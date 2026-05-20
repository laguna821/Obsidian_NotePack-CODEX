import type { AIOAuthState } from "../types";

export interface OpenAIPlanChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIPlanRequestOptions {
  model: string;
  messages: OpenAIPlanChatMessage[];
  temperature?: number;
  response_format?: Record<string, unknown>;
  reasoning_effort?: "low" | "medium" | "high";
  reasoning_summary?: string;
  stream?: boolean;
}

export interface OpenAIPlanHeaderResult {
  headers: Record<string, string>;
  oauth: AIOAuthState;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function extractOpenAIAccountId(tokenResponse: OAuthTokenResponse): string | undefined {
  const payload = tokenResponse.id_token
    ? decodeJwtPayload(tokenResponse.id_token)
    : tokenResponse.access_token
      ? decodeJwtPayload(tokenResponse.access_token)
      : undefined;

  const authPayload = asRecord(payload?.["https://api.openai.com/auth"]);
  const organization = Array.isArray(payload?.organizations)
    ? asRecord(payload?.organizations[0])
    : undefined;

  return (
    (typeof payload?.chatgpt_account_id === "string" ? payload.chatgpt_account_id : undefined) ||
    (typeof authPayload?.chatgpt_account_id === "string" ? authPayload.chatgpt_account_id : undefined) ||
    (typeof organization?.id === "string" ? organization.id : undefined)
  );
}

export function buildOpenAIPlanCodexRequestBody(options: OpenAIPlanRequestOptions): Record<string, unknown> {
  const instructions = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((message) => message.length > 0)
    .join("\n\n");

  const input = options.messages
    .filter((message) => message.role !== "system")
    .map((message) =>
      message.role === "assistant"
        ? {
            role: "assistant",
            content: message.content,
          }
        : {
            role: message.role,
            content: [
              {
                type: "input_text",
                text: message.content,
              },
            ],
          }
    );

  const body: Record<string, unknown> = {
    model: options.model,
    input: input.length > 0
      ? input
      : [
          {
            role: "user",
            content: [{ type: "input_text", text: "" }],
          },
        ],
    store: false,
    stream: options.stream ?? true,
  };

  if (instructions) body.instructions = instructions;

  if (options.reasoning_effort || options.reasoning_summary) {
    body.reasoning = {
      ...(options.reasoning_effort ? { effort: options.reasoning_effort } : {}),
      ...(options.reasoning_summary ? { summary: options.reasoning_summary } : {}),
    };
  }

  return body;
}

export function extractOpenAIPlanErrorMessage(text: string): string {
  const parsed = asRecord(safeJsonParse(text));
  const errorRecord = asRecord(parsed?.error);

  if (typeof errorRecord?.message === "string" && errorRecord.message.trim()) {
    return errorRecord.message.trim();
  }

  if (typeof parsed?.message === "string" && parsed.message.trim()) {
    return parsed.message.trim();
  }

  const compact = text.replace(/\s+/g, " ").trim();
  return compact || "No response body";
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseSseJsonEvents(payload: string): Array<Record<string, unknown>> {
  const blocks = payload.split(/\r?\n\r?\n/);
  const events: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    if (lines.length === 0) continue;

    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (!data || data === "[DONE]") continue;

    try {
      const parsed = JSON.parse(data);
      const record = asRecord(parsed);
      if (record) events.push(record);
    } catch {
      // Ignore non-JSON SSE frames.
    }
  }

  return events;
}

function extractResponseOutputText(response: Record<string, unknown> | undefined): string {
  if (!response) return "";

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .filter((item) => asRecord(item)?.type === "message")
    .flatMap((item) => {
      const content = Array.isArray(asRecord(item)?.content) ? (asRecord(item)?.content as unknown[]) : [];
      return content
        .map((part) => asRecord(part))
        .filter((part): part is Record<string, unknown> => Boolean(part))
        .filter((part) => part.type === "output_text")
        .map((part) => (typeof part.text === "string" ? part.text : ""));
    })
    .join("")
    .trim();
}

export function parseOpenAIPlanCodexSse(payload: string): { content: string; annotations?: unknown[] } {
  let deltaText = "";
  let finalResponse: Record<string, unknown> | undefined;
  let lastErrorMessage = "";

  for (const event of parseSseJsonEvents(payload)) {
    switch (event.type) {
      case "response.output_text.delta":
        if (typeof event.delta === "string") {
          deltaText += event.delta;
        }
        break;
      case "response.completed":
      case "response.incomplete":
        finalResponse = asRecord(event.response) ?? finalResponse;
        break;
      case "error":
        lastErrorMessage =
          typeof asRecord(event.error)?.message === "string"
            ? String(asRecord(event.error)?.message)
            : typeof event.message === "string"
              ? event.message
              : "OpenAI Plan request failed.";
        break;
    }
  }

  const content = extractResponseOutputText(finalResponse) || deltaText.trim();
  if (!content) {
    throw new Error(lastErrorMessage || "No content in OpenAI Plan response");
  }

  return {
    content,
    annotations: undefined,
  };
}

function hasUsableAccessToken(oauth: AIOAuthState, now: number): boolean {
  if (!oauth.accessToken) return false;
  if (oauth.expiresAt === undefined) return true;
  return oauth.expiresAt > now;
}

export async function resolveOpenAIPlanOAuth(options: {
  oauth?: AIOAuthState;
  refresh?: (refreshToken: string) => Promise<OAuthTokenResponse>;
  now?: number;
}): Promise<AIOAuthState> {
  const now = options.now ?? Date.now();
  const oauth = options.oauth;

  if (!oauth || (!oauth.accessToken && !oauth.refreshToken)) {
    throw new Error("Connect OpenAI Plan in settings first.");
  }

  if (hasUsableAccessToken(oauth, now)) {
    return oauth;
  }

  if (!oauth.refreshToken) {
    throw new Error("Reconnect OpenAI Plan in settings.");
  }

  if (!options.refresh) {
    throw new Error("OpenAI Plan token refresh is unavailable.");
  }

  const refreshed = await options.refresh(oauth.refreshToken);
  return {
    ...oauth,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? oauth.refreshToken,
    expiresAt: now + (refreshed.expires_in ?? 3600) * 1000,
    accountId: extractOpenAIAccountId(refreshed) ?? oauth.accountId,
  };
}

export async function createOpenAIPlanHeaders(options: {
  oauth?: AIOAuthState;
  refresh?: (refreshToken: string) => Promise<OAuthTokenResponse>;
  now?: number;
}): Promise<OpenAIPlanHeaderResult> {
  const oauth = await resolveOpenAIPlanOAuth(options);
  if (!oauth.accessToken) {
    throw new Error("Connect OpenAI Plan in settings first.");
  }

  return {
    oauth,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${oauth.accessToken}`,
      ...(oauth.accountId ? { "ChatGPT-Account-Id": oauth.accountId } : {}),
    },
  };
}
