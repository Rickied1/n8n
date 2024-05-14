import { Post, RestController } from '@/decorators';
import { AIRequest } from '@/requests';
import { AIService } from '@/services/ai.service';
import { NodeTypes } from '@/NodeTypes';
import { FailedDependencyError } from '@/errors/response-errors/failed-dependency.error';
import express from 'express';
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

const TOOLS_PROMPT = `
Please use 'get_n8n_info' tool to get information from the official n8n documentation.
and the 'internet_search' tool to get more info from the internet.
Make sure to always use at least one of these tools to provide the most accurate information.
Use the 'calculator' tool to perform any arithmetic operations, if necessary.
You must use only the knowledge acquired from the tools to provide the most accurate information.
You must not make up any information.
Make sure to prioritize the information from the official n8n documentation by using the final answer from the 'get_n8n_info' tool.
If you can't find the answer, just say that you don't know.
`;

const DEBUG_PROMPT = `
I need to solve the following problem with n8n.
${TOOLS_PROMPT}
Make sure to take into account all information about the problem that I will provide later to only provide solutions that are related with the problem.
Your job is to guide me through the solution process step by step so make sure you only provide ONLY ONE, most relevant, suggestion on how to solve the problem at a time.
Each suggestion should be short and actionable.
After each suggestion ALWAYS ask the follow-up question to confirm if I need detailed instructions on how to apply the suggestion.
This follow-up question must be in the form of 'Do you need more detailed instructions on how to ...'
Only provide detailed instructions if I confirm that I need them. In this case, always use 'get_n8n_info' tool to provide the most accurate information.
When providing the solution, always remember that I already have created the workflow and added the node that is causing the problem,
so always skip the steps that involve creating the workflow from scratch or adding the node to the workflow.
`;

const CHAT_PROMPT = `
I need your help with n8n, the workflow automation tool. Please always refer to the official n8n documentation to provide the most accurate information.
This is the question I have:
`;


let chatHistory: string[] = [];
const stringifyHistory = (history: string[]) => history.join('\n');

let toolHistory = {
	calculator: [] as string[],
	internet_search: [] as string[],
	get_n8n_info: [] as string[],
};

const resetToolHistory = () => {
	toolHistory = {
		calculator: [],
		internet_search: [],
		get_n8n_info: [],
	};
}

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
 * Chat with AI assistant that has access to few different tools.
 */
	@Post('/chat-with-assistant', { skipAuth: true })
	async chatWithAssistant(req: AIRequest.AskAssistant, res: express.Response) {
		const { message, newSession } = req.body;
		let userMessage = `${message }\n${TOOLS_PROMPT}`;
		if (newSession) {
			chatHistory = [];
			userMessage = `${CHAT_PROMPT}\n${message }\n${TOOLS_PROMPT}`
		}
		resetToolHistory();
		await this.askAssistant(userMessage, res);
	}

	/**
	 * Debug n8n error using the agent that has access to different tools.
	 */
	@Post('/debug-with-assistant', { skipAuth: true })
	async debugWithAssistant(req: AIRequest.AssistantDebug, res: express.Response) {
		const { nodeType, error, authType, message } = req.body;
		resetToolHistory();
		if (message) {
			await this.askAssistant(`${message }\n${TOOLS_PROMPT}`, res);
			return;
		}
		chatHistory = []
		let authPrompt = `I am using the following authentication type: ${authType?.name}`
		if (!authType) {
			authPrompt = `This is the JSON object that represents n8n credentials for the this node: ${JSON.stringify(error.node.credentials)}`
		}
		const userPrompt = `
			${DEBUG_PROMPT}
			My problem is:
				- I am having the following error in my ${nodeType.displayName} node: ${error.message} ${ error.description ? `- ${error.description}` : ''}
				- Here is some more information from my workflow:
				- ${authPrompt}. Use this info to only provide solutions that are compatible with the related to this authentication type and not the others.
				- This is the JSON object that represents the node that I am having an error in, you can use it to inspect current node parameter values: ${JSON.stringify(error.node)}
				- I am n8n cloud user, so make sure to account for that in your answer and don't provide solutions that are only available in the self-hosted version.
			`;
		await this.askAssistant(userPrompt, res);
	}

	/**
	 * Chat with pinecone vector store that contains n8n documentation.
	 * This endpoint is not used in the assistant currently but can be used to test
	 * access to n8n docs without the agent if needed.
	 */
	@Post('/ask-pinecone')
	async askPinecone(req: AIRequest.DebugChat, res: express.Response) {
		const question = 'How to submit new workflows to n8n templates library?';
		console.log("\n>> 🤷 <<", question);
		return this.askPineconeChain(question);
	}

	// ---------------------------------------------------------- UTIL FUNCTIONS ----------------------------------------------------------
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
		const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'text-embedding-3-large',
			dimensions: 3072
		}), {
			pineconeIndex: index,
		})
		// ----------------- Get top chunks matching query -----------------
		const results = await vectorStore.similaritySearch(question, 3);
		console.log(">> 🧰 << GOT THESE DOCUMENTS:");
		// Prepare chunks
		let out = ""
		results.forEach((result, i) => {
			toolHistory.get_n8n_info.push(result.metadata.source);
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
		// console.log(">> 🧰 << Final answer:\n", response.content);
		return response.content;
	}

	async askAssistant(message: string, res: express.Response) {
		const model = new ChatOpenAI({
			temperature: 0,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4',
			streaming: true,
		});

		// ----------------- Tools -----------------
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
				const duckDuckGoSearchTool = new DuckDuckGoSearch({ maxResults: 5 });
				const response = await duckDuckGoSearchTool.invoke(communityQuery);
				const objectResonse: { link?: string }[] = JSON.parse(response);
				// toolHistory.internet_search.push(response);
				objectResonse.forEach((result) => {
					if (result.link) {
						toolHistory.internet_search.push(result.link);
					}
				});
				console.log(">> 🧰 << duckDuckGoSearchTool:", response);
				return response;
			}
		});

		const tools = [
			calculatorTool,
			n8nInfoTool,
			internetSearchTool,
		];
		// ----------------- Agent -----------------
		const chatPrompt = await pull<PromptTemplate>("hwchase17/react-chat");

		const agent = await createReactAgent({
			llm: model,
			tools,
			prompt: chatPrompt,
		});

		const agentExecutor = new AgentExecutor({
			agent,
			tools,
		});

		console.log(chatHistory);
		console.log("\n>> 🤷 <<", message.trim());
		let response =  '';
		try {
			const result = await agentExecutor.invoke({
				input: message,
				verbose: true,
				chat_history: stringifyHistory(chatHistory),
			});
			response = result.output;
		} catch (error) {
			response = error.toString().replace(/Error: Could not parse LLM output: /, '');
		}
		console.log(">> 🤖 <<", response);
		chatHistory.push(`Human: ${message}`);
		chatHistory.push(`Assistant: ${response}`);
		res.write(response + '\n \n');
		res.write(`
\`\`\`
-------------- DEBUG INFO --------------
${toolHistory.get_n8n_info.length > 0 ? `N8N DOCS DOCUMENTS USED: ${toolHistory.get_n8n_info.join(', ')}` : ''}
${toolHistory.internet_search.length > 0 ? `FORUM PAGES USED: ${toolHistory.internet_search.join(',')}` : ''}
${toolHistory.get_n8n_info.length === 0 && toolHistory.internet_search.length === 0 ? 'NO TOOLS USED' : ''}
\`\`\`
	`);
		// res.end('__END__');
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
