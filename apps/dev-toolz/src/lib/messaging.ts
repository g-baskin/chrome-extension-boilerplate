import type {
  CaptureRequest,
  CaptureResponse,
  CapturedPageEntry,
  CapturedPageSummary,
} from "@/lib/capture";

export interface MessageTypes {
  GET_TAB_INFO: {
    request: void;
    response: { url: string; title: string };
  };

  CAPTURE_SKILL_PAGE: {
    request: CaptureRequest;
    response: CaptureResponse;
  };

  SAVE_CAPTURE: {
    request: { entry: CapturedPageEntry };
    response: { success: boolean };
  };

  GET_CAPTURE_HISTORY: {
    request: void;
    response: { entries: CapturedPageSummary[] };
  };

  GET_CAPTURE_ENTRY: {
    request: { id: string };
    response: { entry?: CapturedPageEntry };
  };

  DELETE_CAPTURE: {
    request: { id: string };
    response: { success: boolean };
  };

  TOGGLE_EXTENSION: {
    request: { enabled: boolean };
    response: { success: boolean };
  };

  GET_SETTINGS: {
    request: void;
    response: {
      enabled: boolean;
      theme: "light" | "dark" | "system";
      notifications: boolean;
      siteAccessMode: "all" | "deny" | "allow";
      siteAccessSites: string[];
    };
  };

  UPDATE_SETTINGS: {
    request: Partial<{
      enabled: boolean;
      theme: "light" | "dark" | "system";
      notifications: boolean;
      siteAccessMode: "all" | "deny" | "allow";
      siteAccessSites: string[];
    }>;
    response: { success: boolean };
  };

  CONTENT_ACTION: {
    request: { action: string; data?: unknown };
    response: { success: boolean; result?: unknown };
  };

  DEVTOOLS_CLOSED: {
    request: { tabId: number };
    response: { success: boolean };
  };

  GET_API_CAPTURE_STATUS: {
    request: { tabId: number };
    response: {
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

export async function sendToTab<T extends MessageType>(
  tabId: number,
  type: T,
  payload: MessageTypes[T]["request"]
): Promise<MessageResponse<T>> {
  try {
    const response = await chrome.tabs.sendMessage<Message<T>, MessageResponse<T>>(tabId, {
      type,
      payload,
    });

    if (response === undefined) {
      return {
        success: false,
        error: "No response from content script (may not be loaded)",
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

export async function sendToActiveTab<T extends MessageType>(
  type: T,
  payload: MessageTypes[T]["request"]
): Promise<MessageResponse<T>> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { success: false, error: "No active tab found" };
  }
  return sendToTab(tab.id, type, payload);
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
