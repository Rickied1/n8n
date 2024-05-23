import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';
import { DynamicTool } from '@langchain/core/tools';
import { toolHistory } from '../history/tool_history';

const INTERNET_TOOL_SITES = [
	'https://community.n8n.io',
	'https://blog.n8n.io',
	'https://n8n.io'
];

export const internetSearchTool = new DynamicTool({
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
