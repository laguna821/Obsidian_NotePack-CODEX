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

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

const OPENAI_PLAN_MODEL_ID = "openai-plan/gpt-5-5-plan";
// Plan endpoint rejects `gpt-5.5-instant`; only the thinking variant works.
// Auto-migrate users off legacy or broken model IDs to the working default.
const LEGACY_OPENAI_PLAN_MODEL_IDS = new Set<string>([
  "openai-plan/gpt-5-2-plan",
  "openai-plan/gpt-5-4-plan",
  "openai-plan/gpt-5-5-instant-plan",
]);

const ANTHROPIC_PLAN_MODEL_ID = "anthropic-plan/claude-sonnet-4-5-plan";
// No active legacy Claude Plan model migrations right now. 4.6 used to be
// quarantined here, but it is back in the catalog as an explicit choice.
const LEGACY_ANTHROPIC_PLAN_MODEL_IDS = new Set<string>([]);

// Gemini Plan = Code Assist. Code Assist has its OWN model catalog separate
// from AI Studio; verified with a live probe (2026-05-13): only models that
// return 200 or 429 on this endpoint are real. 404 = the model name doesn't
// exist on Code Assist regardless of what AI Studio shows.
const GEMINI_PLAN_FALLBACK_MODEL_ID = "gemini-plan/gemini-2-5-flash-plan";
// IDs we shipped that turn out to be unsupported on Code Assist — remove them
// from any persisted chatModels list and re-point annotation agents that
// reference them onto the fallback.
const LEGACY_GEMINI_PLAN_MODEL_IDS = new Set<string>([
  "gemini-plan/gemini-3-1-flash-lite-plan",
]);
// Stored chatModels entries with these IDs may have a stale `model` field
// (server-side identifier) baked in from earlier plugin versions; force the
// canonical Code Assist name back onto them so the request envelope sends a
// name Code Assist actually knows.
const GEMINI_PLAN_MODEL_FIELD_OVERRIDES: Record<string, string> = {
  "gemini-plan/gemini-3-flash-plan": "gemini-3-flash-preview",
  "gemini-plan/gemini-3-pro-preview-plan": "gemini-3-pro-preview",
};

