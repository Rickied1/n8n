import { Post, RestController } from '@/decorators';
import { AIRequest } from '@/requests';
import { AIService } from '@/services/ai.service';
import { NodeTypes } from '@/NodeTypes';
import express from 'express';
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
	SystemMessagePromptTemplate,
} from '@langchain/core/prompts';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { DynamicTool } from '@langchain/core/tools';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';
import { Calculator } from 'langchain/tools/calculator';
import { REACT_CHAT_PROMPT } from '@/aiAssistant/chat_prompts';
import { FailedDependencyError } from '@/errors/response-errors/failed-dependency.error';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';
import { ApplicationError } from 'n8n-workflow';
import { QUICK_ACTIONS, REACT_DEBUG_PROMPT } from '@/aiAssistant/debug_prompts';

// ReAct agent history is string, according to the docs:
// https://js.langchain.com/v0.1/docs/modules/agents/agent_types/react/#using-with-chat-history
// TODO:
//	- 	Add sessions support
//	- 	We can use UserMessage and SystemMessage classes to make it more readable
//		but in the end it has to render to a string
let chatHistory: string[] = [];
const stringifyHistory = (history: string[]) => history.join('\n');

// Tool history is just for debugging
let toolHistory = {
	calculator: [] as string[],
	internet_search: [] as string[],
	n8n_documentation: [] as string[],
};

const INTERNET_TOOL_SITES = ['https://community.n8n.io', 'https://blog.n8n.io', 'https://n8n.io'];

const resetToolHistory = () => {
	toolHistory = {
		calculator: [],
		internet_search: [],
		n8n_documentation: [],
	};
};

const errorSuggestionSchema = z.object({
	suggestion: z.object({
		userQuestionRelatedToTheCurrentContext: z
			.boolean()
			.describe('Weather the question the user did, is related to the current context'),
		title: z.string().describe('The title of the suggestion'),
		description: z.string().describe('Concise description of the suggestion'),
		// followUpQuestion: z.string().describe('The follow-up question to be asked to the user'),
		// followUpAction: z.string().describe('The follow-up action to be taken by the user'),
		codeDiff: z
			.string()
			.optional()
			.describe('Return edits similar to unified diffs that `diff -U0` would produce.'),
	}),
});

const followUpQuestionResponseSchema = z.object({
	followUp: z.object({
		userQuestionRelatedToTheCurrentContext: z
			.boolean()
			.describe('Weather the question the user did, is related to the current context'),
		whatChanged: z
			.string()
			.describe('Short summary of what you did to address the LAST user question'),
		codeDiff: z
			.string()
			.optional()
			.describe('Return edits similar to unified diffs that `diff -U0` would produce'),
	}),
});

const memorySessions = new Map<string, ChatMessageHistory>();

const getHumanMessages = (history: string[]) => {
	return history.filter((message, index) => message.startsWith('Human:'));
};

// Remove id and position from node parameters since they are not relevant to the assistant
const removeUnrelevantNodeProps = (parameters: { id?: string; position?: string }) => {
	const newParameters = { ...parameters };
	delete newParameters.id;
	delete newParameters.position;
	return newParameters;
};

const assistantModel = new ChatOpenAI({
	temperature: 0,
	openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
	modelName: 'gpt-4o',
	streaming: true,
});

@RestController('/ai')
export class AIController {
	constructor(
		private readonly aiService: AIService,
		private readonly nodeTypes: NodeTypes,
	) {}

	/**
	 * Chat with AI assistant that has access to few different tools.
	 * THIS IS THE FREE-CHAT MODE
	 */
	@Post('/chat-with-assistant', { skipAuth: true })
	async chatWithAssistant(req: AIRequest.AskAssistant, res: express.Response) {
		const { message, newSession } = req.body;
		if (newSession) {
			chatHistory = [];
		}
		resetToolHistory();
		await this.askAssistant(message, res);
	}

