import { USER_INTENT } from "../types";

// TODO: If this turns out flaky we can add examples or more details in the prompt
export const INTENT_DETECT_PROMPT = `
Your job is to detect user's intent from the snippet of their conversation with an assistant.
Your answer should be one of the following:
'${USER_INTENT.NEEDS_MORE_DETAILS}', '${USER_INTENT.NEEDS_ANOTHER_SUGGESTION}' or '${USER_INTENT.UNKNOWN}' and nothing else.
This is the part of the conversation:
Assistant: {assistantQuestion}
User: {userAnswer}
`;
