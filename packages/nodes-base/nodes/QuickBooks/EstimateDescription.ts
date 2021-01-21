import {
	INodeProperties,
} from 'n8n-workflow';

export const estimateOperations = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		default: 'get',
		description: 'Operation to perform',
		options: [
			{
				name: 'Create',
				value: 'create',
			},
			{
				name: 'Get',
				value: 'get',
			},
			{
				name: 'Get All',
				value: 'getAll',
			},
			{
				name: 'Send',
				value: 'send',
			},
			{
				name: 'Update',
				value: 'update',
			},
		],
		displayOptions: {
			show: {
				resource: [
					'estimate',
				],
			},
		},
	},
] as INodeProperties[];

export const estimateFields = [
	// ----------------------------------
	//         estimate: create
	// ----------------------------------
	// {
	// 	displayName: 'Line',
	// 	name: 'line',
	// 	type: 'string',
	// 	required: true,
	// 	default: '',
	// 	description: 'The display name of the customer to create',
	// 	displayOptions: {
	// 		show: {
	// 			resource: [
	// 				'estimate',
	// 			],
	// 			operation: [
	// 				'create',
	// 			],
	// 		},
	// 	},
	// },
	// {
	// 	displayName: 'Additional Fields',
	// 	name: 'additionalFields',
	// 	type: 'collection',
	// 	placeholder: 'Add Field',
	// 	default: {},
	// 	displayOptions: {
	// 		show: {
	// 			resource: [
	// 				'customer',
	// 			],
	// 			operation: [
	// 				'create',
	// 			],
	// 		},
	// 	},
	// 	options: customerAdditionalFields,
	// },
	// ----------------------------------
	//         estimate: get
	// ----------------------------------
	{
		displayName: 'Estimate ID',
		name: 'estimateId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the estimate to retrieve',
		displayOptions: {
			show: {
				resource: [
					'estimate',
				],
				operation: [
					'get',
				],
			},
		},
	},
	// ----------------------------------
	//         estimate: getAll
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Return all results',
		displayOptions: {
			show: {
				resource: [
					'estimate',
				],
				operation: [
					'getAll',
				],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 5,
		description: 'The number of results to return',
		typeOptions: {
			minValue: 1,
			maxValue: 1000,
		},
		displayOptions: {
			show: {
				resource: [
					'estimate',
				],
				operation: [
					'getAll',
				],
				returnAll: [
					false,
				],
			},
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: 'WHERE Metadata.LastUpdatedTime > \'2021-01-01\'',
				description: 'The condition for selecting estimates. See the <a href="https://developer.intuit.com/app/developer/qbo/docs/develop/explore-the-quickbooks-online-api/data-queries" target="_blank">guide</a> for supported syntax.',
				typeOptions: {
					alwaysOpenEditWindow: true,
				},
			},
		],
		displayOptions: {
			show: {
				resource: [
					'estimate',
				],
				operation: [
					'getAll',
				],
			},
		},
	},
	// ----------------------------------
	//         customer: update
	// ----------------------------------
	// {
	// 	displayName: 'Customer ID',
	// 	name: 'customerId',
	// 	type: 'string',
	// 	required: true,
	// 	default: '',
	// 	description: 'The ID of the customer to update',
	// 	displayOptions: {
	// 		show: {
	// 			resource: [
	// 				'customer',
	// 			],
	// 			operation: [
	// 				'update',
	// 			],
	// 		},
	// 	},
	// },
	// {
	// 	displayName: 'Update Fields',
	// 	name: 'updateFields',
	// 	type: 'collection',
	// 	placeholder: 'Add Field',
	// 	default: {},
	// 	required: true,
	// 	displayOptions: {
	// 		show: {
	// 			resource: [
	// 				'customer',
	// 			],
	// 			operation: [
	// 				'update',
	// 			],
	// 		},
	// 	},
	// 	options: [
	// 		{
	// 			displayName: 'Display name',
	// 			name: 'displayName',
	// 			type: 'string',
	// 			default: '',
	// 		},
	// 		...customerAdditionalFields,
	// 	],
	// },
] as INodeProperties[];
