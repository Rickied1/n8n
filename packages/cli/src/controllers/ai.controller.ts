import { Post, RestController } from '@/decorators';
import { AIRequest } from '@/requests';
import { AIService } from '@/services/ai.service';
import { NodeTypes } from '@/NodeTypes';
import { FailedDependencyError } from '@/errors/response-errors/failed-dependency.error';
import express from 'express';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
	SystemMessagePromptTemplate,
} from '@langchain/core/prompts';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { RunnableSequence, RunnableWithMessageHistory } from '@langchain/core/runnables';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';
import { DynamicTool } from '@langchain/core/tools';
import { convertToOpenAIFunction } from '@langchain/core/utils/function_calling';
import { AgentExecutor, type AgentStep } from 'langchain/agents';
import { formatToOpenAIFunctionMessages } from "langchain/agents/format_scratchpad";
import { OpenAIFunctionsAgentOutputParser } from "langchain/agents/openai/output_parser";
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { PineconeStore } from "@langchain/pinecone";
import { VectorDBQAChain } from "langchain/chains";
import { ChainTool } from "langchain/tools";
import { Pinecone } from '@pinecone-database/pinecone';

const memorySessions = new Map<string, ChatMessageHistory>();

const suggestionTodos = z.array(
	z.object({
		title: z.string(),
		description: z.string(),
	}),
);

const errorSuggestionsSchema = z.object({
	suggestions: z.array(
		z.object({
			title: z.string().describe('The title of the suggestion'),
			description: z.string().describe('Concise description of the suggestion'),
			key: z.string(),
			followUpQuestion: z.string().describe('The follow-up question to be asked to the user'),
			followUpAction: z.string().describe('The follow-up action to be taken by the user'),
			codeSnippet: z.string().optional().describe('The code snippet to be provided to the user'),
			userUsingWrongRunMode: z
				.boolean()
				.optional()
				.describe('Whether the user is using the wrong run mode'),
		}),
	),
});

const stringifyAndTrim = (obj: object) => JSON.stringify(obj).trim();

@RestController('/ai')
export class AIController {
	constructor(
		private readonly aiService: AIService,
		private readonly nodeTypes: NodeTypes,
	) {}

	/**
	 * Suggest a solution for a given error using the AI provider.
	 */
	@Post('/debug-error')
	async debugError(req: AIRequest.DebugError): Promise<{ message: string }> {
		const { error } = req.body;

		let nodeType;
		if (error.node?.type) {
			nodeType = this.nodeTypes.getByNameAndVersion(error.node.type, error.node.typeVersion);
		}

		try {
			const message = await this.aiService.debugError(error, nodeType);
			return {
				message,
			};
		} catch (aiServiceError) {
			throw new FailedDependencyError(
				(aiServiceError as Error).message ||
					'Failed to debug error due to an issue with an external dependency. Please try again later.',
			);
		}
	}

