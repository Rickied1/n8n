/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import { ResponseHelper } from '..';
import { ResponseError } from '../ResponseHelper';
import { isEventMessageOptions } from './EventMessageClasses/AbstractEventMessage';
import { EventMessageGeneric } from './EventMessageClasses/EventMessageGeneric';
import { EventMessageWorkflow } from './EventMessageClasses/EventMessageWorkflow';
import { eventBus, EventMessageReturnMode } from './MessageEventBus/MessageEventBus';
import {
	isMessageEventBusDestinationSentryOptions,
	MessageEventBusDestinationSentry,
	MessageEventBusDestinationSentryOptions,
} from './MessageEventBusDestination/MessageEventBusDestinationSentry';
import {
	isMessageEventBusDestinationSyslogOptions,
	MessageEventBusDestinationSyslog,
	MessageEventBusDestinationSyslogOptions,
} from './MessageEventBusDestination/MessageEventBusDestinationSyslog';
import {
	MessageEventBusDestinationWebhook,
	MessageEventBusDestinationWebhookOptions,
} from './MessageEventBusDestination/MessageEventBusDestinationWebhook';
import { eventNamesAll } from './EventMessageClasses';
import { EventMessageLevel } from './EventMessageClasses/Enums';
import { MessageEventBusDestinationTypeNames } from './MessageEventBusDestination';

export const eventBusRouter = express.Router();

// ----------------------------------------
// TypeGuards
// ----------------------------------------

const isWithIdString = (candidate: unknown): candidate is { id: string } => {
	const o = candidate as { id: string };
	if (!o) return false;
	return o.id !== undefined;
};

const isWithQueryString = (candidate: unknown): candidate is { query: string } => {
	const o = candidate as { query: string };
	if (!o) return false;
	return o.query !== undefined;
};

const isWithDestinationIdString = (candidate: unknown): candidate is { destinationId: string } => {
	const o = candidate as { destinationId: string };
	if (!o) return false;
	return o.destinationId !== undefined;
};

// const isEventMessageDestinationSubscription = (
// 	candidate: unknown,
// ): candidate is EventMessageSubscribeDestination => {
// 	const o = candidate as EventMessageSubscribeDestination;
// 	if (!o) return false;
// 	return (
// 		o.subscriptionSet !== undefined &&
// 		o.destinationId !== undefined &&
// 		isEventMessageSubscriptionSetOptions(o.subscriptionSet)
// 	);
// };

// TODO: add credentials
const isMessageEventBusDestinationWebhookOptions = (
	candidate: unknown,
): candidate is MessageEventBusDestinationWebhookOptions => {
	const o = candidate as MessageEventBusDestinationWebhookOptions;
	if (!o) return false;
	return o.name !== undefined && o.url !== undefined;
};

// interface EventMessageSubscribeDestination {
// 	subscriptionSet: EventMessageSubscriptionSetOptions;
// 	destinationId: string;
// }

interface MessageEventBusDestinationOptions
	extends MessageEventBusDestinationWebhookOptions,
		MessageEventBusDestinationSentryOptions,
		MessageEventBusDestinationSyslogOptions {
	__type: MessageEventBusDestinationTypeNames;
}

const isMessageEventBusDestinationOptions = (
	candidate: unknown,
): candidate is MessageEventBusDestinationOptions => {
	const o = candidate as MessageEventBusDestinationOptions;
	if (!o) return false;
	return o.__type !== undefined;
};

// ----------------------------------------
// Events
// ----------------------------------------
eventBusRouter.get(
	`/event`,
	ResponseHelper.send(async (req: express.Request): Promise<any> => {
		if (isWithQueryString(req.query)) {
			switch (req.query.query as EventMessageReturnMode) {
				case 'sent':
					return eventBus.getEventsSent();
				case 'unsent':
					return eventBus.getEventsUnsent();
				case 'all':
				default:
			}
		}
		return eventBus.getEvents();
	}),
);

eventBusRouter.post(
	`/event`,
	ResponseHelper.send(async (req: express.Request): Promise<any> => {
		if (isEventMessageOptions(req.body)) {
			await eventBus.send(new EventMessageGeneric(req.body));
		} else {
			throw new ResponseError(
				'Body is not a serialized EventMessage or eventName does not match format {namespace}.{domain}.{event}',
				undefined,
				400,
			);
		}
	}),
);

