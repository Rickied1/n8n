import {
	AbstractEventMessage,
	EventMessageSerialized,
	isEventMessageSerialized,
} from './AbstractEventMessage';
import { JsonObject } from 'n8n-workflow';
import { EventMessageTypeNames } from './Enums';
import { AbstractEventPayload } from './AbstractEventPayload';

export const eventNamesAudit = [
	'n8n.audit.created',
	'n8n.audit.updated',
	'n8n.audit.deleted',
] as const;
export type EventNamesAuditType = typeof eventNamesAudit[number];

// --------------------------------------
// EventMessage class for Audit events
// --------------------------------------
export class EventPayloadAudit extends AbstractEventPayload {
	id: number;

	msg: string;
}

export class EventMessageAudit extends AbstractEventMessage {
	readonly __type: string = EventMessageTypeNames.eventMessageAudit;

	eventName: EventNamesAuditType;

	payload: EventPayloadAudit;

	setPayload(payload: EventPayloadAudit): this {
		this.payload = payload;
		return this;
	}

	anonymize(): this {
		return this;
	}

	serialize(): EventMessageSerialized {
		// TODO: filter payload for sensitive info here?
		return {
			__type: this.__type,
			id: this.id,
			ts: this.ts.toISO(),
			eventName: this.eventName,
			message: this.message,
			level: this.level,
			payload: this.payload ?? new EventPayloadAudit(),
		};
	}

	deserialize(data: JsonObject): this {
		if (isEventMessageSerialized(data, this.__type)) {
			this.setOptionsOrDefault(data);
			if (data.payload) this.setPayload(data.payload as EventPayloadAudit);
		}
		return this;
	}
}
