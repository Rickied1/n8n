// TODO: Add more types from the ai controller
export type AssistantAnswer = {
	title: string;
	text: string;
	followUp: string;
};

export type QuickAction = {
	label: string;
	key: string;
	disabled: boolean;
};

export enum USER_INTENT {
	NEEDS_MORE_DETAILS = 'Asking for more details',
	NEEDS_ANOTHER_SUGGESTION = 'Needs another suggestion',
	UNKNOWN = 'Unknown',
}

export type IntentDetectionResult = {
	detectedIntent: USER_INTENT;
	prompt: string;
};

