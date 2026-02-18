# Atlas Command HTTP Client (TypeScript)

A TypeScript client for the Atlas Command REST API with full type support for entities, tasks, objects, and queries.

## Installation

```bash
npm install @atlasnpm/atlas-api-helper
```

**Requirements:** Node.js 18+

## Quick Start

```ts
import { AtlasHttpClient } from "@atlasnpm/atlas-api-helper";

const client = new AtlasHttpClient({
  baseUrl: "http://localhost:8000",
  token: "my-api-token",  // Optional Bearer token
});

// Create an entity
await client.createEntity("drone-01", "asset", "Demo Drone", "drone", {
  telemetry: { latitude: 40.7128, longitude: -74.0060 },
});

// Create a task assigned to the entity
await client.createTask("task-1", { parameters: { altitude_m: 120 } }, {
  entity_id: "drone-01",
});

// Start and complete the task
await client.startTask("task-1");
await client.completeTask("task-1");
```

## Client Configuration

```ts
interface ClientOptions {
  baseUrl: string;              // Atlas Command server URL
  token?: string;               // Optional Bearer token for Authorization header
  fetchImpl?: FetchImplementation;  // Custom fetch function (defaults to globalThis.fetch)
}
```

## Service Operations

```ts
getRoot(): Promise<JsonRecord>
getHealth(): Promise<JsonRecord>
getReadiness(): Promise<JsonRecord>
```

## Entity Operations

### Creating Entities

```ts
createEntity(
  entityId: string,
  entityType: string,  // "asset" | "track" | "geofeature"
  alias: string,
  subtype: string,
  components?: EntityComponents | JsonRecord
): Promise<Entity>
```

**Example:**
```ts
await client.createEntity("drone-01", "asset", "Demo Drone", "drone", {
  telemetry: {
    latitude: 40.7128,
    longitude: -74.0060,
    altitude_m: 120,
    speed_m_s: 8.2,
    heading_deg: 165,
  },
  health: { battery_percent: 85 },
  communications: { link_state: "connected" },
});
```

### Updating Entities

```ts
updateEntity(
  entityId: string,
  components?: EntityComponents | JsonRecord,
  options?: { subtype?: string }
): Promise<Entity>
```

At least one of `components` or `options.subtype` must be provided.

**Example:**
```ts
// Update components only
await client.updateEntity("drone-01", { health: { battery_percent: 72 } });

// Update subtype only
await client.updateEntity("drone-01", undefined, { subtype: "quadcopter" });

// Update both
await client.updateEntity("drone-01", { health: { battery_percent: 72 } }, { subtype: "quadcopter" });
```

### Updating Telemetry

A convenience method for updating only telemetry fields:

```ts
updateEntityTelemetry(
  entityId: string,
  options: {
    latitude?: number;
    longitude?: number;
    altitude_m?: number;
    speed_m_s?: number;
    heading_deg?: number;
  }
): Promise<Entity>
```

**Example:**
```ts
await client.updateEntityTelemetry("drone-01", {
  latitude: 40.7128,
  longitude: -74.0060,
  altitude_m: 100,
  speed_m_s: 15,
  heading_deg: 90,
});
```

### Other Entity Methods

| Method | Description |
|--------|-------------|
| `listEntities(limit?, offset?)` | List entities with pagination (defaults: limit=100, offset=0) |
| `getEntity(entityId)` | Get entity by ID |
| `getEntityByAlias(alias)` | Get entity by alias |
| `checkinEntity(entityId, telemetry, options?)` | Check in an entity and optionally request filtered tasks (`status_filter`, `limit`, `since`, `fields`) |
| `deleteEntity(entityId)` | Delete an entity |

## Task Operations

### Creating Tasks

```ts
createTask(
  taskId: string,
  components?: TaskComponents | JsonRecord,
  options?: {
    status?: string;      // Defaults to "pending"
    entity_id?: string;   // Entity to assign the task to
    extra?: JsonRecord;   // Additional metadata
  }
): Promise<Task>
```

**Example:**
```ts
await client.createTask("mission-1", {
  parameters: { latitude: 40.123, longitude: -74.456, altitude_m: 120 },
  progress: { percent: 0, status_detail: "Pending" },
}, {
  entity_id: "drone-01",
  status: "pending",
});
```

### Updating Tasks

```ts
updateTask(
  taskId: string,
  components?: TaskComponents | JsonRecord,
  options?: {
    status?: string;
    entity_id?: string;
    extra?: JsonRecord;
  }
): Promise<Task>
```

At least one of `components` or `options` must be provided.

**Example:**
```ts
await client.updateTask("mission-1", {
  progress: { percent: 50, status_detail: "En route" },
});
```

### Task Lifecycle Methods