	/**
	 * Debug n8n error using the agent that has access to different tools.
	 * THIS IS THE DEBUG MODE
	 */
	@Post('/debug-with-assistant', { skipAuth: true })
	async debugWithAssistant(req: AIRequest.AssistantDebug, res: express.Response) {
		const { nodeType, error, authType, message, userTraits } = req.body;
		resetToolHistory();
		if (message) {
			await this.askAssistant(`${message}\n`, res, true);
			return;
		}
		chatHistory = [];
		let authPrompt = `I am using the following authentication type: ${authType?.name}`;
		if (!authType) {
			authPrompt = `This is the JSON object that represents n8n credentials for the this node: ${JSON.stringify(error.node.credentials)}`;
		}
		let errorMessage = error.message;
		if (!errorMessage) {
			errorMessage = error.messages.join(', ');
		}
		const userPrompt = `
			I am having the following error in my ${nodeType.displayName} node: ${errorMessage} ${error.description ? `- ${error.description}` : ''}
			- Here is some more information about my workflow and myself that you can use to provide a solution:
				- ${authPrompt}. Use this info to only provide solutions that are compatible with the related to this authentication type and not the others.
				- This is the JSON object that represents the node that I am having an error in, you can use it to inspect current node parameter values: ${JSON.stringify(removeUnrelevantNodeProps(error.node))}
				- n8n version and deployment type that I am using: ${userTraits.n8nVersion},
				- Version of the ${nodeType.displayName} node that I am having an error in: ${userTraits.nodeVersion}
			`;

		await this.askAssistant(userPrompt, res, true);
	}

	/**
	 * Chat with pinecone vector store that contains n8n documentation.
	 * This endpoint is not used in the assistant currently but can be used to test
	 * access to n8n docs without the agent if needed (cheaper & faster, but less accurate, option).
	 */
	@Post('/ask-pinecone')
	async askPinecone(req: AIRequest.DebugChat, res: express.Response) {
		const question = 'How to submit new workflows to n8n templates library?';
		console.log('\n>> 🤷 <<', question);
		const documentation = await this.searchDocsVectorStore(question);
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
		const systemMessageFormatted = await systemMessage.format({ docs: documentation, question });
		const prompt = ChatPromptTemplate.fromMessages([
			systemMessageFormatted,
			['human', '{question}'],
		]);
		// ----------------- Chain -----------------
		const chain = prompt.pipe(assistantModel);
		const response = await chain.invoke({ question });
		console.log('>> 🧰 << Final answer:\n', response.content);
		return response.content;
	}

	/**
	 * Generate CURL request and additional HTTP Node metadata for given service and request
	 */
	@Post('/generate-curl')
	async generateCurl(req: AIRequest.GenerateCurl): Promise<{ curl: string; metadata?: object }> {
		const { service, request } = req.body;

		try {
			return await this.aiService.generateCurl(service, request);
		} catch (aiServiceError) {
			throw new FailedDependencyError(
				(aiServiceError as Error).message ||
					'Failed to generate HTTP Request Node parameters due to an issue with an external dependency. Please try again later.',
			);
		}
	}

	// ---------------------------------------------------------- UTIL FUNCTIONS ----------------------------------------------------------
	async searchDocsVectorStore(question: string) {
		// ----------------- Vector store -----------------
		const pc = new Pinecone({
			apiKey: process.env.N8N_AI_PINECONE_API_KEY ?? '',
		});
		const index = pc.Index('n8n-docs');
		const vectorStore = await PineconeStore.fromExistingIndex(
			new OpenAIEmbeddings({
				openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
				modelName: 'text-embedding-3-large',
				dimensions: 3072,
			}),
			{
				pineconeIndex: index,
			},
		);
		// ----------------- Get top chunks matching query -----------------
		const results = await vectorStore.similaritySearch(question, 3);
		console.log('>> 🧰 << GOT THESE DOCUMENTS:');
		let out = '';
		// This will make sure that we don't repeat the same document in the output
		const documents: string[] = [];
		results.forEach((result, i) => {
			const source = (result?.metadata?.source as string) ?? '';

			if (documents.includes(source)) {
				return;
			}
			documents.push(source);
			console.log('\t📃', source);
			toolHistory.n8n_documentation.push(source);
			out += `--- N8N DOCUMENTATION DOCUMENT ${i + 1} ---\n${result.pageContent}\n\n`;
		});
		if (results.length === 0) {
			toolHistory.n8n_documentation.push('NO DOCS FOUND');
		}
		return out;
	}

