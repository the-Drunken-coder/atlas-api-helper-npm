/**
 * Typed component interfaces for Atlas Command entities, tasks, and objects.
 *
 * These interfaces provide type safety and validation for component data
 * before it is transmitted to the Atlas Command API.
 */

// === Entity Components ===

/**
 * Position and motion data for entities.
 */
export interface TelemetryComponent {
  /** Latitude in degrees (WGS84) */
  latitude?: number;
  /** Longitude in degrees (WGS84) */
  longitude?: number;
  /** Altitude in meters above sea level */
  altitude_m?: number;
  /** Horizontal speed in meters/second */
  speed_m_s?: number;
  /** Heading in degrees (0=N, 90=E, etc.) */
  heading_deg?: number;
}

/**
 * Geometry for geofeature entities.
 *
 * Primary (ATLAS) shape:
 * - `type` is one of `point|circle|polygon|line` with shape-specific fields.
 *
 * Back-compat:
 * - GeoJSON-like shapes (`Point|LineString|Polygon` + `coordinates`) are also accepted.
 */
export type GeometryComponent =
  | {
      type?: "point";
      point_lat: number;
      point_lng: number;
    }
  | {
      type?: "circle";
      point_lat: number;
      point_lng: number;
      radius_m: number;
    }
  | {
      type?: "polygon";
      polygon: number[][]; // [lat, lng] pairs
    }
  | {
      type?: "line";
      line: number[][]; // [lat, lng] pairs
    }
  | {
      type: "Point" | "LineString" | "Polygon";
      coordinates: number[] | number[][] | number[][][];
    };

/**
 * Lists supported task identifiers for an asset.
 */
export interface TaskCatalogComponent {
  /** Task identifiers the asset can accept */
  supported_tasks: string[];
}

/**
 * A reference to a media object.
 */
export interface MediaRefItem {
  /** Object ID in object storage */
  object_id: string;
  /** Role of the media reference */
  role: "camera_feed" | "thumbnail" | "heatmap_data";
}

/**
 * Military tactical classification component.
 */
export interface MilViewComponent {
  /** Tactical classification */
  classification: "friendly" | "hostile" | "neutral" | "unknown" | "civilian";
  /** ISO 8601 timestamp of last observation */
  last_seen?: string;
}

/**
 * Health and vital statistics for entities.
 */
export interface HealthComponent {
  /** Battery percentage (0-100) */
  battery_percent?: number;
}

/**
 * A reference to a sensor with FOV/orientation metadata.
 */
export interface SensorRefItem {
  /** Unique sensor identifier */
  sensor_id: string;
  /** Sensor type (e.g., 'radar') */
  type: string;
  /** Vertical field of view in degrees */
  vertical_fov?: number;
  /** Horizontal field of view in degrees */
  horizontal_fov?: number;
  /** Vertical orientation in degrees relative to level */
  vertical_orientation?: number;
  /** Horizontal orientation in degrees relative to front */
  horizontal_orientation?: number;
}

/**
 * Network link status component.
 */
export interface CommunicationsComponent {
  /** Network link state */
  link_state: "connected" | "disconnected" | "degraded" | "unknown";
}

/**
 * Current and queued work items for an entity.
 */
export interface TaskQueueComponent {
  /** Current task ID (null if idle) */
  current_task_id: string | null;
  /** Ordered list of queued task IDs */
  queued_task_ids: string[];
}

/**
 * Operational status component.
 */
export interface StatusComponent {
  /** Current operational status value */
  value: string;
  /** RFC 3339 timestamp of last status update */
  last_update?: string;
}

/**
 * Heartbeat timing component.
 */
export interface HeartbeatComponent {
  /** RFC 3339 timestamp of last heartbeat */
  last_seen: string;
}

/**
 * Command component for tasks.
 */
export interface CommandComponent {
  /** Command type identifier (required) */
  type: string;
}

/**
 * All supported entity components with optional fields.
 * Custom components (prefixed with custom_) are allowed via index signature.
 */
