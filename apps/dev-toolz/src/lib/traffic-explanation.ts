import { sharesSite, type ApiExchange } from "./api-traffic";

export type TrafficExplanation = {
  summary: string;
  tone: "success" | "cache" | "warning" | "error";
  external: boolean | null;
  destination: string;
};

export function explainTraffic(exchange: ApiExchange): TrafficExplanation {
  const destinationHost = getHostname(exchange.request.url);
  const destination = destinationHost ?? "unknown destination";
  const pageHost = getHostname(exchange.pageUrl ?? "");
  const external = pageHost && destinationHost ? !sharesSite(pageHost, destinationHost) : null;
  const action = explainMethod(exchange.request.method);
  const outcome = explainStatus(exchange.response.status);
  const timing =
    exchange.durationMs >= 2000
      ? ` It was slow at ${Math.round(exchange.durationMs)} ms.`
      : ` It completed in ${Math.round(exchange.durationMs)} ms.`;
  const destinationNote =
    external === true
      ? ` This left the current site's domain and contacted ${destination}.`
      : external === false
        ? ` This stayed within the current site's domain.`
        : ` Domain attribution was unavailable.`;

  return {
    summary: `${action} ${outcome.text}${timing}${destinationNote}`,
    tone: outcome.tone,
    external,
    destination,
  };
}

function explainMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "The page requested data.";
    case "POST":
      return "The page sent data for processing or creation.";
    case "PUT":
      return "The page sent a complete replacement.";
    case "PATCH":
      return "The page sent a partial update.";
    case "DELETE":
      return "The page requested deletion.";
    case "OPTIONS":
      return "The browser checked which cross-origin actions were allowed.";
    default:
      return `The page sent a ${method.toUpperCase()} request.`;
  }
}

function explainStatus(status: number): {
  text: string;
  tone: TrafficExplanation["tone"];
} {
  if (status === 0) return { text: "No HTTP response arrived.", tone: "error" };
  if (status === 204) return { text: "It succeeded without returning a body.", tone: "success" };
  if (status >= 200 && status < 300) return { text: "It succeeded and returned a usable response.", tone: "success" };
  if (status === 304) return { text: "The browser's cached copy was still current; nothing failed.", tone: "cache" };
  if (status >= 300 && status < 400) return { text: "The server redirected the request elsewhere.", tone: "warning" };
  if (status === 400) return { text: "The server rejected invalid request data.", tone: "error" };
  if (status === 401) return { text: "Authentication was missing or expired.", tone: "error" };
  if (status === 403) return { text: "The server understood but refused the request.", tone: "error" };
  if (status === 404) return { text: "The requested API endpoint was not found.", tone: "error" };
  if (status === 409) return { text: "The request conflicted with current server state.", tone: "error" };
  if (status === 422) return { text: "The server could not validate the submitted data.", tone: "error" };
  if (status === 429) return { text: "The site was rate-limited for sending too many requests.", tone: "warning" };
  if (status >= 400 && status < 500) return { text: "The server rejected the request.", tone: "error" };
  if (status >= 500) return { text: "The remote server failed while handling the request.", tone: "error" };
  return { text: `It returned HTTP ${status}.`, tone: "warning" };
}

function getHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}