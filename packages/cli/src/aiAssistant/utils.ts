import { IDataObject, INode, INodeTypeDescription, NodeError } from "n8n-workflow";

export const prepareDebugUserPrompt = (
	nodeType: INodeTypeDescription,
	error: NodeError,
	authType?: { name: string; value: string },
	userTraits?: { nodeVersion?: string; n8nVersion?: string },
	nodeInputData?: { inputNodeName: string; inputData: IDataObject },
) => {
	// Authentication info
	let authPrompt = `I am using the following authentication type: ${authType?.name}`;
	if (!authType && error.node.credentials) {
		authPrompt = `This is the JSON object that represents n8n credentials for the this node: ${JSON.stringify(error.node.credentials)}`;
	} else if (!authType && !error.node.credentials) {
		authPrompt = '';
	}
	// Error info
	let errorMessage = error.message;
	if (!errorMessage) {
		errorMessage = error.messages.join(', ');
	}
	// Node input data
	let nodeInputPrompt = '';
	if (nodeInputData?.inputData && nodeInputData.inputNodeName) {
		nodeInputPrompt = `This is the JSON object that represents the node's input data (coming from the node named "${nodeInputData.inputNodeName}"): ${JSON.stringify(nodeInputData.inputData)}`;
	}
	console.log(error.stack);
	const userPrompt = `
		I am having the following error in my ${nodeType.displayName} node: ${errorMessage} ${error.description ? `- ${error.description}` : ''}
		- Here is some more information about my workflow and myself that you can use to provide a solution:
			- This is the JSON object that represents the node that I am having an error in, you can use it to inspect current node parameter values:
				${JSON.stringify(removeUnrelevantNodeProps(error.node))}
			${nodeInputPrompt ? `- ${nodeInputPrompt}. Use this to help me fix expressions that reference this data` : ''}
			${authPrompt ? '- ' + authPrompt : ''}
			${userTraits?.n8nVersion ? `- I am using n8n version: ${userTraits.n8nVersion}` : ''}
			${userTraits?.nodeVersion ? `- Version of the ${nodeType.displayName} node that I am having an error in: ${userTraits.nodeVersion}` : ''}
		`;
	return userPrompt;
}


// Remove id and position from node parameters since they are not relevant to the assistant
export const removeUnrelevantNodeProps = (node: INode) => {
	const newParameters = { ...node.parameters };
	delete newParameters.id;
	delete newParameters.position;
	return newParameters;
};
