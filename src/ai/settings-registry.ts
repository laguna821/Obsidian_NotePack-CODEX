import { normalizePackPreferences } from "./pack-preferences.ts";
import type {
  AIChatModel,
  AIConfig,
  AIProviderDefinition,
  AIProviderFamily,
  AIProviderRecord,
  AIProviderType,
  AISettings,
  LegacyAIProvider,
  LegacyAISettings,
} from "../types";
import { createDefaultAnnotationAgents, normalizeAnnotationAgents } from "./personas.ts";
import { isRetiredModelId, replaceRetiredModelId } from "./model-retirement.ts";

const PROVIDER_DEFINITIONS: Record<AIProviderType, AIProviderDefinition> = {
  "anthropic-plan": {
    type: "anthropic-plan",
    label: "Claude Plan",
    defaultProviderId: "anthropic-plan",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "native-runtime",
    family: "anthropic",
    mobileSupported: false,
    warning:
      "Runs the Claude Code app installed on this computer with your own Claude login. NotePack never stores Claude tokens. Personal-use compatibility path, not an official Anthropic integration.",
    additionalSettings: [],
  },
  "openai-plan": {
    type: "openai-plan",
    label: "OpenAI Plan",
    defaultProviderId: "openai-plan",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "oauth",
    family: "openai-compatible",
    mobileSupported: false,
    additionalSettings: [],
  },
  "gemini-plan": {
    type: "gemini-plan",
    label: "Gemini Plan",
    defaultProviderId: "gemini-plan",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "native-runtime",
    family: "gemini",
    mobileSupported: false,
    warning:
      "Runs the Google Antigravity CLI installed on this computer with your own Google login. NotePack never stores Google tokens.",
    additionalSettings: [],
  },
  anthropic: {
    type: "anthropic",
    label: "Anthropic",
    defaultProviderId: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  openai: {
    type: "openai",
    label: "OpenAI",
    defaultProviderId: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "openai-compatible",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  gemini: {
    type: "gemini",
    label: "Gemini",
    defaultProviderId: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "gemini",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIza...",
    mobileSupported: true,
    additionalSettings: [],
  },
  xai: {
    type: "xai",
    label: "xAI",
    defaultProviderId: "xai",
    defaultBaseUrl: "https://api.x.ai/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "openai-compatible",
    keyPlaceholder: "xai-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  deepseek: {
    type: "deepseek",
    label: "DeepSeek",
    defaultProviderId: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "openai-compatible",
    keyPlaceholder: "sk-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  mistral: {
    type: "mistral",
    label: "Mistral",
    defaultProviderId: "mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "openai-compatible",
    keyPlaceholder: "mistral-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  perplexity: {
    type: "perplexity",
    label: "Perplexity",
    defaultProviderId: "perplexity",
    defaultBaseUrl: "https://api.perplexity.ai",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "openai-compatible",
    keyPlaceholder: "pplx-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  openrouter: {
    type: "openrouter",
    label: "OpenRouter",
    defaultProviderId: "openrouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    authStrategy: "apiKey",
    family: "openai-compatible",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyPlaceholder: "sk-or-v1-...",
    mobileSupported: true,
    additionalSettings: [],
  },
  ollama: {
    type: "ollama",
    label: "Ollama",
    defaultProviderId: "ollama",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "none",
    family: "openai-compatible",
    mobileSupported: true,
    additionalSettings: [],
  },
  "lm-studio": {
    type: "lm-studio",
    label: "LM Studio",
    defaultProviderId: "lm-studio",
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "none",
    family: "openai-compatible",
    mobileSupported: true,
    additionalSettings: [],
  },
  "azure-openai": {
    type: "azure-openai",
    label: "Azure OpenAI",
    defaultProviderId: null,
    requiresApiKey: true,
    requiresBaseUrl: true,
    authStrategy: "apiKey",
    family: "openai-compatible",
    mobileSupported: true,
    baseUrlPlaceholder: "https://<resource>.openai.azure.com",
    additionalSettings: [
      {
        label: "Deployment",
        key: "deployment",
        placeholder: "gpt-4o-prod",
        type: "text",
        required: true,
      },
      {
        label: "API Version",
        key: "apiVersion",
        placeholder: "2024-10-21",
        type: "text",
        required: true,
      },
    ],
  },
  "openai-compatible": {
    type: "openai-compatible",
    label: "OpenAI Compatible",
    defaultProviderId: null,
    requiresApiKey: false,
    requiresBaseUrl: true,
    authStrategy: "apiKey-or-oauth",
    family: "openai-compatible",
    mobileSupported: true,
    baseUrlPlaceholder: "https://api.example.com/v1",
    additionalSettings: [
      {
        label: "No Stainless Headers",
        key: "noStainless",
        type: "toggle",
        required: false,
        description:
          "Enable this for providers that reject OpenAI-specific Stainless tracing headers.",
      },
    ],
  },
};

function createProviderRecord(type: AIProviderType, id: string): AIProviderRecord {
  return {
    type,
    id,
  };
}

export const DEFAULT_PROVIDER_CATALOG: AIProviderRecord[] = (
  Object.values(PROVIDER_DEFINITIONS)
    .filter((definition) => definition.defaultProviderId)
    .map((definition) => createProviderRecord(definition.type, definition.defaultProviderId!))
);

function createChatModel(
  id: string,
  providerType: AIProviderType,
  providerId: string,
  label: string,
  model: string,
  options: Partial<AIChatModel> = {},
): AIChatModel {
  return {
    id,
    providerType,
    providerId,
    label,
    model,
    supportsGrounding: false,
    supportsJsonSchema: false,
    supportsJsonObject: true,
    supportsAnnotations: false,
    ...options,
  };
}

// Plan models run through the user's own subscription. Claude and Gemini Plan
// use the installed CLI (no grounding, JSON by prompt); model IDs and aliases
// were checked against Claude Code 2.1.285, Antigravity 1.2.14, and the OpenAI
// Codex model docs on 2026-10-01.
const PLAN_CLI_MODEL: Partial<AIChatModel> = {
  supportsGrounding: false,
  supportsJsonSchema: false,
  supportsJsonObject: true,
  supportsAnnotations: false,
};

export const DEFAULT_CHAT_MODELS: AIChatModel[] = [
  createChatModel(
    "openrouter/openai-gpt-6-1-sol",
    "openrouter",
    "openrouter",
    "GPT-6.1 Sol via OpenRouter",
    "openai/gpt-6.1-sol",
    {
      description: "Balanced default for NotePack",
      supportsGrounding: true,
      supportsJsonSchema: true,
      supportsAnnotations: true,
    },
  ),
  createChatModel(
    "openrouter/anthropic-claude-sonnet-5-5",
    "openrouter",
    "openrouter",
    "Claude Sonnet 5.5 via OpenRouter",
    "anthropic/claude-sonnet-5.5",
    {
      supportsJsonSchema: true,
    },
  ),
  createChatModel(
    "openrouter/google-gemini-3-8-flash",
    "openrouter",
    "openrouter",
    "Gemini 3.8 Flash via OpenRouter",
    "google/gemini-3.8-flash",
    {
      supportsGrounding: true,
      supportsJsonSchema: true,
      supportsAnnotations: true,
    },
  ),
  // Claude Plan: "latest" entries follow Claude Code's aliases; pinned entries
  // need the Claude Code release that introduced them.
  createChatModel("anthropic-plan/claude-sonnet-latest-plan", "anthropic-plan", "anthropic-plan", "Claude Sonnet · latest (Plan)", "sonnet", {
    ...PLAN_CLI_MODEL,
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic-plan/claude-opus-latest-plan", "anthropic-plan", "anthropic-plan", "Claude Opus · latest (Plan)", "opus", {
    ...PLAN_CLI_MODEL,
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic-plan/claude-haiku-latest-plan", "anthropic-plan", "anthropic-plan", "Claude Haiku · latest (Plan)", "haiku", {
    ...PLAN_CLI_MODEL,
  }),
  createChatModel("anthropic-plan/claude-fable-latest-plan", "anthropic-plan", "anthropic-plan", "Claude Fable · latest (Plan)", "fable", {
    ...PLAN_CLI_MODEL,
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic-plan/claude-opus-5-5-plan", "anthropic-plan", "anthropic-plan", "Claude Opus 5.5 (Plan)", "claude-opus-5-5", {
    ...PLAN_CLI_MODEL,
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic-plan/claude-sonnet-5-5-plan", "anthropic-plan", "anthropic-plan", "Claude Sonnet 5.5 (Plan)", "claude-sonnet-5-5", {
    ...PLAN_CLI_MODEL,
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic-plan/claude-fable-5-1-plan", "anthropic-plan", "anthropic-plan", "Claude Fable 5.1 (Plan)", "claude-fable-5-1", {
    ...PLAN_CLI_MODEL,
    thinking: { enabled: true, effort: "medium" },
  }),
  // OpenAI Plan (ChatGPT/Codex subscription over OAuth).
  createChatModel("openai-plan/gpt-6-1-sol-plan", "openai-plan", "openai-plan", "GPT-6.1 Sol (Plan)", "gpt-6.1-sol", {
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  createChatModel("openai-plan/gpt-6-sol-plan", "openai-plan", "openai-plan", "GPT-6 Sol (Plan)", "gpt-6-sol", {
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  createChatModel("openai-plan/gpt-6-astra-plan", "openai-plan", "openai-plan", "GPT-6 Astra (Plan)", "gpt-6-astra", {
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  createChatModel("openai-plan/gpt-6-luna-plan", "openai-plan", "openai-plan", "GPT-6 Luna (Plan)", "gpt-6-luna", {
    reasoning: { enabled: true, reasoning_effort: "low" },
  }),
  // Verified on this OAuth path (CMDS Achmage R-001) and kept available during
  // the GPT-6 rollout. Retired GPT-5.x selections move here, because the
  // Codex backend may gate GPT-6 by client version for this connection.
  createChatModel("openai-plan/gpt-5-6-sol-plan", "openai-plan", "openai-plan", "GPT-5.6 Sol (Plan)", "gpt-5.6-sol", {
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  // Gemini Plan: Antigravity model IDs carry their effort tier in the name.
  // Other Gemini models found while checking the connection are added on demand.
  createChatModel("gemini-plan/gemini-3-1-pro-high-plan", "gemini-plan", "gemini-plan", "Gemini 3.1 Pro · High (Plan)", "gemini-3.1-pro-high", {
    ...PLAN_CLI_MODEL,
  }),
  createChatModel("gemini-plan/gemini-3-8-flash-medium-plan", "gemini-plan", "gemini-plan", "Gemini 3.8 Flash · Medium (Plan)", "gemini-3.8-flash-medium", {
    ...PLAN_CLI_MODEL,
  }),
  // Claude 4.6+ models run adaptive thinking with an effort level; Haiku 4.5
  // keeps the older token-budget request shape.
  createChatModel("anthropic/claude-opus-5-5", "anthropic", "anthropic", "Claude Opus 5.5", "claude-opus-5-5", {
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic/claude-sonnet-5-5", "anthropic", "anthropic", "Claude Sonnet 5.5", "claude-sonnet-5-5", {
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic/claude-fable-5-1", "anthropic", "anthropic", "Claude Fable 5.1", "claude-fable-5-1", {
    thinking: { enabled: true, effort: "medium" },
  }),
  createChatModel("anthropic/claude-haiku-4-5", "anthropic", "anthropic", "Claude Haiku 4.5", "claude-haiku-4-5"),
  createChatModel("openai/gpt-6-1-sol", "openai", "openai", "GPT-6.1 Sol", "gpt-6.1-sol", {
    supportsJsonSchema: true,
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  createChatModel("openai/gpt-6-astra", "openai", "openai", "GPT-6 Astra", "gpt-6-astra", {
    supportsJsonSchema: true,
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  createChatModel("openai/gpt-6-luna", "openai", "openai", "GPT-6 Luna", "gpt-6-luna", {
    supportsJsonSchema: true,
    reasoning: { enabled: true, reasoning_effort: "low" },
  }),
  createChatModel("gemini/gemini-3-8-flash", "gemini", "gemini", "Gemini 3.8 Flash", "gemini-3.8-flash", {
    supportsGrounding: true,
    supportsJsonSchema: true,
  }),
  createChatModel("gemini/gemini-3-1-pro-preview", "gemini", "gemini", "Gemini 3.1 Pro Preview", "gemini-3.1-pro-preview", {
    supportsGrounding: true,
    supportsJsonSchema: true,
  }),
  createChatModel("gemini/gemini-3-5-flash-lite", "gemini", "gemini", "Gemini 3.5 Flash-Lite", "gemini-3.5-flash-lite", {
    supportsGrounding: true,
    supportsJsonSchema: true,
  }),
  // DeepSeek retired deepseek-chat/-reasoner on 2026-07-24; xAI retired the
  // Grok 4.1 Fast models on 2026-05-15 (checked against their docs 2026-10-01).
  createChatModel("deepseek/deepseek-flash", "deepseek", "deepseek", "DeepSeek V4.1 Flash", "deepseek-flash"),
  createChatModel("deepseek/deepseek-v4-pro", "deepseek", "deepseek", "DeepSeek V4 Pro", "deepseek-v4-pro"),
  createChatModel("xai/grok-4-7", "xai", "xai", "Grok 4.7", "grok-4.7"),
  createChatModel("xai/grok-4-3", "xai", "xai", "Grok 4.3", "grok-4.3"),
  createChatModel("mistral/mistral-large-latest", "mistral", "mistral", "Mistral Large", "mistral-large-latest"),
  createChatModel("perplexity/sonar", "perplexity", "perplexity", "Sonar", "sonar"),
  createChatModel("perplexity/sonar-deep-research", "perplexity", "perplexity", "Sonar Deep Research", "sonar-deep-research"),
  createChatModel("ollama/llama3.1", "ollama", "ollama", "Llama 3.1", "llama3.1"),
  createChatModel("ollama/mistral", "ollama", "ollama", "Mistral", "mistral"),
  createChatModel("ollama/qwen2.5", "ollama", "ollama", "Qwen 2.5", "qwen2.5"),
  createChatModel("lm-studio/qwen2.5-instruct", "lm-studio", "lm-studio", "Qwen 2.5 Instruct (LM Studio)", "qwen2.5-instruct"),
];

export interface ResolvedAISelection {
  provider: AIProviderRecord;
  providerDefinition: AIProviderDefinition;
  model: AIChatModel;
}

export type AIExecutionStateCode =
  | "ready"
  | "native_check_required"
  | "unsupported_platform"
  | "missing_model"
  | "missing_base_url"
  | "missing_api_key"
  | "missing_oauth"
  | "missing_credentials";

export interface AIExecutionState {
  canExecute: boolean;
  code: AIExecutionStateCode;
  message: string;
}

function cloneProvider(provider: AIProviderRecord): AIProviderRecord {
  return {
    ...provider,
    oauth: provider.oauth ? { ...provider.oauth } : undefined,
    additionalSettings: provider.additionalSettings ? { ...provider.additionalSettings } : undefined,
  };
}

function cloneChatModel(model: AIChatModel): AIChatModel {
  return {
    ...model,
    thinking: model.thinking ? { ...model.thinking } : undefined,
    reasoning: model.reasoning ? { ...model.reasoning } : undefined,
  };
}

function mergeProviders(providers: AIProviderRecord[] = []): AIProviderRecord[] {
  const merged = new Map<string, AIProviderRecord>();
  DEFAULT_PROVIDER_CATALOG.forEach((provider) => {
    merged.set(provider.id, cloneProvider(provider));
  });
  providers.forEach((provider) => {
    merged.set(provider.id, cloneProvider(provider));
  });
  return [...merged.values()];
}

function mergeChatModels(chatModels: AIChatModel[] = []): AIChatModel[] {
  const merged = new Map<string, AIChatModel>();
  DEFAULT_CHAT_MODELS.forEach((model) => {
    merged.set(model.id, cloneChatModel(model));
  });
  chatModels.forEach((model) => {
    // Built-in entries cannot be edited in the UI, so the shipped catalog
    // always wins; otherwise a stored copy would keep stale labels and IDs.
    if (isBuiltInChatModel(model.id) || isRetiredModelId(model.id)) return;
    merged.set(model.id, cloneChatModel(model));
  });
  return [...merged.values()];
}

// Runs on every load (not only once per schema bump) so data written back by
// an older NotePack on another synced device is repaired again.
function migrateRetiredModels(candidate?: Partial<AISettings>): Partial<AISettings> | undefined {
  if (!candidate) return candidate;

  const migrated: Partial<AISettings> = { ...candidate };

  if (candidate.activeChatModelId) {
    migrated.activeChatModelId = replaceRetiredModelId(candidate.activeChatModelId);
  }

  if (candidate.chatModels) {
    migrated.chatModels = candidate.chatModels
      .filter((model) => !isRetiredModelId(model.id))
      .map((model) => cloneChatModel(model));
  }

  if (candidate.annotationAgents) {
    migrated.annotationAgents = candidate.annotationAgents.map((agent) =>
      agent?.modelId && isRetiredModelId(agent.modelId)
        ? { ...agent, modelId: replaceRetiredModelId(agent.modelId) }
        : agent,
    );
  }

  if (candidate.providers) {
    migrated.providers = candidate.providers.map((provider) => cloneProvider(provider));
  }

  return migrated;
}

export function getProviderDefinition(type: AIProviderType): AIProviderDefinition {
  return PROVIDER_DEFINITIONS[type];
}

export function getProviderDefinitions(): AIProviderDefinition[] {
  return Object.values(PROVIDER_DEFINITIONS);
}

export function createDefaultAISettings(): AISettings {
  const activeChatModelId = DEFAULT_CHAT_MODELS[0]?.id ?? "";
  return {
    providers: mergeProviders(),
    chatModels: mergeChatModels(),
    activeChatModelId,
    webGrounding: false,
    annotationMode: "parallel",
    annotationLanguageMode: "auto-source",
    packLanguageMode: "auto-source",
    annotationAgents: createDefaultAnnotationAgents(activeChatModelId),
    annotationMaxSentences: 4,
    packExploration: 2,
    packPityEnabled: true,
    promotionFolder: "Cards",
    noteAuthor: "",
    customPackDifficultyPrompt: "",
    customSynthesisPrompt: "",
    uiLanguage: "ko",
  };
}

export function getFirstUsableChatModelId(settings: AISettings): string {
  const models = settings.chatModels.filter((model) =>
    settings.providers.some((provider) => provider.id === model.providerId),
  );
  return models[0]?.id ?? DEFAULT_CHAT_MODELS[0]?.id ?? "";
}

export function normalizeAISettings(candidate?: Partial<AISettings>): AISettings {
  const migratedCandidate = migrateRetiredModels(candidate);
  const defaults = createDefaultAISettings();
  const legacyPackRisk = migratedCandidate?.packRisk;
  const merged: AISettings = {
    ...defaults,
    ...migratedCandidate,
    providers: mergeProviders(migratedCandidate?.providers ?? defaults.providers),
    chatModels: mergeChatModels(migratedCandidate?.chatModels ?? defaults.chatModels),
  };

  const rawMax = Number(migratedCandidate?.annotationMaxSentences ?? defaults.annotationMaxSentences);
  merged.annotationMaxSentences = Math.max(1, Math.min(10, Math.round(Number.isFinite(rawMax) ? rawMax : defaults.annotationMaxSentences)));
  merged.packExploration = Math.max(
    0,
    Math.min(
      5,
      Math.round(migratedCandidate?.packExploration ?? legacyPackRisk ?? defaults.packExploration),
    ),
  );
  delete merged.packRisk;
  merged.packPreferences = normalizePackPreferences(migratedCandidate?.packPreferences, migratedCandidate);

  if (!merged.activeChatModelId || !merged.chatModels.some((model) => model.id === merged.activeChatModelId)) {
    merged.activeChatModelId = getFirstUsableChatModelId(merged);
  }

  if (merged.annotationMode !== "single" && merged.annotationMode !== "parallel" && merged.annotationMode !== "sequential") {
    merged.annotationMode = defaults.annotationMode;
  }

  if (
    merged.annotationLanguageMode !== "auto-source" &&
    merged.annotationLanguageMode !== "ui-language" &&
    merged.annotationLanguageMode !== "fixed" &&
    merged.annotationLanguageMode !== "bilingual"
  ) {
    merged.annotationLanguageMode = defaults.annotationLanguageMode;
  }

  if (
    merged.packLanguageMode !== "auto-source" &&
    merged.packLanguageMode !== "ui-language" &&
    merged.packLanguageMode !== "fixed" &&
    merged.packLanguageMode !== "bilingual"
  ) {
    merged.packLanguageMode = defaults.packLanguageMode;
  }

  merged.annotationAgents = normalizeAnnotationAgents(merged.annotationAgents, merged.activeChatModelId, {
    withDefaults: true,
  });

  return merged;
}

function findLegacyProviderRecord(
  providers: AIProviderRecord[],
  providerType: LegacyAIProvider,
): AIProviderRecord | undefined {
  return providers.find((provider) => provider.id === providerType);
}

function findLegacyModelId(providerType: LegacyAIProvider, modelId?: string): string {
  const models = DEFAULT_CHAT_MODELS.filter((model) => model.providerId === providerType);
  if (modelId) {
    const exact = models.find((model) => model.model === modelId || model.id === modelId);
    if (exact) return exact.id;
  }
  return models[0]?.id ?? DEFAULT_CHAT_MODELS[0]?.id ?? "";
}

function isCurrentAISettings(candidate: Partial<LegacyAISettings> | AISettings): candidate is AISettings {
  return "providers" in candidate && Array.isArray(candidate.providers) && "chatModels" in candidate;
}

export function migrateLegacyAISettings(candidate?: Partial<LegacyAISettings> | AISettings): AISettings {
  if (candidate && isCurrentAISettings(candidate)) {
    return normalizeAISettings(candidate);
  }

  const legacy = candidate;
  const migrated = createDefaultAISettings();
  const providerType = legacy?.provider ?? "openrouter";

  if (legacy?.providerKeys) {
    (Object.entries(legacy.providerKeys) as Array<[LegacyAIProvider, string | undefined]>).forEach(
      ([key, value]) => {
        if (!value) return;
        const provider = findLegacyProviderRecord(migrated.providers, key);
        if (provider) provider.apiKey = value;
      },
    );
  }

  const activeProvider = findLegacyProviderRecord(migrated.providers, providerType);
  if (activeProvider) {
    activeProvider.apiKey = legacy?.apiKey ?? activeProvider.apiKey;
    activeProvider.baseUrl = legacy?.customBaseUrl ?? activeProvider.baseUrl;
  }

  migrated.activeChatModelId = findLegacyModelId(providerType, legacy?.modelId);
  migrated.webGrounding = legacy?.webGrounding ?? migrated.webGrounding;
  migrated.packExploration = legacy?.packRisk ?? migrated.packExploration;
  migrated.packPityEnabled = legacy?.packPityEnabled ?? migrated.packPityEnabled;
  migrated.promotionFolder = legacy?.promotionFolder ?? migrated.promotionFolder;
  migrated.uiLanguage = legacy?.uiLanguage ?? migrated.uiLanguage;

  return normalizeAISettings(migrated);
}

export function resolveActiveChatModel(settings: AISettings): ResolvedAISelection | null {
  const normalized = normalizeAISettings(settings);
  let model = normalized.chatModels.find((item) => item.id === normalized.activeChatModelId);
  if (!model) {
    const fallbackId = getFirstUsableChatModelId(normalized);
    model = normalized.chatModels.find((item) => item.id === fallbackId);
  }
  if (!model) return null;

  const provider = normalized.providers.find((item) => item.id === model.providerId);
  if (!provider) return null;

  return {
    provider,
    providerDefinition: getProviderDefinition(provider.type),
    model,
  };
}

export function resolveChatModelById(settings: AISettings, modelId: string): ResolvedAISelection | null {
  const normalized = normalizeAISettings(settings);
  const model = normalized.chatModels.find((item) => item.id === modelId);
  if (!model) return null;

  const provider = normalized.providers.find((item) => item.id === model.providerId);
  if (!provider) return null;

  return {
    provider,
    providerDefinition: getProviderDefinition(provider.type),
    model,
  };
}

export function resolveProviderBaseUrl(provider: AIProviderRecord, definition?: AIProviderDefinition): string {
  const resolvedDefinition = definition ?? getProviderDefinition(provider.type);
  return provider.baseUrl?.trim() || resolvedDefinition.defaultBaseUrl || "";
}

function isOpenAIPlanReconnectRequired(provider: AIProviderRecord): boolean {
  if (provider.type !== "openai-plan") return false;

  const oauth = provider.oauth;
  if (!oauth) return false;
  if (oauth.refreshToken) return false;
  if (!oauth.accessToken) return true;
  return oauth.expiresAt !== undefined && oauth.expiresAt <= Date.now();
}

function getOpenAIPlanOauthMessage(provider: AIProviderRecord): string {
  if (!provider.oauth?.accessToken && !provider.oauth?.refreshToken) {
    return "Connect the active plan provider in settings first.";
  }
  if (isOpenAIPlanReconnectRequired(provider)) {
    return "Reconnect OpenAI Plan in settings.";
  }
  return "Ready to run.";
}

export function getProviderAuthToken(provider: AIProviderRecord): string | undefined {
  if (provider.type === "openai-plan") {
    return provider.oauth?.accessToken || undefined;
  }
  return provider.oauth?.accessToken;
}

export function getProviderApiKey(provider: AIProviderRecord): string | undefined {
  return provider.apiKey?.trim() || undefined;
}

// The native Plan runtimes spawn desktop CLIs; main.ts reports the platform.
let nativeRuntimeAvailable = true;

export function setNativeRuntimeAvailability(available: boolean): void {
  nativeRuntimeAvailable = available;
}

export function getResolvedModelExecutionState(resolved: ResolvedAISelection | null): AIExecutionState {
  if (!resolved) {
    return {
      canExecute: false,
      code: "missing_model",
      message: "Choose an active model before running AI features.",
    };
  }

  const { provider, providerDefinition } = resolved;
  const baseUrl = resolveProviderBaseUrl(provider, providerDefinition);
  if (providerDefinition.requiresBaseUrl && !baseUrl) {
    return {
      canExecute: false,
      code: "missing_base_url",
      message: "Add a base URL for the active provider in settings.",
    };
  }

  const apiKey = getProviderApiKey(provider);
  const authToken = getProviderAuthToken(provider);

  switch (providerDefinition.authStrategy) {
    case "native-runtime":
      // Installation and login are checked by the runtime right before each
      // request (and on demand in settings); nothing is stored in the vault.
      return nativeRuntimeAvailable
        ? { canExecute: true, code: "native_check_required", message: "The login on this computer is checked when a request starts." }
        : {
            canExecute: false,
            code: "unsupported_platform",
            message: "Plan connections run on desktop only. Use an API key provider on mobile.",
          };
    case "none":
      return {
        canExecute: Boolean(baseUrl),
        code: baseUrl ? "ready" : "missing_base_url",
        message: baseUrl ? "Ready to run." : "Add a base URL for the active provider in settings.",
      };
    case "apiKey":
      return {
        canExecute: Boolean(apiKey),
        code: apiKey ? "ready" : "missing_api_key",
        message: apiKey ? "Ready to run." : "Add an API key for the active provider in settings.",
      };
    case "oauth":
      if (provider.type === "openai-plan") {
        const message = getOpenAIPlanOauthMessage(provider);
        const ready = !isOpenAIPlanReconnectRequired(provider) && Boolean(provider.oauth?.accessToken || provider.oauth?.refreshToken);
        return {
          canExecute: ready,
          code: ready ? "ready" : "missing_oauth",
          message,
        };
      }

      return {
        canExecute: Boolean(authToken),
        code: authToken ? "ready" : "missing_oauth",
        message: authToken ? "Ready to run." : "Connect the active plan provider in settings first.",
      };
    case "apiKey-or-oauth":
      if (!baseUrl) {
        return {
          canExecute: false,
          code: "missing_base_url",
          message: "Add a base URL for the active provider in settings.",
        };
      }
      if (apiKey || authToken || !providerDefinition.requiresApiKey) {
        return {
          canExecute: true,
          code: "ready",
          message: "Ready to run.",
        };
      }
      return {
        canExecute: false,
        code: "missing_credentials",
        message: "Add credentials for the active provider in settings.",
      };
    default:
      return {
        canExecute: false,
        code: "missing_credentials",
        message: "The active provider is missing required credentials.",
      };
  }
}

export function canExecuteResolvedModel(resolved: ResolvedAISelection | null): boolean {
  return getResolvedModelExecutionState(resolved).canExecute;
}

export function getActiveModelExecutionState(settings: AISettings): AIExecutionState {
  return getResolvedModelExecutionState(resolveActiveChatModel(settings));
}

export function getModelExecutionState(settings: AISettings, modelId: string): AIExecutionState {
  return getResolvedModelExecutionState(resolveChatModelById(settings, modelId));
}

export function canExecuteActiveModel(settings: AISettings): boolean {
  return getActiveModelExecutionState(settings).canExecute;
}

export function getModelsForProvider(settings: AISettings, providerId: string): AIChatModel[] {
  return normalizeAISettings(settings).chatModels.filter((model) => model.providerId === providerId);
}

export function isBuiltInProvider(provider: AIProviderRecord): boolean {
  const definition = getProviderDefinition(provider.type);
  return definition.defaultProviderId === provider.id;
}

export function isBuiltInChatModel(modelId: string): boolean {
  return DEFAULT_CHAT_MODELS.some((model) => model.id === modelId);
}

export function upsertProvider(settings: AISettings, provider: AIProviderRecord): AISettings {
  const providers = normalizeAISettings(settings).providers;
  const nextProviders = providers.filter((item) => item.id !== provider.id);
  nextProviders.push(cloneProvider(provider));
  return normalizeAISettings({ ...settings, providers: nextProviders });
}

export function removeProvider(settings: AISettings, providerId: string): AISettings {
  const normalized = normalizeAISettings(settings);
  const providers = normalized.providers.filter((provider) => provider.id !== providerId);
  const chatModels = normalized.chatModels.filter((model) => model.providerId !== providerId);
  const nextSettings = normalizeAISettings({
    ...normalized,
    providers,
    chatModels,
  });
  if (!nextSettings.chatModels.some((model) => model.id === nextSettings.activeChatModelId)) {
    nextSettings.activeChatModelId = getFirstUsableChatModelId(nextSettings);
  }
  return nextSettings;
}

export function upsertChatModel(settings: AISettings, model: AIChatModel): AISettings {
  const normalized = normalizeAISettings(settings);
  const chatModels = normalized.chatModels.filter((item) => item.id !== model.id);
  chatModels.push(cloneChatModel(model));
  return normalizeAISettings({ ...normalized, chatModels });
}

export function removeChatModel(settings: AISettings, modelId: string): AISettings {
  const normalized = normalizeAISettings(settings);
  const chatModels = normalized.chatModels.filter((model) => model.id !== modelId);
  const nextSettings = normalizeAISettings({ ...normalized, chatModels });
  if (nextSettings.activeChatModelId === modelId) {
    nextSettings.activeChatModelId = getFirstUsableChatModelId(nextSettings);
  }
  return nextSettings;
}

export function setActiveChatModel(settings: AISettings, modelId: string): AISettings {
  return normalizeAISettings({
    ...settings,
    activeChatModelId: modelId,
  });
}

function buildAIConfigFromResolved(settings: AISettings, resolved: ResolvedAISelection | null): AIConfig | null {
  if (!resolved || !canExecuteResolvedModel(resolved)) return null;

  const { provider, providerDefinition, model } = resolved;

  return {
    provider,
    providerDefinition,
    model,
    modelId: model.model,
    providerType: provider.type,
    providerId: provider.id,
    providerFamily: providerDefinition.family,
    baseUrl: resolveProviderBaseUrl(provider, providerDefinition),
    authToken: getProviderAuthToken(provider),
    apiKey: getProviderApiKey(provider),
    supportsGrounding: settings.webGrounding && model.supportsGrounding,
    supportsJsonSchema: model.supportsJsonSchema ?? false,
    supportsJsonObject: model.supportsJsonObject ?? true,
    supportsAnnotations: model.supportsAnnotations ?? false,
  };
}

export function buildAIConfig(settings: AISettings): AIConfig | null {
  return buildAIConfigFromResolved(settings, resolveActiveChatModel(settings));
}

export function buildAIConfigForModel(settings: AISettings, modelId: string): AIConfig | null {
  return buildAIConfigFromResolved(settings, resolveChatModelById(settings, modelId));
}

export function getProviderDisplayName(provider: AIProviderRecord): string {
  const definition = getProviderDefinition(provider.type);
  return isBuiltInProvider(provider) ? definition.label : `${definition.label} (${provider.id})`;
}

export function getActiveModelLabel(settings: AISettings): string {
  const resolved = resolveActiveChatModel(settings);
  if (!resolved) return "AI not configured";
  return resolved.model.label;
}

export function isLegacyProvider(value: string): value is LegacyAIProvider {
  return value === "openrouter" || value === "openai" || value === "ollama";
}

export function getProviderFamily(type: AIProviderType): AIProviderFamily {
  return getProviderDefinition(type).family;
}

export function getDefaultProviderId(type: AIProviderType): string | null {
  return getProviderDefinition(type).defaultProviderId;
}

export function cloneSettings(settings: AISettings): AISettings {
  return normalizeAISettings(settings);
}

export function getProviderConnectionSummary(provider: AIProviderRecord): string {
  const definition = getProviderDefinition(provider.type);
  if (definition.authStrategy === "native-runtime") {
    return `${definition.label}: ${provider.type === "anthropic-plan" ? "Claude Code" : "Antigravity CLI"} on this computer`;
  }
  if (provider.type === "openai-plan" && isOpenAIPlanReconnectRequired(provider)) {
    return `${definition.label}: reconnect required`;
  }
  if (provider.oauth?.accessToken || provider.oauth?.refreshToken) return `${definition.label}: connected`;
  if (provider.apiKey) return `${definition.label}: key set`;
  if (definition.authStrategy === "none") return `${definition.label}: ready`;
  return `${definition.label}: not connected`;
}
