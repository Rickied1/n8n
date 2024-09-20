import { NodeConnectionType, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { postFields, postOperations } from './PostDescription';
import { reviewFields, reviewOperations } from './ReviewDescription';
import { searchAccounts, searchLocations, searchPosts, searchReviews } from './GenericFunctions';

export class GoogleMyBusiness implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google My Business',
		name: 'googleMyBusiness',
		icon: 'file:googleMyBusines.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume Google My Business API',
		defaults: {
			name: 'Google My Business',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'googleMyBusinessOAuth2Api',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://mybusiness.googleapis.com/v4',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Post',
						value: 'post',
					},
					{
						name: 'Review',
						value: 'review',
					},
				],
				default: 'post',
			},
			...postOperations,
			...postFields,
			...reviewOperations,
			...reviewFields,
		],
	};

	methods = {
		listSearch: {
			searchAccounts,
			searchLocations,
			searchReviews,
			searchPosts,
		},
	};
}
