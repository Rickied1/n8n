// ReAct agent history is string, according to the docs:
// https://js.langchain.com/v0.1/docs/modules/agents/agent_types/react/#using-with-chat-history
// TODO:
//	- 	Add sessions support
//	- 	We can use UserMessage and SystemMessage classes to make it more readable
//			but in the end it has to render to a string
export let chatHistory: string[] = [];
export const stringifyHistory = (history: string[]) => history.join('\n');

export const getHumanMessages = (history: string[]) => {
	return history.filter((message, index) => message.startsWith('Human:'));
};

export const clearChatHistory = () => {
	chatHistory = [];
}
