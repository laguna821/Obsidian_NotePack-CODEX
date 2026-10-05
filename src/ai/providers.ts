import { Platform, requestUrl, type RequestUrlParam } from "obsidian";
import type { AIConfig, AIOAuthState } from "../types";
import {
  buildAnthropicMessagesBody,
  claudeCliEffort,
  geminiThinkingConfig,
  normalizeMessageContent,
  rejectsSampling,
  splitMessagesForCli,
  type ChatCompletionOptions,
  type ChatMessage,
} from "./request-shapes";
import {
  buildOpenAIPlanCodexRequestBody,
  createOpenAIPlanHeaders,
  extractOpenAIPlanErrorMessage,
  parseOpenAIPlanCodexSse,
} from "./openai-plan";
import { refreshOpenAIPlanToken, type OAuthTokenResponse } from "./oauth";
import { getNativeRuntime } from "./native/runtime";
import { requestPublicTextStream } from "./native/http-stream";
import { executeProviderRequest } from "./rate-limiter";
import { explicitOutputSchema } from "./structured-output";

export { buildAIConfig, buildAIConfigForModel } from "./settings-registry";
export type { ChatCompletionOptions, ChatMessage } from "./request-shapes";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

// Response bodies as the providers document them; every field is optional
// because a proxy or an error page can return something else.
interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: unknown; annotations?: unknown[] } }>;
}

interface AnthropicMessageResponse {
  stop_reason?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface GeminiResponse {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
    citationMetadata?: { citationSources?: Array<{ uri?: string }> };
  }>;
}

function truncateErrorBody(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 400) || "No response body";
}

function throwProviderError(config: AIConfig, response: { status: number; text: string }): never {
  if (config.providerType === "openai-plan") {
    const message = extractOpenAIPlanErrorMessage(response.text);
    // The Codex backend can gate new models by client version.
    const hint = /newer version of codex/i.test(message)
      ? " This model is not available through NotePack's OpenAI Plan connection yet. Choose GPT-5.6 Sol (Plan) in settings."
      : "";
    throw new Error(`AI error (${config.providerType}) ${response.status}: ${message}${hint}`);
  }
  throw new Error(`AI error (${config.providerType}) ${response.status}: ${truncateErrorBody(response.text)}`);
}

function toJsonBody(options: ChatCompletionOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
  };

  if (options.temperature !== undefined && !rejectsSampling(options.model)) body.temperature = options.temperature;
  if (options.response_format) body.response_format = options.response_format;
  if (options.web_search_options) body.web_search_options = options.web_search_options;

  return body;
}