```ts
startTask(taskId: string): Promise<Task>
completeTask(taskId: string): Promise<Task>
failTask(taskId: string, errorMessage?: string, errorDetails?: JsonRecord): Promise<Task>
```

**Example:**
```ts
await client.startTask("mission-1");
// ... task execution ...
await client.completeTask("mission-1");

// Or if the task fails:
await client.failTask("mission-2", "Calibration failed", { code: "CAL-01" });
```

### Other Task Methods

| Method | Description |
|--------|-------------|
| `listTasks(limit?, status?, offset?)` | List tasks with optional status filter (default limit: 25) and offset (default: 0) |
| `getTask(taskId)` | Get task by ID |
| `deleteTask(taskId)` | Delete a task |
| `getTasksByEntity(entityId, limit?, status?, offset?)` | Get tasks for an entity with optional offset (default: 0) |

## Object Operations

### Uploading Objects

```ts
createObject(
  file: Blob | File,
  objectId: string,
  usageHint?: string,
  referencedBy?: Array<{ entity_id?: string; task_id?: string }>
): Promise<StoredObject>
```

**Example:**
```ts
const videoBlob = new Blob([videoData], { type: "video/mp4" });
const stored = await client.createObject(videoBlob, "mission-video", "mission_recording", [
  { entity_id: "drone-01" },
  { task_id: "mission-1" },
]);
```

### Creating Object Metadata

```ts
createObjectMetadata(
  objectId: string,
  options?: {
    path?: string;
    bucket?: string;
    size_bytes?: number;
    content_type?: string;
    type?: string;
    usage_hints?: string[];
    referenced_by?: Array<{ entity_id?: string; task_id?: string }>;
    extra?: JsonRecord;
  }
): Promise<StoredObject>
```

### Updating Object Metadata

```ts
updateObject(
  objectId: string,
  usageHints?: string[],
  referencedBy?: Array<{ entity_id?: string; task_id?: string }>
): Promise<StoredObject>
```

At least one of `usageHints` or `referencedBy` must be provided.

**Example:**
```ts
await client.updateObject("mission-video", ["final_recording", "approved"], [
  { task_id: "mission-1" },
]);
```

### Object Reference Methods

| Method | Description |
|--------|-------------|
| `addObjectReference(objectId, entityId?, taskId?)` | Add reference to entity/task |
| `removeObjectReference(objectId, entityId?, taskId?)` | Remove reference |
| `getObjectReferences(objectId)` | Get all references for an object |
| `validateObjectReferences(objectId)` | Check if references point to existing entities/tasks |
| `cleanupObjectReferences(objectId)` | Remove references to deleted entities/tasks |

### Other Object Methods

| Method | Description |
|--------|-------------|
| `listObjects(limit?, offset?, contentType?, type?)` | List objects with filters |
| `getObject(objectId)` | Get object by ID |
| `viewObject(objectId)` | Fetch viewable object content inline |
| `deleteObject(objectId)` | Delete an object |
| `getObjectsByEntity(entityId, limit?, offset?)` | Get objects referenced by an entity |
| `getObjectsByTask(taskId, limit?, offset?)` | Get objects referenced by a task |
| `findOrphanedObjects(limit?)` | Find objects with no references |

## Query Operations

### Changed Since

Get entities, tasks, and objects modified after a timestamp:

```ts
getChangedSince(since: string, limitPerType?: number): Promise<ChangedSinceResponse>
```

**Example:**
```ts
const changes = await client.getChangedSince("2025-01-01T00:00:00Z", 50);
```

### Full Dataset

Get a snapshot of all data with configurable limits:

```ts
getFullDataset(options?: {
  entityLimit?: number;
  taskLimit?: number;
  objectLimit?: number;
}): Promise<FullDatasetResponse>
```

**Example:**
```ts
const snapshot = await client.getFullDataset({
  entityLimit: 100,
  taskLimit: 50,
  objectLimit: 200,
});
```

## Typed Components

The client provides type-safe interfaces for entity and task components. Use these to get IDE autocomplete and compile-time validation.

### Entity Components

```ts
import type { EntityComponents, TelemetryComponent } from "@atlasnpm/atlas-api-helper";

const components: EntityComponents = {
  telemetry: {
    latitude: 40.7128,      // degrees (WGS84)
    longitude: -74.0060,    // degrees (WGS84)
    altitude_m: 120,        // meters above sea level
    speed_m_s: 8.2,         // horizontal speed in m/s
    heading_deg: 165,       // heading (0=N, 90=E)
  },
  geometry: {
    type: "Point",          // "Point" | "LineString" | "Polygon"
    coordinates: [-74.0060, 40.7128],
  },
  health: {
    battery_percent: 85,
  },
  communications: {
    link_state: "connected",  // "connected" | "disconnected" | "degraded" | "unknown"
  },
  task_catalog: {
    supported_tasks: ["move_to_location", "survey_grid"],
  },
  task_queue: {
    current_task_id: "mission-1",
    queued_task_ids: ["mission-2", "mission-3"],
  },
  mil_view: {
    classification: "friendly",  // "friendly" | "hostile" | "neutral" | "unknown" | "civilian"
    last_seen: "2025-12-01T10:30:00Z",
  },
  media_refs: [
    { object_id: "video-001", role: "camera_feed" },
  ],
  sensor_refs: [
    { sensor_id: "radar-1", type: "radar", horizontal_fov: 120 },
  ],
};
```