	async askAssistant(message: string, res: express.Response, debug?: boolean) {
		// ----------------- Tools -----------------
		const n8nInfoTool = new DynamicTool({
			name: 'n8n_documentation',
			description: 'Has access to the official n8n documentation',
			func: async (input: string) => {
				console.log('>> 🧰 << n8nInfoTool:', input);
				return (await this.searchDocsVectorStore(input)).toString();
			},
		});

		const internetSearchTool = new DynamicTool({
			name: 'internet_search',
			description: 'Searches the n8n internet sources',
			func: async (input: string) => {
				const searchQuery = `${input} site:${INTERNET_TOOL_SITES.join(' OR site:')}`;
				console.log('>> 🧰 << internetSearchTool:', searchQuery);
				const duckDuckGoSearchTool = new DuckDuckGoSearch({ maxResults: 10 });
				const response = await duckDuckGoSearchTool.invoke(searchQuery);
				try {
					const objectResponse = JSON.parse(response) as unknown as [{ link?: string }];
					objectResponse.forEach((result) => {
						if (result.link) {
							toolHistory.internet_search.push(result.link);
						}
					});
					if (toolHistory.internet_search.length === 0) {
						toolHistory.internet_search.push('NO FORUM PAGES FOUND');
					}
				} catch (error) {
					console.error('Error parsing search results', error);
				}
				console.log('>> 🧰 << duckDuckGoSearchTool:', response);
				return response;
			},
		});

		const tools = [n8nInfoTool, internetSearchTool];

		const toolNames = tools.map((tool) => tool.name);
		// ----------------- Agent -----------------
		const chatPrompt = debug ? ChatPromptTemplate.fromTemplate(REACT_DEBUG_PROMPT) : ChatPromptTemplate.fromTemplate(REACT_CHAT_PROMPT);
		// Different conversation rules for debug and free-chat modes
		const humanAskedForSuggestions = getHumanMessages(chatHistory).filter((msg) => {
			return (
				msg.includes('I need another suggestion') ||
				msg.includes('I need more detailed instructions')
			);
		});

		// Hard-stop if human asks for too many suggestions
		if (humanAskedForSuggestions.length >= 3) {
			if (debug) {
				message =
					'I have asked for too many new suggestions. Please follow your conversation rules for this case.';
			}
		}

		const agent = await createReactAgent({
			llm: assistantModel,
			tools,
			prompt: chatPrompt,
		});

		const agentExecutor = new AgentExecutor({
			agent,
			tools,
			returnIntermediateSteps: true,
		});

		console.log('\n>> 🤷 <<', message.trim());
		let response = '';
		try {
			// TODO: Add streaming & LangSmith tracking
			const result = await agentExecutor.invoke({
				input: message,
				chat_history: stringifyHistory(chatHistory),
				tool_names: toolNames,
			});
			response = result.output as string;
			// console.log();
			// console.log('--------------------- 📋 INTERMEDIATE STEPS ------------------------------------');
			// result.intermediateSteps.forEach((step) => {
			// 	console.log('🦾', step.action.toString());
			// 	console.log('🧠', step.observation);
			// });
			// console.log('-----------------------------------------------------------------------------');
			// console.log();
		} catch (error) {
			// TODO: This can be handled by agentExecutor
			if (error instanceof Error)
				response = error.toString().replace(/Error: Could not parse LLM output: /, '');
		}
		console.log('>> 🤖 <<', response);

		chatHistory.push(`Human: ${message}`);
		chatHistory.push(`Assistant: ${response}`);
		let debugInfo = '-------------- DEBUG INFO --------------\n';
		debugInfo += toolHistory.n8n_documentation.length > 0 ? `N8N DOCS DOCUMENTS USED: ${toolHistory.n8n_documentation.join(', ')}\n` : '';
		debugInfo += toolHistory.internet_search.length > 0 ? `FORUM PAGES USED: ${toolHistory.internet_search.join(',')}\n` : '';
		debugInfo += toolHistory.n8n_documentation.length === 0 && toolHistory.internet_search.length === 0 ? 'NO TOOLS USED' : '';
		res.end(JSON.stringify({ response, debugInfo, quickActions: debug ? QUICK_ACTIONS : undefined }));
	}

