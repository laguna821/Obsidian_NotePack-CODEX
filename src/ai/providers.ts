import { requestUrl, type RequestUrlParam } from "obsidian";
import type { AIConfig } from "../types";
import { buildAIConfig } from "./settings-registry";
import {
  buildOpenAIPlanCodexRequestBody,
  createOpenAIPlanHeaders,
  extractOpenAIPlanErrorMessage,
  parseOpenAIPlanCodexSse,
} from "./openai-plan";
import {
  CLAUDE_CODE_DEFAULT_BETAS,
  CLAUDE_CODE_MESSAGES_ENDPOINT,
  CLAUDE_CODE_SYSTEM_MESSAGE,
  CLAUDE_CODE_USER_AGENT,
  CODE_ASSIST_CLIENT_HEADERS,
  refreshAnthropicPlanToken,
  refreshOpenAIPlanToken,
  setupCodeAssistUser,
} from "./oauth";
import { executeProviderRequest } from "./rate-limiter";

export { buildAIConfig, buildAIConfigForModel } from "./settings-registry";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  response_format?: Record<string, unknown>;
  web_search_options?: Record<string, unknown>;
  signal?: AbortSignal;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function generatePromptId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `np-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateErrorBody(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 400) || "No response body";
}

function throwProviderError(config: AIConfig, response: { status: number; text: string }): never {
  if (config.providerType === "openai-plan") {
    throw new Error(`AI error (${config.providerType}) ${response.status}: ${extractOpenAIPlanErrorMessage(response.text)}`);
  }
  throw new Error(`AI error (${config.providerType}) ${response.status}: ${truncateErrorBody(response.text)}`);
}

function toJsonBody(options: ChatCompletionOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
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

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

const OPENAI_PLAN_CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";

async function callOpenAIPlanChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  let headerResult;
  try {
    headerResult = await createOpenAIPlanHeaders({
      oauth: config.provider.oauth,
      refresh: async (refreshToken) => refreshOpenAIPlanToken({ refreshToken }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconnect OpenAI Plan in settings.";
    throw new Error(message);
  }

  const params: RequestUrlParam = {
    url: OPENAI_PLAN_CODEX_URL,
    method: "POST",
    headers: headerResult.headers,
    body: JSON.stringify(
      buildOpenAIPlanCodexRequestBody({
        model: options.model,
        messages: options.messages.map((message) => ({
          role: message.role,
          content: normalizeMessageContent(message.content),
        })),
        reasoning_effort: config.model.reasoning?.enabled ? config.model.reasoning.reasoning_effort : undefined,
      }),
    ),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  return parseOpenAIPlanCodexSse(response.text);
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

  const data = response.json;
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
  const systemPrompt = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  const messages = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: 4096,
    messages,
  };

  if (systemPrompt) body.system = systemPrompt;
  if (options.temperature !== undefined) body.temperature = options.temperature;

  const params: RequestUrlParam = {
    url: `${stripTrailingSlash(config.baseUrl)}/messages`,
    method: "POST",
    headers: anthropicHeaders(config),
    body: JSON.stringify(body),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  const data = response.json;
  const content = Array.isArray(data?.content)
    ? data.content
        .map((item: { type?: string; text?: string }) => (item?.type === "text" ? item.text || "" : ""))
        .join("\n")
        .trim()
    : "";

  if (!content) {
    throw new Error("No content in Anthropic response");
  }

  return {
    content,
    annotations: undefined,
  };
}

async function resolveAnthropicPlanAccessToken(config: AIConfig): Promise<string> {
  const oauth = config.provider.oauth;
  if (!oauth?.accessToken && !oauth?.refreshToken) {
    throw new Error("Connect Claude Plan in settings first.");
  }
  const now = Date.now();
  if (oauth.accessToken && (oauth.expiresAt === undefined || oauth.expiresAt > now)) {
    return oauth.accessToken;
  }
  if (!oauth.refreshToken) {
    throw new Error("Reconnect Claude Plan in settings.");
  }
  const refreshed = await refreshAnthropicPlanToken({ refreshToken: oauth.refreshToken });
  if (!refreshed.access_token) {
    throw new Error("Claude Plan token refresh returned no access token.");
  }
  return refreshed.access_token;
}

async function callAnthropicPlanChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  // Claude Code OAuth tokens are only honored when the request declares
  // itself as the official CLI: specific beta flags + system message + UA.
  // Smart Composer's pattern (which works end-to-end) is mirrored here.
  const accessToken = await resolveAnthropicPlanAccessToken(config);
  const originalSystem = options.messages
    .filter((m) => m.role === "system")
    .map((m) => normalizeMessageContent(m.content))
    .join("\n\n")
    .trim();
  const nonSystem: Array<{ role: "user" | "assistant"; content: string }> = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: normalizeMessageContent(m.content),
    }));

  // Forcibly set system to the Claude Code prefix; relocate the user's actual
  // system content as a leading USER message (Anthropic's contract for plan).
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (originalSystem) {
    messages.push({ role: "user", content: originalSystem });
  }
  messages.push(...nonSystem);

  const thinkingBudget = config.model.thinking?.enabled
    ? config.model.thinking.budget_tokens ?? 8192
    : undefined;

  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: thinkingBudget ? thinkingBudget + 8192 : 8192,
    system: CLAUDE_CODE_SYSTEM_MESSAGE,
    messages,
  };
  // Anthropic only honors temperature=1 when thinking is enabled, so when
  // thinking is on we omit temperature and let the API default to 1 instead
  // of returning HTTP 400 for any other value.
  if (options.temperature !== undefined && !thinkingBudget) {
    body.temperature = options.temperature;
  }
  if (thinkingBudget) {
    body.thinking = { type: "enabled", budget_tokens: thinkingBudget };
  }

  // ?beta=true mirrors what Smart Composer/Opencode use.
  const url = new URL(CLAUDE_CODE_MESSAGES_ENDPOINT);
  if (!url.searchParams.has("beta")) url.searchParams.set("beta", "true");

  const params: RequestUrlParam = {
    url: url.toString(),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": CLAUDE_CODE_DEFAULT_BETAS.join(","),
      "user-agent": CLAUDE_CODE_USER_AGENT,
    },
    body: JSON.stringify(body),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  const data = response.json;
  const content = Array.isArray(data?.content)
    ? data.content
        .map((item: { type?: string; text?: string }) => (item?.type === "text" ? item.text || "" : ""))
        .join("\n")
        .trim()
    : "";
  if (!content) {
    throw new Error("No content in Claude Plan response");
  }
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

  const formatRecord = responseFormat as Record<string, unknown>;
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

  if (config.model.thinking?.enabled) {
    const thinkingConfig: Record<string, unknown> = {};
    if (config.model.thinking.budget_tokens !== undefined) {
      thinkingConfig.thinkingBudget = config.model.thinking.budget_tokens;
    }
    if (Object.keys(thinkingConfig).length > 0) {
      generationConfig.thinkingConfig = thinkingConfig;
    }
  }

  return Object.keys(generationConfig).length > 0 ? generationConfig : undefined;
}

function extractGeminiText(data: any): string {
  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .map((part: { text?: string }) => part?.text || "")
    .join("\n")
    .trim();

  return text || data?.text || "";
}

function extractGeminiAnnotations(data: any): Array<{ type: string; url_citation: { url: string; title?: string } }> {
  const annotations: Array<{ type: string; url_citation: { url: string; title?: string } }> = [];
  const candidate = data?.candidates?.[0];
  const groundingChunks = candidate?.groundingMetadata?.groundingChunks;

  if (Array.isArray(groundingChunks)) {
    groundingChunks.forEach((chunk: any) => {
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
    citationSources.forEach((source: any) => {
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

  const data = response.json;
  const content = extractGeminiText(data);
  if (!content) {
    throw new Error("No content in Gemini response");
  }

  return {
    content,
    annotations: extractGeminiAnnotations(data),
  };
}

async function callGeminiPlanChatCompletion(
  config: AIConfig,
  options: ChatCompletionOptions,
): Promise<{ content: string; annotations?: unknown[] }> {
  const systemPrompt = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  // Code Assist envelope mirrors the minimum shape Smart Composer (which
  // works end-to-end) sends: {project, model, request: {contents,
  // systemInstruction(with role), generationConfig}}. No user_prompt_id,
  // no enabled_credit_types, no session_id — adding those was actually
  // confusing the backend and producing 500 INTERNAL.
  const innerRequest: Record<string, unknown> = {
    contents: buildGeminiContents(options.messages),
  };
  if (systemPrompt) {
    innerRequest.systemInstruction = {
      role: "system",
      parts: [{ text: systemPrompt }],
    };
  }
  const generationConfig = buildGeminiGenerationConfig(config, options);
  if (generationConfig) {
    innerRequest.generationConfig = generationConfig;
  }
  if (options.web_search_options) {
    innerRequest.tools = [{ google_search: {} }];
  }

  // Self-heal: if we never captured a managedProjectId (e.g. user connected
  // with an earlier plugin build that lacked the Code Assist client headers
  // and onboarding silently failed), run setup lazily and persist the result
  // on the provider's OAuth record so subsequent calls reuse it.
  let projectId = config.managedProjectId;
  let lazySetupError: Error | null = null;
  if (!projectId && config.authToken && config.provider.oauth) {
    try {
      const setup = await setupCodeAssistUser(config.authToken);
      if (setup.projectId) {
        projectId = setup.projectId;
        config.provider.oauth.managedProjectId = projectId;
      }
    } catch (setupError) {
      lazySetupError =
        setupError instanceof Error ? setupError : new Error(String(setupError));
      console.error("Code Assist lazy onboarding failed", setupError);
    }
  }
  // Without a project ID the request goes out with `project: undefined`, which
  // Code Assist answers with 404 NOT_FOUND on the *project* — users routinely
  // misread that as a model deprecation. Block the doomed request and surface
  // the actual cause so the user knows reconnect / API-Key-mode is the fix.
  if (!projectId) {
    const detail = lazySetupError
      ? lazySetupError.message
      : "managedProjectId가 저장되어 있지 않습니다";
    throw new Error(
      `Code Assist 프로젝트가 설정되지 않았습니다 (${detail}). Gemini Plan 연결을 해제하고 다시 로그인하거나 Gemini API Key 모드로 전환하세요.`,
    );
  }

  const envelope: Record<string, unknown> = {
    project: projectId,
    model: options.model,
    request: innerRequest,
  };

  // cloudcode-pa.googleapis.com CORS-blocks browser fetch. Use Obsidian's
  // requestUrl (Electron net.request) which bypasses CORS preflight. That
  // means non-streaming :generateContent — streaming SSE would need Node's
  // http module, which is overkill since NotePack doesn't show tokens live.
  const baseUrl = stripTrailingSlash(config.baseUrl);
  const url = `${baseUrl}:generateContent`;

  const params: RequestUrlParam = {
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken ?? ""}`,
      ...CODE_ASSIST_CLIENT_HEADERS,
    },
    body: JSON.stringify(envelope),
    contentType: "application/json",
    throw: false,
  };

  const response = await executeProviderRequest(config.providerType, options.signal, async () => {
    const result = await requestUrl(params);
    if (result.status >= 400) throwProviderError(config, result);
    return result;
  });

  // Code Assist wraps the standard Gemini generateContent body under `.response`.
  const root = response.json as { response?: unknown };
  const inner =
    root && typeof root === "object" && "response" in root ? root.response : root;
  const content = extractGeminiText(inner);
  if (!content) {
    throw new Error("No content in Gemini Plan (Code Assist) response");
  }
  return {
    content,
    annotations: extractGeminiAnnotations(inner),
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
    return callAnthropicPlanChatCompletion(config, options);
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
