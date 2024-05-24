import { CHAT_HISTORY_CONVERSATION_LIMIT } from "../constants";
import { QUICK_ACTIONS } from "../prompts/debug_prompts";

// ReAct agent history is string, according to the docs:
// https://js.langchain.com/v0.1/docs/modules/agents/agent_types/react/#using-with-chat-history
// TODO:
//	- 	Add sessions support
//	- 	We can use UserMessage and SystemMessage classes to make it more readable
//			but in the end it has to render to a string
export let chatHistory: string[] = [];
export const stringifyHistory = (history: string[]) => history.join('\n');

// Track used quick actions so we can alter them as the conversation progresses
export const usedQuickActions: Record<string, number> ={
	...QUICK_ACTIONS.reduce((acc, { label }) => ({ ...acc, [label]: 0 }), {}),
}

export const increaseSuggestionCounter = (label: string) => {
	if (label in usedQuickActions) {
		usedQuickActions[label]++;
	}
}

export const resetSuggestionsCounter = (label: string) => {
	if (label in usedQuickActions) {
		usedQuickActions[label] = 0;
	}
}

export const checkIfAllQuickActionsUsed = () => {
	// Check if any of the quick actions have been used more than three times
	return QUICK_ACTIONS.some(({ label }) => usedQuickActions[label] > 3);
}

export const getHumanMessages = (history: string[]) => {
	return history.filter((message, index) => message.startsWith('Human:'));
};

export const addConversationToHistory = (userMessage: string, systemMessage: string) => {
	// If history has more than 5 conversations, remove the first one
	if (chatHistory.length >= CHAT_HISTORY_CONVERSATION_LIMIT * 2) {
		chatHistory.shift();
		chatHistory.shift();
	}
	chatHistory.push(`Human: ${userMessage}`);
	chatHistory.push(`Assistant: ${systemMessage}`);
};

export const clearChatHistory = () => {
	chatHistory = [];
	for (const key in usedQuickActions) {
		usedQuickActions[key] = 0;
	}
	QUICK_ACTIONS.forEach((action) => {
		action.disabled = false;
	})
}
