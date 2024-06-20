import type { IRestApiContext, Schema } from '@/Interface';
import type { DebugChatPayload } from '@/stores/ai.store';
import { makeRestApiRequest } from '@/utils/apiUtils';
import type { IDataObject, INode, INodeTypeDescription, NodeError } from 'n8n-workflow';

export interface GenerateCurlPayload {
	service: string;
	request: string;
}

export interface GenerateCurlResponse {
	curl: string;
	metadata: object;
}

export async function generateCodeForPrompt(
	ctx: IRestApiContext,
	{
		question,
		context,
		model,
		n8nVersion,
	}: {
		question: string;
		context: {
			schema: Array<{ nodeName: string; schema: Schema }>;
			inputSchema: { nodeName: string; schema: Schema };
			pushRef: string;
			ndvPushRef: string;
		};
		model: string;
		n8nVersion: string;
	},
): Promise<{ code: string }> {
	return await makeRestApiRequest(ctx, 'POST', '/ask-ai', {
		question,
		context,
		model,
		n8nVersion,
	} as IDataObject);
}

export const generateCurl = async (
	context: IRestApiContext,
	payload: GenerateCurlPayload,
): Promise<GenerateCurlResponse> => {
	return await makeRestApiRequest(
		context,
		'POST',
		'/ai/generate-curl',
		payload as unknown as IDataObject,
	);
};

export const askAssistant = async (
	context: IRestApiContext,
	payload: { message?: string; newSession?: boolean },
	onChunk: (chunk: string) => void,
): Promise<void> => {
	const headers = {
		'Content-Type': 'application/json',
	};
	const response = await fetch(`${context.baseUrl}/ai/chat-with-assistant`, {
		headers,
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify(payload),
	});
	if (response.ok && response.body) {
		console.log('Response:', response);
		// Handle the streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');

		async function readStream() {
			const { done, value } = await reader.read();
			if (done) {
				console.log('Stream finished');
				// waitingForResponse.value = false;
				return;
			}

			const chunk = decoder.decode(value);
			const splitChunks = chunk.split('\n');

			for (const splitChunk of splitChunks) {
				if (splitChunk) {
					onChunk(splitChunk);
				}
			}
			await readStream();
		}
		// Start reading the stream
		await readStream();
	} else {
		console.error('Error:', response.status);
	}
};

export const debugWithAssistant = async (
	context: IRestApiContext,
	payload: {
		nodeType?: INodeTypeDescription;
		error?: NodeError;
		errorNode?: INode;
		authType?: { name: string; value: string };
		userTraits?: { nodeVersion?: string; n8nVersion?: string };
		nodeInputData?: { inputNodeName?: string; inputData?: IDataObject };
		referencedNodesData?: { [key: string]: IDataObject };
		message?: string;
	},
	onChunk: (chunk: string) => void,
): Promise<void> => {
	const headers = {
		'Content-Type': 'application/json',
	};
	const response = await fetch(`${context.baseUrl}/ai/ai-assistant/error-debug`, {
		headers,
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify(payload),
	});
	if (response.ok && response.body) {
		console.log('Response:', response);
		// Handle the streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');

		async function readStream() {
			const { done, value } = await reader.read();
			if (done) {
				console.log('Stream finished');
				// waitingForResponse.value = false;
				return;
			}

			const chunk = decoder.decode(value);
			const splitChunks = chunk.split('\n');

			for (const splitChunk of splitChunks) {
				if (splitChunk) {
					onChunk(splitChunk);
				}
			}
			await readStream();
		}
		// Start reading the stream
		await readStream();
	} else {
		console.error('Error:', response.status);
	}
};

export const askPinecone = async (
	context: IRestApiContext,
	onChunk: (chunk: string) => void,
): Promise<void> => {
	const headers = {
		'Content-Type': 'application/json',
	};
	const response = await fetch(`${context.baseUrl}/ai/ask-pinecone`, {
		headers,
		method: 'POST',
		credentials: 'include',
	});
	if (response.ok && response.body) {
		// Handle the streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');

		async function readStream() {
			const { done, value } = await reader.read();
			if (done) {
				// console.log('Stream finished');
				// waitingForResponse.value = false;
				return;
			}

			const chunk = decoder.decode(value);
			const splitChunks = chunk.split('\n');

			for (const splitChunk of splitChunks) {
				if (splitChunk) {
					onChunk(splitChunk);
				}
			}
			await readStream();
		}
		// Start reading the stream
		await readStream();
	} else {
		console.error('Error:', response.status);
	}
};

export const applyCodeSuggestion = async (
	context: IRestApiContext,
	payload: { sessionId: string },
): Promise<void> => {
	const headers = {
		'Content-Type': 'application/json',
	};
	const response = await fetch(`${context.baseUrl}/ai/debug-chat/apply-code-suggestion`, {
		headers,
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify(payload),
	});

	// console.log('fetch response', await response.json());

	if (response.ok && response.body) {
		const body = await response.json();
		return body.data.codeSnippet;
	} else {
		console.error('Error:', response.status);
	}
};

export const debugChatWithAiErrorHelper = async (
	context: IRestApiContext,
	payload: DebugChatPayload,
	onChunk: (chunk: string) => void,
): Promise<void> => {
	const headers = {
		'Content-Type': 'application/json',
	};
	const response = await fetch(`${context.baseUrl}/ai/ai-assistant/code-node-debug`, {
		headers,
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify(payload),
	});

	if (response.ok && response.body) {
		// Handle the streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');

		async function readStream() {
			const { done, value } = await reader.read();
			if (done) {
				console.log('Stream finished');
				// waitingForResponse.value = false;
				return;
			}

			const chunk = decoder.decode(value);
			const splitChunks = chunk.split('\n');

			for (const splitChunk of splitChunks) {
				if (splitChunk) {
					onChunk(splitChunk);
				}
			}
			await readStream();
		}
		// Start reading the stream
		await readStream();
	} else {
		console.error('Error:', response.status);
	}
};

export const followUpChatWithAiErrorHelper = async (
	context: IRestApiContext,
	payload: { text: string; sessionId: string },
	onChunk: (chunk: string) => void,
): Promise<void> => {
	const headers = {
		'Content-Type': 'application/json',
	};
	const response = await fetch(`${context.baseUrl}/ai/debug-chat-follow-up-question`, {
		headers,
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify(payload),
	});

	if (response.ok && response.body) {
		// Handle the streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');

		async function readStream() {
			const { done, value } = await reader.read();
			if (done) {
				console.log('Stream finished');
				// waitingForResponse.value = false;
				return;
			}

			const chunk = decoder.decode(value);
			const splitChunks = chunk.split('\n');

			for (const splitChunk of splitChunks) {
				if (splitChunk) {
					onChunk(splitChunk);
				}
			}
			await readStream();
		}
		// Start reading the stream
		await readStream();
	} else {
		console.error('Error:', response.status);
	}
};
