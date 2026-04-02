const DEFAULT_API_BASE = "https://reach-optimizer.vercel.app";

type MessageType = "GET_AUTH_TOKEN" | "SET_AUTH_TOKEN" | "API_REQUEST" | "UPDATE_BADGE" | "GET_SETTINGS" | "SET_SETTINGS";

/** Read the user-configured API URL, falling back to default */
async function getApiBase(): Promise<string> {
  const result = await chrome.storage.local.get("apiBase");
  return (result.apiBase as string) || DEFAULT_API_BASE;
}

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

      case "GET_SETTINGS":
        chrome.storage.local.get(["apiBase"], (result) => {
          sendResponse({ apiBase: result.apiBase || DEFAULT_API_BASE });
        });
        return true;

      case "SET_SETTINGS": {
        const apiBase = (message as { type: string; apiBase: string }).apiBase;
        chrome.storage.local.set({ apiBase: apiBase || "" }, () => {
          sendResponse({ success: true });
        });
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
    const apiBase = await getApiBase();
    const result = await chrome.storage.local.get("authToken");
    const token = result.authToken as string | undefined;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${apiBase}${endpoint}`, {
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
