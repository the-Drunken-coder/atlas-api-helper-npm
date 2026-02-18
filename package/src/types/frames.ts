import type { Entity, StoredObject, Task } from "./entities";

export type FrameType =
  | "handshake"
  | "handshake:ack"
  | "heartbeat"
  | "heartbeat:ack"
  | "sync"
  | "sync:ack"
  | "subscribe"
  | "subscribe:ack"
  | "unsubscribe"
  | "unsubscribe:ack"
  | "event"
  | "create"
  | "create:ack"
  | "update"
  | "update:ack"
  | "delete"
  | "delete:ack"
  | "list"
  | "list:ack"
  | "get"
  | "get:ack"
  | "error";

export interface MessageMeta {
  message_id?: string;
  sent_at?: string;
  entity_type?: "asset" | "track" | "geofeature" | "task" | "object";
  entity_id?: string;
  sequence?: number;
  [key: string]: unknown;
}

export interface BaseFrame {
  type: FrameType;
  meta?: MessageMeta;
  payload?: Record<string, unknown>;
}

export interface HandshakeFrame extends BaseFrame {
  type: "handshake";
  payload?: {
    client_version?: string;
    client_type?: string;
  };
}

export interface HandshakeAckFrame extends BaseFrame {
  type: "handshake:ack";
  payload?: {
    server_version?: string;
    supported_entity_types?: Array<MessageMeta["entity_type"]>;
    server_time?: string;
  };
}

export interface HeartbeatFrame extends BaseFrame {
  type: "heartbeat";
}

export interface HeartbeatAckFrame extends BaseFrame {
  type: "heartbeat:ack";
}

export interface SyncFrame extends BaseFrame {
  type: "sync";
  payload?: {
    request_id?: string;
    filters?: Record<string, unknown>;
  };
}

export interface SyncAckPayload {
  entities?: {
    entities: Entity[];
    total: number;
    limit: number;
  };
  tasks?: {
    tasks: Task[];
    total: number;
    limit: number;
  };
  objects?: {
    objects: StoredObject[];
    total: number;
    limit: number;
  };
  [key: string]: unknown;
}

export interface SyncAckFrame extends BaseFrame {
  type: "sync:ack";
  payload: SyncAckPayload;
}

export interface SubscribeFrame extends BaseFrame {
  type: "subscribe";
  payload?: {
    channels?: string[];
    filters?: Record<string, unknown>;
  };
}

export interface SubscribeAckFrame extends BaseFrame {
  type: "subscribe:ack";
}

export interface UnsubscribeFrame extends BaseFrame {
  type: "unsubscribe";
  payload?: {
    channels?: string[];
  };
}

export interface UnsubscribeAckFrame extends BaseFrame {
  type: "unsubscribe:ack";
}

export interface EventFrame extends BaseFrame {
  type: "event";
  payload: {
    table: string;
    operation: "create" | "update" | "delete";
    id?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface CreateFrame extends BaseFrame {
  type: "create";
  payload: {
    entity_type?: MessageMeta["entity_type"];
    entity_id?: string;
    data: Record<string, unknown>;
  };
}

export interface CreateAckFrame extends BaseFrame {
  type: "create:ack";
}

export interface UpdateFrame extends BaseFrame {
  type: "update";
  payload: {
    entity_type?: MessageMeta["entity_type"];
    entity_id?: string;
    data: Record<string, unknown>;
  };
}

export interface UpdateAckFrame extends BaseFrame {
  type: "update:ack";
}

export interface DeleteFrame extends BaseFrame {
  type: "delete";
  payload: {
    entity_type?: MessageMeta["entity_type"];
    entity_id?: string;
  };
}

export interface DeleteAckFrame extends BaseFrame {
  type: "delete:ack";
}

export interface ListFrame extends BaseFrame {
  type: "list";
  payload?: {
    entity_type?: MessageMeta["entity_type"];
    filters?: Record<string, unknown>;
    limit?: number;
  };
}

export interface ListAckFrame extends BaseFrame {
  type: "list:ack";
  payload?: {
    entities?: Entity[];
    tasks?: Task[];
    objects?: StoredObject[];
    total?: number;
    limit?: number;
  };
}

export interface GetFrame extends BaseFrame {
  type: "get";
  payload?: {
    entity_type?: MessageMeta["entity_type"];
    entity_id: string;
  };
}

export interface GetAckFrame extends BaseFrame {
  type: "get:ack";
  payload?: {
    entity?: Entity;
    task?: Task;
    object?: StoredObject;
  };
}

export interface ErrorFrame extends BaseFrame {
  type: "error";
  payload: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ControllerFrame =
  | HandshakeFrame
  | HandshakeAckFrame
  | HeartbeatFrame
  | HeartbeatAckFrame
  | SyncFrame
  | SyncAckFrame
  | SubscribeFrame
  | SubscribeAckFrame
  | UnsubscribeFrame
  | UnsubscribeAckFrame
  | EventFrame
  | CreateFrame
  | CreateAckFrame
  | UpdateFrame
  | UpdateAckFrame
  | DeleteFrame
  | DeleteAckFrame
  | ListFrame
  | ListAckFrame
  | GetFrame
  | GetAckFrame
  | ErrorFrame
  | BaseFrame;

export type SyncDataset = SyncAckPayload;

