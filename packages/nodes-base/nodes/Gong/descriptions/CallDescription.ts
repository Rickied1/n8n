import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { getCursorPaginator, gongApiPaginateRequest } from '../GenericFunctions';

export const callOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['call'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve data for a specific call',
				routing: {
					request: {
						method: 'POST',
						url: '/v2/calls/extensive',
					},
				},
				action: 'Get call',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of calls',
				routing: {
					request: {
						method: 'POST',
						url: '/v2/calls/extensive',
						body: {
							filter: {},
						},
					},
				},
				action: 'Get many calls',
			},
		],
		default: 'getAll',
	},
];

const getFields: INodeProperties[] = [
	{
		displayName: 'Call to Get',
		name: 'call',
		default: {
			mode: 'list',
			value: '',
		},
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['get'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getCalls',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				placeholder: 'e.g. 7782342274025937895',
				type: 'string',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '[0-9]{1,20}',
							errorMessage: 'Not a valid Gong Call ID',
						},
					},
				],
			},
			{
				displayName: 'By URL',
				name: 'url',
				extractValue: {
					type: 'regex',
					regex: 'https:\\/\\/[a-zA-Z0-9-]+\\.app\\.gong\\.io\\/call\\?id=([0-9]{1,20})',
				},
				placeholder: 'e.g. https://subdomain.app.gong.io/call?id=7782342274025937895',
				type: 'string',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: 'https:\\/\\/[a-zA-Z0-9-]+\\.app\\.gong\\.io\\/call\\?id=([0-9]{1,20})',
							errorMessage: 'Not a valid Gong URL',
						},
					},
				],
			},
		],
		required: true,
		routing: {
			send: {
				type: 'body',
				property: 'filter.callIds',
				propertyInDotNotation: true,
				value: '={{ [$value] }}',
			},
			output: {
				postReceive: [
					{
						type: 'rootProperty',
						properties: {
							property: 'calls',
						},
					},
				],
			},
		},
		type: 'resourceLocator',
	},
	{
		displayName: 'Options',
		name: 'options',
		default: {},
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['get'],
			},
		},
		placeholder: 'Add option',
		options: [
			{
				displayName: 'Call Data to Include',
				name: 'properties',
				type: 'multiOptions',
				default: [],
				description:
					'Whether to include specific Call properties in the returned results. Choose from a list, or specify IDs using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
				options: [
					{
						name: 'Action Items',
						value: 'pointsOfInterest',
						description: 'Whether to add call points of interest',
					},
					{
						name: 'Audio and Video URLs',
						value: 'media',
						description:
							'Whether to add audio and video URL of the call. The URLs will be available for 8 hours.',
					},
					{
						name: 'Brief',
						value: 'brief',
						description: 'Whether to add the spotlight call brief',
						routing: {
							send: {
								type: 'body',
								property: 'contentSelector.exposedFields.content.brief',
								propertyInDotNotation: true,
								value: '={{ $value }}',
							},
						},
					},
					{
						name: 'Comments',
						value: 'publicComments',
						description: 'Whether to add public comments made for this call',
					},
					{
						name: 'Highlights',
						value: 'highlights',
						description: 'Whether to add the call highlights',
					},
					{
						name: 'Keypoints',
						value: 'keyPoints',
						description: 'Whether to add the key points of the call',
					},
					{
						name: 'Outcome',
						value: 'callOutcome',
						description: 'Whether to add the outcome of the call',
					},
					{
						name: 'Outline',
						value: 'outline',
						description: 'Whether to add the call outline',
					},
					{
						name: 'Participants',
						value: 'parties',
						description: 'Whether to add information about the participants of the call',
					},
					{
						name: 'Structure',
						value: 'structure',
						description: 'Whether to add the call agenda',
					},
					{
						name: 'Topics',
						value: 'topics',
						description: 'Whether to add the duration of call topics',
					},
					{
						name: 'Trackers',
						value: 'trackers',
						description:
							'Whether to add the smart tracker and keyword tracker information for the call',
					},
					{
						name: 'Transcript',
						value: 'transcript',
						description: 'Whether to add information about the participants',
					},
				],
				routing: {
					send: {
						preSend: [
							async function (
								this: IExecuteSingleFunctions,
								requestOptions: IHttpRequestOptions,
							): Promise<IHttpRequestOptions> {
								const contentProperties = [
									'pointsOfInterest',
									'brief',
									'highlights',
									'keyPoints',
									'outline',
									'callOutcome',
									'structure',
									'trackers',
									'topics',
								];
								const exposedFieldsProperties = ['media', 'parties'];
								const collaborationProperties = ['publicComments'];

								const properties = this.getNodeParameter('options.properties') as string[];
								const contentSelector = { exposedFields: {} } as any;
								for (const property of properties) {
									if (exposedFieldsProperties.includes(property)) {
										contentSelector.exposedFields[property] = true;
									} else if (contentProperties.includes(property)) {
										contentSelector.exposedFields.content ??= {};
										contentSelector.exposedFields.content[property] = true;
									} else if (collaborationProperties.includes(property)) {
										contentSelector.exposedFields.collaboration ??= {};
										contentSelector.exposedFields.collaboration[property] = true;
									}
								}

								requestOptions.body ||= {};
								Object.assign(requestOptions.body, { contentSelector });
								return requestOptions;
							},
						],
					},
					output: {
						postReceive: [
							async function (
								this: IExecuteSingleFunctions,
								items: INodeExecutionData[],
								_responseData: IN8nHttpFullResponse,
							): Promise<INodeExecutionData[]> {
								const properties = this.getNodeParameter('options.properties') as string[];
								if (properties.includes('transcript')) {
									for (const item of items) {
										const callTranscripts = await gongApiPaginateRequest.call(
											this,
											'POST',
											'/v2/calls/transcript',
											{ filter: { callIds: [(item.json.metaData as IDataObject).id] } },
											{},
											item.index ?? 0,
											'callTranscripts',
										);
										item.json.transcript = callTranscripts?.length
											? callTranscripts[0].transcript
											: [];
									}
								}
								return items;
							},
						],
					},
				},
			},
		],
		type: 'collection',
	},
];

const getAllFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['getAll'],
			},
		},
		routing: {
			send: {
				paginate: '={{ $value }}',
			},
			operations: {
				pagination: getCursorPaginator('calls'),
			},
		},
		type: 'boolean',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		description: 'Max number of results to return',
		typeOptions: {
			minValue: 1,
		},
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		routing: {
			output: {
				postReceive: [
					{
						type: 'rootProperty',
						properties: {
							property: 'calls',
						},
					},
					{
						type: 'limit',
						properties: {
							maxResults: '={{ $value }}',
						},
					},
				],
			},
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		default: {},
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['getAll'],
			},
		},
		placeholder: 'Add Filter',
		options: [
			{
				displayName: 'After',
				name: 'fromDateTime',
				default: '',
				description:
					'Returns calls that started on or after the specified date and time. If not provided, list starts with earliest call. For web-conference calls recorded by Gong, the date denotes its scheduled time, otherwise, it denotes its actual start time.',
				placeholder: 'e.g. 2018-02-18T02:30:00-07:00 or 2018-02-18T08:00:00Z',
				routing: {
					send: {
						type: 'body',
						property: 'filter.fromDateTime',
						propertyInDotNotation: true,
						value: '={{ new Date($value).toISOString() }}',
					},
				},
				type: 'dateTime',
			},
			{
				displayName: 'Before',
				name: 'toDateTime',
				default: '',
				description:
					'Returns calls that started up to but excluding specified date and time. If not provided, list ends with most recent call. For web-conference calls recorded by Gong, the date denotes its scheduled time, otherwise, it denotes its actual start time.',
				placeholder: 'e.g. 2018-02-18T02:30:00-07:00 or 2018-02-18T08:00:00Z',
				routing: {
					send: {
						type: 'body',
						property: 'filter.toDateTime',
						propertyInDotNotation: true,
						value: '={{ new Date($value).toISOString() }}',
					},
				},
				type: 'dateTime',
			},
			{
				displayName: 'Workspace ID',
				name: 'workspaceId',
				default: '',
				description: 'Return only the calls belonging to this workspace',
				placeholder: 'e.g. 623457276584334',
				routing: {
					send: {
						type: 'body',
						property: 'filter.workspaceId',
						propertyInDotNotation: true,
						value: '={{ $value }}',
					},
				},
				type: 'string',
			},
			{
				displayName: 'Call IDs',
				name: 'callIds',
				default: {
					mode: 'list',
					value: '',
				},
				description: 'List of calls IDs to be filtered',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'getCalls',
							searchable: true,
						},
					},
					{
						displayName: 'By ID',
						name: 'id',
						placeholder: 'e.g. 7782342274025937895',
						type: 'string',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '[0-9]{1,20}',
									errorMessage: 'Not a valid Gong Call ID',
								},
							},
						],
					},
				],
				required: true,
				routing: {
					send: {
						type: 'body',
						property: 'filter.callIds',
						propertyInDotNotation: true,
						value: '={{ $value.flatMap(x => x.value) }}',
					},
				},
				type: 'resourceLocator',
				typeOptions: {
					multipleValues: true,
				},
			},
			{
				displayName: 'User IDs',
				name: 'primaryUserIds',
				default: {
					mode: 'list',
					value: '',
				},
				description: 'Return only the calls hosted by the specified users',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'getUsers',
							searchable: true,
						},
					},
					{
						displayName: 'By ID',
						name: 'id',
						placeholder: 'e.g. 7782342274025937895',
						type: 'string',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '[0-9]{1,20}',
									errorMessage: 'Not a valid Gong User ID',
								},
							},
						],
					},
				],
				required: true,
				routing: {
					send: {
						type: 'body',
						property: 'filter.primaryUserIds',
						propertyInDotNotation: true,
						value: '={{ $value.flatMap(x => x.value) }}',
					},
				},
				type: 'resourceLocator',
				typeOptions: {
					multipleValues: true,
				},
			},
		],
		type: 'collection',
	},
	{
		displayName: 'Options',
		name: 'options',
		default: {},
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['getAll'],
			},
		},
		placeholder: 'Add option',
		options: [
			{
				displayName: 'Call Data to Include',
				name: 'properties',
				type: 'multiOptions',
				default: [],
				description:
					'Whether to include specific Call properties in the returned results. Choose from a list, or specify IDs using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
				options: [
					{
						name: 'Participants',
						value: 'parties',
						description: 'Whether to add information about the participants of the call',
					},
					{
						name: 'Topics',
						value: 'topics',
						description: 'Whether to add information about the topics of the call',
					},
				],
				routing: {
					send: {
						preSend: [
							async function (
								this: IExecuteSingleFunctions,
								requestOptions: IHttpRequestOptions,
							): Promise<IHttpRequestOptions> {
								const contentProperties = ['topics'];
								const exposedFieldsProperties = ['parties'];

								const properties = this.getNodeParameter('options.properties') as string[];
								const contentSelector = { exposedFields: {} } as any;
								for (const property of properties) {
									if (exposedFieldsProperties.includes(property)) {
										contentSelector.exposedFields[property] = true;
									} else if (contentProperties.includes(property)) {
										contentSelector.exposedFields.content ??= {};
										contentSelector.exposedFields.content[property] = true;
									}
								}

								requestOptions.body ||= {};
								Object.assign(requestOptions.body, { contentSelector });
								return requestOptions;
							},
						],
					},
				},
			},
		],
		type: 'collection',
	},
];

export const callFields: INodeProperties[] = [...getFields, ...getAllFields];