function getOpenAICompatibleUrl(config: AIConfig): string {
  const baseUrl = stripTrailingSlash(config.baseUrl);

  if (config.providerType === "azure-openai") {
    const deployment = String(config.provider.additionalSettings?.deployment || "").trim();
    const apiVersion = String(config.provider.additionalSettings?.apiVersion || "").trim();

    if (!deployment || !apiVersion) {
      throw new Error("Azure OpenAI requires both deployment and API version settings.");
    }

    return `${baseUrl}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  }

  return `${baseUrl}/chat/completions`;
}

function createOpenAICompatibleHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.providerType === "azure-openai") {
    if (config.apiKey) headers["api-key"] = config.apiKey;
    return headers;
  }

  const bearer = config.authToken || config.apiKey;
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  if (config.providerType === "openrouter") {
    headers["HTTP-Referer"] = "https://notepack-codex.obsidian.md";
    headers["X-Title"] = "NotePack CODEX";
  }

  const noStainless = config.provider.additionalSettings?.noStainless;
  if (!noStainless) {
    headers["X-Stainless-Helper-Method"] = "notepack-codex";
  }

  return headers;
}

const OPENAI_PLAN_CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";

/**
 * Where OpenAI Plan tokens live between requests. AIConfig carries a copy of
 * the provider made before the request was queued, so requests read the
 * latest saved tokens here and save refreshed ones back.
 */
export interface ProviderOAuthStore {
  /** The saved OAuth state, or undefined once the user disconnected. */
  read(providerId: string): AIOAuthState | undefined;
  /** Saves refreshed tokens unless the saved refresh token changed meanwhile. */
  write(providerId: string, oauth: AIOAuthState, previousRefreshToken: string | undefined): void;
}

let providerOAuthStore: ProviderOAuthStore | null = null;

export function setProviderOAuthStore(store: ProviderOAuthStore | null): void {
  providerOAuthStore = store;
}

// Refresh tokens rotate and OpenAI rejects a reused one, so every request that
// still holds an old refresh token gets the result of its single refresh.
const refreshesInFlight = new Map<string, Promise<OAuthTokenResponse>>();
const completedRefreshes = new Map<string, { result: OAuthTokenResponse; at: number }>();
const COMPLETED_REFRESH_TTL_MS = 15 * 60_000;

function refreshOpenAIPlanTokenOnce(refreshToken: string): Promise<OAuthTokenResponse> {
  const now = Date.now();
  for (const [token, entry] of completedRefreshes) {
    if (now - entry.at > COMPLETED_REFRESH_TTL_MS) completedRefreshes.delete(token);
  }
  const completed = completedRefreshes.get(refreshToken);
  if (completed) return Promise.resolve(completed.result);
  const existing = refreshesInFlight.get(refreshToken);
  if (existing) return existing;
  const refresh = refreshOpenAIPlanToken({ refreshToken })
    .then((result) => {
      completedRefreshes.set(refreshToken, { result, at: Date.now() });
      return result;
    })
    .finally(() => {
      refreshesInFlight.delete(refreshToken);
    });
  refreshesInFlight.set(refreshToken, refresh);
  return refresh;
}

/**
 * Builds request headers from the latest saved tokens. `rejectedAccessToken`
 * is the token a 401 came back for: it is refreshed unless another request
 * already replaced it.
 */
async function resolveOpenAIPlanHeaders(
  config: AIConfig,
  rejectedAccessToken?: string,
): Promise<{ headers: Record<string, string>; accessToken: string }> {
  const current = providerOAuthStore ? providerOAuthStore.read(config.provider.id) : config.provider.oauth;
  const force = rejectedAccessToken !== undefined && current?.accessToken === rejectedAccessToken;
  const result = await createOpenAIPlanHeaders({
    oauth: force && current ? { ...current, expiresAt: 0 } : current,
    refresh: refreshOpenAIPlanTokenOnce,
  });
  if (current && result.oauth.accessToken !== current.accessToken) {
    providerOAuthStore?.write(config.provider.id, result.oauth, current.refreshToken);
  }
  config.provider.oauth = result.oauth;
  return { headers: result.headers, accessToken: result.oauth.accessToken };
}

async function callOpenAIPlanChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const outputSchema = explicitOutputSchema(options.response_format);
  const body = JSON.stringify(
    buildOpenAIPlanCodexRequestBody({
      model: options.model,
      messages: options.messages.map((message) => ({
        role: message.role,
        content: normalizeMessageContent(message.content),
      })),
      reasoning_effort: config.model.reasoning?.enabled ? config.model.reasoning.reasoning_effort : undefined,
      response_format: options.response_format,
    }),
  );

  const send = async (rejectedAccessToken?: string) => {
    let auth: { headers: Record<string, string>; accessToken: string };
    try {
      auth = await resolveOpenAIPlanHeaders(config, rejectedAccessToken);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Reconnect OpenAI Plan in settings.");
    }
    const response = options.onTextDelta && Platform.isDesktop ? await requestPublicTextStream({
      url: OPENAI_PLAN_CODEX_URL, headers: auth.headers, body, signal: options.signal, onTextDelta: outputSchema ? () => {} : options.onTextDelta,
    }) : await requestUrl({
      url: OPENAI_PLAN_CODEX_URL,
      method: "POST",
      headers: auth.headers,
      body,
      contentType: "application/json",
      throw: false,
    });
    return { response, accessToken: auth.accessToken };
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    let attempt = await send();
    // A request can race token expiry; refresh once and retry once.
    if (attempt.response.status === 401 && config.provider.oauth?.refreshToken) {
      attempt = await send(attempt.accessToken);
    }
    const result = attempt.response;
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  return parseOpenAIPlanCodexSse(response.text, Boolean(outputSchema));
}

async function callOpenAICompatibleChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const params: RequestUrlParam = {
    url: getOpenAICompatibleUrl(config),
    method: "POST",
    headers: createOpenAICompatibleHeaders(config),
    body: JSON.stringify(toJsonBody(options)),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  const data = response.json as OpenAICompatibleResponse | undefined;
  const choice = data?.choices?.[0];
  const content = normalizeMessageContent(choice?.message?.content);

  if (!content) {
    throw new Error("No content in AI response");
  }

  return {
    content,
    annotations: choice?.message?.annotations,
  };
}

function anthropicHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }

  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  return headers;
}

async function callAnthropicChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const params: RequestUrlParam = {
    url: `${stripTrailingSlash(config.baseUrl)}/messages`,
    method: "POST",
    headers: anthropicHeaders(config),
    body: JSON.stringify(buildAnthropicMessagesBody(options.model, config.model.thinking, options)),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  const data = response.json as AnthropicMessageResponse | undefined;
  if (data?.stop_reason === "refusal") {
    throw new Error("Claude declined this request (refusal). Rephrase the content or choose another model.");
  }
  const blocks = data?.content;
  const content = Array.isArray(blocks)
    ? blocks
        .map((item) => (item?.type === "text" ? item.text || "" : ""))
        .join("\n")
        .trim()
    : "";

  if (!content) {
    throw new Error(
      data?.stop_reason === "max_tokens"
        ? "Claude ran out of output tokens before answering. Try a lower effort or a shorter input."
        : "No content in Anthropic response",
    );
  }

  return {
    content,
    annotations: undefined,
  };
}

async function callClaudePlanChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const { systemPrompt, prompt } = splitMessagesForCli(options.messages);
  const outputSchema = explicitOutputSchema(options.response_format);
  const content = await executeProviderRequest(config.providerType, options.signal, () =>
    getNativeRuntime().completeWithClaude({
      model: options.model,
      effort: claudeCliEffort(config.model.model, config.model.thinking),
      systemPrompt,
      prompt,
      signal: options.signal,
      onTextDelta: options.onTextDelta,
      jsonSchema: outputSchema?.schema,
    }),
  );
  return { content, annotations: undefined };
}

async function callGeminiPlanChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const { systemPrompt, prompt } = splitMessagesForCli(options.messages);
  const content = await executeProviderRequest(config.providerType, options.signal, () =>
    getNativeRuntime().completeWithGemini({
      model: options.model,
      systemPrompt,
      prompt,
      signal: options.signal,
    }),
  );
  return { content, annotations: undefined };
}

function normalizeGeminiBaseUrl(baseUrl: string): string {
  const stripped = stripTrailingSlash(baseUrl);
  return stripped.endsWith("/openai") ? stripped.slice(0, -"/openai".length) : stripped;
}

function getGeminiUrl(config: AIConfig, model: string): string {
  const baseUrl = normalizeGeminiBaseUrl(config.baseUrl);
  return `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
}

function createGeminiHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  } else if (config.apiKey) {
    headers["x-goog-api-key"] = config.apiKey;
  }

  return headers;
}

