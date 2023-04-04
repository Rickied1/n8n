import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import OTPAuth from 'otpauth';

export class Totp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TOTP',
		name: 'totp',
		icon: 'fa:fingerprint',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Generate a TOTP code',
		defaults: {
			name: 'TOTP',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'totpApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Generate Secret',
						value: 'generateSecret',
						action: 'Generate secret',
					},
				],
				default: 'generateSecret',
			},
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				displayOptions: {
					show: {
						operation: ['generateSecret'],
					},
				},
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Algorithm',
						name: 'algorithm',
						type: 'options',
						default: 'SHA1',
						description: 'HMAC hashing algorithm. Set by the issuer. Defaults to SHA1.',
						options: [
							{
								name: 'SHA1',
								value: 'SHA1',
							},
							{
								name: 'SHA224',
								value: 'SHA224',
							},
							{
								name: 'SHA256',
								value: 'SHA256',
							},
							{
								name: 'SHA3-224',
								value: 'SHA3-224',
							},
							{
								name: 'SHA3-256',
								value: 'SHA3-256',
							},
							{
								name: 'SHA3-384',
								value: 'SHA3-384',
							},
							{
								name: 'SHA3-512',
								value: 'SHA3-512',
							},
							{
								name: 'SHA384',
								value: 'SHA384',
							},
							{
								name: 'SHA512',
								value: 'SHA512',
							},
						],
					},
					{
						displayName: 'Digits',
						name: 'digits',
						type: 'number',
						default: 6,
						description:
							'Number of digits in the generated TOTP code. Set by the issuer. Defaults to 6 digits.',
					},
					{
						displayName: 'Period',
						name: 'period',
						type: 'number',
						default: 30,
						description:
							'How many seconds the generated TOTP code is valid for. Set by the issuer. Defaults to 30 seconds.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0);
		const credentials = (await this.getCredentials('totpApi')) as { label: string; secret: string };
		const additionalOptions = this.getNodeParameter('additionalOptions', 0) as {
			algorithm: string;
			digits: number;
			period: number;
		};

		const [issuer] = credentials.label.split(':');

		const totp = new OTPAuth.TOTP({
			issuer,
			label: credentials.label,
			secret: credentials.secret,
			algorithm: additionalOptions.algorithm,
			digits: additionalOptions.digits,
			period: additionalOptions.period,
		});

		const token = totp.generate();

		const secondsRemaining = (30 * (1 - ((Date.now() / 1000 / 30) % 1))) | 0;

		for (let i = 0; i < items.length; i++) {
			if (operation === 'generateSecret') {
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray({ token, secondsRemaining }),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);
			}
		}

		return this.prepareOutputData(returnData);
	}
}