	/**
	 * Chat with pinecone vector store that contains n8n documentation.
	 * This is just a recreation of the Nik's workflow, without the indexing part.
	 * Ideally, we should use this as a tool for AI agent
	 */
	@Post('/ask-pinecone')
	async askPinecone(req: AIRequest.DebugChat, res: express.Response) {
		const question = 'How to submit new workflows to n8n templates library?';
		console.log("\n>> 🤷 <<", question);
		// ----------------- Model -----------------
		const model = new ChatOpenAI({
			temperature: 0,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4',
			streaming: true,
		});
		// ----------------- Vector store -----------------
		const pc = new Pinecone({
			apiKey: process.env.N8N_AI_PINECONE_API_KEY ?? ''
		});
		const index = pc.Index('n8n-docs');
		const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({ modelName: 'text-embedding-3-large', dimensions: 3072 }), {
			pineconeIndex: index,
		})
		// ----------------- Get top chunks matching query -----------------
		const results = await vectorStore.similaritySearch(question, 3);
		console.log(">> 🤖 << GOT THESE DOCUMENTS:");
		// Prepare chunks
		let out = ""
		results.forEach((result, i) => {
			console.log("\t📃", result.metadata.source);
			out += `--- CHUNK ${i} ---\n${result.pageContent}\n\n`
		})
		// ----------------- Prompt -----------------
		const systemMessage = SystemMessagePromptTemplate.fromTemplate(`
			You are an automation expert and are tasked to help users answer their questions about n8n.
			Use the following pieces of context to answer the question at the end.
			If you don't know the answer, just say that you don't know, don't try to make up an answer.
			Try to make the answers actionable and easy to follow for users that are just starting with n8n.

			{docs}

			Question: {question}
			Helpful Answer:
		`);
		const systemMessageFormatted = await systemMessage.format({ docs: out, question });
		const prompt = ChatPromptTemplate.fromMessages([
			systemMessageFormatted,
			['human', '{question}'],
		]);
		// ----------------- Chain -----------------
		const chain = prompt.pipe(model);
		const response = await chain.invoke({ question });
		console.log(">> 🤖 << Final answer:\n", response.content);
		return response.content;
	}

	/**
	 * Chat with AI assistant that has access to few different tools.
	 * Currently doesn't work so well but we should get it to work and use
	 * pinecone similarity search as a tool.
	 */
	@Post('/ai-assistant')
	async aiAssistant(req: AIRequest.DebugChat, res: express.Response) {
		// ----------------- model -----------------
		const model = new ChatOpenAI({
			temperature: 0,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4',
			streaming: true,
		});

		// ----------------- Tools -----------------
		const wordLengthTool = new DynamicTool({
			name: "get_word_length",
			description: "Returns the length of a word.",
			func: async (input: string) => input.length.toString(),
		});

		const myInfoTool = new DynamicTool({
			name: "get_my_info",
			description: "Returns information about myself (the human).",
			func: async (input: string) => {
				const info = {
					firstName: "Ricardo",
					lastName: "Espinoza",
					age: 30,
					height: 180,
				}
				return `My first name is ${info.firstName}, my last name is ${info.lastName}, I am ${info.age} years old and I am ${info.height} cm tall.`
			}
		});

		const pc = new Pinecone({
			apiKey: process.env.N8N_AI_PINECONE_API_KEY ?? ''
		});
		const index = pc.index('n8n-docs');
		const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings(), {
			pineconeIndex: index,
		})
		const chain = VectorDBQAChain.fromLLM(model, vectorStore);
		const n8nDocsTool = new ChainTool({
			name: "n8n-docs-qa",
			description:
				"Useful tool to search for information in the n8n documentation.",
			chain: chain,
		});

		const tools = [
			wordLengthTool,
			myInfoTool,
			n8nDocsTool
		];

		const modelWithFunctions = model.bind({
			functions: tools.map((tool) => convertToOpenAIFunction(tool)),
		});
		// ----------------- Agent -----------------
		const MEMORY_KEY = "chat_history";
		const chatHistory: BaseMessage[] = [];
		const memoryPrompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				"You are very powerful assistant, but bad at calculating lengths of words.",
			],
			new MessagesPlaceholder(MEMORY_KEY),
			["user", "{input}"],
			new MessagesPlaceholder("agent_scratchpad"),
		]);

		const agentWithMemory = RunnableSequence.from([
			{
				input: (i) => i.input,
				agent_scratchpad: (i) => formatToOpenAIFunctionMessages(i.steps),
				chat_history: (i) => i.chat_history,
			},
			memoryPrompt,
			modelWithFunctions,
			new OpenAIFunctionsAgentOutputParser(),
		]);

		const executorWithMemory = AgentExecutor.fromAgentAndTools({
			agent: agentWithMemory,
			tools,
		});

		// ----------------- Conversation -----------------

		// const input1 = "How many letters in the word 'education'?";
		// console.log("\n>> 🤷 <<", input1);
		// const result1 = await executorWithMemory.invoke({
		// 	input: input1,
		// 	chat_history: chatHistory,
		// });

		// console.log(">> 🤖 <<", result1.output);

		// chatHistory.push(new HumanMessage(input1));
		// chatHistory.push(new AIMessage(result1.output));

		// const input2 = "Is that a real English word? Answer with just 'yes' or 'no'";
		// console.log("\n>> 🤷 <<", input2);
		// const result2 = await executorWithMemory.invoke({
		// 	input: input2,
		// 	chat_history: chatHistory,
		// });

		// console.log(">> 🤖 <<", result2.output);

		// chatHistory.push(new HumanMessage(input2));
		// chatHistory.push(new AIMessage(result2.output));

		// const input3 = "Can you tell me my first name, last name and my age?";
		// console.log("\n>> 🤷 <<", input3);
		// const result3 = await executorWithMemory.invoke({
		// 	input: input3,
		// 	chat_history: chatHistory,
		// });

		// console.log(">> 🤖 <<", result3.output);

		// chatHistory.push(new HumanMessage(input3));
		// chatHistory.push(new AIMessage(result3.output));

		// const input4 = "And how tall am I?";
		// console.log("\n>> 🤷 <<", input4);
		// const result4 = await executorWithMemory.invoke({
		// 	input: input4,
		// 	chat_history: chatHistory,
		// });

		// console.log(">> 🤖 <<", result4.output);

		// chatHistory.push(new HumanMessage(input4));
		// chatHistory.push(new AIMessage(result4.output));

		const input5 = "Can you tell me the steps to set up Airtable credentials in n8n?";
		console.log("\n>> 🤷 <<", input5);
		const result = await executorWithMemory.invoke({
			input: input5,
			chat_history: chatHistory,
		});
		console.log(">> 🤖 <<", result.output);


		// res.write(`${result1.output}\n`);
		// res.write(`${result2.output}\n`);
		// res.write(`${result3.output}\n`);
		// res.write(`${result4.output}\n`);
		res.end('__END__');
	}

	@Post('/debug-chat', { skipAuth: true })
	async debugChat(req: AIRequest.DebugChat, res: express.Response) {
		const { sessionId, text, schemas, nodes, parameters, error } = req.body;

		const systemMessage = SystemMessagePromptTemplate.fromTemplate(`

				You're an assistant n8n expert assistant. Your role is to help users fix issues with coding in the n8n code node.

				Provide two suggestions. Each suggestion should include: title, description and a code snippet.

				If the suggestion is related to a wrong run mode, do not provide a code snippet.

				Provide a follow up action responding the follow-up question affirmatively. For example: Yes, I would like to try this solution.

				Make sure to end the suggestion with a follow-up question that should be answered by the user. For example: Would you like to try the solution in the code node?

				The code node uses $now and $today to work with dates. Both methods are wrapper around the Luxon library

				$now:	A Luxon object containing the current timestamp. Equivalent to DateTime.now().

				$today: A Luxon object containing the current timestamp, rounded down to the day.

				The code node does not allow the use of import or require.

				The code node does not allow to make http requests or accessing the file system.

				There are two modes:

				Run Once for All Items: this is the default. When your workflow runs, the code in the code node executes once, regardless of how many input items there are. In this mode you can access all input items using "items"

				Run Once for Each Item: choose this if you want your code to run for every input item. In this mode you can access each input item using "item"

				When mode is Run Once for each item, the code node cannot access the items to reference the input data.

				When suggesting fixes to expressions which are referencing other nodes(or input data), carefully check the provided schema, if the node contains the referenced data.

			## Workflow context

			### Workflow nodes:
				{nodes}

			### All workflow nodes schemas:
				{schemas}

			### Run mode: {runMode}

			### Language: {language}

			### User Provided Code: {code}

			`);

		const systemMessageFormatted = await systemMessage.format({
			nodes,
			schemas: JSON.stringify(schemas),
			runMode: parameters!.runMode,
			language: parameters!.language,
			code: parameters!.code,
		});

		const model = new ChatOpenAI({
			temperature: 0,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4',
			streaming: true,
		});

		const modelWithOutputParser = model.bind({
			functions: [
				{
					name: 'output_formatter',
					description: 'Should always be used to properly format output',
					parameters: zodToJsonSchema(errorSuggestionsSchema),
				},
			],
			function_call: { name: 'output_formatter' },
		});

		const outputParser = new JsonOutputFunctionsParser();

		// messages.inputVariables;

		const prompt = ChatPromptTemplate.fromMessages([
			systemMessageFormatted,
			['human', '{question} \n\n Error: {error}'],
		]);

		const chain = prompt.pipe(modelWithOutputParser).pipe(outputParser);

		// const chainWithHistory = new RunnableWithMessageHistory({
		// 	runnable: chain,
		// 	getMessageHistory: async () => chatMessageHistory,
		// 	inputMessagesKey: 'question',
		// 	historyMessagesKey: 'history',
		// });

		const chainStream = await chain.stream({
			question: text ?? 'Please suggest solutions for the error below',
			error: JSON.stringify(error),
		});

		try {
			for await (const output of chainStream) {
				// console.log('🚀 ~ AIController ~ forawait ~ output:', output);
				res.write(JSON.stringify(output) + '\n');
			}
			// console.log('Final messages: ', chatMessageHistory.getMessages());
			res.end('__END__');
		} catch (err) {
			console.error('Error during streaming:', err);
			res.end(JSON.stringify({ err: 'An error occurred during streaming' }) + '\n');
		}

		// Handle client closing the connection
		req.on('close', () => {
			res.end();
		});
	}
}