function buildGeminiContents(messages: ChatMessage[]): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    const text = normalizeMessageContent(message.content).trim();
    if (!text) continue;

    const role: "user" | "model" = message.role === "assistant" ? "model" : "user";
    const previous = contents[contents.length - 1];

    if (previous && previous.role === role) {
      previous.parts.push({ text });
    } else {
      contents.push({
        role,
        parts: [{ text }],
      });
    }
  }

  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "" }],
    });
  }

  return contents;
}

function getGeminiResponseJsonSchema(options: ChatCompletionOptions): Record<string, unknown> | undefined {
  const responseFormat = options.response_format;
  if (!responseFormat || responseFormat.type !== "json_schema") return undefined;

  const formatRecord = responseFormat;
  const schemaWrapper = formatRecord.json_schema;
  if (!schemaWrapper || typeof schemaWrapper !== "object" || Array.isArray(schemaWrapper)) {
    return undefined;
  }

  const schemaRecord = schemaWrapper as Record<string, unknown>;
  const schema = schemaRecord.schema;
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return schema as Record<string, unknown>;
  }

  return schemaRecord;
}

function buildGeminiGenerationConfig(
  config: AIConfig,
  options: ChatCompletionOptions,
): Record<string, unknown> | undefined {
  const generationConfig: Record<string, unknown> = {};

  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature;
  }

  if (options.response_format?.type === "json_object" || options.response_format?.type === "json_schema") {
    generationConfig.responseMimeType = "application/json";
  }

  const responseJsonSchema = getGeminiResponseJsonSchema(options);
  if (responseJsonSchema) {
    generationConfig.responseJsonSchema = responseJsonSchema;
  }

  const thinkingConfig = geminiThinkingConfig(config.model.model, config.model.thinking);
  if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

  return Object.keys(generationConfig).length > 0 ? generationConfig : undefined;
}

