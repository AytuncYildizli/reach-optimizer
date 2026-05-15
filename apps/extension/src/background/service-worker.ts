const DEFAULT_API_BASE = "https://reach-optimizer.vercel.app";

type MessageType =
  | "GET_AUTH_TOKEN" | "SET_AUTH_TOKEN"
  | "API_REQUEST" | "UPDATE_BADGE"
  | "GET_SETTINGS" | "SET_SETTINGS"
  | "DIRECT_ANTHROPIC";

/** Read the user-configured API URL, falling back to default */
async function getApiBase(): Promise<string> {
  const result = await chrome.storage.local.get("apiBase");
  return (result.apiBase as string) || DEFAULT_API_BASE;
}

/** Read the user's own Anthropic API key (true BYOK) */
async function getAnthropicKey(): Promise<string | null> {
  const result = await chrome.storage.local.get("anthropicKey");
  return (result.anthropicKey as string) || null;
}

interface Message {
  type: MessageType;
  token?: string;
  endpoint?: string;
  method?: string;
  body?: unknown;
  // DIRECT_ANTHROPIC fields
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
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
        chrome.storage.local.get(["apiBase", "anthropicKey"], (result) => {
          sendResponse({
            apiBase: result.apiBase || DEFAULT_API_BASE,
            anthropicKey: result.anthropicKey || "",
          });
        });
        return true;

      case "SET_SETTINGS": {
        const settings = message as { type: string; apiBase?: string; anthropicKey?: string };
        const toStore: Record<string, string> = {};
        if (settings.apiBase !== undefined) toStore.apiBase = settings.apiBase || "";
        if (settings.anthropicKey !== undefined) toStore.anthropicKey = settings.anthropicKey || "";
        chrome.storage.local.set(toStore, () => {
          sendResponse({ success: true });
        });
        return true;
      }

      case "DIRECT_ANTHROPIC":
        handleDirectAnthropic(message).then(sendResponse);
        return true;

      default:
        sendResponse({ error: "Unknown message type" });
    }
  }
);

/**
 * Call Anthropic API directly using the user's own API key (true BYOK).
 * No server needed — runs entirely in the extension.
 */
async function handleDirectAnthropic(message: Message): Promise<unknown> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return { ok: false, error: "No Anthropic API key configured. Add your key in Settings." };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: message.model || "claude-haiku-4-5-20251001",
        max_tokens: message.maxTokens || 1024,
        temperature: message.temperature ?? 0.3,
        system: message.systemPrompt || "",
        messages: [{ role: "user", content: message.userPrompt || "" }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { ok: false, error: `Anthropic API ${response.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    return { ok: true, data: { text } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

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
