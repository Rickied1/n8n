import { AssignmentSetField } from "n8n-nodes-base/nodes/Set/v2/helpers/interfaces";
import { AssignmentCollectionValue, IDataObject, INode, INodeTypeDescription, NodeError } from "n8n-workflow";

export const prepareDebugUserPrompt = (
	nodeType: INodeTypeDescription,
	error: NodeError,
	authType?: { name: string; value: string },
	userTraits?: { nodeVersion?: string; n8nVersion?: string },
	nodeInputData?: { inputNodeName: string; inputData: IDataObject },
	referencedNodesData?: { [key: string]: IDataObject },
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
	// Referenced nodes data
	let referencedNodesPrompt = '';
	if (referencedNodesData) {
		referencedNodesPrompt = `This is the JSON object that represents the data of the referenced nodes:`;
		Object.keys(referencedNodesData).forEach((key) => {
			referencedNodesPrompt += `
				- Node "${key}": ${JSON.stringify(referencedNodesData[key])}`;
		});
	}
	// Direct input data
	let nodeInputPrompt = '';
	if (nodeInputData?.inputData && nodeInputData.inputNodeName && !(nodeInputData.inputNodeName in (referencedNodesData ?? {}))) {
		nodeInputPrompt = `This is the JSON object that represents the node's input data (coming from the node named "${nodeInputData.inputNodeName}"): ${JSON.stringify(nodeInputData.inputData)}`;
	}
	const userPrompt = `
		I am having the following error in my ${nodeType.displayName} node: ${errorMessage} ${error.description ? `- ${error.description}` : ''}
		- Here is some more information about my workflow and myself that you can use to provide a solution:
			- This is the JSON object that represents the node that I am having an error in, you can use it to inspect current node parameter values:
				${JSON.stringify(prepareNodeParameterValues(error.node))}
			${authPrompt ? '- ' + authPrompt : ''}
			${userTraits?.n8nVersion ? `- I am using n8n version: ${userTraits.n8nVersion}` : ''}
			${userTraits?.nodeVersion ? `- Version of the ${nodeType.displayName} node that I am having an error in: ${userTraits.nodeVersion}` : ''}
			${nodeInputPrompt ? `- ${nodeInputPrompt}. Use this to help me fix expressions that reference this data` : ''}
			${referencedNodesPrompt ? `- ${referencedNodesPrompt}. Use this to help me fix expressions that reference any of these nodes` : ''}
		`;
	return userPrompt;
}

export const prepareNodeParameterValues = (node: INode) => {
	if (!node.parameters) {
		return [];
	}
	// Get fields from the Set node
	// TODO: We'll probably want to massage the data from some other node types as well
	if (node.type === 'n8n-nodes-base.set' && node.parameters.assignments) {
		const fields: Record<string, string> = {};
		const assignments = node.parameters.assignments as AssignmentCollectionValue;
		if (assignments.assignments && assignments.assignments.length) {
			assignments.assignments.forEach((assignment) => {
				if (assignment.name && assignment.value) {
					fields[assignment.name] = String(assignment.value); // Convert value to string
				}
			});
			const oldParameters = { ...node.parameters };
			delete oldParameters.assignments;
			return { ...oldParameters, ...fields };
		}
	}
	return node.parameters;
}