const PROVIDER_DEFINITIONS: Record<AIProviderType, AIProviderDefinition> = {
  "anthropic-plan": {
    type: "anthropic-plan",
    label: "Claude Plan",
    defaultProviderId: "anthropic-plan",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "oauth",
    family: "anthropic",
    mobileSupported: false,
    warning:
      "Anthropic subscription access via third-party clients can be risky. Connect only if you understand the account risk.",
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
    // Gemini Plan uses Google's internal Code Assist API (the same backend
    // that gemini-cli talks to), NOT the public Gemini API. The OAuth token
    // returned by the consumer-friendly login is only valid for this host.
    defaultBaseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    requiresApiKey: false,
    requiresBaseUrl: false,
    authStrategy: "oauth",
    family: "gemini",
    mobileSupported: false,
    warning:
      "Gemini 구독 계정으로 Google 로그인하면 됩니다. 아래 BYO 필드는 비워두면 기본(Gemini CLI 공개 OAuth 클라이언트)으로 자동 연결되고, 본인 GCP 프로젝트 자격증명을 쓰려면 직접 입력하세요.",
    additionalSettings: [
      {
        label: "BYO OAuth Client ID (고급, 선택)",
        key: "geminiByoClientId",
        type: "text",
        required: false,
        placeholder: "(비워두면 기본값 사용)",
        description: "직접 GCP에서 발급한 OAuth 2.0 Desktop 클라이언트를 쓰고 싶을 때만 입력.",
      },
      {
        label: "BYO OAuth Client Secret (고급, 선택)",
        key: "geminiByoClientSecret",
        type: "text",
        required: false,
        placeholder: "(비워두면 기본값 사용)",
        description: "위 Client ID와 짝이 되는 secret. 둘 다 입력해야 BYO가 활성화됩니다.",
      },
    ],
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

export const DEFAULT_CHAT_MODELS: AIChatModel[] = [
  createChatModel(
    "openrouter/openai-gpt-4o",
    "openrouter",
    "openrouter",
    "GPT-4o via OpenRouter",
    "openai/gpt-4o",
    {
      description: "Balanced default for NotePack",
      supportsGrounding: true,
      supportsJsonSchema: true,
      supportsAnnotations: true,
    },
  ),
  createChatModel(
    "openrouter/anthropic-claude-sonnet-4-5",
    "openrouter",
    "openrouter",
    "Claude Sonnet 4.5 via OpenRouter",
    "anthropic/claude-sonnet-4-5",
    {
      supportsJsonSchema: true,
    },
  ),
  createChatModel(
    "openrouter/google-gemini-2.5-pro",
    "openrouter",
    "openrouter",
    "Gemini 2.5 Pro via OpenRouter",
    "google/gemini-2.5-pro",
    {
      supportsGrounding: true,
      supportsJsonSchema: true,
      supportsAnnotations: true,
    },
  ),
  // Claude Plan models keep extended thinking OFF by default. When thinking is
  // enabled, Anthropic forces temperature=1; providers.ts honors that contract
  // by omitting temperature on thinking calls, so flipping thinking on per
  // model is safe but trades the per-call temperature for fixed-1 sampling.
  createChatModel(
    "anthropic-plan/claude-sonnet-4-5-plan",
    "anthropic-plan",
    "anthropic-plan",
    "Claude Sonnet 4.5 (Plan)",
    "claude-sonnet-4-5",
    {},
  ),
  createChatModel(
    "anthropic-plan/claude-sonnet-4-6-plan",
    "anthropic-plan",
    "anthropic-plan",
    "Claude Sonnet 4.6 (Plan)",
    "claude-sonnet-4-6",
    {},
  ),
  createChatModel(
    "anthropic-plan/claude-opus-4-5-plan",
    "anthropic-plan",
    "anthropic-plan",
    "Claude Opus 4.5 (Plan)",
    "claude-opus-4-5",
    {},
  ),
  createChatModel(
    "anthropic-plan/claude-haiku-4-5-plan",
    "anthropic-plan",
    "anthropic-plan",
    "Claude Haiku 4.5 (Plan)",
    "claude-haiku-4-5",
    {},
  ),
  createChatModel(
    OPENAI_PLAN_MODEL_ID,
    "openai-plan",
    "openai-plan",
    "GPT-5.5 (Plan)",
    "gpt-5.5",
    {},
  ),
  createChatModel(
    "gemini-plan/gemini-2-5-flash-plan",
    "gemini-plan",
    "gemini-plan",
    "Gemini 2.5 Flash (Plan)",
    "gemini-2.5-flash",
    {
      supportsGrounding: true,
    },
  ),
  createChatModel(
    "gemini-plan/gemini-2-5-pro-plan",
    "gemini-plan",
    "gemini-plan",
    "Gemini 2.5 Pro (Plan)",
    "gemini-2.5-pro",
    {
      supportsGrounding: true,
    },
  ),
  createChatModel(
    "gemini-plan/gemini-3-flash-plan",
    "gemini-plan",
    "gemini-plan",
    "Gemini 3 Flash (Plan)",
    "gemini-3-flash-preview",
    {
      supportsGrounding: true,
    },
  ),
  createChatModel(
    "gemini-plan/gemini-3-pro-preview-plan",
    "gemini-plan",
    "gemini-plan",
    "Gemini 3 Pro Preview (Plan)",
    "gemini-3-pro-preview",
    {
      supportsGrounding: true,
    },
  ),
  createChatModel("anthropic/claude-opus-4-5", "anthropic", "anthropic", "Claude Opus 4.5", "claude-opus-4-5"),
  createChatModel("anthropic/claude-sonnet-4-5", "anthropic", "anthropic", "Claude Sonnet 4.5", "claude-sonnet-4-5"),
  createChatModel("anthropic/claude-haiku-4-5", "anthropic", "anthropic", "Claude Haiku 4.5", "claude-haiku-4-5"),
  createChatModel("openai/gpt-5.5-instant", "openai", "openai", "GPT-5.5 Instant", "gpt-5.5-instant", {
    supportsJsonSchema: true,
  }),
  createChatModel("openai/gpt-5.5", "openai", "openai", "GPT-5.5", "gpt-5.5", {
    supportsJsonSchema: true,
  }),
  createChatModel("openai/gpt-5", "openai", "openai", "GPT-5", "gpt-5", {
    supportsJsonSchema: true,
  }),
  createChatModel("openai/gpt-5-mini", "openai", "openai", "GPT-5 Mini", "gpt-5-mini", {
    supportsJsonSchema: true,
  }),
  createChatModel("openai/gpt-4o", "openai", "openai", "GPT-4o", "gpt-4o", {
    supportsGrounding: true,
    groundingModelId: "gpt-4o-search-preview",
    supportsJsonSchema: true,
    supportsAnnotations: true,
  }),
  createChatModel("openai/gpt-4o-mini", "openai", "openai", "GPT-4o Mini", "gpt-4o-mini", {
    supportsGrounding: true,
    groundingModelId: "gpt-4o-mini-search-preview",
    supportsJsonSchema: true,
    supportsAnnotations: true,
  }),
  createChatModel("openai/gpt-4.1", "openai", "openai", "GPT-4.1", "gpt-4.1", {
    supportsJsonSchema: true,
  }),
  createChatModel("openai/gpt-4.1-mini", "openai", "openai", "GPT-4.1 Mini", "gpt-4.1-mini", {
    supportsJsonSchema: true,
  }),
  createChatModel("openai/o4-mini", "openai", "openai", "o4-mini", "o4-mini", {
    supportsJsonSchema: true,
    reasoning: { enabled: true, reasoning_effort: "medium" },
  }),
  createChatModel("gemini/gemini-2.5-pro", "gemini", "gemini", "Gemini 2.5 Pro", "gemini-2.5-pro", {
    supportsGrounding: true,
  }),
  createChatModel("gemini/gemini-2.5-flash", "gemini", "gemini", "Gemini 2.5 Flash", "gemini-2.5-flash", {
    supportsGrounding: true,
  }),
  createChatModel("deepseek/deepseek-chat", "deepseek", "deepseek", "DeepSeek Chat", "deepseek-chat"),
  createChatModel("deepseek/deepseek-reasoner", "deepseek", "deepseek", "DeepSeek Reasoner", "deepseek-reasoner"),
  createChatModel("xai/grok-4-1-fast", "xai", "xai", "Grok 4.1 Fast", "grok-4-1-fast"),
  createChatModel("xai/grok-4-1-fast-non-reasoning", "xai", "xai", "Grok 4.1 Fast Non-Reasoning", "grok-4-1-fast-non-reasoning"),
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
    merged.set(model.id, cloneChatModel(model));
  });
  return [...merged.values()];
}

