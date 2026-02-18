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

// Query interfaces
export interface ChangedSinceOptions {
  since: string;
  limit_per_type?: number;
}

export interface DeletedEntity {
  entity_id: string;
  deleted_at?: string;
}

export interface DeletedTask {
  task_id: string;
  deleted_at?: string;
}

export interface DeletedObject {
  object_id: string;
  deleted_at?: string;
}

export interface ChangedSinceResponse {
  entities?: Entity[];
  tasks?: Task[];
  objects?: StoredObject[];
  deleted_entities?: DeletedEntity[];
  deleted_tasks?: DeletedTask[];
  deleted_objects?: DeletedObject[];
}

export interface FullDatasetOptions {
  entity_limit?: number;
  task_limit?: number;
  object_limit?: number;
}