	@Post('/debug-chat', { skipAuth: true })
	async debugChat(req: AIRequest.DebugChat, res: express.Response) {
		const { sessionId, schemas, nodes, parameters, error } = req.body;

		const model = new ChatOpenAI({
			temperature: 0,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4o',
			streaming: true,
		});

		const modelWithOutputParser = model.bind({
			functions: [
				{
					name: 'output_formatter',
					description: 'Should always be used to properly format output',
					parameters: zodToJsonSchema(errorSuggestionSchema),
				},
			],
			function_call: { name: 'output_formatter' },
		});

		const outputParser = new JsonOutputFunctionsParser();

		const chatMessageHistory = new ChatMessageHistory();

		const systemMessage = SystemMessagePromptTemplate.fromTemplate(`

			You're an assistant n8n expert assistant. Your role is to help users fix issues with coding in the n8n code node.

			Provide ONE suggestion. The suggestion should include a title, description, and code diff between the original code and the suggested code solution by you. If the suggestion is related to the wrong run mode, do not provide a code diff.

			## Code diff rules

			Return unified diffs that 'diff -U0' (Linux utility) would produce.

			Indentation matters in the diffs!

			Think carefully and make sure you include and mark all lines that need to be removed or changed as '-' lines.
			Make sure you mark all new or modified lines with '+'.

			Do not include in the code diff code that did not change

			Start a new hunk for each section of the suggested code that needs changes.

			### Context about how the code node in n8n works.

			The code node uses $now and $today to work with dates. Both methods are wrapper around the Luxon library

			$now:	A Luxon object containing the current timestamp. Equivalent to DateTime.now().

			$today: A Luxon object containing the current timestamp, rounded down to the day.

			The code node does not allow the use of import or require.

			The code node does not allow to make http requests or accessing the file system.

			The code node support two run modes:

			1. runOnceForAllItems: The code in the code node executes once, regardless of how many input items there are. In this mode you can access all input items using "items". in this mode you CAN'T use "item" to access the input data.

			2. runOnceForEachItem: The code in the code node run for every input item. In this mode you can access each input item using "item". In this mode you CAN'T use "items" to access the input data. The output in this mode should be always a single object.

			## Workflow context

			### Run mode: {runMode}

			### Language: {language}

		`);

		const systemMessageFormatted = await systemMessage.format({
			nodes,
			schemas: JSON.stringify(schemas),
			runMode: parameters!.mode,
			language: parameters!.language,
			code: parameters!.jsCode,
		});

		const prompt = ChatPromptTemplate.fromMessages([
			systemMessageFormatted,

			['human', '{question} \n\n Error: {error}'],
		]);

		await chatMessageHistory.addMessage(systemMessageFormatted);
		await chatMessageHistory.addMessage(
			new HumanMessage(
				`Please suggest solutions for the error below: \n\n Error: ${JSON.stringify(error)}`,
			),
		);

		const chain = prompt.pipe(modelWithOutputParser).pipe(outputParser);

		const chainWithHistory = new RunnableWithMessageHistory({
			runnable: chain,
			getMessageHistory: async () => chatMessageHistory,
			inputMessagesKey: 'question',
			historyMessagesKey: 'history',
		});

		const chainStream = await chainWithHistory.stream(
			{
				question:
					'Please suggest solutions for the error below and carefully look for other errors in the code. Remember that response should always match the original intent',
				error: JSON.stringify(error),
			},
			{ configurable: { sessionId } },
		);

		let data = '';
		try {
			for await (const output of chainStream) {
				// console.log('🚀 ~ AIController ~ forawait ~ output:', output);
				data = JSON.stringify(output) + '\n';
				res.write(data);
			}
			await chatMessageHistory.addMessage(new AIMessage(JSON.stringify(data)));
			// console.log('Final messages: ', chatMessageHistory.getMessages());
			res.end('__END__');
		} catch (e) {
			console.error('Error during streaming:', e);
			// eslint-disable-next-line id-denylist
			res.end(JSON.stringify({ err: 'An error occurred during streaming' }) + '\n');
		}

		// Handle client closing the connection
		req.on('close', () => {
			res.end();
		});
	}

