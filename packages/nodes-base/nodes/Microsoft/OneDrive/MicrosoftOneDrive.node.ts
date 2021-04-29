import {
	BINARY_ENCODING,
	IExecuteFunctions,
} from 'n8n-core';

import {
	IBinaryKeyData,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import {
	microsoftApiRequest,
	microsoftApiRequestAllItems,
} from './GenericFunctions';

import {
	fileFields,
	fileOperations,
} from './FileDescription';

import {
	folderFields,
	folderOperations,
} from './FolderDescription';

export class MicrosoftOneDrive implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Microsoft OneDrive',
		name: 'microsoftOneDrive',
		icon: 'file:oneDrive.png',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume Microsoft OneDrive API.',
		defaults: {
			name: 'Microsoft OneDrive',
			color: '#1d4bab',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'microsoftOneDriveOAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'File',
						value: 'file',
					},
					{
						name: 'Folder',
						value: 'folder',
					},
				],
				default: 'file',
				description: 'The resource to operate on.',
			},
			...fileOperations,
			...fileFields,
			...folderOperations,
			...folderFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: IDataObject[] = [];
		const length = items.length as unknown as number;
		const qs: IDataObject = {};
		let responseData;
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		for (let i = 0; i < length; i++) {
			try {
				if (resource === 'file') {
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_copy?view=odsp-graph-online
					if (operation === 'copy') {
						const fileId = this.getNodeParameter('fileId', i) as string;
						const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;
						const parentReference = this.getNodeParameter('parentReference', i) as IDataObject;
						const body: IDataObject = {};
						if (parentReference) {
							body.parentReference = { ...parentReference };
						}
						if (additionalFields.name) {
							body.name = additionalFields.name as string;
						}
						responseData = await microsoftApiRequest.call(this, 'POST', `/drive/items/${fileId}/copy`, body, {}, undefined, {}, { json: true, resolveWithFullResponse: true });
						responseData = { location : responseData.headers.location };
						returnData.push(responseData as IDataObject);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delete?view=odsp-graph-online
					if (operation === 'delete') {
						const fileId = this.getNodeParameter('fileId', i) as string;
						responseData = await microsoftApiRequest.call(this, 'DELETE', `/drive/items/${fileId}`);
						responseData = { success: true };
						returnData.push(responseData as IDataObject);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_list_children?view=odsp-graph-online
					if (operation === 'download') {
						const fileId = this.getNodeParameter('fileId', i) as string;
						const dataPropertyNameDownload = this.getNodeParameter('binaryPropertyName', i) as string;
						responseData = await microsoftApiRequest.call(this, 'GET', `/drive/items/${fileId}`);

						const fileName = responseData.name;

						if (responseData.file === undefined) {
							throw new NodeApiError(this.getNode(), responseData, { message: 'The ID you provided does not belong to a file.' });
						}

						let mimeType: string | undefined;
						if (responseData.file.mimeType) {
							mimeType = responseData.file.mimeType;
						}

						responseData = await microsoftApiRequest.call(this, 'GET', `/drive/items/${fileId}/content`, {}, {}, undefined, {}, { encoding: null, resolveWithFullResponse: true });

						const newItem: INodeExecutionData = {
							json: items[i].json,
							binary: {},
						};

						if (mimeType === undefined && responseData.headers['content-type']) {
							mimeType = responseData.headers['content-type'];
						}

						if (items[i].binary !== undefined) {
							// Create a shallow copy of the binary data so that the old
							// data references which do not get changed still stay behind
							// but the incoming data does not get changed.
							Object.assign(newItem.binary, items[i].binary);
						}

						items[i] = newItem;

						const data = Buffer.from(responseData.body);

						items[i].binary![dataPropertyNameDownload] = await this.helpers.prepareBinaryData(data as unknown as Buffer, fileName, mimeType);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_get?view=odsp-graph-online
					if (operation === 'get') {
						const fileId = this.getNodeParameter('fileId', i) as string;
						responseData = await microsoftApiRequest.call(this, 'GET', `/drive/items/${fileId}`);
						returnData.push(responseData as IDataObject);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_search?view=odsp-graph-online
					if (operation === 'search') {
						const query = this.getNodeParameter('query', i) as string;
						responseData = await microsoftApiRequestAllItems.call(this, 'value', 'GET', `/drive/root/search(q='${query}')`);
						responseData = responseData.filter((item: IDataObject) => item.file);
						returnData.push.apply(returnData, responseData as IDataObject[]);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_createlink?view=odsp-graph-online
					if (operation === 'share') {
						const fileId = this.getNodeParameter('fileId', i) as string;
						const type = this.getNodeParameter('type', i) as string;
						const scope = this.getNodeParameter('scope', i) as string;
						const body: IDataObject = {
							type,
							scope,
						};
						responseData = await microsoftApiRequest.call(this, 'POST', `/drive/items/${fileId}/createLink`, body);
						returnData.push(responseData);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_put_content?view=odsp-graph-online#example-upload-a-new-file
					if (operation === 'upload') {
						const parentId = this.getNodeParameter('parentId', i) as string;
						const isBinaryData = this.getNodeParameter('binaryData', i) as boolean;
						const fileName = this.getNodeParameter('fileName', i) as string;

						if (isBinaryData) {
							const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0) as string;

							if (items[i].binary === undefined) {
								throw new NodeOperationError(this.getNode(), 'No binary data exists on item!');
							}
							//@ts-ignore
							if (items[i].binary[binaryPropertyName] === undefined) {
								throw new NodeOperationError(this.getNode(), `No binary data property "${binaryPropertyName}" does not exists on item!`);
							}

							const binaryData = (items[i].binary as IBinaryKeyData)[binaryPropertyName];

							const body = Buffer.from(binaryData.data, BINARY_ENCODING);
							responseData = await microsoftApiRequest.call(this, 'PUT', `/drive/items/${parentId}:/${fileName || binaryData.fileName}:/content`, body, {}, undefined, { 'Content-Type': binaryData.mimeType, 'Content-length': body.length }, {} );

							returnData.push(JSON.parse(responseData) as IDataObject);
						} else {
							const body = this.getNodeParameter('fileContent', i) as string;
							if (fileName === '') {
								throw new NodeOperationError(this.getNode(), 'File name must be set!');
							}
							responseData = await microsoftApiRequest.call(this, 'PUT', `/drive/items/${parentId}:/${fileName}:/content`,  body , {}, undefined, { 'Content-Type': 'text/plain' } );
							returnData.push(responseData as IDataObject);
						}
					}
				}
				if (resource === 'folder') {
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_post_children?view=odsp-graph-online
					if (operation === 'create') {
						const name = this.getNodeParameter('name', i) as string;
						const options = this.getNodeParameter('options', i) as IDataObject;
						const body: IDataObject = {
							name,
							folder: {},
						};
						let endpoint = '/drive/root/children';
						if (options.parentFolderId) {
							endpoint = `/drive/items/${options.parentFolderId}/children`;
						}
						responseData = await microsoftApiRequest.call(this, 'POST', endpoint, body);
						returnData.push(responseData);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delete?view=odsp-graph-online
					if (operation === 'delete') {
						const folderId = this.getNodeParameter('folderId', i) as string;
						responseData = await microsoftApiRequest.call(this, 'DELETE', `/drive/items/${folderId}`);
						responseData = { success: true };
						returnData.push(responseData as IDataObject);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_list_children?view=odsp-graph-online
					if (operation === 'getChildren') {
						const folderId = this.getNodeParameter('folderId', i) as string;
						responseData = await microsoftApiRequestAllItems.call(this, 'value', 'GET', `/drive/items/${folderId}/children`);
						returnData.push.apply(returnData, responseData as IDataObject[]);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_search?view=odsp-graph-online
					if (operation === 'search') {
						const query = this.getNodeParameter('query', i) as string;
						responseData = await microsoftApiRequestAllItems.call(this, 'value', 'GET', `/drive/root/search(q='${query}')`);
						responseData = responseData.filter((item: IDataObject) => item.folder);
						returnData.push.apply(returnData, responseData as IDataObject[]);
					}
					//https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_createlink?view=odsp-graph-online
					if (operation === 'share') {
						const folderId = this.getNodeParameter('folderId', i) as string;
						const type = this.getNodeParameter('type', i) as string;
						const scope = this.getNodeParameter('scope', i) as string;
						const body: IDataObject = {
							type,
							scope,
						};
						responseData = await microsoftApiRequest.call(this, 'POST', `/drive/items/${folderId}/createLink`, body);
						returnData.push(responseData);
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					if (resource === 'file' && operation === 'download') {
						items[i].json = { error: error.message };
					} else {
						returnData.push({ error: error.message });
					}
					continue;
				}
				throw error;
			}
		}
		if (resource === 'file' && operation === 'download') {
			// For file downloads the files get attached to the existing items
			return this.prepareOutputData(items);
		} else {
			return [this.helpers.returnJsonArray(returnData)];
		}
	}
}
