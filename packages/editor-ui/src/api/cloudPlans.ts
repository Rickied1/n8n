import type { Cloud, IRestApiContext, InstanceUsage, LeadEnrichmentTemplates } from '@/Interface';
import { get, post } from '@/utils/apiUtils';

export async function getCurrentPlan(context: IRestApiContext): Promise<Cloud.PlanData> {
	return get(context.baseUrl, '/admin/cloud-plan');
}

export async function getCurrentUsage(context: IRestApiContext): Promise<InstanceUsage> {
	return get(context.baseUrl, '/cloud/limits');
}

export async function getCloudUserInfo(context: IRestApiContext): Promise<Cloud.UserAccount> {
	return get(context.baseUrl, '/cloud/proxy/user/me');
}

export async function confirmEmail(context: IRestApiContext): Promise<Cloud.UserAccount> {
	return post(context.baseUrl, '/cloud/proxy/user/resend-confirmation-email');
}

export async function getAdminPanelLoginCode(context: IRestApiContext): Promise<{ code: string }> {
	return get(context.baseUrl, '/cloud/proxy/login/code');
}

// TODO: Call the real endpoint once it is ready
export function getLeadEnrichmentTemplates(): LeadEnrichmentTemplates {
	return {
		sections: [
			{
				name: 'Lead enrichment',
				title: 'Explore curated lead enrichment workflows or start fresh with a blank canvas',
				workflows: [
					{
						title:
							'Score new leads with AI from Facebook Lead Ads with AI and get notifications for high scores on Slack',
						description:
							'This workflow will help you save tons of time and will notify you fully automatically about the most important incoming leads from Facebook Lead Ads. The workflow will automatically fire for every submission. It will then take the name, company, and email information, enrich the submitter via AI, and score it based on metrics that you can easily set.',
						preview: {
							nodes: [
								{
									parameters: {
										operation: 'create',
										base: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										table: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										columns: {
											mappingMode: 'defineBelow',
											value: {},
											matchingColumns: [],
											schema: [],
										},
										options: {},
									},
									id: 'b09d4f4d-19fa-43de-8148-2d430a04956f',
									name: 'Airtable',
									type: 'n8n-nodes-base.airtable',
									typeVersion: 2,
									position: [1800, 740],
								},
								{
									parameters: {},
									id: '551313bb-1e01-4133-9956-e6f09968f2ce',
									name: 'When clicking "Execute Workflow"',
									type: 'n8n-nodes-base.manualTrigger',
									typeVersion: 1,
									position: [920, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'b4c089ee-2adb-435e-8d48-47012c981a11',
									name: 'Get image',
									type: 'n8n-nodes-base.httpRequest',
									typeVersion: 4.1,
									position: [1140, 740],
								},
								{
									parameters: {
										operation: 'extractHtmlContent',
										options: {},
									},
									id: '04ca2f61-b930-4fbc-b467-3470c0d93d64',
									name: 'Extract Information',
									type: 'n8n-nodes-base.html',
									typeVersion: 1,
									position: [1360, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'd1a77493-c579-4ac4-b6a7-708eea2bf8ce',
									name: 'Set Information',
									type: 'n8n-nodes-base.set',
									typeVersion: 3.2,
									position: [1580, 740],
								},
							],
							connections: {
								'When clicking "Execute Workflow"': {
									main: [
										[
											{
												node: 'Get image',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Get image': {
									main: [
										[
											{
												node: 'Extract Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Extract Information': {
									main: [
										[
											{
												node: 'Set Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Set Information': {
									main: [
										[
											{
												node: 'Airtable',
												type: 'main',
												index: 0,
											},
										],
									],
								},
							},
						},
						nodes: [
							{
								id: 24,
								icon: 'fa:code-branch',
								defaults: {
									color: '#00bbcc',
								},
								iconData: {
									icon: 'code-branch',
									type: 'icon',
								},
								displayName: 'Merge',
							},
						],
					},
					{
						title: 'Verify the email address every time a contact is created in HubSpot',
						description:
							'This workflow will help you save tons of time and will notify you fully automatically about the most important incoming leads from Facebook Lead Ads. The workflow will automatically fire for every submission. It will then take the name, company, and email information, enrich the submitter via AI, and score it based on metrics that you can easily set.',
						preview: {
							nodes: [
								{
									parameters: {
										operation: 'create',
										base: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										table: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										columns: {
											mappingMode: 'defineBelow',
											value: {},
											matchingColumns: [],
											schema: [],
										},
										options: {},
									},
									id: 'b09d4f4d-19fa-43de-8148-2d430a04956f',
									name: 'Airtable',
									type: 'n8n-nodes-base.airtable',
									typeVersion: 2,
									position: [1800, 740],
								},
								{
									parameters: {},
									id: '551313bb-1e01-4133-9956-e6f09968f2ce',
									name: 'When clicking "Execute Workflow"',
									type: 'n8n-nodes-base.manualTrigger',
									typeVersion: 1,
									position: [920, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'b4c089ee-2adb-435e-8d48-47012c981a11',
									name: 'Get image',
									type: 'n8n-nodes-base.httpRequest',
									typeVersion: 4.1,
									position: [1140, 740],
								},
								{
									parameters: {
										operation: 'extractHtmlContent',
										options: {},
									},
									id: '04ca2f61-b930-4fbc-b467-3470c0d93d64',
									name: 'Extract Information',
									type: 'n8n-nodes-base.html',
									typeVersion: 1,
									position: [1360, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'd1a77493-c579-4ac4-b6a7-708eea2bf8ce',
									name: 'Set Information',
									type: 'n8n-nodes-base.set',
									typeVersion: 3.2,
									position: [1580, 740],
								},
							],
							connections: {
								'When clicking "Execute Workflow"': {
									main: [
										[
											{
												node: 'Get image',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Get image': {
									main: [
										[
											{
												node: 'Extract Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Extract Information': {
									main: [
										[
											{
												node: 'Set Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Set Information': {
									main: [
										[
											{
												node: 'Airtable',
												type: 'main',
												index: 0,
											},
										],
									],
								},
							},
						},
						nodes: [
							{
								id: 14,
								icon: 'fa:code',
								name: 'n8n-nodes-base.function',
								defaults: {
									name: 'Function',
									color: '#FF9922',
								},
								iconData: {
									icon: 'code',
									type: 'icon',
								},
								categories: [
									{
										id: 5,
										name: 'Development',
									},
									{
										id: 9,
										name: 'Core Nodes',
									},
								],
								displayName: 'Function',
								typeVersion: 1,
							},
							{
								id: 24,
								icon: 'fa:code-branch',
								name: 'n8n-nodes-base.merge',
								defaults: {
									name: 'Merge',
									color: '#00bbcc',
								},
								iconData: {
									icon: 'code-branch',
									type: 'icon',
								},
								categories: [
									{
										id: 9,
										name: 'Core Nodes',
									},
								],
								displayName: 'Merge',
								typeVersion: 2,
							},
						],
					},
					{
						title: 'Enrich leads from HubSpot with company information via OpenAi',
						description:
							'This workflow will help you save tons of time and will notify you fully automatically about the most important incoming leads from Facebook Lead Ads. The workflow will automatically fire for every submission. It will then take the name, company, and email information, enrich the submitter via AI, and score it based on metrics that you can easily set.',
						preview: {
							nodes: [
								{
									parameters: {
										operation: 'create',
										base: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										table: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										columns: {
											mappingMode: 'defineBelow',
											value: {},
											matchingColumns: [],
											schema: [],
										},
										options: {},
									},
									id: 'b09d4f4d-19fa-43de-8148-2d430a04956f',
									name: 'Airtable',
									type: 'n8n-nodes-base.airtable',
									typeVersion: 2,
									position: [1800, 740],
								},
								{
									parameters: {},
									id: '551313bb-1e01-4133-9956-e6f09968f2ce',
									name: 'When clicking "Execute Workflow"',
									type: 'n8n-nodes-base.manualTrigger',
									typeVersion: 1,
									position: [920, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'b4c089ee-2adb-435e-8d48-47012c981a11',
									name: 'Get image',
									type: 'n8n-nodes-base.httpRequest',
									typeVersion: 4.1,
									position: [1140, 740],
								},
								{
									parameters: {
										operation: 'extractHtmlContent',
										options: {},
									},
									id: '04ca2f61-b930-4fbc-b467-3470c0d93d64',
									name: 'Extract Information',
									type: 'n8n-nodes-base.html',
									typeVersion: 1,
									position: [1360, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'd1a77493-c579-4ac4-b6a7-708eea2bf8ce',
									name: 'Set Information',
									type: 'n8n-nodes-base.set',
									typeVersion: 3.2,
									position: [1580, 740],
								},
							],
							connections: {
								'When clicking "Execute Workflow"': {
									main: [
										[
											{
												node: 'Get image',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Get image': {
									main: [
										[
											{
												node: 'Extract Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Extract Information': {
									main: [
										[
											{
												node: 'Set Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Set Information': {
									main: [
										[
											{
												node: 'Airtable',
												type: 'main',
												index: 0,
											},
										],
									],
								},
							},
						},
						nodes: [
							{
								id: 14,
								icon: 'fa:code',
								defaults: {
									name: 'Function',
									color: '#FF9922',
								},
								iconData: {
									icon: 'code',
									type: 'icon',
								},
								displayName: 'Function',
							},
						],
					},
					{
						title:
							'Score new lead submissions from Facebook Lead Ads with AI and notify me on Slack when it is a high score lead',
						description:
							'This workflow will help you save tons of time and will notify you fully automatically about the most important incoming leads from Facebook Lead Ads. The workflow will automatically fire for every submission. It will then take the name, company, and email information, enrich the submitter via AI, and score it based on metrics that you can easily set.',
						preview: {
							nodes: [
								{
									parameters: {
										operation: 'create',
										base: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										table: {
											__rl: true,
											mode: 'list',
											value: '',
										},
										columns: {
											mappingMode: 'defineBelow',
											value: {},
											matchingColumns: [],
											schema: [],
										},
										options: {},
									},
									id: 'b09d4f4d-19fa-43de-8148-2d430a04956f',
									name: 'Airtable',
									type: 'n8n-nodes-base.airtable',
									typeVersion: 2,
									position: [1800, 740],
								},
								{
									parameters: {},
									id: '551313bb-1e01-4133-9956-e6f09968f2ce',
									name: 'When clicking "Execute Workflow"',
									type: 'n8n-nodes-base.manualTrigger',
									typeVersion: 1,
									position: [920, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'b4c089ee-2adb-435e-8d48-47012c981a11',
									name: 'Get image',
									type: 'n8n-nodes-base.httpRequest',
									typeVersion: 4.1,
									position: [1140, 740],
								},
								{
									parameters: {
										operation: 'extractHtmlContent',
										options: {},
									},
									id: '04ca2f61-b930-4fbc-b467-3470c0d93d64',
									name: 'Extract Information',
									type: 'n8n-nodes-base.html',
									typeVersion: 1,
									position: [1360, 740],
								},
								{
									parameters: {
										options: {},
									},
									id: 'd1a77493-c579-4ac4-b6a7-708eea2bf8ce',
									name: 'Set Information',
									type: 'n8n-nodes-base.set',
									typeVersion: 3.2,
									position: [1580, 740],
								},
							],
							connections: {
								'When clicking "Execute Workflow"': {
									main: [
										[
											{
												node: 'Get image',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Get image': {
									main: [
										[
											{
												node: 'Extract Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Extract Information': {
									main: [
										[
											{
												node: 'Set Information',
												type: 'main',
												index: 0,
											},
										],
									],
								},
								'Set Information': {
									main: [
										[
											{
												node: 'Airtable',
												type: 'main',
												index: 0,
											},
										],
									],
								},
							},
						},
						nodes: [
							{
								id: 14,
								icon: 'fa:code',
								defaults: {
									name: 'Function',
									color: '#FF9922',
								},
								iconData: {
									icon: 'code',
									type: 'icon',
								},
								displayName: 'Function',
							},
							{
								id: 24,
								icon: 'fa:code-branch',
								defaults: {
									name: 'Merge',
									color: '#00bbcc',
								},
								iconData: {
									icon: 'code-branch',
									type: 'icon',
								},
								displayName: 'Merge',
							},
						],
					},
				],
			},
		],
	};
}
