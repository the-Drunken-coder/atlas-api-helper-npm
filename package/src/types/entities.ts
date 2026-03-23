export interface Entity {
  entity_id: string;
  type: string;  // REQUIRED (promoted field at top level)
  subtype?: string;  // Promoted field at top level (optional)
  alias?: string;  // Promoted field at top level (optional)
  json: {
    components?: Record<string, unknown>;
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Task {
  task_id: string;
  status: string;  // REQUIRED (promoted field at top level)
  entity_id?: string;  // Promoted field at top level (optional)
  json: {
    // Do NOT include promoted fields in JSON - they're columns now (zero backwards compatibility)
    components?: Record<string, unknown>;
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
}

export interface StoredObject {
  object_id: string;
  path?: string;  // Promoted field at top level (optional)
  content_type?: string;  // Promoted field at top level (optional)
  type?: string;  // Promoted field at top level (optional)
  json: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export type Asset = Entity;
export type Track = Entity;
export type GeoFeature = Entity;
export type Command = Task;

export interface Model {
  id: string | number;
  name?: string;
  asset_type?: string;
  capabilities?: Record<string, unknown>;
  heartbeat_interval?: number;
  location_update_frequency?: number;
  settings_schema?: Record<string, unknown>;
  default_settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CommandDefinition {
  id: number;
  name?: string;
  parameters_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EventType {
  id: number;
  name?: string;
  [key: string]: unknown;
}

export interface Event {
  id: number;
  asset_id?: string;
  event_type_id?: number;
  timestamp?: string;
  payload?: Record<string, unknown>;
  entity?: string;
  [key: string]: unknown;
}

export interface Sensor {
  id: number;
  asset_id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface TrackTelemetry {
  track_id: string;
  timestamp: string;
  latitude?: number | string;
  longitude?: number | string;
  altitude?: number;
  sensor_id?: number;
  [key: string]: unknown;
}

// Telemetry interfaces
export interface Telemetry {
  latitude?: number;
  longitude?: number;
  altitude_m?: number;
  speed_m_s?: number;
  heading_deg?: number;
  [key: string]: unknown;
}

// Task status interfaces
export interface TaskStatusUpdate {
  status?: string;
  components?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface TaskStart {
  started_by?: string;
}

export interface TaskComplete {
  result?: Record<string, unknown>;
}

export interface TaskFail {
  error_message?: string;
  error_details?: Record<string, unknown>;
}

// Object interfaces
export interface ObjectReference {
  entity_id?: string;
  task_id?: string;
}

export interface ObjectCreate {
  object_id: string;
  path?: string;
  bucket?: string;
  size_bytes?: number;
  content_type?: string;
  type?: string;
  usage_hints?: string[];
  referenced_by?: ObjectReference[];
  extra?: Record<string, unknown>;
}

export interface ObjectUpdate {
  path?: string;
  bucket?: string;
  size_bytes?: number;
  content_type?: string;
  type?: string;
  usage_hints?: string[];
  referenced_by?: ObjectReference[];
  extra?: Record<string, unknown>;
}

// Query interfaces — keep ChangedSinceResponse / FullDatasetResponse fields aligned with
// Atlas_Command internal/actions/query_actions.go (FullDatasetResponse, ChangedSinceResponse).
/** Matches Atlas_Command serializers.EntityResponse (query/full and changed-since). */
export interface SerializedEntity {
  entity_id: string;
  /** Canonical Atlas Command field; prefer this in new code. */
  entity_type: string;
  /** Legacy alias retained for wire compatibility; mirrors `entity_type`. */
  type: string;
  subtype?: string | null;
  alias?: string | null;
  components: Record<string, unknown>;
  metadata: { created_at?: string; updated_at?: string };
  extra?: Record<string, unknown>;
}

/** Matches serializers.TaskResponse. */
export interface SerializedTask {
  task_id: string;
  status: string;
  entity_id?: string | null;
  components: Record<string, unknown>;
  metadata: { created_at?: string; updated_at?: string };
  extra?: Record<string, unknown>;
}

/** Matches serializers.ObjectResponse. */
export interface SerializedObject {
  object_id: string;
  path?: string | null;
  content_type?: string | null;
  type?: string | null;
  size_bytes?: number | null;
  usage_hints: string[];
  referenced_by?: Array<Record<string, unknown>>;
  bucket?: string | null;
  metadata: { created_at?: string; updated_at?: string };
  payload?: Record<string, unknown>;
}

/** Tombstone from Atlas Command `changed-since`; use `id` + `type` (not legacy per-field keys). */
export type DeletedEntityTombstone = { id: string; type: "entity"; deleted_at?: string };
export type DeletedTaskTombstone = { id: string; type: "task"; deleted_at?: string };
export type DeletedObjectTombstone = { id: string; type: "object"; deleted_at?: string };
export type DeletedResource =
  | DeletedEntityTombstone
  | DeletedTaskTombstone
  | DeletedObjectTombstone;

/** @deprecated Prefer DeletedEntityTombstone. `getChangedSince` always injects `entity_id` (= `id`). */
export type DeletedEntity = DeletedEntityTombstone & { entity_id: string };
/** @deprecated Prefer DeletedTaskTombstone. `getChangedSince` always injects `task_id` (= `id`). */
export type DeletedTask = DeletedTaskTombstone & { task_id: string };
/** @deprecated Prefer DeletedObjectTombstone. `getChangedSince` always injects `object_id` (= `id`). */
export type DeletedObject = DeletedObjectTombstone & { object_id: string };

/** Opaque continuation tokens from `next_*_cursor` fields — pass back as query parameters for the next request. */
export interface QueryStreamCursors {
  entityCursor?: string;
  taskCursor?: string;
  objectCursor?: string;
  deletedEntityCursor?: string;
  deletedTaskCursor?: string;
  deletedObjectCursor?: string;
}

/** Continuation cursors for live entity/task/object streams only. */
export interface LiveQueryStreamCursors {
  entityCursor?: string;
  taskCursor?: string;
  objectCursor?: string;
}

/** Options for `getChangedSince` — includes opaque continuation cursors from prior responses. */
export interface ChangedSinceOptions extends QueryStreamCursors {
  since: string;
  limit_per_type?: number;
}

export interface ChangedSinceResponse {
  entities?: SerializedEntity[];
  tasks?: SerializedTask[];
  objects?: SerializedObject[];
  deleted_entities?: DeletedEntity[];
  deleted_tasks?: DeletedTask[];
  deleted_objects?: DeletedObject[];
  has_more_entities?: boolean;
  has_more_tasks?: boolean;
  has_more_objects?: boolean;
  has_more_deleted_entities?: boolean;
  has_more_deleted_tasks?: boolean;
  has_more_deleted_objects?: boolean;
  /** Present when has_more_entities — use as `entity_cursor` on the next request (same `since`). */
  next_entity_cursor?: string;
  next_task_cursor?: string;
  next_object_cursor?: string;
  next_deleted_entity_cursor?: string;
  next_deleted_task_cursor?: string;
  next_deleted_object_cursor?: string;
  /** Always set by Atlas Command changed-since handler (RFC3339). */
  timestamp: string;
}

export interface FullDatasetOptions extends LiveQueryStreamCursors {
  entityLimit?: number;
  taskLimit?: number;
  objectLimit?: number;
  /** @deprecated Prefer camelCase `entityLimit` */
  entity_limit?: number;
  /** @deprecated Prefer `taskLimit` */
  task_limit?: number;
  /** @deprecated Prefer `objectLimit` */
  object_limit?: number;
  /** @deprecated Prefer `entityCursor` */
  entity_cursor?: string;
  /** @deprecated Prefer `taskCursor` */
  task_cursor?: string;
  /** @deprecated Prefer `objectCursor` */
  object_cursor?: string;
}

export interface FullDatasetResponse {
  entities?: SerializedEntity[];
  tasks?: SerializedTask[];
  objects?: SerializedObject[];
  has_more_entities?: boolean;
  has_more_tasks?: boolean;
  has_more_objects?: boolean;
  next_entity_cursor?: string;
  next_task_cursor?: string;
  next_object_cursor?: string;
}
