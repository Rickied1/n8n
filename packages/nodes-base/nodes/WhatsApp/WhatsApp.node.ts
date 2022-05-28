import {
    IExecuteFunctions,
} from 'n8n-core';

import {
	apiRequest,
} from './GenericFunctions';

import {
    IBinaryData,
    IDataObject,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

import {messageFields, messageTypeFields, mediaTypes} from "./MessagesDescription"
import {
    OptionsWithUri,
} from 'request';

export class WhatsApp implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'WhatsApp',
        name: 'whatsApp',
        icon: 'file:whatsapp.svg',
        group: ['transform'],
        version: 1,
        // subtitle: '={{ $parameter["resource"] + ": " + $parameter["type"] }}',
        subtitle: '',
        description: 'Access WhatsApp API',
        defaults: {
            name: 'WhatsApp',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
          {
            name: 'whatsAppApi',
            required: true,
          },
        ],
        properties: [
            {
			    displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Message',
						value: 'messages',
					}
				],
				default: 'messages',
			},
            ...messageFields,
            ...messageTypeFields
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
		const returnData: IDataObject[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
        const phoneNumberId = this.getNodeParameter('phoneNumberId', 0)
		const messageType = this.getNodeParameter('type', 0) as string;


        let body: IDataObject;
		// For Query string
		let qs: IDataObject;

		let requestMethod: string;
		let endpoint: string;
		let returnAll = false;
		let responseData;
		// const type = this.getNodeParameter('type', 0) as string;

        // console.log(type)
        for (let i = 0; i < items.length; i++) {
            try {
                requestMethod = 'GET';
                endpoint = "";
                body = {};
                qs = {};

                // ----------------------------------
	            //         resource: messages
	            // ----------------------------------
                if (resource === "messages") {
                    requestMethod = "POST"
                    endpoint = `${phoneNumberId}/messages`;
                    body = { type: messageType,  to: this.getNodeParameter('recipientPhoneNumber', i), };

                    // ----------------------------------
	                //         type: text
	                // ----------------------------------
                    if (messageType === "text") {
                        const textBody = this.getNodeParameter('textBody', i) as string;
                        const previewUrl = this.getNodeParameter('previewUrl', i) as string;

                        body = {...body,
                            "text": {
                                body: textBody,
                                preview_url: previewUrl,
                            }
                        }
                        // ----------------------------------
                        //         type: template
                        // ----------------------------------
                    } else if (messageType === "template") {
                        requestMethod = "POST"
                        const templateName = this.getNodeParameter('templateName', i) as string;
                        const templateLanguageCode = this.getNodeParameter('templateLanguageCode', i) as string;

                        body = {...body, template: {
                            name: templateName,
                            language: {
                                code: templateLanguageCode
                            }
                        }}
                        // ----------------------------------
                        //         type: media
                        // ----------------------------------
                    } else if (mediaTypes.includes(messageType)) {
                        requestMethod = "POST"

                        // some parameters are slightly different if using a link or an ID
                        const mediaPath = this.getNodeParameter('mediaPath', i) as string;

                        body = {...body, type: messageType};

                        if (mediaPath === "useMediaLink") {
                            const link = this.getNodeParameter('mediaLink', i) as string;
                            const name = this.getNodeParameter('mediaLinkProvider', i) as string;
                            const caption = this.getNodeParameter('mediaCaption', i) as string;


                            body = {...body, [messageType]: { link, caption, ...(name && { provider: { name }}) } }

                        } else {
                            const mediaId = this.getNodeParameter('mediaId', i) as string;
                            const caption = this.getNodeParameter('mediaCaption', i) as string;
                            const filename = this.getNodeParameter('mediaFilename', i) as string;

                            body = {...body, [messageType]: { id: mediaId, filename, caption } }

                        }

                    }
                }

				responseData = await apiRequest.call(this, requestMethod, endpoint, body, qs);

				if (returnAll === false && qs.limit) {
					responseData = responseData.splice(0, qs.limit);
				}

				if (Array.isArray(responseData)) {
					returnData.push.apply(returnData, responseData as IDataObject[]);
				} else {
					returnData.push(responseData as IDataObject);
				}

            } catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({ error: error.message });

                }
                throw error;
            }

        }

        return [this.helpers.returnJsonArray(returnData)]
    }

}