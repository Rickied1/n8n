import type { INodeProperties } from 'n8n-workflow';

export const reportRLC: INodeProperties = {
	displayName: 'Report',
	name: 'reportId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a report...',
			typeOptions: {
				searchListMethod: 'searchReports',
				searchable: true,
			},
		},
		{
			displayName: 'Link',
			name: 'url',
			type: 'string',
			placeholder:
				'e.g. https://localhost:8089/servicesNS/nobody/search/saved/searches/Errors%20in%20the%20last%20hour',
			extractValue: {
				type: 'regex',
				regex: '\\/([^/]+?)\\/?$',
			},
			validation: [
				{
					type: 'regex',
					properties: {
						regex: '.+\\/search\\/saved\\/searches\\/([^/]+?)\\/?$',
						errorMessage: 'Not a valid report URL',
					},
				},
			],
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. Errors%20in%20the%20last%20hour',
		},
	],
};
