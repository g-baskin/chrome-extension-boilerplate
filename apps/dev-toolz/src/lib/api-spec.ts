import type { ApiExchange } from "./api-traffic";

export const MAX_OPENAPI_IMPORT_BYTES = 5 * 1024 * 1024;
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
export type DriftState = "observed" | "matched" | "shadow" | "unseen";

export type ObservedRoute = {
  key: string;
  hostname: string;
  origin: string;
  path: string;
  method: HttpMethod;
  requestCount: number;
  statuses: number[];
  queryFields: string[];
  bodyFields: Record<string, JsonSchema>;
  contentTypes: string[];
};

type JsonSchema = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

export type OpenApiDocument = {
  openapi: string;
  info?: Record<string, unknown>;
  paths: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

export type AttackMapEntry = {
  key: string;
  path: string;
  method: string;
  state: DriftState;
  observed?: ObservedRoute;
};

export function normalizeObservedRoute(rawUrl: string): { hostname: string; origin: string; path: string } {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname
      .split("/")
      .map((segment) => isIdentifier(segment) ? "{id}" : segment)
      .join("/") || "/";
    return { hostname: url.hostname.toLowerCase(), origin: url.origin, path };
  } catch {
    return { hostname: "", origin: "", path: rawUrl };
  }
}

function isIdentifier(segment: string): boolean {
  return /^\d+$/.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
    /^[0-9a-f]{16,}$/i.test(segment);
}

export function buildObservedRoutes(exchanges: ApiExchange[]): ObservedRoute[] {
  const routes = new Map<string, ObservedRoute & { statusSet: Set<number>; querySet: Set<string>; contentTypeSet: Set<string> }>();
  for (const exchange of exchanges) {
    const method = exchange.request.method.toLowerCase();
    if (!HTTP_METHODS.includes(method as HttpMethod)) continue;
    const target = normalizeObservedRoute(exchange.request.url);
    if (!target.path.startsWith("/")) continue;
    const key = `${target.hostname}\u0000${target.path}\u0000${method}`;
    let route = routes.get(key);
    if (!route) {
      route = {
        key,
        ...target,
        method: method as HttpMethod,
        requestCount: 0,
        statuses: [],
        queryFields: [],
        bodyFields: {},
        contentTypes: [],
        statusSet: new Set(),
        querySet: new Set(),
        contentTypeSet: new Set(),
      };
      routes.set(key, route);
    }
    route.requestCount += 1;
    route.statusSet.add(exchange.response.status);
    try {
      for (const name of new URL(exchange.request.url).searchParams.keys()) if (name) route.querySet.add(name);
    } catch { /* Malformed URLs are excluded above. */ }
    if (exchange.request.mimeType) route.contentTypeSet.add(exchange.request.mimeType.split(";", 1)[0] ?? exchange.request.mimeType);
    mergeBodySchema(route.bodyFields, exchange.request.body?.kind === "json" ? exchange.request.body.value : undefined);
  }
  return [...routes.values()].map(({ statusSet, querySet, contentTypeSet, ...route }) => ({
    ...route,
    statuses: [...statusSet].sort((a, b) => a - b),
    queryFields: [...querySet].sort(),
    contentTypes: [...contentTypeSet].sort(),
  }));
}

function mergeBodySchema(fields: Record<string, JsonSchema>, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
    const schema = inferSchema(child, 0);
    if (!fields[name]) fields[name] = schema;
    else if (fields[name]?.type !== schema.type) fields[name] = {};
  }
}

function inferSchema(value: unknown, depth: number): JsonSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) return { type: "array", ...(value[0] === undefined ? {} : { items: inferSchema(value[0], depth + 1) }) };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "object") {
    if (depth >= 1) return { type: "object" };
    return {
      type: "object",
      properties: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, inferSchema(child, depth + 1)])),
    };
  }
  return {};
}

export function generateOpenApi(exchanges: ApiExchange[]): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  for (const route of buildObservedRoutes(exchanges)) {
    const operations = paths[route.path] ??= {};
    const parameters: Array<Record<string, unknown>> = route.queryFields.map((name) => ({
      name, in: "query", required: false, schema: { type: "string" },
    }));
    for (const name of route.path.matchAll(/\{([^}]+)\}/g)) {
      parameters.push({ name: name[1], in: "path", required: true, schema: { type: "string" } });
    }
    const requestBody = route.contentTypes.length > 0 || Object.keys(route.bodyFields).length > 0
      ? {
          content: Object.fromEntries((route.contentTypes.length ? route.contentTypes : ["application/json"]).map((type) => [type, {
            schema: { type: "object", properties: route.bodyFields },
          }])),
        }
      : undefined;
    operations[route.method] = {
      parameters,
      ...(requestBody ? { requestBody } : {}),
      responses: Object.fromEntries(route.statuses.map((status) => [status === 0 ? "default" : String(status), { description: status === 0 ? "No response observed" : `Observed ${status}` }])),
      "x-dev-toolz-observed": {
        draft: true,
        requestCount: route.requestCount,
        hostnames: [route.hostname],
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Dev Toolz observed API draft", version: "0.0.0-observed" },
    paths,
  };
}

export function parseOpenApiBaseline(text: string): OpenApiDocument {
  if (new TextEncoder().encode(text).length > MAX_OPENAPI_IMPORT_BYTES) throw new Error("OpenAPI file must be 5 MiB or smaller.");
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error("OpenAPI file must contain valid JSON."); }
  if (!isRecord(value) || typeof value.openapi !== "string" || !/^3(?:\.\d+){1,2}(?:[-+].*)?$/.test(value.openapi)) {
    throw new Error("OpenAPI document must declare a 3.x version.");
  }
  if (!isRecord(value.paths)) throw new Error("OpenAPI document must contain a paths object.");
  return value as OpenApiDocument;
}

export function compareOpenApi(observed: ObservedRoute[], baseline: OpenApiDocument | null): AttackMapEntry[] {
  if (!baseline) return observed.map((route) => ({ key: route.key, path: route.path, method: route.method, state: "observed", observed: route }));
  const declared = new Map<string, { path: string; method: string }>();
  for (const [rawPath, item] of Object.entries(baseline.paths)) {
    if (!isRecord(item)) continue;
    const path = normalizeBaselinePath(rawPath);
    for (const method of HTTP_METHODS) if (isRecord(item[method])) declared.set(`${path}\u0000${method}`, { path, method });
  }
  const entries: AttackMapEntry[] = observed.map((route) => {
    const declaredKey = `${route.path}\u0000${route.method}`;
    const matched = declared.delete(declaredKey);
    return { key: route.key, path: route.path, method: route.method, state: matched ? "matched" : "shadow", observed: route };
  });
  for (const [key, route] of declared) entries.push({ key, ...route, state: "unseen" });
  return entries;
}

function normalizeBaselinePath(path: string): string {
  if (!path.startsWith("/")) return path;
  return path.replace(/\/+/g, "/") || "/";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
