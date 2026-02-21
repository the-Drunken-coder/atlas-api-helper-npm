import type {
  EntityComponents,
  TaskComponents,
  CommandComponent,
} from "./types/components.js";
import {
  componentsToRecord,
  validateEntityComponents,
} from "./types/components.js";
import type { ChangedSinceResponse } from "./types/entities.js";

export interface FetchImplementation {
  (input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: FetchImplementation;
}

export type JsonRecord = Record<string, unknown>;

export class AtlasHttpClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: FetchImplementation;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    const defaultFetch =
      typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined;
    const resolvedFetch = options.fetchImpl ?? defaultFetch;
    if (!resolvedFetch) {
      throw new Error("fetch is not available; provide fetchImpl");
    }
    this.fetchImpl = resolvedFetch;
  }

  private headers(): HeadersInit {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private multipartHeaders(): HeadersInit {
    const headers: HeadersInit = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: JsonRecord | null,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async multipartRequest<T>(path: string, formData: FormData): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: this.multipartHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // Service ------------------------------------------------------------------
  getRoot() {
    return this.request("GET", "/");
  }

  getHealth() {
    return this.request("GET", "/health");
  }

  getReadiness() {
    return this.request("GET", "/readiness");
  }

  // Entities ------------------------------------------------------------------
  listEntities(limit = 100, offset = 0) {
    return this.request("GET", "/entities", null, { limit, offset });
  }

  getEntity(entityId: string) {
    return this.request("GET", `/entities/${entityId}`);
  }

  getEntityByAlias(alias: string) {
    return this.request("GET", `/entities/alias/${alias}`);
  }

  createEntity(
    entityId: string,
    entityType: string,
    alias: string,
    subtype: string,
    components?: EntityComponents,
  ) {
    const payload: JsonRecord = {
      entity_id: entityId,
      entity_type: entityType,
      alias,
      subtype,
    };
    if (components !== undefined) {
      // Validate component keys if provided
      validateEntityComponents(components as Record<string, unknown>);
      payload.components = componentsToRecord(components);
    }
    return this.request("POST", "/entities", payload);
  }

  updateEntity(entityId: string, components?: EntityComponents, options?: { subtype?: string }) {
    if (components === undefined && options?.subtype === undefined) {
      throw new Error("AtlasHttpClient.updateEntity requires a components payload or subtype.");
    }
    const payload: JsonRecord = {};
    if (components !== undefined) {
      validateEntityComponents(components as Record<string, unknown>);
      payload.components = componentsToRecord(components);
    }
    if (options?.subtype !== undefined) payload.subtype = options.subtype;
    return this.request("PATCH", `/entities/${entityId}`, payload);
  }

  deleteEntity(entityId: string) {
    return this.request("DELETE", `/entities/${entityId}`);
  }

  updateEntityTelemetry(
    entityId: string,
    options: {
      latitude?: number;
      longitude?: number;
      altitude_m?: number;
      speed_m_s?: number;
      heading_deg?: number;
    },
  ) {
    const payload: JsonRecord = {};
    if (options.latitude !== undefined) payload.latitude = options.latitude;
    if (options.longitude !== undefined) payload.longitude = options.longitude;
    if (options.altitude_m !== undefined) payload.altitude_m = options.altitude_m;
    if (options.speed_m_s !== undefined) payload.speed_m_s = options.speed_m_s;
    if (options.heading_deg !== undefined) payload.heading_deg = options.heading_deg;
    return this.request("PATCH", `/entities/${entityId}/telemetry`, payload);
  }

  checkinEntity(
    entityId: string,
    telemetry: {
      latitude?: number;
      longitude?: number;
      altitude_m?: number;
      speed_m_s?: number;
      heading_deg?: number;
    },
    options?: {
      status?: string;
      status_filter?: string;
      limit?: number;
      since?: string;
      fields?: string;
    },
  ) {
    const payload: JsonRecord = { ...telemetry };
    if (options?.status !== undefined) {
      payload.status = options.status;
    }
    const params: Record<string, unknown> = {
      status_filter: options?.status_filter ?? "pending,acknowledged",
      limit: options?.limit ?? 10,
      since: options?.since,
      fields: options?.fields,
    };
    return this.request("POST", `/entities/${entityId}/checkin`, payload, params);
  }

  // Tasks ---------------------------------------------------------------------
  listTasks(limit = 25, status?: string, offset = 0) {
    return this.request("GET", "/tasks", null, {
      limit,
      status,
      offset,
    });
  }

  getTask(taskId: string) {
    return this.request("GET", `/tasks/${taskId}`);
  }

  createTask(
    taskId: string,
    components?: TaskComponents,
    options?: { status?: string; entity_id?: string; extra?: JsonRecord }
  ) {
    const payload: JsonRecord = {
      task_id: taskId,
      status: options?.status || "pending",
    };
    if (options?.entity_id !== undefined) payload.entity_id = options.entity_id;
    if (components !== undefined) payload.components = componentsToRecord(components);
    if (options?.extra !== undefined) payload.extra = options.extra;
    return this.request("POST", "/tasks", payload);
  }

  updateTask(
    taskId: string,
    components?: TaskComponents,
    options?: { status?: string; entity_id?: string; extra?: JsonRecord }
  ) {
    if (components === undefined && options === undefined) {
      throw new Error(
        "AtlasHttpClient.updateTask requires a components payload or options.",
      );
    }
    const payload: JsonRecord = {};
    if (components !== undefined) payload.components = componentsToRecord(components);
    if (options?.status !== undefined) payload.status = options.status;
    if (options?.entity_id !== undefined) payload.entity_id = options.entity_id;
    if (options?.extra !== undefined) payload.extra = options.extra;
    return this.request("PATCH", `/tasks/${taskId}`, payload);
  }

  deleteTask(taskId: string) {
    return this.request("DELETE", `/tasks/${taskId}`);
  }

  getTasksByEntity(entityId: string, limit = 25, status?: string, offset = 0) {
    return this.request("GET", `/entities/${entityId}/tasks`, null, {
      limit,
      status,
      offset,
    });
  }

  acknowledgeTask(taskId: string) {
    return this.request("POST", `/tasks/${taskId}/acknowledge`, {});
  }

  startTask(taskId: string) {
    return this.acknowledgeTask(taskId);
  }

  completeTask(taskId: string, result?: JsonRecord) {
    const payload: JsonRecord = {};
    if (result !== undefined) payload.result = result;
    return this.request("POST", `/tasks/${taskId}/complete`, payload);
  }

  transitionTaskStatus(
    taskId: string,
    status: string,
    options?: { validate?: boolean; extra?: JsonRecord },
  ) {
    const payload: JsonRecord = {
      status,
      validate: options?.validate ?? true,
    };
    if (options?.extra !== undefined) payload.extra = options.extra;
    return this.request("POST", `/tasks/${taskId}/status`, payload);
  }

  failTask(
    taskId: string,
    errorMessage?: string,
    errorDetails?: JsonRecord,
  ) {
    const payload: JsonRecord = {};
    if (errorMessage !== undefined) payload.error_message = errorMessage;
    if (errorDetails !== undefined) payload.error_details = errorDetails;
    return this.request("POST", `/tasks/${taskId}/fail`, payload);
  }

  // Objects -------------------------------------------------------------------
  async downloadObject(objectId: string): Promise<{
    data: Uint8Array;
    contentType?: string;
    contentLength?: number;
  }> {
    const url = new URL(`${this.baseUrl}/objects/${objectId}/download`);
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || undefined;
    const lengthHeader = response.headers.get("content-length");
    const contentLength =
      lengthHeader && !Number.isNaN(Number(lengthHeader)) ? Number(lengthHeader) : undefined;
    return { data: new Uint8Array(buffer), contentType, contentLength };
  }

  async viewObject(objectId: string): Promise<{
    data: string;
    contentType?: string;
    contentLength?: number;
  }> {
    const url = new URL(`${this.baseUrl}/objects/${objectId}/view`);
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const contentType = response.headers.get("content-type") || undefined;
    const lengthHeader = response.headers.get("content-length");
    const contentLength =
      lengthHeader && !Number.isNaN(Number(lengthHeader)) ? Number(lengthHeader) : undefined;
    return { data: await response.text(), contentType, contentLength };
  }

  listObjects(limit = 100, offset = 0, contentType?: string, type?: string) {
    return this.request("GET", "/objects", null, { limit, offset, content_type: contentType, type });
  }

  getObject(objectId: string) {
    return this.request("GET", `/objects/${objectId}`);
  }

  async createObject(
    file: Blob | File,
    objectId: string,
    usageHint?: string,
    referencedBy?: Array<{ entity_id?: string; task_id?: string }>,
  ) {
    const contentType = "type" in file ? file.type : "";
    if (!contentType) {
      throw new Error("AtlasHttpClient.createObject requires a content type.");
    }
    const formData = new FormData();
    formData.append("object_id", objectId);
    const filename = (file as File).name ?? "upload.bin";
    formData.append("file", file, filename);
    if (usageHint) {
      formData.append("usage_hint", usageHint);
    }

    const stored = await this.multipartRequest<JsonRecord>("/objects/upload", formData);
    const storedObjectId = stored["object_id"] as string | undefined;
    if (referencedBy && storedObjectId !== undefined) {
      for (const reference of referencedBy) {
        await this.addObjectReference(storedObjectId, reference.entity_id, reference.task_id);
      }
    } else if (referencedBy && storedObjectId === undefined) {
      throw new Error(
        "AtlasHttpClient.createObject expected the upload response to include an object_id before attaching references.",
      );
    }

    return stored;
  }

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
    },
  ) {
    const payload: JsonRecord = {
      object_id: objectId,
      path: options?.path,
      bucket: options?.bucket,
      size_bytes: options?.size_bytes,
      content_type: options?.content_type,
      type: options?.type,
      usage_hints: options?.usage_hints,
      referenced_by: options?.referenced_by,
      extra: options?.extra,
    };
    return this.request("POST", "/objects", payload);
  }

  updateObject(
    objectId: string,
    usageHints?: string[],
    referencedBy?: Array<{ entity_id?: string; task_id?: string }>,
  ) {
    if (usageHints === undefined && referencedBy === undefined) {
      return Promise.reject(
        new Error(
          "AtlasHttpClient.updateObject requires usageHints or referencedBy to make an update.",
        ),
      );
    }
    const payload: JsonRecord = {};
    if (usageHints !== undefined) payload.usage_hints = usageHints;
    if (referencedBy !== undefined) payload.referenced_by = referencedBy;
    return this.request("PATCH", `/objects/${objectId}`, payload);
  }

  deleteObject(objectId: string) {
    return this.request("DELETE", `/objects/${objectId}`);
  }

  getObjectsByEntity(entityId: string, limit = 50, offset = 0) {
    return this.request("GET", `/entities/${entityId}/objects`, null, { limit, offset });
  }

  getObjectsByTask(taskId: string, limit = 50, offset = 0) {
    return this.request("GET", `/tasks/${taskId}/objects`, null, { limit, offset });
  }

  addObjectReference(
    objectId: string,
    entityId?: string,
    taskId?: string,
  ) {
    const payload: JsonRecord = {};
    if (entityId !== undefined) payload.entity_id = entityId;
    if (taskId !== undefined) payload.task_id = taskId;
    return this.request("POST", `/objects/${objectId}/references`, payload);
  }

  removeObjectReference(
    objectId: string,
    entityId?: string,
    taskId?: string,
  ) {
    const payload: JsonRecord = {};
    if (entityId !== undefined) payload.entity_id = entityId;
    if (taskId !== undefined) payload.task_id = taskId;
    return this.request("DELETE", `/objects/${objectId}/references`, payload);
  }

  findOrphanedObjects(limit = 100) {
    return this.request("GET", "/objects/orphaned", null, { limit });
  }

  getObjectReferences(objectId: string) {
    return this.request("GET", `/objects/${objectId}/references/info`);
  }

  validateObjectReferences(objectId: string) {
    return this.request("GET", `/objects/${objectId}/references/validate`);
  }

  cleanupObjectReferences(objectId: string) {
    return this.request("POST", `/objects/${objectId}/references/cleanup`, {});
  }

  // Queries -------------------------------------------------------------------
  getChangedSince(since: string, limitPerType?: number): Promise<ChangedSinceResponse> {
    return this.request("GET", "/queries/changed-since", null, {
      since,
      limit_per_type: limitPerType,
    });
  }

  getFullDataset(options?: { entityLimit?: number; taskLimit?: number; objectLimit?: number }) {
    return this.request("GET", "/queries/full", null, {
      entity_limit: options?.entityLimit,
      task_limit: options?.taskLimit,
      object_limit: options?.objectLimit,
    });
  }
}
