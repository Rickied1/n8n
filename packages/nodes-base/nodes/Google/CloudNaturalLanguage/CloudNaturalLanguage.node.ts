
import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	googleApiRequest,
} from './GenericFunctions';

export class CloudNaturalLanguage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Cloud Natural Language',
		name: 'cloudNaturalLanguage',
		icon: 'file:cloudnaturallanguage.png',
		group: ['input', 'output'],
		version: 1,
		description: 'Consume Google Cloud Natural Language API',
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		defaults: {
			name: 'Cloud Natural Language',
			color: '#5288f0',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'cloudNaturalLanguageOAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Analyze Sentiment',
						value: 'analyzeSentiment',
						description: 'Analyze Sentiment',
					},
				],
				default: 'analyzeSentiment',
				description: 'The operation to perform',
			},
			// ----------------------------------
			//         All
			// ----------------------------------
			{
				displayName: 'Document Type',
				name: 'documentType',
				type: 'options',
				options: [
					{
						name: 'Unspecified',
						value: 'TYPE_UNSPECIFIED',
					},
					{
						name: 'Plain Text',
						value: 'PLAIN_TEXT',
					},
					{
						name: 'HTML',
						value: 'HTML',
					},
				],
				default: '',
				description: 'The type of input document.',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'analyzeSentiment',
						],
					},
				},
			},
			{
				displayName: 'Source',
				name: 'source',
				type: 'options',
				options: [
					{
						name: 'Content',
						value: 'content',
					},
					{
						name: 'Google Cloud Storage URI',
						value: 'gcsContentUri',
					},
				],
				default: 'content',
				description: 'The source of the document: a string containing the content or a Google Cloud Storage URI.',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'analyzeSentiment',
						],
					},
				},
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				default: '',
				description: 'The content of the input in string format. Cloud audit logging exempt since it is based on user data. ',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'analyzeSentiment',
						],
						source: [
							'content',
						],
					},
				},
			},
			{
				displayName: 'Google Cloud Storage URI',
				name: 'gcsContentUri',
				type: 'string',
				default: '',
				description: 'The Google Cloud Storage URI where the file content is located. This URI must be of the form: gs://bucket_name/object_name.<br/> For more details, see https://cloud.google.com/storage/docs/reference-uris.',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'analyzeSentiment',
						],
						source: [
							'gcsContentUri',
						],
					},
				},
			},
			{
				displayName: 'Encoding Type',
				name: 'encodingType',
				type: 'options',
				options: [
					{
						name: 'None',
						value: 'NONE',
					},
					{
						name: 'UTF-8',
						value: 'UTF8',
					},
					{
						name: 'UTF-16',
						value: 'UTF16',
					},
					{
						name: 'UTF-32',
						value: 'UTF32',
					},
				],
				default: '',
				description: 'The encoding type used by the API to calculate sentence offsets.',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'analyzeSentiment',
						],
					},
				},
			},
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				displayOptions: {
					show: {
						operation: [
							'analyzeSentiment',
						],
					},
				},
				default: {},
				description: '',
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						placeholder: '',
						description: 'The language of the document (if not specified, the language is automatically detected). Both ISO and BCP-47 language codes are accepted.',
					},
				],
			}
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const length = items.length as unknown as number;

		const operation = this.getNodeParameter('operation', 0) as string;
		const responseData = [];
		for (let i = 0; i < length; i++) {
			if (operation === 'analyzeSentiment') {
				const source = this.getNodeParameter('source', i) as string;
				const documentType = this.getNodeParameter('documentType', i) as string;
				const encodingType = this.getNodeParameter('encodingType', i) as string;
				const options = this.getNodeParameter('additionalOptions', i) as IDataObject;

				interface IData {
					document: IDocument;
					encodingType: string;
				}

				interface IDocument {
					type: string;
					language?: string;
					content?: string;
					gcsContentUri?: string;
				}

				const body: IData = {
					document: {
						type: documentType,
					},
					encodingType,
				};

				if (source === 'content') {
					const content = this.getNodeParameter('content', i) as string;
					body.document.content = content;
				} else {
					const gcsContentUri = this.getNodeParameter('gcsContentUri', i) as string;
					body.document.gcsContentUri = gcsContentUri;
				}

				if (options.language) {
					body.document.language = options.language as string;
				}

				const response = await googleApiRequest.call(this, 'POST', `/v1/documents:analyzeSentiment`, body);
				responseData.push(response);
			}
		}
		return [this.helpers.returnJsonArray(responseData)];
	}
}
