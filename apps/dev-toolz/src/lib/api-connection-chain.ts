import type { ApiExchange } from "./api-traffic";

export type ConnectionChainStep = {
  label: string;
  direction: "local" | "outbound" | "inbound" | "bidirectional";
  detail: string;
};

export type InferredConnectionChain = {
  protocol: string;
  steps: ConnectionChainStep[];
  disclaimer: string;
};

export type ConnectionChainFilter = "" | "tcp-handshake" | "quic-handshake" | "reused";

export function matchesConnectionChainFilter(
  exchange: ApiExchange,
  filter: ConnectionChainFilter
): boolean {
  if (!filter) return true;
  if (filter === "reused") return exchange.network?.connectionSetup !== "observed";
  if (exchange.network?.connectionSetup !== "observed") return false;
  const http3 = isHttp3(exchange.network.protocol);
  return filter === "quic-handshake" ? http3 : !http3;
}

export function buildInferredConnectionChain(exchange: ApiExchange): InferredConnectionChain {
  const network = exchange.network;
  const protocol = network?.protocol || "Protocol unavailable";
  const steps: ConnectionChainStep[] = [];

  if (network?.dnsMs !== undefined) {
    steps.push({ label: "DNS lookup", direction: "local", detail: formatTiming(network.dnsMs) });
  }

  if (network?.connectionSetup === "observed") {
    if (isHttp3(protocol)) {
      steps.push(
        { label: "QUIC Initial", direction: "outbound", detail: "Inferred" },
        {
          label: "QUIC + TLS handshake",
          direction: "bidirectional",
          detail: formatTiming(network.connectMs),
        }
      );
    } else {
      steps.push(
        { label: "SYN", direction: "outbound", detail: "Inferred" },
        { label: "SYN-ACK", direction: "inbound", detail: "Inferred" },
        {
          label: "ACK",
          direction: "outbound",
          detail: network.connectMs === undefined
            ? "Inferred"
            : `${formatTiming(network.connectMs)} total connection setup`,
        }
      );
      if (network.tlsMs !== undefined) {
        steps.push({
          label: "TLS negotiation",
          direction: "bidirectional",
          detail: `${formatTiming(network.tlsMs)} · included in setup`,
        });
      }
    }
  } else {
    steps.push({
      label: "Existing connection",
      direction: "bidirectional",
      detail: "Reused or setup timing unavailable",
    });
  }

  steps.push(
    {
      label: `${exchange.request.method} request`,
      direction: "outbound",
      detail: formatTiming(network?.sendMs),
    },
    {
      label: `${exchange.response.status} response`,
      direction: "inbound",
      detail: formatResponseTiming(network?.waitMs, network?.receiveMs),
    }
  );

  return {
    protocol,
    steps,
    disclaimer: "Inferred from HAR timings. Chrome does not expose TCP/QUIC packets or connection close frames.",
  };
}

function isHttp3(protocol: string): boolean {
  const normalized = protocol.toLowerCase();
  return normalized.includes("http/3") || normalized === "h3" || normalized.includes("quic");
}

function formatTiming(value: number | undefined): string {
  return value === undefined ? "Timing unavailable" : `${Math.round(value * 10) / 10} ms`;
}

function formatResponseTiming(waitMs: number | undefined, receiveMs: number | undefined): string {
  if (waitMs === undefined && receiveMs === undefined) return "Timing unavailable";
  const parts: string[] = [];
  if (waitMs !== undefined) parts.push(`${formatTiming(waitMs)} wait`);
  if (receiveMs !== undefined) parts.push(`${formatTiming(receiveMs)} receive`);
  return parts.join(" · ");
}
