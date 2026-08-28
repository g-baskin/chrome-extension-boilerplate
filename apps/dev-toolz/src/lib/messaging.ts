import type { RaceFlow } from "./race-flow";
import type { RaceRunResult } from "../background/race-runner";

export interface MessageTypes {
  TOGGLE_EXTENSION: {
    request: { enabled: boolean };
    response: { success: boolean };
  };

  GET_SETTINGS: {
    request: void;
    response: {
      enabled: boolean;
      siteAccessMode: "all" | "deny" | "allow";
      siteAccessSites: string[];
    };
  };

  UPDATE_SETTINGS: {
    request: Partial<{
      enabled: boolean;
      siteAccessMode: "all" | "deny" | "allow";
      siteAccessSites: string[];
    }>;
    response: { success: boolean };
  };

  DEVTOOLS_CLOSED: {
    request: { tabId: number };
    response: { success: boolean };
  };

  GET_API_CAPTURE_STATUS: {
    request: { tabId: number };
    response: {
      enabled: boolean;
      hostname: string;
      paused: boolean;
      pausedUntil: number | null;
      allowed: boolean;
      siteAccessMode: "all" | "deny" | "allow";
    };
  };

  SET_API_CAPTURE_PAUSE: {
    request: { tabId: number; durationMs: 0 | 300000 | 900000 | 3600000 | null };
    response: { hostname: string; paused: boolean; pausedUntil: number | null };
  };

  RUN_RACE_FLOW: {
    request: {
      tabId: number;
      runId: string;
      expectedPageUrl: string;
      flow: RaceFlow;
      concurrency: number;
    };
    response: RaceRunResult;
  };

  CANCEL_RACE_FLOW: {
    request: { tabId: number; runId: string };
    response: { cancelled: boolean };
  };
}

export type MessageType = keyof MessageTypes;

export interface Message<T extends MessageType = MessageType> {
  type: T;
  payload: MessageTypes[T]["request"];
}

export interface MessageResponse<T extends MessageType = MessageType> {
  success: boolean;
  data?: MessageTypes[T]["response"];
  error?: string;
}

export async function sendToBackground<T extends MessageType>(
  type: T,
  payload: MessageTypes[T]["request"]
): Promise<MessageResponse<T>> {
  try {
    const response = await chrome.runtime.sendMessage<Message<T>, MessageResponse<T>>({
      type,
      payload,
    });

    if (response === undefined) {
      return {
        success: false,
        error: "No response from background script",
      };
    }

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


export function createMessageHandler(
  handlers: Partial<{
    [K in MessageType]: (
      payload: MessageTypes[K]["request"],
      sender: chrome.runtime.MessageSender
    ) => Promise<MessageTypes[K]["response"]> | MessageTypes[K]["response"];
  }>
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message as Message;
    const handler = handlers[type] as
      | ((payload: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown> | unknown)
      | undefined;

    if (handler) {
      Promise.resolve(handler(payload, sender))
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => {
          console.error(`[Messaging] Handler error for ${type}:`, error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    }

    return false;
  });
}
