import { defineStore } from 'pinia';
import * as aiApi from '@/api/ai';
import type { GenerateCurlPayload } from '@/api/ai';
import { useRootStore } from '@/stores/n8nRoot.store';
import { useSettingsStore } from '@/stores/settings.store';
import { computed, reactive, ref } from 'vue';
import type { Ref } from 'vue';
import type { AIAssistantConnectionInfo, XYPosition } from '@/Interface';
import { usePostHog } from './posthog.store';
import { AI_ASSISTANT_EXPERIMENT } from '@/constants';
import { chatEventBus } from '@n8n/chat/event-buses';
import { useUsersStore } from '@/stores/users.store';
import { useNDVStore } from '@/stores/ndv.store';
import type { ChatMessage } from '@n8n/chat/types';
import type { INodeTypeDescription, NodeError } from 'n8n-workflow';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';

const CURRENT_POPUP_HEIGHT = 94;

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

	async function sendMessage(text: string) {
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

	function onMessageReceived(messageChunk: string) {
		waitingForResponse.value = false;
		if (messageChunk.length === 0) return;
		if (messageChunk === '__END__') {
			if (debugSessionInProgress.value && getLastMessage().type !== 'component') {
				const followUpActions = [
					{ label: 'I need more detailed instructions', key: 'more_details' },
					{ label: 'I need another suggestion', key: 'another_suggestion' },
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
							await sendMessage(label);
							// Remove the quick replies so only user message is shown
							messages.value = messages.value.filter((message) => {
								return message.id !== newMessageId;
							});
						},
					},
				});
			}
		}

		if (getLastMessage()?.sender !== 'bot') {
			messages.value.push({
				createdAt: new Date().toISOString(),
				text: messageChunk,
				sender: 'bot',
				type: 'text',
				id: Math.random().toString(),
			});
			return;
		}

		const lastMessage = getLastMessage();

		if (lastMessage.type === 'text') {
			lastMessage.text += `\n${messageChunk}`;

			chatEventBus.emit('scrollToBottom');
		}
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
		chatTitle,
		messages,
		initialMessages,
		waitingForResponse,
		askAssistant,
		askPinecone,
		debugWithAssistant,
		debugWithAssistantFollowup,
		debugSessionInProgress,
	};
});
