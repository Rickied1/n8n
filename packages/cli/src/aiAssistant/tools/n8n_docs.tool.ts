import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { toolHistory } from '../history/tool_history';
import { DynamicTool } from '@langchain/core/tools';

export const searchDocsVectorStore = async (question: string) => {
	// ----------------- Vector store -----------------
	const pc = new Pinecone({
		apiKey: process.env.N8N_AI_PINECONE_API_KEY ?? '',
	});
	const index = pc.Index('n8n-docs');
	const vectorStore = await PineconeStore.fromExistingIndex(
		new OpenAIEmbeddings({
			openAIApiKey: process.env.N8N_AI_OPENAI_API_KEY,
			modelName: 'text-embedding-3-large',
			dimensions: 3072,
		}),
		{
			pineconeIndex: index,
		},
	);
	// ----------------- Get top chunks matching query -----------------
	const results = await vectorStore.similaritySearch(question, 3);
	console.log('>> 🧰 << GOT THESE DOCUMENTS:');
	let out = '';
	// This will make sure that we don't repeat the same document in the output
	const documents: string[] = [];
	results.forEach((result, i) => {
		const source = (result?.metadata?.source as string) ?? '';

		if (documents.includes(source)) {
			return;
		}
		documents.push(source);
		console.log('\t📃', source);
		toolHistory.n8n_documentation.push(source);
		out += `--- N8N DOCUMENTATION DOCUMENT ${i + 1} ---\n${result.pageContent}\n\n`;
	});
	if (results.length === 0) {
		toolHistory.n8n_documentation.push('NO DOCS FOUND');
	}
	return out;
}

export const n8nInfoTool = new DynamicTool({
	name: 'n8n_documentation',
	description: 'Has access to the official n8n documentation',
	func: async (input: string) => {
		console.log('>> 🧰 << n8nInfoTool:', input);
		return (await searchDocsVectorStore(input)).toString();
	},
});