	@Post('/debug-chat-follow-up-question', { skipAuth: true })
	async debugChatFollowUpQuestion(req: AIRequest.DebugChat, res: express.Response) {
		const { sessionId, text } = req.body;

		const model = new ChatOpenAI({
			temperature: 0,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4o',
			streaming: true,
		});

		const modelWithOutputParser = model.bind({
			functions: [
				{
					name: 'output_formatter',
					description: 'Should always be used to properly format output',
					parameters: zodToJsonSchema(followUpQuestionResponseSchema),
				},
			],
			function_call: { name: 'output_formatter' },
		});

		const outputParser = new JsonOutputFunctionsParser();

		const chatMessageHistory = memorySessions.get(sessionId);

		if (!chatMessageHistory) {
			throw new ApplicationError('No chat history found for the given session id');
		}

		const prompt = ChatPromptTemplate.fromMessages([
			new MessagesPlaceholder('history'),
			['human', '{question}'],
			['human', 'Do not mention things you already mentioned, just provide the new information'],
			['human', 'If question has nothing do with the previous context, just say that'],
		]);

		await chatMessageHistory.addMessage(new HumanMessage(`${text}`));

		const chain = prompt.pipe(modelWithOutputParser).pipe(outputParser);

		const chainWithHistory = new RunnableWithMessageHistory({
			runnable: chain,
			getMessageHistory: async () => chatMessageHistory,
			inputMessagesKey: 'question',
			historyMessagesKey: 'history',
		});

		const chainStream = await chainWithHistory.stream(
			{
				question: text,
			},
			{ configurable: { sessionId } },
		);

		let data = '';
		try {
			for await (const output of chainStream) {
				// console.log('🚀 ~ AIController ~ forawait ~ output:', output);
				data = JSON.stringify(output) + '\n';
				res.write(data);
			}
			await chatMessageHistory.addMessage(new AIMessage(JSON.stringify(data)));
			// console.log('Final messages: ', chatMessageHistory.getMessages());
			res.end('__END__');
		} catch (e) {
			console.error('Error during streaming:', e);
			// eslint-disable-next-line id-denylist
			res.end(JSON.stringify({ err: 'An error occurred during streaming' }) + '\n');
		}

		// Handle client closing the connection
		req.on('close', () => {
			res.end();
		});
	}

	@Post('/debug-chat/apply-code-suggestion', { skipAuth: true })
	async applyCodeSuggestion(req: AIRequest.DebugChat, res: express.Response) {
		const { sessionId } = req.body;

		const model = new ChatOpenAI({
			temperature: 0.1,
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'gpt-4-turbo',
		});

		const modelWithOutputParser = model.bind({
			functions: [
				{
					name: 'output_formatter',
					description: 'Should always be used to properly format output',
					parameters: zodToJsonSchema(
						z.object({
							codeSnippet: z.string().describe('The code with the diff applied'),
						}),
					),
				},
			],
			function_call: { name: 'output_formatter' },
		});

		const outputParser = new JsonOutputFunctionsParser();

		const chatMessageHistory = memorySessions.get(sessionId);

		if (!chatMessageHistory) {
			throw new ApplicationError('No chat history found for the given session id');
		}
		// messages.inputVariables;

		const prompt = ChatPromptTemplate.fromMessages([
			new MessagesPlaceholder('history'),
			[
				'human',
				'You are diligent and tireless! You NEVER leave comments describing code without implementing it! You always COMPLETELY IMPLEMENT the needed code!',
			],
			['human', 'Apply the diff to the original code'],
		]);

		await chatMessageHistory.addMessage(new HumanMessage('Apply the diff to the original code'));

		const chain = prompt.pipe(modelWithOutputParser).pipe(outputParser);

		const chainWithHistory = new RunnableWithMessageHistory({
			runnable: chain,
			getMessageHistory: async () => chatMessageHistory,
			inputMessagesKey: 'question',
			historyMessagesKey: 'history',
		});

		const response = await chainWithHistory.invoke({}, { configurable: { sessionId } });

		return response;
	}
}