function migrateLegacyPlanModels(candidate?: Partial<AISettings>): Partial<AISettings> | undefined {
  if (!candidate) return candidate;

  const migrated: Partial<AISettings> = { ...candidate };

  if (candidate.activeChatModelId) {
    if (LEGACY_OPENAI_PLAN_MODEL_IDS.has(candidate.activeChatModelId)) {
      migrated.activeChatModelId = OPENAI_PLAN_MODEL_ID;
    } else if (LEGACY_ANTHROPIC_PLAN_MODEL_IDS.has(candidate.activeChatModelId)) {
      migrated.activeChatModelId = ANTHROPIC_PLAN_MODEL_ID;
    } else if (LEGACY_GEMINI_PLAN_MODEL_IDS.has(candidate.activeChatModelId)) {
      migrated.activeChatModelId = GEMINI_PLAN_FALLBACK_MODEL_ID;
    }
  }

  if (candidate.chatModels) {
    migrated.chatModels = candidate.chatModels
      .filter(
        (model) =>
          !LEGACY_OPENAI_PLAN_MODEL_IDS.has(model.id) &&
          !LEGACY_ANTHROPIC_PLAN_MODEL_IDS.has(model.id) &&
          !LEGACY_GEMINI_PLAN_MODEL_IDS.has(model.id),
      )
      .map((model) => {
        const cloned = cloneChatModel(model);
        const canonicalModel = GEMINI_PLAN_MODEL_FIELD_OVERRIDES[cloned.id];
        if (canonicalModel) {
          // The `model` field is the server-side identifier sent to Code
          // Assist; never let a stored stale value win over the catalog.
          cloned.model = canonicalModel;
        }
        return cloned;
      });
  }

  if (candidate.annotationAgents) {
    migrated.annotationAgents = candidate.annotationAgents.map((agent) => {
      if (agent?.modelId && LEGACY_GEMINI_PLAN_MODEL_IDS.has(agent.modelId)) {
        return { ...agent, modelId: GEMINI_PLAN_FALLBACK_MODEL_ID };
      }
      return agent;
    });
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
  const migratedCandidate = migrateLegacyPlanModels(candidate);
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

export function migrateLegacyAISettings(candidate?: Partial<LegacyAISettings> | AISettings): AISettings {
  if (
    candidate &&
    "providers" in candidate &&
    Array.isArray((candidate as AISettings).providers) &&
    "chatModels" in candidate
  ) {
    return normalizeAISettings(candidate as AISettings);
  }

  const legacy = candidate as Partial<LegacyAISettings> | undefined;
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
    managedProjectId: provider.oauth?.managedProjectId,
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
  if (provider.type === "openai-plan" && isOpenAIPlanReconnectRequired(provider)) {
    return `${definition.label}: reconnect required`;
  }
  if (provider.oauth?.accessToken || provider.oauth?.refreshToken) return `${definition.label}: connected`;
  if (provider.apiKey) return `${definition.label}: key set`;
  if (definition.authStrategy === "none") return `${definition.label}: ready`;
  return `${definition.label}: not connected`;
}
