import type {
  EntityComponents,
  TaskComponents,
  CommandComponent,
} from "./types/components.js";
import {
  componentsToRecord,
  validateEntityComponents,
} from "./types/components.js";
import type {
  ChangedSinceOptions,
  ChangedSinceResponse,
  FullDatasetOptions,
  FullDatasetResponse,
  QueryStreamCursors,
} from "./types/entities.js";

export interface FetchImplementation {
  (input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: FetchImplementation;
}

export type JsonRecord = Record<string, unknown>;

/** Raised when PATCH /objects/{id} returns 412; callers should refetch, merge, and retry. */
export class ObjectPreconditionFailedError extends Error {
  readonly status = 412;
  readonly objectId: string;

  constructor(objectId: string, detail: string) {
    super(detail || `HTTP 412 precondition failed for object ${objectId}`);
    this.name = "ObjectPreconditionFailedError";
    this.objectId = objectId;
  }
}

export class AtlasHttpClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: FetchImplementation;
  /** Weak ETags from GET /objects/{id}; sent as If-Match on PATCH. */
  private readonly objectEtags = new Map<string, string>();
  /** Hard cap on cached ETags to prevent unbounded memory growth. */
  private static readonly MAX_ETAG_CACHE_SIZE = 10_000;
  private readonly deprecationWarnings = new Set<string>();

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