function extractGeminiText(data: GeminiResponse | undefined): string {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts;
  const text = (Array.isArray(parts) ? parts : [])
    .filter((part) => part?.thought !== true)
    .map((part) => part?.text || "")
    .join("\n")
    .trim();

  // A proxy's top-level text must not reintroduce a filtered thought part.
  return Array.isArray(parts) ? text : data?.text || "";
}

function extractGeminiAnnotations(
  data: GeminiResponse | undefined,
): Array<{ type: string; url_citation: { url: string; title?: string } }> {
  const annotations: Array<{ type: string; url_citation: { url: string; title?: string } }> = [];
  const candidate = data?.candidates?.[0];
  const groundingChunks = candidate?.groundingMetadata?.groundingChunks;

  if (Array.isArray(groundingChunks)) {
    groundingChunks.forEach((chunk) => {
      const uri = chunk?.web?.uri;
      if (!uri) return;
      annotations.push({
        type: "url_citation",
        url_citation: {
          url: uri,
          title: chunk?.web?.title,
        },
      });
    });
  }

  const citationSources = candidate?.citationMetadata?.citationSources;
  if (Array.isArray(citationSources)) {
    citationSources.forEach((source) => {
      if (!source?.uri) return;
      annotations.push({
        type: "url_citation",
        url_citation: {
          url: source.uri,
          title: source.uri,
        },
      });
    });
  }

  return annotations;
}

async function callGeminiChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const systemPrompt = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  const body: Record<string, unknown> = {
    contents: buildGeminiContents(options.messages),
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const generationConfig = buildGeminiGenerationConfig(config, options);
  if (generationConfig) {
    body.generationConfig = generationConfig;
  }

  if (options.web_search_options) {
    body.tools = [{ google_search: {} }];
  }

  const params: RequestUrlParam = {
    url: getGeminiUrl(config, options.model),
    method: "POST",
    headers: createGeminiHeaders(config),
    body: JSON.stringify(body),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  const data = response.json as GeminiResponse | undefined;
  const content = extractGeminiText(data);
  if (!content) {
    throw new Error("No content in Gemini response");
  }

  return {
    content,
    annotations: extractGeminiAnnotations(data),
  };
}

export async function chatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  if (config.providerType === "openai-plan") {
    return callOpenAIPlanChatCompletion(config, options);
  }
  if (config.providerType === "anthropic-plan") {
    return callClaudePlanChatCompletion(config, options);
  }
  if (config.providerType === "gemini-plan") {
    return callGeminiPlanChatCompletion(config, options);
  }

  switch (config.providerFamily) {
    case "anthropic":
      return callAnthropicChatCompletion(config, options);
    case "gemini":
      return callGeminiChatCompletion(config, options);
    case "openai-compatible":
    default:
      return callOpenAICompatibleChatCompletion(config, options);
  }
}
