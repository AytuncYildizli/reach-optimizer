const API_BASE = "https://api.reachos.dev";

type MessageType = "GET_AUTH_TOKEN" | "SET_AUTH_TOKEN" | "API_REQUEST" | "UPDATE_BADGE";

interface Message {
  type: MessageType;
  token?: string;
  endpoint?: string;
  method?: string;
  body?: unknown;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ReachOS] Extension installed");
});

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    switch (message.type) {
      case "GET_AUTH_TOKEN":
        chrome.storage.local.get("authToken", (result) => {
          sendResponse({ token: result.authToken ?? null });
        });
        return true; // async response

      case "SET_AUTH_TOKEN":
        chrome.storage.local.set({ authToken: message.token }, () => {
          sendResponse({ success: true });
        });
        return true;

      case "API_REQUEST":
        handleApiRequest(
          message.endpoint ?? "/",
          message.method ?? "GET",
          message.body
        ).then(sendResponse);
        return true;

      case "UPDATE_BADGE": {
        const score = (message as { type: string; score: number }).score;
        const color =
          score >= 86
            ? "#1d9bf0"
            : score >= 71
              ? "#00ba7c"
              : score >= 51
                ? "#00ba7c"
                : score >= 31
                  ? "#ffd400"
                  : "#f4212e";

        chrome.action.setBadgeText({ text: String(score) });
        chrome.action.setBadgeBackgroundColor({ color });
        sendResponse({ success: true });
        return true;
      }

      default:
        sendResponse({ error: "Unknown message type" });
    }
  }
);

async function handleApiRequest(
  endpoint: string,
  method: string,
  body?: unknown
): Promise<unknown> {
  try {
    const result = await chrome.storage.local.get("authToken");
    const token = result.authToken as string | undefined;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
