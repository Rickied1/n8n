import { Post, RestController } from '@/decorators';
import { AIRequest } from '@/requests';
import { AIService } from '@/services/ai.service';
import { NodeTypes } from '@/NodeTypes';
import { FailedDependencyError } from '@/errors/response-errors/failed-dependency.error';
import express from 'express';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';
import {
	ChatPromptTemplate,
	PromptTemplate,
	SystemMessagePromptTemplate,
} from '@langchain/core/prompts';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';
import { DynamicTool } from '@langchain/core/tools';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from '@pinecone-database/pinecone';
import { pull } from "langchain/hub";
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { Calculator } from 'langchain/tools/calculator';

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
		return this.askPineconeChain(question);
	}

	async askPineconeChain(question: string) {
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
		console.log(">> 🧰 << GOT THESE DOCUMENTS:");
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
		console.log(">> 🧰 << Final answer:\n", response.content);
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
		// const myInfoTool = new DynamicTool({
		// 	name: "get_my_info",
		// 	description: "Returns information about myself (the human).",
		// 	func: async (input: string) => {
		// 		const info = {
		// 			firstName: "Ricardo",
		// 			lastName: "Espinoza",
		// 			age: 30,
		// 			height: 180,
		// 		}
		// 		console.log(">> 🧰 << myInfoTool:", input);
		// 		return `My first name is ${info.firstName}, my last name is ${info.lastName}, I am ${info.age} years old and I am ${info.height} cm tall.`
		// 	}
		// });
		const calculatorTool = new DynamicTool({
			name: "calculator",
			description: "Performs arithmetic operations. Use this tool whenever you need to perform calculations.",
			func: async (input: string) => {
				console.log(">> 🧰 << calculatorTool:", input);
				const calculator = new Calculator();
				return await calculator.invoke(input);
			}
		});


		const n8nInfoTool = new DynamicTool({
			name: "get_n8n_info",
			description: "Returns information about n8n. Use this tool to answer questions and solve problems related to n8n, the workflow automation tool.",
			func: async (input: string) => {
				console.log(">> 🧰 << n8nInfoTool:", input);
				return (await this.askPineconeChain(input)).toString();
			}
		});

		const internetSearchTool = new DynamicTool({
			name: "internet_search",
			description: "Searches the n8n community forum for the answer to a question. Use this tool to find answers to questions that are not in the n8n documentation.",
			func: async (input: string) => {
				const communityQuery = `${input} site:https://community.n8n.io/`
				console.log(">> 🧰 << internetSearchTool:", communityQuery);
				const duckDuckGoSearchTool = new DuckDuckGoSearch({ maxResults: 3 });
				const response = await duckDuckGoSearchTool.invoke(communityQuery);
				console.log(">> 🧰 << duckDuckGoSearchTool:", response);
				return response;
			}
		});

		const tools = [
			// myInfoTool,
			calculatorTool,
			n8nInfoTool,
			internetSearchTool,
		];
		// ----------------- Agent -----------------
		const prompt = await pull<PromptTemplate>("hwchase17/react");
		const agent = await createReactAgent({
			llm: model,
			tools,
			prompt,
		});

		const agentExecutor = new AgentExecutor({
			agent,
			tools,
		});

		// ----------------- Conversation -----------------
		// TODO: How can this be a custom system message?
		const userMessagePre = `
			I need to solve the following problem with n8n.
			Please use 'get_n8n_info' tool to get information from the official n8n documentation
			and the 'internet_search' tool to get more info from the internet.
			Use the 'calculator' tool to perform any arithmetic operations, if necessary.
			Use this knowledge to solve my problem.
			Make sure to prioritize the information from the official n8n documentation by using the final answer from the 'get_n8n_info' tool.
			Always reply with an answer that is actionable and easy to follow for users that are just starting with n8n.
			It the solution is found using the 'get_n8n_info' tool, include steps to solve the problem by taking them directly from the tool response.
			If you can't find the answer, just say that you don't know.
			The problem is:\n
		`;

		// TODO: Use this to test the memory once it's implemented
		// const input1 = "How many letters in the word 'education'?";
		// console.log("\n>> 🤷 <<", input1);
		// const result1 = await agentExecutor.invoke({
		// 	input: input1,
		// });
		// console.log(">> 🤖 <<", result1.output);

		// const input2 = "Is that a real English word?";
		// console.log("\n>> 🤷 <<", input2);
		// const result2 = await agentExecutor.invoke({
		// 	input: input2,
		// });
		// console.log(">> 🤖 <<", result2.output);

		// const input3 = "Can you tell me my first name, last name and my age?";
		// console.log("\n>> 🤷 <<", input3);
		// const result3 = await agentExecutor.invoke({
		// 	input: input3,
		// });
		// console.log(">> 🤖 <<", result3.output);

		// const input4 = "And how tall am I?";
		// console.log("\n>> 🤷 <<", input4);
		// const result4 = await agentExecutor.invoke({
		// 	input: input4,
		// });
		// console.log(">> 🤖 <<", result4.output);

		// const input5 = 'If Mary has 3 apples and John has 5 apples, how many apples do they have together?';
		// console.log("\n>> 🤷 <<", input5);
		// const result5 = await agentExecutor.invoke({
		// 	input: input5,
		// 	verbose: true,
		// });
		// console.log(">> 🤖 <<", result5.output);

		const input6 = userMessagePre + `
			Webhooks in my workflows are unresponsive.
			I am running n8n via docker compose on n8n.example.com subdomain. I have cloudflare pointed to proxy traffic to the server and I have nginx set up as a reverse proxy
			This works and I can access the interface from my browser. Setting a webhook trigger works until I go to test it. Sending a test request doesn’t get registered by n8n and pressing “Stop listening” for test events also does not work.
			`;
		console.log("\n>> 🤷 <<", input6.trim());
		const result6 = await agentExecutor.invoke({
			input: input6,
			verbose: true,
		});
		console.log(">> 🤖 <<", result6.output);

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