### Task Components

```ts
import type { TaskComponents } from "@atlasnpm/atlas-api-helper";

const taskComponents: TaskComponents = {
  parameters: {
    latitude: 40.123,
    longitude: -74.456,
    altitude_m: 120,
    // Additional custom parameters are allowed
    speed_limit: 25,
  },
  progress: {
    percent: 65,
    updated_at: "2025-12-01T08:45:00Z",
    status_detail: "En route to destination",
  },
};
```

### Custom Components

Custom components must be prefixed with `custom_`:

```ts
const components: EntityComponents = {
  telemetry: { latitude: 40.7128 },
  custom_weather: { wind_speed: 12, gusts: 18 },
  custom_mission_data: { priority: "high" },
};
```

### Component Validation

The client validates entity component keys before sending requests. Unknown keys that don't start with `custom_` will throw an error:

```ts
// This will throw: "Unknown component 'unknown_key'..."
await client.createEntity("test", "asset", "Test", "drone", {
  unknown_key: { foo: "bar" },
});

// This works - prefixed with custom_
await client.createEntity("test", "asset", "Test", "drone", {
  custom_mydata: { foo: "bar" },
});
```

## Error Handling

All methods throw an `Error` on non-2xx responses. The error message includes the HTTP status and response body:

```ts
try {
  await client.getEntity("nonexistent");
} catch (error) {
  // Error: HTTP 404: {"detail":"Entity not found","code":"ENTITY_NOT_FOUND"}
  console.error(error.message);
}
```

For 204 No Content responses (like successful deletes), methods return `undefined`.

## TypeScript Types

The package exports comprehensive types for all API resources:

```ts
import type {
  // Core types
  Entity,
  Task,
  StoredObject,
  
  // Entity aliases
  Asset,
  Track,
  GeoFeature,
  Command,
  
  // Component types
  EntityComponents,
  TaskComponents,
  TelemetryComponent,
  GeometryComponent,
  HealthComponent,
  CommunicationsComponent,
  TaskCatalogComponent,
  TaskQueueComponent,
  MilViewComponent,
  MediaRefItem,
  SensorRefItem,
  TaskParametersComponent,
  TaskProgressComponent,
  
  // Object types
  ObjectMetadata,
  ObjectReferenceItem,
  ObjectReference,
  ObjectCreate,
  ObjectUpdate,
  
  // Task lifecycle
  TaskStatusUpdate,
  TaskStart,
  TaskComplete,
  TaskFail,
  Telemetry,
  
  // Other entity types
  Model,
  CommandDefinition,
  EventType,
  Event,
  Sensor,
  TrackTelemetry,
  
  // Query types
  ChangedSinceOptions,
  FullDatasetOptions,
  
  // Client types
  ClientOptions,
  FetchImplementation,
  JsonRecord,
} from "@atlasnpm/atlas-api-helper";
```

### Utility Functions

```ts
import { validateEntityComponents, componentsToRecord } from "@atlasnpm/atlas-api-helper";

// Validate component keys (throws on unknown non-custom keys)
validateEntityComponents({ telemetry: {}, custom_data: {} });

// Convert components to plain object, stripping null/undefined values
const cleaned = componentsToRecord({ telemetry: { latitude: 40.7, altitude_m: undefined } });
// Result: { telemetry: { latitude: 40.7 } }
```

## Custom Fetch / Testing

Pass a custom `fetchImpl` when constructing the client to inject your own transport (e.g., `node-fetch`, `cross-fetch`, or a mocked implementation for unit tests):

```ts
const client = new AtlasHttpClient({
  baseUrl: "https://atlas.example.com",
  fetchImpl: myCustomFetch,
});
```

See `tests/httpClient.test.ts` for examples using mocked fetch functions.

## Building & Testing

```bash
npm install
npm run build
npm run test
```

The build produces both ESM and CJS bundles plus `.d.ts` type definitions via `tsup`.

## Publishing

Publishing is handled by `.github/workflows/publish-atlas-api-helper-npm.yml`. Ensure the `@atlasnpm` scope and automation token are set up as documented in the workflow README before triggering a release.
