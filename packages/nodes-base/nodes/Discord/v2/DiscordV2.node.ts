// tslint:disable: no-any

import {
	IExecuteFunctions
} from 'n8n-core';
import { IDataObject } from 'n8n-workflow';
import { INodeExecutionData } from 'n8n-workflow';
import { INodeType, INodeTypeBaseDescription, INodeTypeDescription } from 'n8n-workflow';
import { DiscordAttachment, DiscordWebhook } from './Interfaces';

export class DiscordV2 implements INodeType {
	description: INodeTypeDescription;
	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			displayName: 'Discord',
			name: 'discord',
			icon: 'file:discord.svg',
			group: ['output'],
			version: 2,
			subtitle: '={{"Webhook: " + $parameter["webhookUri"]}}',
			description: 'Consume Discord API',
			defaults: {
				name: 'Discord',
				color: '#000000',
			},
			inputs: ['main'],
			outputs: ['main'],
			properties:[
				{
					displayName: 'Webhook URL',
					name: 'webhookUri',
					type: 'string',
					typeOptions: {
						alwaysOpenEditWindow: true,
					},
					required: true,
					default: '',
					placeholder: 'https://discord.com/api/webhooks/ID/TOKEN',
				},
				{
					displayName: 'Content',
					name: 'content',
					type: 'string',
					typeOptions: {
						maxValue: 2000,
						alwaysOpenEditWindow: true,
					},
					default: '',
					required: false,
					placeholder: 'You are a pirate.',
				},
				{
					displayName: 'Username',
					name: 'username',
					type: 'string',
					default: '',
					required: false,
					placeholder: 'Captain Hook',
				},
				{
					displayName: 'Additional Fields',
					name: 'options',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					options: [
						{
							displayName: 'Components',
							name: 'components',
							type: 'json',
							typeOptions: { alwaysOpenEditWindow: true, editor: 'code' },
							default: '',
						},
						{
							displayName: 'TTS',
							name: 'tts',
							type: 'boolean',
							default: false,
							required: false,
							description: 'Should this message be sent as a Text To Speech message?',
						},
						{
							displayName: 'Flags',
							name: 'flags',
							type: 'number',
							default: '',
						},
						{
							displayName: 'Avatar URL',
							name: 'avatarUrl',
							type: 'string',
							default: '',
							required: false,
						},
						{
							displayName: 'Attachments',
							name: 'attachments',
							type: 'json',
							typeOptions: { alwaysOpenEditWindow: true, editor: 'code' },
							default: '',
						},
						{
							displayName: 'Embeds',
							name: 'embeds',
							type: 'json',
							typeOptions: { alwaysOpenEditWindow: true, editor: 'code' },
							default: '',
							required: false,
						},
						{
							displayName: 'Allowed Mentions',
							name: 'allowedMentions',
							type: 'json',
							typeOptions: { alwaysOpenEditWindow: true, editor: 'code' },
							default: '',
						},
						{
							displayName: 'Json Payload',
							name: 'payloadJson',
							type: 'json',
							typeOptions: { alwaysOpenEditWindow: true, editor: 'code' },
							default: '',
						},
					],
				},
			],
		};
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const nodeInput = this.getInputData()[0].json as any,
			returnData: IDataObject[] = [];

		const body: DiscordWebhook = {};

		const webhookUri = this.getNodeParameter('webhookUri', 0, '') as string;

		if (!webhookUri) throw Error('Webhook uri is required.');

		body.content =
			nodeInput['content'] ||
			(this.getNodeParameter('content', 0, '') as string);
		body.username =
			nodeInput['username'] ||
			(this.getNodeParameter('username', 0, '') as string);

		const items = this.getInputData();
		const length = items.length as number;
		for (let i = 0; i < length; i++) {
			const options = this.getNodeParameter('options', i) as IDataObject;
			if (!body.content && !options.embeds) {
				throw new Error('Either content or embeds must be set.');
			}
			if (options.embeds) {
				try {
					//@ts-expect-error
					body.embeds = JSON.parse(options.embeds);
					if (!Array.isArray(body.embeds)) {
						throw new Error('Embeds must be an array of embeds.');
					}
				} catch (e) {
					throw new Error('Embeds must be valid JSON.');
				}
			}

			if (options.components) {
				try {
					//@ts-expect-error
					body.components = JSON.parse(options.components);
					// if (!Array.isArray(options.components)) {
					// 	throw new Error('components must be an array of components.');
					// }
				} catch (e) {
					throw new Error('components must be valid JSON.');
				}
			}

			if (options.allowed_mentions) {
					//@ts-expect-error
					body.allowed_mentions = JSON.parse(options.allowed_mentions);
			}

			if (options.avatarUrl) {
				body.avatar_url = options.avatarUrl as string;
			}

			if (options.flags) {
				body.flags = options.flags as number;
			}

			if (options.tts) {
				body.tts = options.tts as boolean;
			}

			if (options.payloadJson) {
				//@ts-expect-error
				body.payload_json = JSON.parse(options.payloadJson);
			}

			if (options.attachments) {
				//@ts-expect-error
				body.attachments = JSON.parse(options.attachments as DiscordAttachment[]);
			}
		}


		//* Not used props, delete them from the payload as Discord won't need them :^
		if (!body.content) delete body.content;
		if (!body.username) delete body.username;
		if (!body.avatar_url) delete body.avatar_url;
		if (!body.embeds) delete body.embeds;
		if (!body.allowed_mentions) delete body.allowed_mentions;
		if (!body.flags) delete body.flags;
		if (!body.components) delete body.components;
		if (!body.payload_json) delete body.payload_json;
		if (!body.attachments) delete body.attachments;

		let options;

		if(!body.payload_json){
			 options = {
				method: 'POST',
				body,
				uri: webhookUri,
				headers: {
					'content-type': 'application/json; charset=utf-8',
				},
				json: true,
			};
		}else {
			 options = {
				method: 'POST',
				body,
				uri: webhookUri,
				headers: {
					'content-type': 'multipart/form-data; charset=utf-8',
				},
			};
		}
		let maxTries = 5;
		do {
			try {
				await this.helpers.request(options);
				break;
			} catch (error) {
				if (error.statusCode === 429) {
					//* Await ratelimit to be over
					await new Promise<void>((resolve) =>
						setTimeout(resolve, error.response.body.retry_after || 150),
					);

					continue;
				}

				//* Different Discord error, throw it
				throw error;
			}
		} while (--maxTries);

		if (maxTries <= 0) {
			throw new Error(
				'Could not send Webhook message. Max. amount of rate-limit retries reached.',
			);
		}

		returnData.push({ success: true });

		return [this.helpers.returnJsonArray(returnData)];
	}
}
