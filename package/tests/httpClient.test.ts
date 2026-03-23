import { describe, expect, it, vi } from "vitest";
import { AtlasHttpClient } from "../src/httpClient.js";

type RecordedRequest = {
  url: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
};

const createRecorder = () => {
  const calls: RecordedRequest[] = [];
  const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const record: RecordedRequest = { url, method: init?.method || "GET" };

    if (typeof init?.body === "string") {
      record.body = JSON.parse(init.body);
    } else if (init?.body instanceof FormData) {
      record.body = init.body;
    } else if (init?.body !== undefined) {
      record.body = init.body;
    }

    calls.push(record);
    const path = new URL(url).pathname;
    const responseBody = path === "/objects/upload" ? { object_id: "obj-123" } : { success: true };
    return new Response(JSON.stringify(responseBody));
  };

  const client = new AtlasHttpClient({
    baseUrl: "http://atlas.local",
    token: "test-token",
    fetchImpl,
  });

  return { calls, client };
};

describe("AtlasHttpClient constructor", () => {
  it("throws a clear error when fetch is unavailable", () => {
    vi.stubGlobal("fetch", undefined);
    try {
      expect(() => new AtlasHttpClient({ baseUrl: "http://atlas.local" })).toThrow(
        /fetch is not available/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AtlasHttpClient entities helpers", () => {
  it("lists and mutates entities with correct payloads", async () => {
    const { calls, client } = createRecorder();

    await client.listEntities();
    expect(calls.at(-1)?.url).toContain("/entities");
    expect(calls.at(-1)?.method).toBe("GET");

    await client.createEntity("test-entity", "asset", "Test Entity", "drone", { custom_foo: "bar" });
    expect(calls.at(-1)?.body).toEqual({
      entity_id: "test-entity",
      entity_type: "asset",
      alias: "Test Entity",
      subtype: "drone",
      components: { custom_foo: "bar" },
    });

    await client.updateEntity("test-entity", { custom_status: "ok" });
    expect(calls.at(-1)?.body).toEqual({ components: { custom_status: "ok" } });

    expect(() => client.updateEntity("test-entity")).toThrow(
      /requires a components payload/,
    );

    await client.updateEntityTelemetry("test-entity", {
      latitude: 40.7128,
      longitude: -74.0060,
    });
    expect(calls.at(-1)?.url).toContain("/entities/test-entity/telemetry");
    expect(calls.at(-1)?.body).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
  });

  it("supports check-in with telemetry and filters", async () => {
    const { calls, client } = createRecorder();

    await client.checkinEntity(
      "asset-1",
      { latitude: 1, longitude: 2 },
      { status_filter: "pending", limit: 5, since: "2025-01-01T00:00:00Z", fields: "minimal" },
    );

    const call = calls.at(-1)!;
    expect(call.url).toContain("/entities/asset-1/checkin");
    const url = new URL(call.url);
    expect(url.searchParams.get("status_filter")).toBe("pending");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("since")).toBe("2025-01-01T00:00:00Z");
    expect(url.searchParams.get("fields")).toBe("minimal");
    expect(call.body).toEqual({ latitude: 1, longitude: 2 });
  });

  it("validates unknown component keys", async () => {
    const { client } = createRecorder();
    
    expect(() => 
      client.createEntity("test-entity", "asset", "Test Entity", "drone", { unknown_key: "value" })
    ).toThrow(/Unknown component.*custom_/);
  });

  it("accepts typed entity components", async () => {
    const { calls, client } = createRecorder();

    await client.createEntity("test-entity", "asset", "Test Entity", "drone", {
      telemetry: {
        latitude: 40.7128,
        longitude: -74.0060,
        altitude_m: 120,
      },
      health: {
        battery_percent: 85,
      },
    });
    
    expect(calls.at(-1)?.body).toEqual({
      entity_id: "test-entity",
      entity_type: "asset",
      alias: "Test Entity",
      subtype: "drone",
      components: {
        telemetry: {
          latitude: 40.7128,
          longitude: -74.0060,
          altitude_m: 120,
        },
        health: {
          battery_percent: 85,
        },
      },
    });
  });

  it("preserves nested arrays in geometry components", async () => {
    const { calls, client } = createRecorder();

    await client.createEntity("geo-1", "geofeature", "Test Geo", "polygon", {
      geometry: {
        polygon: [
          [40.0, -74.0],
          [40.1, -74.1],
          [40.2, -74.2],
        ],
      },
    });

    expect(calls.at(-1)?.body).toEqual({
      entity_id: "geo-1",
      entity_type: "geofeature",
      alias: "Test Geo",
      subtype: "polygon",
      components: {
        geometry: {
          polygon: [
            [40.0, -74.0],
            [40.1, -74.1],
            [40.2, -74.2],
          ],
        },
      },
    });
  });
});

describe("AtlasHttpClient task helpers", () => {
  it("handles lifecycle operations and payloads", async () => {
    const { calls, client } = createRecorder();

    await client.createTask("task-1", { payload: "start" });
    expect(calls.at(-1)?.body).toEqual({
      task_id: "task-1",
      status: "pending",
      components: { payload: "start" },
    });

    await client.updateTask("task-1", { payload: "update" });
    expect(calls.at(-1)?.body).toEqual({ components: { payload: "update" } });

    expect(() => client.updateTask("task-1")).toThrow(
      /requires a components payload/,
    );

    await client.acknowledgeTask("task-1");
    expect(calls.at(-1)?.url).toContain("/tasks/task-1/acknowledge");
    expect(calls.at(-1)?.body).toEqual({});

    await client.completeTask("task-1");
    expect(calls.at(-1)?.url).toContain("/tasks/task-1/complete");
    expect(calls.at(-1)?.body).toEqual({});

    await client.failTask("task-1", "error occurred", { code: "ERR" });
    expect(calls.at(-1)?.body).toEqual({
      error: { message: "error occurred", details: { code: "ERR" } },
    });
  });

  it("handles status transitions and completion with result", async () => {
    const { calls, client } = createRecorder();

    await client.transitionTaskStatus("task-1", "in_progress", {
      progress: 25,
      message: "quarter",
    });
    expect(calls.at(-1)?.url).toContain("/tasks/task-1/status");
    expect(calls.at(-1)?.body).toEqual({
      status: "in_progress",
      progress: 25,
      message: "quarter",
    });

    await client.completeTask("task-2", { ok: true });
    expect(calls.at(-1)?.url).toContain("/tasks/task-2/complete");
    expect(calls.at(-1)?.body).toEqual({ result: { ok: true } });
  });
});

describe("AtlasHttpClient object helpers", () => {
  it("uploads files and manages references", async () => {
    const calls: RecordedRequest[] = [];
    let storedRefs: Array<{ entity_id?: string; task_id?: string }> = [];

    const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      const record: RecordedRequest = { url, method };
      if (init?.headers) {
        record.headers = Object.fromEntries(new Headers(init.headers).entries());
      }
      if (typeof init?.body === "string") {
        record.body = JSON.parse(init.body);
      } else if (init?.body instanceof FormData) {
        record.body = init.body;
      }
      calls.push(record);

      const path = new URL(url).pathname;
      if (path === "/objects/upload") {
        return new Response(JSON.stringify({ object_id: "obj-123" }), {
          headers: { etag: 'W/"upload-v1"' },
        });
      }
      if (path === "/objects/obj-123" && method === "GET") {
        return new Response(
          JSON.stringify({ object_id: "obj-123", referenced_by: storedRefs }),
        );
      }
      if (path === "/objects/obj-123" && method === "PATCH") {
        const body = record.body as { referenced_by?: typeof storedRefs; usage_hints?: string[] };
        if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "referenced_by")) {
          storedRefs = body.referenced_by ?? [];
        }
        return new Response(
          JSON.stringify({
            object_id: "obj-123",
            referenced_by: storedRefs,
            ...(body &&
            typeof body === "object" &&
            Object.prototype.hasOwnProperty.call(body, "usage_hints")
              ? { usage_hints: body.usage_hints }
              : {}),
          }),
        );
      }
      return new Response(JSON.stringify({ success: true }));
    };

    const client = new AtlasHttpClient({
      baseUrl: "http://atlas.local",
      token: "test-token",
      fetchImpl,
    });

    const uploadFile = new File(["abc"], "test.bin", { type: "application/octet-stream" });

    await client.createObject(uploadFile, "obj-123", "file-hint", [{ entity_id: "entity-1" }]);
    const uploadCall = calls.find((call) => call.url.endsWith("/objects/upload"));
    expect(uploadCall).toBeDefined();
    expect(uploadCall?.method).toBe("POST");
    const formData = uploadCall?.body;
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("object_id")).toBe("obj-123");
    expect((formData as FormData).get("usage_hint")).toBe("file-hint");

    const patchAfterUpload = calls.filter(
      (c) => c.method === "PATCH" && c.url.includes("/objects/obj-123"),
    );
    expect(patchAfterUpload.length).toBeGreaterThanOrEqual(1);
    expect(patchAfterUpload[0].body).toEqual({
      referenced_by: [{ entity_id: "entity-1" }],
    });

    await client.updateObject("obj-123", ["hint-1"], [{ task_id: "task-2" }]);
    expect(calls.at(-1)?.body).toEqual({
      usage_hints: ["hint-1"],
      referenced_by: [{ task_id: "task-2" }],
    });

    await client.addObjectReference("obj-123", "entity-2");
    expect(calls.at(-1)?.body).toEqual({
      referenced_by: [{ task_id: "task-2" }, { entity_id: "entity-2" }],
    });

    await expect(client.updateObject("obj-123")).rejects.toThrow(
      /requires usageHints or referencedBy/,
    );

    await client.removeObjectReference("obj-123", undefined, "task-2");
    expect(calls.at(-1)?.body).toEqual({
      referenced_by: [{ entity_id: "entity-2" }],
    });
  });

  it("seeds the object ETag cache from upload responses", async () => {
    type HeaderCall = { url: string; method: string; ifMatch: string | null };
    const calls: HeaderCall[] = [];
    const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      const headers = new Headers(init?.headers);
      calls.push({ url, method, ifMatch: headers.get("If-Match") });
      const path = new URL(url).pathname;
      if (path === "/objects/upload") {
        return new Response(JSON.stringify({ object_id: "obj-upload-etag" }), {
          headers: { etag: 'W/"upload-v1"' },
        });
      }
      if (path === "/objects/obj-upload-etag" && method === "PATCH") {
        return new Response(JSON.stringify({ object_id: "obj-upload-etag" }));
      }
      return new Response(JSON.stringify({ success: true }));
    };
    const client = new AtlasHttpClient({ baseUrl: "http://atlas.local", fetchImpl });
    const uploadFile = new File(["abc"], "seed.bin", { type: "application/octet-stream" });
    await client.createObject(uploadFile, "obj-upload-etag");
    await client.updateObject("obj-upload-etag", ["hint-1"]);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.ifMatch).toBe('W/"upload-v1"');
  });

  it("sends If-Match on PATCH using the ETag from GET /objects/{id}", async () => {
    type HeaderCall = { url: string; method: string; ifMatch: string | null };
    const calls: HeaderCall[] = [];
    const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      const headers = new Headers(init?.headers);
      calls.push({ url, method, ifMatch: headers.get("If-Match") });
      const path = new URL(url).pathname;
      if (path === "/objects/obj-etag" && method === "GET") {
        return new Response(JSON.stringify({ object_id: "obj-etag", referenced_by: [] }), {
          headers: { etag: 'W/"snap"' },
        });
      }
      if (path === "/objects/obj-etag" && method === "PATCH") {
        return new Response(
          JSON.stringify({
            object_id: "obj-etag",
            referenced_by: [{ entity_id: "e1" }],
          }),
          { headers: { etag: 'W/"next"' } },
        );
      }
      return new Response(JSON.stringify({ success: true }));
    };
    const client = new AtlasHttpClient({ baseUrl: "http://atlas.local", fetchImpl });
    await client.getObject("obj-etag");
    await client.updateObject("obj-etag", undefined, [{ entity_id: "e1" }]);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.ifMatch).toBe('W/"snap"');
  });

  it("retries addObjectReference once after HTTP 412 from PATCH", async () => {
    let patchCount = 0;
    let getCount = 0;
    const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      const path = new URL(url).pathname;
      if (path === "/objects/obj-race" && method === "GET") {
        getCount += 1;
        const etag = getCount === 1 ? 'W/"a"' : 'W/"b"';
        return new Response(JSON.stringify({ object_id: "obj-race", referenced_by: [] }), {
          headers: { etag },
        });
      }
      if (path === "/objects/obj-race" && method === "PATCH") {
        patchCount += 1;
        if (patchCount === 1) {
          return new Response("precondition failed", { status: 412 });
        }
        return new Response(
          JSON.stringify({
            object_id: "obj-race",
            referenced_by: [{ entity_id: "e1" }],
          }),
          { headers: { etag: 'W/"c"' } },
        );
      }
      return new Response(JSON.stringify({}));
    };
    const client = new AtlasHttpClient({ baseUrl: "http://atlas.local", fetchImpl });
    await client.addObjectReference("obj-race", "e1");
    expect(patchCount).toBe(2);
    expect(getCount).toBe(2);
  });

  it("sends If-Match on removeObjectReference after GET", async () => {
    type HeaderCall = { url: string; method: string; ifMatch: string | null; body?: unknown };
    const calls: HeaderCall[] = [];
    const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      const headers = new Headers(init?.headers);
      const call: HeaderCall = { url, method, ifMatch: headers.get("If-Match") };
      if (typeof init?.body === "string") {
        call.body = JSON.parse(init.body);
      }
      calls.push(call);
      const path = new URL(url).pathname;
      if (path === "/objects/obj-remove" && method === "GET") {
        return new Response(
          JSON.stringify({
            object_id: "obj-remove",
            referenced_by: [{ entity_id: "e1", task_id: "t1" }],
          }),
          { headers: { etag: 'W/"rm-v1"' } },
        );
      }
      if (path === "/objects/obj-remove" && method === "PATCH") {
        return new Response(JSON.stringify({ object_id: "obj-remove", referenced_by: [] }));
      }
      return new Response(JSON.stringify({}));
    };
    const client = new AtlasHttpClient({ baseUrl: "http://atlas.local", fetchImpl });
    await client.removeObjectReference("obj-remove", "e1", "t1");
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.ifMatch).toBe('W/"rm-v1"');
    expect(patch?.body).toEqual({ referenced_by: [] });
  });

  it("downloads objects and returns metadata", async () => {
    const calls: RecordedRequest[] = [];
    const fetchImpl = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, method: init?.method || "GET" });
      if (url.endsWith("/objects/obj-9/download")) {
        const data = new Uint8Array([1, 2, 3]);
        return new Response(data, {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(data.byteLength),
          },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const client = new AtlasHttpClient({
      baseUrl: "http://atlas.local",
      token: "tok",
      fetchImpl,
    });

    const result = await client.downloadObject("obj-9");
    expect(calls.at(-1)?.url).toContain("/objects/obj-9/download");
    expect(result.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.contentType).toBe("application/octet-stream");
    expect(result.contentLength).toBe(3);
  });
});

