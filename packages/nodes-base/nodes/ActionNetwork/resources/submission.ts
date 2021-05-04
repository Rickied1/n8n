import { createPersonSignupHelperFields, createPersonSignupHelperObject } from './person';
import { INodeProperties } from 'n8n-workflow';
import { createListOperations, createFilterFields, createResourceLink, createPaginationProperties, createFilterProperties } from '../helpers/fields';
import { IExecuteFunctions } from 'n8n-core/dist/src/Interfaces';
import { actionNetworkApiRequest } from '../helpers/request';
import { IDataObject } from '../../../../workflow/dist/src/Interfaces';

// DOCS: https://actionnetwork.org/docs/v2/submissions
// Scenario: Retrieving a collection of submission resources (GET)
// Scenario: Retrieving an individual submission resource (GET)
// Scenario: Creating a new submission (POST)
// Scenario: Modifying an submission (PUT)

export const fields = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		default: 'GET',
		description: 'Operation to perform',
		options: [
			{
				name: 'Get',
				value: 'GET',
			},
			{
				name: 'Create (POST)',
				value: 'POST',
			},
			{
				name: 'Update (PUT)',
				value: 'PUT',
			},
		],
		displayOptions: {
			show: {
				resource: [ 'submission' ],
			},
		},
	},
	{
		displayName: 'Form ID',
		name: 'form_id',
		type: 'string',
		default: '',
		required: false,
		displayOptions: {
			show: {
				resource: [ 'submission' ],
			},
		},
	},
	{
		displayName: 'Person ID',
		name: 'person_id',
		type: 'string',
		default: '',
		required: false,
		displayOptions: {
			show: {
				resource: [ 'submission' ],
			},
		},
	},
	{
		displayName: 'Submission ID',
		name: 'submission_id',
		type: 'string',
		required: false,
		default: '',
		displayOptions: {
			show: {
				resource: [ 'submission' ],
				operation: ['GET', 'PUT']
			}
		}
	},
	/**
	 * Adding or updating a resource
	 */
	{
		displayName: 'Additional properties',
		name: 'additional_properties',
		type: 'fixedCollection',
		default: '',
		placeholder: 'Add data',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: [ 'submission' ],
				operation: [ 'POST', 'PUT' ]
			}
		},
		options: [
			{
				name: 'identifiers',
				displayName: 'Custom ID',
				type: 'string',
				default: '',
			},
		]
	},
	{
		name: 'is_autoresponse_enabled',
		displayName: 'Enable Autoresponse Email',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: [ 'submission' ],
				operation: [ 'POST' ]
			}
		}
	},
	{
		name: "osdi:person",
		displayName: "Person URL",
		description: "Link to a person by their URL",
		type: 'string',
		required: false,
		default: '',
		displayOptions: {
			show: {
				resource: [ 'submission' ],
				operation: [ 'POST' ]
			}
		}
	},
	...createPersonSignupHelperFields({
		displayOptions: {
			show: {
				resource: ['submission'],
				operation: [ 'POST' ]
			}
		}
	}),
	/**
	 * Listing and getting resources
	 */
	...createListOperations({
		displayOptions: {
			show: {
				resource: [ 'submission' ],
				operation: [ 'GET' ],
				submission_id: [null, '', undefined]
			}
		}
	}),
	...createFilterFields({
		// Valid filter properties documented at https://actionnetwork.org/docs/v2#odata
		properties: [ 'identifier', 'created_date', 'modified_date' ],
		displayOptions: {
			show: {
				resource: [ 'submission' ],
				operation: [ 'GET' ],
				submission_id: [null, '', undefined]
			}
		}
	}),
] as INodeProperties[];

export const resolve = async (node: IExecuteFunctions, i: number) => {
	const form_id = node.getNodeParameter('form_id', i) as string;
	const person_id = node.getNodeParameter('person_id', i) as string;

	let url = `/api/v2`
	if (form_id) {
		url += `/forms/${form_id}/submissions`
	} else if (person_id) {
		url += `/people/${person_id}/submissions`
	} else {
		throw new Error("You must provide a Form ID or Person ID")
	}

	const submission_id = node.getNodeParameter('submission_id', i) as string;
	const operation = node.getNodeParameter('operation', i) as 'GET' | 'PUT' | 'POST';

	if (submission_id && operation === 'GET') {
		return actionNetworkApiRequest.call(node, operation, `${url}/${submission_id}`) as Promise<IDataObject>
	}

	if (submission_id && operation === 'PUT') {
		let body: any = {
			'identifiers': (node.getNodeParameter('additional_properties', i, { identifiers: [] }) as any)?.identifiers
		}
		return actionNetworkApiRequest.call(node, operation, `${url}/${submission_id}`, body) as Promise<IDataObject>
	}

	if (form_id && operation === 'POST') {
		let body: any = {
			'identifiers': (node.getNodeParameter('additional_properties', i, { identifiers: [] }) as any)?.identifiers,
			'triggers': {
				'autoresponse': {
					'enabled': node.getNodeParameter('is_autoresponse_enabled', i) as boolean
				}
			}
		}

		const personRefURL = node.getNodeParameter('osdi:person', i) as string;
		if (personRefURL) {
			body = { ...body, ...createResourceLink('osdi:person', personRefURL) }
		} else {
			body = { ...body, ...createPersonSignupHelperObject(node, i) }
		}

		return actionNetworkApiRequest.call(node, operation, url, body) as Promise<IDataObject>
	}

	// Otherwise list all
	const qs = {
		...createPaginationProperties(node, i),
		...createFilterProperties(node, i)
	}
	return actionNetworkApiRequest.call(node, 'GET', url, undefined, undefined, qs) as Promise<IDataObject[]>
}
