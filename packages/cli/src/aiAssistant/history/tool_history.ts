// Tool history is just for debugging
export let toolHistory = {
	internet_search: [] as string[],
	n8n_documentation: [] as string[],
};

export const resetToolHistory = () => {
	toolHistory = {
		internet_search: [],
		n8n_documentation: [],
	};
};