describe("AtlasHttpClient query helpers", () => {
  it("builds query URLs correctly", async () => {
    const { calls, client } = createRecorder();

    await client.getChangedSince("2023-01-01T00:00:00Z", 5);
    expect(calls.at(-1)?.url).toContain("/queries/changed-since");

    await client.getFullDataset({
      entityLimit: 2,
      taskLimit: 2,
      objectLimit: 2,
    });
    expect(calls.at(-1)?.url).toContain("/queries/full");
  });

  it("injects legacy deleted stream id aliases on getChangedSince", async () => {
    const fetchImpl = async (input: RequestInfo): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/queries/changed-since")) {
        return new Response(
          JSON.stringify({
            timestamp: "2024-01-01T00:00:00Z",
            deleted_entities: [{ id: "ent-1", type: "entity" }],
            deleted_tasks: [{ id: "task-1", type: "task" }],
            deleted_objects: [{ id: "obj-1", type: "object" }],
          }),
        );
      }
      return new Response(JSON.stringify({}));
    };
    const client = new AtlasHttpClient({ baseUrl: "http://atlas.local", fetchImpl });
    const res = await client.getChangedSince("2024-01-01T00:00:00Z");
    expect(res.deleted_entities?.[0]).toMatchObject({ id: "ent-1", entity_id: "ent-1" });
    expect(res.deleted_tasks?.[0]).toMatchObject({ id: "task-1", task_id: "task-1" });
    expect(res.deleted_objects?.[0]).toMatchObject({ id: "obj-1", object_id: "obj-1" });
  });
});

describe("AtlasHttpClient getTasksByEntity compatibility", () => {
  it("warns when a deprecated status string is passed as the 2nd argument", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const urls: string[] = [];
    const fetchImpl = async (input: RequestInfo): Promise<Response> => {
      urls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify([]));
    };
    const client = new AtlasHttpClient({ baseUrl: "http://atlas.local", fetchImpl });
    await client.getTasksByEntity("entity-1", "pending", 10, 2);
    expect(warn).toHaveBeenCalled();
    expect(urls[0]).toContain("limit=10");
    expect(urls[0]).toContain("offset=2");
    warn.mockRestore();
  });
});
