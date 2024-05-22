import { defineStore } from 'pinia';
import * as aiApi from '@/api/ai';
import type { GenerateCurlPayload } from '@/api/ai';
import { useRootStore } from '@/stores/n8nRoot.store';
import { useSettingsStore } from '@/stores/settings.store';
import { computed, nextTick, reactive, ref } from 'vue';
import type { Ref } from 'vue';
import type { AIAssistantConnectionInfo, Schema, XYPosition } from '@/Interface';
import { usePostHog } from './posthog.store';
import { AI_ASSISTANT_EXPERIMENT } from '@/constants';
import { chatEventBus } from '@n8n/chat/event-buses';
import { useUsersStore } from '@/stores/users.store';
import { useNDVStore } from '@/stores/ndv.store';
import type { ChatMessage } from '@n8n/chat/types';
import {
	jsonParse,
	type IDataObject,
	type INodeTypeDescription,
	type IUser,
	type NodeError,
} from 'n8n-workflow';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';
import { useWorkflowsStore } from './workflows.store';
import { executionDataToJson } from '@/utils/nodeTypesUtils';
import { useDataSchema } from '@/composables/useDataSchema';
import { codeNodeEditorEventBus } from '@/event-bus';

const CURRENT_POPUP_HEIGHT = 94;

export interface DebugChatPayload {
	text?: string;
	sessionId: string;
	error?: NodeError;
	schemas?: Array<{ node_name: string; schema: Schema }>;
	nodes?: string[];
	parameters?: IDataObject;
}

const codeEditorEventBus = codeNodeEditorEventBus;

/**
 * Calculates the position for the next step popup based on the specified element
 * so they are aligned vertically.
 */
const getPopupCenterPosition = (relativeElement: HTMLElement) => {
	const bounds = relativeElement.getBoundingClientRect();
	const rectMiddle = bounds.top + bounds.height / 2;
	const x = bounds.left + bounds.width + 22;
	const y = rectMiddle - CURRENT_POPUP_HEIGHT / 2;
	return [x, y] as XYPosition;
};