  /** Store an ETag with LRU eviction: deletes and re-inserts the key so Map
   *  iteration order (insertion order) reflects most-recent access, then evicts
   *  the oldest entry when the cache exceeds its cap. */
  private cacheEtag(objectId: string, etag: string): void {
    this.objectEtags.delete(objectId);
    this.objectEtags.set(objectId, etag);
    if (this.objectEtags.size > AtlasHttpClient.MAX_ETAG_CACHE_SIZE) {
      const oldest = this.objectEtags.keys().next().value;
      if (oldest !== undefined) this.objectEtags.delete(oldest);
    }
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

  /** GET JSON or null when the server returns 404 (used for reference validation). */
  private async getJsonAllowNotFound(path: string): Promise<JsonRecord | null> {
    const url = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: this.headers(),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const text = await response.text();
    if (!text.trim()) {
      return {};
    }
    return JSON.parse(text) as JsonRecord;
  }

  private async multipartRequest<T>(
    path: string,
    formData: FormData,
  ): Promise<{ body: T; etag: string | null }> {
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

    const etag = response.headers.get("etag");
    if (response.status === 204) {
      return { body: undefined as T, etag };
    }

    return { body: (await response.json()) as T, etag };
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

  private normalizeOptionalRefValue(value: unknown): unknown {
    return value ?? null;
  }

  private warnDeprecated(message: string): void {
    if (this.deprecationWarnings.has(message)) {
      return;
    }
    this.deprecationWarnings.add(message);
    console.warn(message);
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
  listTasks(limit = 25, offset = 0, status?: string) {
    if (status !== undefined) {
      this.warnDeprecated(
        "AtlasHttpClient.listTasks(status=...) is deprecated and will be removed in the next release.",
      );
    }
    return this.request("GET", "/tasks", null, {
      limit,
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

  getTasksByEntity(entityId: string, limit?: number, offset?: number): Promise<unknown>;
  /** @deprecated Passing a status string as the 2nd argument is ignored; use (entityId, limit?, offset?) only. */
  getTasksByEntity(
    entityId: string,
    deprecatedStatus: string,
    limit?: number,
    offset?: number,
  ): Promise<unknown>;
  getTasksByEntity(
    entityId: string,
    limitOrDeprecatedStatus: number | string = 25,
    offsetOrLimit?: number,
    offsetOnly?: number,
  ): Promise<unknown> {
    let limit = 25;
    let offset = 0;
    if (typeof limitOrDeprecatedStatus === "string") {
      this.warnDeprecated(
        "AtlasHttpClient.getTasksByEntity(..., status) is deprecated and ignored; pass (entityId, limit?, offset?) only.",
      );
      limit = offsetOrLimit ?? 25;
      offset = offsetOnly ?? 0;
    } else {
      limit = limitOrDeprecatedStatus;
      offset = offsetOrLimit ?? 0;
    }
    return this.request("GET", `/entities/${entityId}/tasks`, null, {
      limit,
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
    options?: {
      progress?: number;
      message?: string;
      /** @deprecated */
      validate?: boolean;
      /** @deprecated */
      extra?: JsonRecord;
    },
  ) {
    if (options?.validate !== undefined || options?.extra !== undefined) {
      this.warnDeprecated(
        "AtlasHttpClient.transitionTaskStatus({ validate, extra }) is deprecated and ignored.",
      );
    }
    const payload: JsonRecord = { status };
    if (options?.progress !== undefined) payload.progress = options.progress;
    if (options?.message !== undefined) payload.message = options.message;
    return this.request("POST", `/tasks/${taskId}/status`, payload);
  }

  failTask(
    taskId: string,
    errorMessage?: string,
    errorDetails?: JsonRecord,
  ) {
    const errObj: JsonRecord = {};
    if (errorMessage !== undefined) errObj.message = errorMessage;
    if (errorDetails !== undefined) errObj.details = errorDetails;
    const payload: JsonRecord = {};
    if (Object.keys(errObj).length > 0) payload.error = errObj;
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

  listObjects(
    limit = 100,
    offset = 0,
    contentType?: string,
    legacyType?: string,
    validate?: unknown,
  ) {
    if (contentType !== undefined || legacyType !== undefined || validate !== undefined) {
      this.warnDeprecated(
        "AtlasHttpClient.listObjects(contentType, type, validate) is deprecated and ignored.",
      );
    }
    return this.request("GET", "/objects", null, { limit, offset });
  }

  /**
   * GET /objects/{id} returning the JSON body and the ETag from the same response.
   * Use `etag` when calling PATCH immediately so If-Match matches this GET (avoids map races).
   */
  async getObjectWithEtag(objectId: string): Promise<{ data: unknown; etag: string | null }> {
    const url = new URL(`${this.baseUrl}/objects/${objectId}`);
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const rawEtag = response.headers.get("etag");
    const etag = rawEtag?.trim() ? rawEtag.trim() : null;
    if (etag) {
      this.cacheEtag(objectId, etag);
    } else {
      this.objectEtags.delete(objectId);
    }
    return { data: (await response.json()) as unknown, etag };
  }

  async getObject(objectId: string): Promise<unknown> {
    const { data } = await this.getObjectWithEtag(objectId);
    return data;
  }

  /** If-Match uses the explicit snapshot ETag when provided, else the latest cached ETag. */
  private async patchObjectWithEtag(
    objectId: string,
    payload: JsonRecord,
    ifMatch: string | undefined,
  ): Promise<unknown> {
    const headers = new Headers(this.headers());
    if (ifMatch) {
      headers.set("If-Match", ifMatch);
    }
    const url = new URL(`${this.baseUrl}/objects/${objectId}`);
    const response = await this.fetchImpl(url.toString(), {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (response.status === 412) {
      const detail = await response.text();
      throw new ObjectPreconditionFailedError(objectId, detail);
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const newEtag = response.headers.get("etag");
    if (newEtag) {
      this.cacheEtag(objectId, newEtag);
    } else {
      this.objectEtags.delete(objectId);
    }
    return (await response.json()) as unknown;
  }

  async createObject(
    file: Blob | File,
    objectId: string,
    usageHint?: string,
    referencedBy?: Array<{ entity_id?: string; task_id?: string }>,
    objectType?: string,
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
    if (objectType) {
      formData.append("type", objectType);
    }

    const { body: stored, etag } = await this.multipartRequest<JsonRecord>("/objects/upload", formData);
    const storedObjectId = stored["object_id"] as string | undefined;
    if (storedObjectId) {
      if (etag) {
        this.cacheEtag(storedObjectId, etag);
      } else {
        this.objectEtags.delete(storedObjectId);
      }
    }
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

  async createObjectMetadata(
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
  ): Promise<unknown> {
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
    const url = new URL(`${this.baseUrl}/objects`);
    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const body = (await response.json()) as JsonRecord;
    const oid = (body.object_id as string | undefined) ?? objectId;
    const etag = response.headers.get("etag");
    if (etag) {
      this.cacheEtag(oid, etag);
    }
    return body;
  }

  async updateObject(
    objectId: string,
    usageHints?: string[],
    referencedBy?: Array<{ entity_id?: string; task_id?: string }>,
    etag?: string,
  ): Promise<unknown> {
    if (usageHints === undefined && referencedBy === undefined) {
      throw new Error(
        "AtlasHttpClient.updateObject requires usageHints or referencedBy to make an update.",
      );
    }
    const payload: JsonRecord = {};
    if (usageHints !== undefined) payload.usage_hints = usageHints;
    if (referencedBy !== undefined) payload.referenced_by = referencedBy;
    const ifMatch = etag ?? this.objectEtags.get(objectId);
    return this.patchObjectWithEtag(objectId, payload, ifMatch);
  }

  async deleteObject(objectId: string): Promise<unknown> {
    const out = await this.request("DELETE", `/objects/${objectId}`);
    this.objectEtags.delete(objectId);
    return out;
  }

  getObjectsByEntity(entityId: string, limit = 50, offset = 0) {
    return this.request("GET", `/entities/${entityId}/objects`, null, { limit, offset });
  }

  getObjectsByTask(taskId: string, limit = 50, offset = 0) {
    return this.request("GET", `/tasks/${taskId}/objects`, null, { limit, offset });
  }

  /**
   * Append a reference on the object (GET referenced_by, PATCH). Uses If-Match when the
   * server returns ETags; retries once on 412 after refreshing the object.
   */
  async addObjectReference(
    objectId: string,
    entityId?: string,
    taskId?: string,
  ): Promise<unknown> {
    const newRef: JsonRecord = {};
    if (entityId !== undefined) newRef.entity_id = entityId;
    if (taskId !== undefined) newRef.task_id = taskId;
    if (Object.keys(newRef).length === 0) {
      throw new Error("addObjectReference requires entityId and/or taskId");
    }
    const sameRef = (r: JsonRecord) =>
      this.normalizeOptionalRefValue(r.entity_id) ===
        this.normalizeOptionalRefValue(newRef.entity_id) &&
      this.normalizeOptionalRefValue(r.task_id) === this.normalizeOptionalRefValue(newRef.task_id);

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: objRaw, etag } = await this.getObjectWithEtag(objectId);
      const obj = objRaw as JsonRecord;
      const refsAny = obj.referenced_by;
      const refs: JsonRecord[] = [];
      if (Array.isArray(refsAny)) {
        for (const item of refsAny) {
          if (item && typeof item === "object") {
            refs.push({ ...(item as JsonRecord) });
          }
        }
      }
      if (refs.some(sameRef)) {
        return obj;
      }
      refs.push(newRef);
      try {
        return await this.patchObjectWithEtag(
          objectId,
          { referenced_by: refs as Array<{ entity_id?: string; task_id?: string }> },
          etag ?? undefined,
        );
      } catch (e) {
        if (e instanceof ObjectPreconditionFailedError && attempt === 0) {
          continue;
        }
        throw e;
      }
    }
    throw new Error("addObjectReference retry exhausted");
  }

  /**
   * Remove references that **exactly** match the given dimensions: both IDs remove only
   * that pair; entity-only removes only refs with that entity and no task; task-only removes
   * only refs with that task and no entity. See addObjectReference re: concurrent writes.
   */
  async removeObjectReference(
    objectId: string,
    entityId?: string,
    taskId?: string,
  ): Promise<unknown> {
    if (entityId === undefined && taskId === undefined) {
      throw new Error("removeObjectReference requires entityId and/or taskId");
    }
    const shouldRemove = (r: JsonRecord): boolean => {
      const re = r.entity_id;
      const rt = r.task_id;
      const entityUnset = re === undefined || re === null;
      const taskUnset = rt === undefined || rt === null;
      if (entityId !== undefined && taskId !== undefined) {
        return re === entityId && rt === taskId;
      }
      if (entityId !== undefined) {
        return re === entityId && taskUnset;
      }
      return rt === taskId && entityUnset;
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: objRaw, etag } = await this.getObjectWithEtag(objectId);
      const obj = objRaw as JsonRecord;
      const refsAny = obj.referenced_by;
      const refs: JsonRecord[] = [];
      if (Array.isArray(refsAny)) {
        for (const item of refsAny) {
          if (item && typeof item === "object") {
            refs.push({ ...(item as JsonRecord) });
          }
        }
      }
      const newRefs = refs.filter((r) => !shouldRemove(r));
      if (newRefs.length === refs.length) {
        return obj;
      }
      try {
        return await this.patchObjectWithEtag(
          objectId,
          { referenced_by: newRefs as Array<{ entity_id?: string; task_id?: string }> },
          etag ?? undefined,
        );
      } catch (e) {
        if (e instanceof ObjectPreconditionFailedError && attempt === 0) {
          continue;
        }
        throw e;
      }
    }
    throw new Error("removeObjectReference retry exhausted");
  }

  findOrphanedObjects(limit = 100, offset = 0) {
    return this.request("GET", "/objects/orphaned", null, { limit, offset });
  }

  async getObjectReferences(objectId: string): Promise<JsonRecord> {
    const obj = (await this.getObject(objectId)) as JsonRecord;
    let rb: unknown = obj.referenced_by;
    if (rb === undefined || rb === null) {
      rb = [];
    }
    if (!Array.isArray(rb)) {
      rb = [];
    }
    return {
      object_id: (obj.object_id as string) ?? objectId,
      referenced_by: rb,
    };
  }

  async validateObjectReferences(objectId: string): Promise<JsonRecord[]> {
    const { checks } = await this.validateObjectReferencesSnapshot(objectId);
    return checks;
  }

  private async validateObjectReferencesSnapshot(
    objectId: string,
  ): Promise<{ checks: JsonRecord[]; etag: string | null }> {
    const { data: objRaw, etag } = await this.getObjectWithEtag(objectId);
    const obj = objRaw as JsonRecord;
    const refsAny = obj.referenced_by;
    const out: JsonRecord[] = [];
    if (!Array.isArray(refsAny)) {
      return { checks: out, etag };
    }
    for (const item of refsAny) {
      if (!item || typeof item !== "object") {
        out.push({ status: "invalid_format", reason: "reference_not_object" });
        continue;
      }
      const ref = { ...(item as JsonRecord) };
      const eid = ref.entity_id;
      const tid = ref.task_id;
      if (eid == null && tid == null) {
        ref.status = "invalid_format";
        ref.reason = "missing_entity_and_task";
        out.push(ref);
        continue;
      }
      let valid = true;
      if (eid != null) {
        const ent = await this.getJsonAllowNotFound(`/entities/${String(eid)}`);
        if (ent === null) {
          valid = false;
          if (ref.reason === undefined) ref.reason = "entity_not_found";
        }
      }
      if (valid && tid != null) {
        const task = await this.getJsonAllowNotFound(`/tasks/${String(tid)}`);
        if (task === null) {
          valid = false;
          if (ref.reason === undefined) ref.reason = "task_not_found";
        }
      }
      ref.status = valid ? "valid" : "invalid";
      out.push(ref);
    }
    return { checks: out, etag };
  }

  async cleanupObjectReferences(objectId: string): Promise<JsonRecord> {
    const { checks, etag } = await this.validateObjectReferencesSnapshot(objectId);
    const kept: Array<{ entity_id?: string; task_id?: string }> = [];
    let strippedNullsOnValid = false;
    for (const row of checks) {
      if (row.status === "valid") {
        if (row.entity_id === null || row.task_id === null) {
          strippedNullsOnValid = true;
        }
        const entry: { entity_id?: string; task_id?: string } = {};
        if (row.entity_id != null) entry.entity_id = String(row.entity_id);
        if (row.task_id != null) entry.task_id = String(row.task_id);
        kept.push(entry);
      }
    }
    const removed = checks.filter((r) => r.status !== "valid").length;
    if (removed === 0 && !strippedNullsOnValid) {
      return { object_id: objectId, cleaned: 0 };
    }
    await this.updateObject(objectId, undefined, kept, etag ?? undefined);
    return { object_id: objectId, cleaned: removed };
  }

  private withLegacyDeletedAliases<T extends { id: string }>(
    rows: T[] | undefined,
    legacyKey: "entity_id" | "task_id" | "object_id",
  ): Array<T & Record<string, string>> | undefined {
    if (!rows) {
      return rows;
    }
    return rows.map((row) => ({
      ...row,
      [legacyKey]: row.id,
    }));
  }

  private normalizeChangedSinceResponse(response: ChangedSinceResponse): ChangedSinceResponse {
    return {
      ...response,
      deleted_entities: this.withLegacyDeletedAliases(response.deleted_entities, "entity_id"),
      deleted_tasks: this.withLegacyDeletedAliases(response.deleted_tasks, "task_id"),
      deleted_objects: this.withLegacyDeletedAliases(response.deleted_objects, "object_id"),
    };
  }

  // Queries -------------------------------------------------------------------
  /**
   * @param cursors Optional opaque tokens from a prior response `next_*_cursor` fields (same `since` for continuation).
   */
  async getChangedSince(
    sinceOrOptions: string | ChangedSinceOptions,
    limitPerType?: number,
    cursors?: QueryStreamCursors,
  ): Promise<ChangedSinceResponse> {
    let since: string;
    let limit: number | undefined;
    let stream: QueryStreamCursors | undefined;

    if (typeof sinceOrOptions === "string") {
      since = sinceOrOptions;
      limit = limitPerType;
      stream = cursors;
    } else {
      since = sinceOrOptions.since;
      limit = sinceOrOptions.limit_per_type ?? limitPerType;
      const { since: _s, limit_per_type: _l, ...cursorFields } = sinceOrOptions;
      stream = { ...cursorFields, ...cursors };
    }

    const params: Record<string, unknown> = {
      since,
      limit_per_type: limit,
    };
    if (stream) {
      if (stream.entityCursor) params.entity_cursor = stream.entityCursor;
      if (stream.taskCursor) params.task_cursor = stream.taskCursor;
      if (stream.objectCursor) params.object_cursor = stream.objectCursor;
      if (stream.deletedEntityCursor) params.deleted_entity_cursor = stream.deletedEntityCursor;
      if (stream.deletedTaskCursor) params.deleted_task_cursor = stream.deletedTaskCursor;
      if (stream.deletedObjectCursor) params.deleted_object_cursor = stream.deletedObjectCursor;
    }
    const response = await this.request<ChangedSinceResponse>(
      "GET",
      "/queries/changed-since",
      null,
      params,
    );
    return this.normalizeChangedSinceResponse(response);
  }

  getFullDataset(options?: FullDatasetOptions): Promise<FullDatasetResponse>;
  getFullDataset(
    entityLimit?: number,
    taskLimit?: number,
    objectLimit?: number,
  ): Promise<FullDatasetResponse>;
  getFullDataset(
    optionsOrEntityLimit?: FullDatasetOptions | number,
    taskLimit?: number,
    objectLimit?: number,
  ): Promise<FullDatasetResponse> {
    const options =
      typeof optionsOrEntityLimit === "number" ||
      taskLimit !== undefined ||
      objectLimit !== undefined
        ? {
            entity_limit:
              typeof optionsOrEntityLimit === "number" ? optionsOrEntityLimit : undefined,
            task_limit: taskLimit,
            object_limit: objectLimit,
          }
        : optionsOrEntityLimit;
    const el = options?.entityLimit ?? options?.entity_limit;
    const tl = options?.taskLimit ?? options?.task_limit;
    const ol = options?.objectLimit ?? options?.object_limit;
    const ec = options?.entityCursor ?? options?.entity_cursor;
    const tc = options?.taskCursor ?? options?.task_cursor;
    const oc = options?.objectCursor ?? options?.object_cursor;
    return this.request("GET", "/queries/full", null, {
      entity_limit: el,
      task_limit: tl,
      object_limit: ol,
      entity_cursor: ec,
      task_cursor: tc,
      object_cursor: oc,
    });
  }
}
