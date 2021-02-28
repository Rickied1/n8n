import { createPersonSignupHelperFields, createPersonSignupHelperObject } from './person';
import { INodeProperties } from 'n8n-workflow';
import { createListOperations, createFilterFields, createPaginationProperties, createFilterProperties } from '../helpers/fields';
import { IExecuteFunctions } from 'n8n-core/dist/src/Interfaces';
import { actionNetworkApiRequest } from '../helpers/request';
import { IDataObject } from '../../../../workflow/dist/src/Interfaces';

// https://actionnetwork.org/docs/v2/advocacy_campaigns
// Scenario: Retrieving a collection of event campaign resources (GET)
// Scenario: Retrieving an individual event campaign resource (GET)
// Scenario: Creating a new event campaign (POST)
// Scenario: Modifying an event campaign (PUT)

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
				resource: [ 'advocacy_campaign' ],
			},
		},
	},
	{
		displayName: 'Event Campaign ID',
		name: 'advocacy_campaign_id',
		type: 'string',
		default: '',
		required: false,
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'PUT', 'GET' ]
			},
		},
	},
	/**
	 * Adding or updating a resource
	 */
	{
		displayName: "Origin System",
		description: "A human readable string identifying where this advocacy_campaign originated. May be used in the user interface for this purpose.",
		name: "origin_system",
		type: "string",
		required: true,
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'POST', 'PUT' ]
			}
		},
	},
	{
		displayName: "Title",
		description: "The advocacy_campaign's public title. ",
		name: "title",
		type: "string",
		required: true,
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'POST', 'PUT' ]
			}
		},
	},
	{
		name: "description",
		type: "string",
		description: "The advocacy_campaign's description. May contain HTML.",
		required: false,
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'POST', 'PUT' ]
			}
		},
	},
	{
		name: "targets",
		type: "string",
		description: "The target universe for this advocacy campaign. (ex: 'U.S. Congress')",
		required: false,
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'POST', 'PUT' ]
			}
		},
	},
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
				resource: [ 'advocacy_campaign' ],
				method: [ 'POST', 'PUT' ]
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
	/**
	 * Listing and getting resources
	 */
	...createListOperations({
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'GET' ],
				advocacy_campaign_id: [null, '', undefined]
			}
		}
	}),
	// Valid filter properties documented at https://actionnetwork.org/docs/v2#odata
	...createFilterFields({
		properties: [ 'identifier', 'created_date', 'modified_date', 'origin_system', 'title' ],
		displayOptions: {
			show: {
				resource: [ 'advocacy_campaign' ],
				method: [ 'GET' ],
				advocacy_campaign_id: [null, '', undefined]
			}
		}
	}),
] as INodeProperties[];

export const logic = async (node: IExecuteFunctions) => {
	const advocacy_campaign_id = node.getNodeParameter('advocacy_campaign_id', 0) as string;
	const method = node.getNodeParameter('method', 0) as 'GET' | 'PUT' | 'POST';
	let url = `/api/v2/advocacy_campaigns`

	if (advocacy_campaign_id && method === 'GET') {
		return actionNetworkApiRequest.call(node, method, `${url}/${advocacy_campaign_id}`) as Promise<IDataObject>
	}

	if (advocacy_campaign_id && method === 'PUT') {
		let body: any = {
			'identifiers': (node.getNodeParameter('additional_properties', 0, { identifiers: [] }) as any)?.identifiers,
			// @ts-ignore
			title: node.getNodeParameter('title', 0) || undefined,
			description: node.getNodeParameter('description', 0) || undefined,
			targets: node.getNodeParameter('targets', 0, undefined),
			origin_system: node.getNodeParameter('origin_system', 0) || undefined,
		}

		return actionNetworkApiRequest.call(node, method, `${url}/${advocacy_campaign_id}`, body) as Promise<IDataObject>
	}

	if (method === 'POST') {
		let body: any = {
			'identifiers': (node.getNodeParameter('additional_properties', 0, { identifiers: [] }) as any)?.identifiers,
			// @ts-ignore
			title: node.getNodeParameter('title', 0) || undefined,
			description: node.getNodeParameter('description', 0) || undefined,
			targets: node.getNodeParameter('targets', 0, undefined),
			origin_system: node.getNodeParameter('origin_system', 0) || undefined,
		}

		return actionNetworkApiRequest.call(node, method, url, body) as Promise<IDataObject>
	}

	// Otherwise list all
	const qs = {
		...createPaginationProperties(node),
		...createFilterProperties(node)
	}
	return actionNetworkApiRequest.call(node, 'GET', url, undefined, qs) as Promise<IDataObject[]>
}