eventBusRouter.post(
	`/event/addmany/:count`,
	ResponseHelper.send(async (req: express.Request): Promise<any> => {
		if (isEventMessageOptions(req.body)) {
			const count: number = parseInt(req.params.count) ?? 100;
			for (let i = 0; i < count; i++) {
				const msg = new EventMessageWorkflow(req.body);
				msg.setPayload({
					id: i,
					msg: 'REST test',
				});
				await eventBus.send(msg);
			}
		} else {
			throw new ResponseError(
				'Body is not a serialized EventMessage or eventName does not match format {namespace}.{domain}.{event}',
				undefined,
				400,
			);
		}
	}),
);

// ----------------------------------------
// Destinations
// ----------------------------------------

eventBusRouter.get(
	`/destination`,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	ResponseHelper.send(async (req: express.Request, res: express.Response): Promise<any> => {
		let result = [];
		if (isWithIdString(req.query)) {
			result = await eventBus.findDestination(req.query.id);
		} else {
			result = await eventBus.findDestination();
		}
		return result;
	}),
);

eventBusRouter.post(
	`/destination`,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	ResponseHelper.send(async (req: express.Request, res: express.Response): Promise<any> => {
		if (isMessageEventBusDestinationOptions(req.body)) {
			let result;
			switch (req.body.__type) {
				case MessageEventBusDestinationTypeNames.sentry:
					if (isMessageEventBusDestinationSentryOptions(req.body)) {
						result = await eventBus.addDestination(new MessageEventBusDestinationSentry(req.body));
					}
					break;
				case MessageEventBusDestinationTypeNames.webhook:
					if (isMessageEventBusDestinationWebhookOptions(req.body)) {
						result = await eventBus.addDestination(new MessageEventBusDestinationWebhook(req.body));
					}
					break;
				case MessageEventBusDestinationTypeNames.syslog:
					if (isMessageEventBusDestinationSyslogOptions(req.body)) {
						result = await eventBus.addDestination(new MessageEventBusDestinationSyslog(req.body));
					}
					break;
				default:
					throw new ResponseError(
						`Body is missing ${req.body.__type} options or type ${req.body.__type} is unknown`,
						undefined,
						400,
					);
			}
			if (result) {
				await result.saveToDb();
			}
			return result;
		}
		throw new ResponseError(
			`Body is not configuring MessageEventBusDestinationOptions`,
			undefined,
			400,
		);
	}),
);

eventBusRouter.delete(
	`/destination`,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	ResponseHelper.send(async (req: express.Request, res: express.Response): Promise<any> => {
		if (isWithIdString(req.query)) {
			const result = await eventBus.removeDestination(req.query.id);
			if (result) {
				return result;
			}
		} else {
			throw new ResponseError('Query is missing id', undefined, 400);
		}
	}),
);

// ----------------------------------------
// Subscriptions
// ----------------------------------------

eventBusRouter.get(
	`/subscription`,
	ResponseHelper.send(async (req: express.Request): Promise<any> => {
		if (isWithDestinationIdString(req.query)) {
			return eventBus.getDestinationSubscriptionSet(req.query.destinationId);
		} else {
			throw new ResponseError('Query is missing destination id', undefined, 400);
		}
	}),
);

// eventBusRouter.post(
// 	`/subscription`,
// 	ResponseHelper.send(async (req: express.Request): Promise<any> => {
// 		if (isEventMessageDestinationSubscription(req.body)) {
// 			const result = eventBus.setDestinationSubscriptionSet(
// 				req.body.destinationId,
// 				EventMessageSubscriptionSet.deserialize(req.body.subscriptionSet),
// 			);
// 			if (result) {
// 				await result.saveToDb();
// 			}
// 		} else {
// 			throw new ResponseError('Body is missing subscriptionSet or destinationId', undefined, 400);
// 		}
// 	}),
// );

// eventBusRouter.delete(
// 	`/subscription`,
// 	ResponseHelper.send(async (req: express.Request): Promise<any> => {
// 		if (isWithDestinationIdString(req.query)) {
// 			const result = eventBus.resetDestinationSubscriptionSet(req.query.destinationId);
// 			if (result) {
// 				await result.saveToDb();
// 			}
// 		} else {
// 			throw new ResponseError('Query is missing destination id', undefined, 400);
// 		}
// 	}),
// );

// ----------------------------------------
// Utilities
// ----------------------------------------

eventBusRouter.get(
	`/constants`,
	ResponseHelper.send(async (): Promise<any> => {
		return {
			eventLevels: Object.values(EventMessageLevel),
			// events: eventListToObjectTree(eventNamesAll),
			eventNames: eventNamesAll,
		};
	}),
);
