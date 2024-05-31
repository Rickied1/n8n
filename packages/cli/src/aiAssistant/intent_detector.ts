import { ChatOpenAI } from "@langchain/openai";
import { MORE_DETAILS_USER_PROMPT, QUICK_ACTIONS, SUGGESTION_USER_PROMPT } from "./prompts/debug_prompts";
import { IntentDetectionResult, USER_INTENT } from "./types";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { INTENT_DETECT_PROMPT } from "./prompts/intent_detection_prompt";

const intentDetectionModel = new ChatOpenAI({
	temperature: 0,
	openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
	modelName: 'gpt-3.5-turbo',
	streaming: true,
});

/**
 * Uses LLM to detect user's intent from the snippet of their conversation with an assistant.
 * @param question Assistant's question
 * @param answer User's answer
 * @returns One of the values from USER_INTENT enum
 */
export const detectUserIntent = async (question: string, answer: string): Promise<USER_INTENT> => {
	const moreDetailsQuickAction = QUICK_ACTIONS.find((action) => action.key === 'more_details');
	const anotherSuggestionQuickAction = QUICK_ACTIONS.find((action) => action.key === 'another_suggestion');
	// Try to map the answer to the quick actions before using the model
	// TODO: maybe we can remove the startsWith check and just use the quick actions as is
	if (answer === moreDetailsQuickAction?.label || answer.toLowerCase().includes('yes')) {
		return USER_INTENT.NEEDS_MORE_DETAILS;
	} else if (answer === anotherSuggestionQuickAction?.label || answer.toLowerCase().includes('no')) {
		return USER_INTENT.NEEDS_ANOTHER_SUGGESTION;
	} else {
		const promptTemplate = ChatPromptTemplate.fromMessages([
			["system", INTENT_DETECT_PROMPT],
		]);
		const chain = promptTemplate.pipe(intentDetectionModel);
		const response = await chain.invoke({ assistantQuestion: question, userAnswer: answer});
		const responseContent = response.content;
		return responseContent as USER_INTENT;
	}
}

/**
 * Gets the next user prompt based on detected intent.
 * This prompt will be send instead of the original user message.
 * @param userMessage
 * @param assistantMessage
 * @returns
 */

export const getNextUserPrompt = async (userMessage: string, assistantMessage: string): Promise<IntentDetectionResult> => {
	const intent = await detectUserIntent(assistantMessage, userMessage);
	console.log('>> 🎰 INTENT DETECTOR <<', intent);
	switch (intent) {
		case USER_INTENT.NEEDS_MORE_DETAILS:
			return {
				detectedIntent: USER_INTENT.NEEDS_MORE_DETAILS,
				prompt: `Yes, I need a detailed guide on how to solve the issue.\n${MORE_DETAILS_USER_PROMPT}`,
			}
		case USER_INTENT.NEEDS_ANOTHER_SUGGESTION:
			return {
				detectedIntent: USER_INTENT.NEEDS_ANOTHER_SUGGESTION,
				prompt: `No, I need another suggestion.\n${SUGGESTION_USER_PROMPT}`,
			}
		default:
			return {
				detectedIntent: USER_INTENT.UNKNOWN,
				prompt: userMessage,
			};
	}
}