export interface EntityComponents {
  telemetry?: TelemetryComponent;
  geometry?: GeometryComponent;
  task_catalog?: TaskCatalogComponent;
  media_refs?: MediaRefItem[];
  mil_view?: MilViewComponent;
  health?: HealthComponent;
  sensor_refs?: SensorRefItem[];
  communications?: CommunicationsComponent;
  task_queue?: TaskQueueComponent;
  status?: StatusComponent;
  heartbeat?: HeartbeatComponent;
  /** Custom components must be prefixed with custom_ */
  [key: `custom_${string}`]: unknown;
}

// === Task Components ===

/**
 * Command parameters for task execution.
 */
export interface TaskParametersComponent {
  latitude?: number;
  longitude?: number;
  altitude_m?: number;
  /** Custom parameters must be prefixed with custom_ */
  [key: `custom_${string}`]: unknown;
}

/**
 * Runtime telemetry about task execution.
 */
export interface TaskProgressComponent {
  /** Progress percentage (0-100) */
  percent?: number;
  /** ISO 8601 timestamp of last update */
  updated_at?: string;
  /** Human-readable status detail */
  status_detail?: string;
}

/**
 * All supported task components.
 */
export interface TaskComponents {
  command?: CommandComponent;
  parameters?: TaskParametersComponent;
  progress?: TaskProgressComponent;
  /** Custom components must be prefixed with custom_ */
  [key: `custom_${string}`]: unknown;
}

// === Object Metadata ===

/**
 * A reference from an object to an entity or task.
 */
export interface ObjectReferenceItem {
  entity_id?: string;
  task_id?: string;
}

/**
 * Metadata for stored objects (JSON blob fields).
 */
export interface ObjectMetadata {
  /** Storage bucket name */
  bucket?: string;
  /** File size in bytes */
  size_bytes?: number;
  /** Hints about object usage */
  usage_hints?: string[];
  /** Entities/tasks that reference this object */
  referenced_by?: ObjectReferenceItem[];
  /** Hash/checksum of object content */
  checksum?: string;
  /** ISO 8601 expiry timestamp */
  expiry_time?: string;
  /** Custom fields */
  [key: `custom_${string}`]: unknown;
}

// === Helper Functions ===

/**
 * Known entity component keys for validation.
 */
const KNOWN_ENTITY_COMPONENTS = new Set([
  "telemetry",
  "geometry",
  "task_catalog",
  "media_refs",
  "mil_view",
  "health",
  "sensor_refs",
  "communications",
  "task_queue",
  "status",
  "heartbeat",
]);

/**
 * Validates that component keys are either known or prefixed with custom_.
 */
export function validateEntityComponents(components: Record<string, unknown>): void {
  for (const key of Object.keys(components)) {
    if (!KNOWN_ENTITY_COMPONENTS.has(key) && !key.startsWith("custom_")) {
      throw new Error(
        `Unknown component '${key}' in entity components. Custom components must be prefixed with 'custom_'`
      );
    }
  }
}

/**
 * Strips null and undefined values from an object recursively.
 * Preserves array shapes (including nested arrays) to avoid
 * converting arrays to objects.
 */
function stripNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const stripValue = (value: unknown): unknown => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (item === null || item === undefined) {
          return item;
        }
        return stripValue(item);
      });
    }
    if (typeof value === "object") {
      const nested: Record<string, unknown> = {};
      for (const [key, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue === null || innerValue === undefined) {
          continue;
        }
        const stripped = stripValue(innerValue);
        if (stripped !== undefined) {
          nested[key] = stripped;
        }
      }
      return nested;
    }
    return value;
  };

  return stripValue(obj) as Partial<T>;
}

/**
 * Convert typed components to a plain object for API transmission.
 * Strips null and undefined values.
 *
 * @param components - Typed component object
 * @returns Plain object suitable for JSON serialization
 */
export function componentsToRecord(
  components: EntityComponents | TaskComponents | undefined,
): Record<string, unknown> | undefined {
  if (components === undefined) {
    return undefined;
  }

  return stripNulls(components as Record<string, unknown>);
}
