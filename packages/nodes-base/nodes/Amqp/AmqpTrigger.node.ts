import { ITriggerFunctions } from 'n8n-core';
import {
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,

} from 'n8n-workflow';


export class AmqpTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AMQP Trigger',
		name: 'amqpTrigger',
		icon: 'file:amqp.png',
		group: ['trigger'],
		version: 1,
		description: 'Listens to AMQP 1.0 Messages',
		defaults: {
			name: 'AMQP Trigger',
			color: '#00FF00',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [{
			name: 'amqp',
			required: true,
		}],
		properties: [
			// Node properties which the user gets displayed and
			// can change on the node.
			{
				displayName: 'Queue / Topic',
				name: 'sink',
				type: 'string',
				default: '',
				placeholder: 'topic://sourcename.something',
				description: 'name of the queue of topic to listen to',
			},
			{
				displayName: 'Clientname',
				name: 'clientname',
				type: 'string',
				default: '',
				placeholder: 'for durable/persistent topic subscriptions, example: "n8n"',
				description: 'Leave empty for non-durable topic subscriptions or queues. ',
			},
			{
				displayName: 'Subscription',
				name: 'subscription',
				type: 'string',
				default: '',
				placeholder: 'for durable/persistent topic subscriptions, example: "order-worker"',
				description: 'Leave empty for non-durable topic subscriptions or queues',
			},
		]
	};


	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

		const credentials = this.getCredentials('amqp');
		if (!credentials) {
			throw new Error('Credentials are mandatory!');
		}

		const sink = this.getNodeParameter('sink', '') as string;
		const clientname = this.getNodeParameter('clientname', '') as string;
		const subscription = this.getNodeParameter('subscription', '') as string;

		if (sink == '') {
			throw new Error('Queue or Topic required!');
		}
		let durable: boolean = false;
		if(subscription && clientname) {
			durable = true;
		}

		let container = require('rhea');
		let connectOptions = {
			host: credentials.hostname,
			port: credentials.port,
			reconnect: true,		// this id the default anyway
			reconnect_limit: 50,	// try for max 50 times, based on a back-off algorithm
			container_id: (durable ? clientname : null)
		}
		if (credentials.username || credentials.password) {
			container.options.username = credentials.username;
			container.options.password = credentials.password;
		}

		let lastMsgId: any = undefined;
		let self = this;

		container.on('message', function (context: any) {
			if (context.message.message_id && context.message.message_id == lastMsgId) {
				// ignore duplicate message check, don't think it's necessary, but it was in the rhea-lib example code
				lastMsgId = context.message.message_id;
				return;
			}
			self.emit([self.helpers.returnJsonArray([context.message])]);
		});
		
		let connection = container.connect(connectOptions);
		let clientOptions = undefined;
		if (durable) {
			clientOptions = {
				name: subscription,
				source: {
					address: sink,
					durable: 2,
					expiry_policy: 'never'
				},
				credit_window: 1	// prefetch 1
			}
		} else {
			clientOptions = {
				source: {
					address: sink,
				},
				credit_window: 1	// prefetch 1
			}
		}
		connection.open_receiver(clientOptions);


		// The "closeFunction" function gets called by n8n whenever
		// the workflow gets deactivated and can so clean up.
		async function closeFunction() {
			connection.close();
		}

		// The "manualTriggerFunction" function gets called by n8n
		// when a user is in the workflow editor and starts the
		// workflow manually.
		// for AMQP it doesn't make much sense to wait here but
		// for a new user who doesn't know how this works, it's better to wait and show a respective info message
		async function manualTriggerFunction() {

			await new Promise( function( resolve ) {
				let timeoutHandler = setTimeout(function() {
					self.emit([self.helpers.returnJsonArray([{
						error: 'Aborted, no message received within 30secs. This 30sec timeout is only set for "manually triggered execution". Active Workflows will listen indefinitely.'
					}])]);
					resolve(true);
				}, 30000);
				container.on('message', function (context: any) {
					clearTimeout(timeoutHandler);
					resolve(true);
				});
			});
		}

		return {
			closeFunction,
			manualTriggerFunction,
		};

	}
}