export const useAIStore = defineStore('ai', () => {
	const rootStore = useRootStore();
	const posthogStore = usePostHog();
	const usersStore = useUsersStore();
	const settingsStore = useSettingsStore();
	const waitingForResponse = ref(false);
	const chatTitle = ref('🧞 n8n Assistant::Free chat mode');
	const currentSessionId = ref<string>('Whatever');

	const assistantChatOpen = ref(false);
	const nextStepPopupConfig = reactive({
		open: false,
		title: '',
		position: [0, 0] as XYPosition,
	});
	const latestConnectionInfo: Ref<AIAssistantConnectionInfo | null> = ref(null);
	const isGenerateCurlEnabled = computed(() => settingsStore.settings.ai.features.generateCurl);
	const isAssistantExperimentEnabled = computed(
		() => posthogStore.getVariant(AI_ASSISTANT_EXPERIMENT.name) === AI_ASSISTANT_EXPERIMENT.variant,
	);

	const userName = computed(() => usersStore.currentUser?.firstName ?? 'there');
	const activeNode = computed(() => useNDVStore().activeNodeName);

	const debugSessionInProgress = ref(false);
	const initialMessages = ref<ChatMessage[]>([
		{
			id: '1',
			type: 'text',
			sender: 'bot',
			createdAt: new Date().toISOString(),
			text: `Hi ${userName.value}! I am your n8n assistant. How can I help you today?`,
		},
		{
			id: '2',
			type: 'text',
			sender: 'bot',
			createdAt: new Date().toISOString(),
			text: '⚠️ I currently do not support chat sessions, so make sure to reload your page to start a new session.',
		},
	]);

	const messages = ref<ChatMessage[]>([]);

	function openNextStepPopup(title: string, relativeElement: HTMLElement) {
		nextStepPopupConfig.open = true;
		nextStepPopupConfig.title = title;
		nextStepPopupConfig.position = getPopupCenterPosition(relativeElement);
	}

	function closeNextStepPopup() {
		nextStepPopupConfig.open = false;
	}

	async function generateCurl(payload: GenerateCurlPayload) {
		return await aiApi.generateCurl(rootStore.getRestApiContext, payload);
	}

	async function sendMessageToAiCodeErrorHelper(text: string) {
		messages.value.push({
			createdAt: new Date().toISOString(),
			text,
			sender: 'user',
			id: Math.random().toString(),
		});

		chatEventBus.emit('scrollToBottom');

		void debugChatWithAiErrorHelper({
			error: new Error('Whatever'),
			text,
			sessionId: currentSessionId.value,
		});
	}

	async function sendFollowUpQuestionToAiCodeErrorHelper(question: string) {
		messages.value.push({
			createdAt: new Date().toISOString(),
			text: question,
			sender: 'user',
			id: Math.random().toString(),
		});

		chatEventBus.emit('scrollToBottom');

		void followUpChatWithAiErrorHelper({
			text: question,
			sessionId: currentSessionId.value,
		});
	}

	const isCodeNodeActive = () => useNDVStore().activeNode?.type === 'n8n-nodes-base.code';

	async function sendMessage(text: string) {
		// this is called when a user inputs a message in the chat
		if (isCodeNodeActive()) {
			await sendFollowUpQuestionToAiCodeErrorHelper(text);
			return;
		}

		const hasUserMessages = messages.value.some((message) => message.sender === 'user');
		messages.value.push({
			createdAt: new Date().toISOString(),
			text,
			sender: 'user',
			id: Math.random().toString(),
		});

		chatEventBus.emit('scrollToBottom');

		waitingForResponse.value = true;
		if (debugSessionInProgress.value) {
			await debugWithAssistantFollowup(text);
		} else {
			await askAssistant(text, !hasUserMessages);
		}
		waitingForResponse.value = false;
	}

	function getLastMessage() {
		return messages.value[messages.value.length - 1];
	}

	const n8nVersion = computed(() => {
		const baseUrl = rootStore.urlBaseEditor;
		let instanceType = 'Self Hosted';
		if (baseUrl.includes('n8n.cloud')) {
			instanceType = 'Cloud';
		}
		return rootStore.versionCli + ` (${instanceType})`;
	});

	async function onMessageSuggestionReceived(messageChunk: string) {
		waitingForResponse.value = false;
		if (messageChunk.length === 0) return;
		if (messageChunk === '__END__') {
			const lastMessage = getLastMessage();

			// If last message is a component, then show the follow-up actions

			if (lastMessage.type === 'component') {
				const followUpQuestion: string = lastMessage.arguments.suggestions[0].followUpQuestion;
				const suggestedCode: string = lastMessage.arguments.suggestions[0].codeDiff;
				const userQuestionRelatedToTheCurrentContext =
					lastMessage.arguments.suggestions[0].userQuestionRelatedToTheCurrentContext;

				if (!userQuestionRelatedToTheCurrentContext) {
					return;
				}

				messages.value.push({
					createdAt: new Date().toISOString(),
					sender: 'bot',
					type: 'text',
					id: Math.random().toString(),
					text: followUpQuestion,
				});

				let affirmativeAction = lastMessage.arguments.suggestions[0].codeDiff
					? { key: 'import_code', label: 'Yes, apply the change' }
					: { ley: 'update_run_mode', label: 'Yes, update the run mode' };

				const followUpActions = [
					affirmativeAction,
					{ key: 'another_suggestion', label: 'No, try another suggestion' },
				];
				const newMessageId = Math.random().toString();
				messages.value.push({
					createdAt: new Date().toISOString(),
					transparent: true,
					key: 'QuickReplies',
					sender: 'bot',
					type: 'component',
					id: newMessageId,
					arguments: {
						suggestions: followUpActions,
						async onReplySelected({ label, key }: { action: string; label: string }) {
							if (key === 'import_code') {
								waitingForResponse.value = true;

								await nextTick();
								await nextTick();

								chatEventBus.emit('scrollToBottom');

								const suggestedCode = await aiApi.applyCodeSuggestion(rootStore.getRestApiContext, {
									sessionId: currentSessionId.value,
								});

								waitingForResponse.value = false;

								codeEditorEventBus.emit('updateCodeContent', suggestedCode);

								messages.value.push({
									createdAt: new Date().toISOString(),
									sender: 'bot',
									type: 'text',
									id: Math.random().toString(),
									text: 'Perfect, I inserted the code. Feel free to execute the the node again.',
								});

								await nextTick();
								await nextTick();
								chatEventBus.emit('scrollToBottom');
								return;
							}

							await sendMessageToAiCodeErrorHelper(label);
							// Remove the quick replies so only user message is shown
							messages.value = messages.value.filter((message) => {
								return message.id !== newMessageId;
							});
						},
					},
				});
				await nextTick();
				await nextTick();
				chatEventBus.emit('scrollToBottom');
			}
			return;
		}

		const parsedMessage = jsonParse<Record<string, unknown>>(messageChunk);

		const suggestions = [
			{
				...parsedMessage.suggestion,
				key: 'testingricardo',
				followUpQuestion: 'Would you like to try this solution?',
				codeDiff: parsedMessage.suggestion.codeDiff
					? '```diff\n' + parsedMessage.suggestion.codeDiff + '\n```'
					: '',
				userQuestionRelatedToTheCurrentContext:
					parsedMessage.suggestion.userQuestionRelatedToTheCurrentContext,
			},
		];

		if (getLastMessage()?.sender !== 'bot') {
			messages.value.push({
				createdAt: new Date().toISOString(),
				sender: 'bot',
				key: 'MessageWithSuggestions',
				type: 'component',
				id: Math.random().toString(),
				arguments: {
					suggestions,
				},
			});

			chatEventBus.emit('scrollToBottom');
			return;
		}

		const lastMessage = getLastMessage();

		if (lastMessage.type === 'component') {
			lastMessage.arguments = { suggestions };
			await nextTick();
			await nextTick();
			chatEventBus.emit('scrollToBottom');
		}
	}

	async function onFollowUpResponseRecieved(messageChunk: string) {
		waitingForResponse.value = false;
		if (messageChunk.length === 0) return;
		if (messageChunk === '__END__') {
			//have to get the last message and the args from there

			const lastMessage = getLastMessage();

			if (
				lastMessage.type === 'component' &&
				lastMessage.key === 'FollowUp' &&
				lastMessage.arguments?.followUp?.codeDiff
			) {
				const newMessageId = Math.random().toString();
				messages.value.push({
					createdAt: new Date().toISOString(),
					transparent: true,
					key: 'QuickReplies',
					sender: 'bot',
					type: 'component',
					id: newMessageId,
					arguments: {
						suggestions: [{ key: 'import_code', label: 'Yes, apply the changes' }],
						async onReplySelected({ label, key }: { action: string; label: string }) {
							if (key === 'import_code') {
								waitingForResponse.value = true;

								await nextTick();
								await nextTick();

								chatEventBus.emit('scrollToBottom');

								const suggestedCode = await aiApi.applyCodeSuggestion(rootStore.getRestApiContext, {
									sessionId: currentSessionId.value,
								});

								waitingForResponse.value = false;

								codeEditorEventBus.emit('updateCodeContent', suggestedCode);

								messages.value.push({
									createdAt: new Date().toISOString(),
									sender: 'bot',
									type: 'text',
									id: Math.random().toString(),
									text: 'Perfect, I inserted the code. Feel free to execute the the node again.',
								});

								await nextTick();
								await nextTick();
								chatEventBus.emit('scrollToBottom');
								return;
							}
						},
					},
				});
			}
			await nextTick();
			await nextTick();

			chatEventBus.emit('scrollToBottom');

			return;
		}

		const parsedMessage = jsonParse<Record<string, unknown>>(messageChunk);

		if (getLastMessage()?.sender === 'user') {
			console.log('CREEE EN COMPONENTE', parsedMessage);

			messages.value.push({
				createdAt: new Date().toISOString(),
				sender: 'bot',
				key: 'FollowUp',
				type: 'component',
				arguments: {
					followUp: {
						...parsedMessage.followUp,
						codeDiff: parsedMessage.followUp.codeDiff
							? '```diff\n' + parsedMessage.followUp.codeDiff + '\n```'
							: '',
					},
				},
				id: Math.random().toString(),
			});
			return;
		}

		console.log('get argument to the compoent');
		const lastMessage = getLastMessage();
		lastMessage.arguments = {
			followUp: {
				...parsedMessage.followUp,
				codeDiff: parsedMessage.followUp.codeDiff
					? '```diff\n' + parsedMessage.followUp.codeDiff + '\n```'
					: '',
			},
		};

		// if (parsedMessage.followUp?.whatChanged)
		// 	messages.value.push({
		// 		createdAt: new Date().toISOString(),
		// 		text: parsedMessage.followUp?.whatChanged,
		// 		sender: 'bot',
		// 		type: 'text',
		// 		id: Math.random().toString(),
		// 	});
		chatEventBus.emit('scrollToBottom');
	}

	function onMessageReceived(messageChunk: string) {
		waitingForResponse.value = false;
		if (messageChunk.length === 0) return;
		let jsonResponse: {
			response?: string;
			debugInfo?: string;
			quickActions?: Array<{ label: string; value: string; disabled: boolean }>;
		} | null = null;
		try {
			jsonResponse = JSON.parse(messageChunk);
		} catch (error) {
			return;
		}

		let newMessageText = jsonResponse?.response ?? messageChunk;
		if (jsonResponse?.response) {
			try {
				const jsonSuggestion: { suggestionTitle?: string; suggestionText?: string } = JSON.parse(
					jsonResponse.response,
				);
				if (jsonSuggestion.suggestionTitle && jsonSuggestion.suggestionText) {
					newMessageText = `### ${jsonSuggestion.suggestionTitle}\r\n\n ${jsonSuggestion.suggestionText}`;
				}
			} catch (error) {
				// newMessageText = messageChunk;
				console.log('Error parsing JSON', error);
			}
		}

		messages.value.push({
			createdAt: new Date().toISOString(),
			text: newMessageText,
			sender: 'bot',
			type: 'text',
			id: Math.random().toString(),
		});
		if (jsonResponse?.debugInfo) {
			messages.value.push({
				createdAt: new Date().toISOString(),
				text: `\`\`\`\n${jsonResponse.debugInfo}`,
				sender: 'bot',
				type: 'text',
				id: Math.random().toString(),
			});
		}

		if (jsonResponse?.quickActions) {
			const quickReplies = jsonResponse?.quickActions.filter((action) => !action.disabled);
			const newMessageId = Math.random().toString();
			messages.value.push({
				createdAt: new Date().toISOString(),
				transparent: true,
				key: 'QuickReplies',
				sender: 'bot',
				type: 'component',
				id: newMessageId,
				arguments: {
					suggestions: quickReplies,
					async onReplySelected({ label, key }: { action: string; label: string }) {
						await sendMessage(label);
						// Remove the quick replies so only user message is shown
						messages.value = messages.value.filter((message) => {
							return message.id !== newMessageId;
						});
					},
				},
			});
		}
		chatEventBus.emit('scrollToBottom');
	}

	function nodeVersionTag(nodeType: NodeError['node']): string {
		let tag = '';
		if (!nodeType || ('hidden' in nodeType && nodeType.hidden)) {
			tag = 'Deprecated';
		} else {
			const latestNodeVersion = Math.max(...useNodeTypesStore().getNodeVersions(nodeType.type));
			if (latestNodeVersion === nodeType.typeVersion) {
				tag = 'Latest';
			}
		}
		return `${nodeType.typeVersion} (${tag})`;
	}

	async function debugWithAssistantFollowup(message: string) {
		chatEventBus.emit('open');
		waitingForResponse.value = true;
		await aiApi.debugWithAssistant(rootStore.getRestApiContext, { message }, onMessageReceived);
		waitingForResponse.value = false;
	}

	async function debugWithAssistant(
		nodeType: INodeTypeDescription,
		error: NodeError,
		authType?: { name: string; value: string },
	) {
		chatTitle.value = '🧞 n8n Assistant::Debug mode';
		chatEventBus.emit('open');
		initialMessages.value[0].text = `Hi ${userName.value}! I see you're having trouble with the __${activeNode.value}__ node. Let me help you with that.`;
		waitingForResponse.value = true;
		let userTraits: { nodeVersion?: string; n8nVersion?: string } = {};
		if (error) {
			userTraits = {
				nodeVersion: nodeVersionTag(error.node),
				n8nVersion: n8nVersion.value,
			};
		}
		await aiApi.debugWithAssistant(
			rootStore.getRestApiContext,
			{ nodeType, error, authType, userTraits },
			onMessageReceived,
		);
		waitingForResponse.value = false;
	}

	async function startNewDebugSession(error: NodeError) {
		const currentNode = useNDVStore().activeNode;
		const workflowNodes = useWorkflowsStore().allNodes;

		const schemas = workflowNodes.map((node) => {
			const { getSchemaForExecutionData, getInputDataWithPinned } = useDataSchema();
			const schema = getSchemaForExecutionData(
				executionDataToJson(getInputDataWithPinned(node)),
				true,
			);
			return {
				node_name: node.name,
				schema,
			};
		});

		const currentNodeParameters = currentNode?.parameters ?? {};
		const currentUser = usersStore.currentUser ?? ({} as IUser);
		const activeNode = useNDVStore().activeNode?.id;

		const digestMessage = async (message: string) => {
			const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
			const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); // hash the message
			const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
			const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
			return hashHex;
		};

		const errorId = await digestMessage(error.message);

		messages.value = [];
		currentSessionId.value = `${currentUser.id}-${activeNode}-${errorId}`;
		delete error.stack;
		chatEventBus.emit('open');

		return await aiApi.debugChatWithAiErrorHelper(
			rootStore.getRestApiContext,
			{
				error,
				sessionId: currentSessionId.value,
				schemas,
				nodes: workflowNodes.map((n) => n.name),
				parameters: currentNodeParameters,
			},
			onMessageSuggestionReceived,
		);
	}

	async function debugChatWithAiErrorHelper(payload: DebugChatPayload) {
		waitingForResponse.value = true;
		return await aiApi.debugChatWithAiErrorHelper(
			rootStore.getRestApiContext,
			payload,
			onMessageSuggestionReceived,
		);
	}

	async function followUpChatWithAiErrorHelper(payload: { text: string; sessionId: string }) {
		waitingForResponse.value = true;
		return await aiApi.followUpChatWithAiErrorHelper(
			rootStore.getRestApiContext,
			{ ...payload },
			onFollowUpResponseRecieved,
		);
	}

	async function askAssistant(message: string, newSession: boolean = false) {
		await aiApi.askAssistant(
			rootStore.getRestApiContext,
			{ message, newSession },
			onMessageReceived,
		);
	}

	async function askPinecone() {
		await aiApi.askPinecone(rootStore.getRestApiContext, onMessageReceived);
	}

	return {
		assistantChatOpen,
		nextStepPopupConfig,
		openNextStepPopup,
		closeNextStepPopup,
		latestConnectionInfo,
		generateCurl,
		isGenerateCurlEnabled,
		isAssistantExperimentEnabled,
		sendMessage,
		debugChatWithAiErrorHelper,
		chatTitle,
		messages,
		initialMessages,
		waitingForResponse,
		askAssistant,
		askPinecone,
		debugWithAssistant,
		debugWithAssistantFollowup,
		debugSessionInProgress,
		startNewDebugSession,
	};
});
