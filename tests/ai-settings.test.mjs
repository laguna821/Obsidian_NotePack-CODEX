import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROVIDER_CATALOG,
  DEFAULT_CHAT_MODELS,
  buildAIConfig,
  buildAIConfigForModel,
  getProviderConnectionSummary,
  getProviderDefinition,
  migrateLegacyAISettings,
  normalizeAISettings,
  resolveActiveChatModel,
  resolveChatModelById,
  canExecuteActiveModel,
  getActiveModelExecutionState,
  getModelExecutionState,
  setNativeRuntimeAvailability,
} from '../src/ai/settings-registry.ts';
import { RETIRED_MODEL_REPLACEMENTS, replaceRetiredModelId } from '../src/ai/model-retirement.ts';
import { createDefaultAnnotationAgents, normalizeAnnotationAgents } from '../src/ai/personas.ts';
import {
  buildEffectiveWorkbenchSettings,
  getDifficultyInstruction,
  getLanguageInstruction,
  getPackDifficultyInstruction,
  getSequentialConversationInstruction,
} from '../src/data/runtime-settings.ts';

const DEFAULT_MODEL_ID = 'openrouter/openai-gpt-6-1-sol';

function baseSettings(overrides = {}) {
  return {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: DEFAULT_MODEL_ID,
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
    ...overrides,
  };
}

test('migrateLegacyAISettings preserves a legacy OpenAI setup and moves retired models forward', () => {
  const migrated = migrateLegacyAISettings({
    provider: 'openai',
    apiKey: 'sk-test',
    modelId: 'gpt-4o',
    webGrounding: true,
    customBaseUrl: '',
    packRisk: 3,
    packPityEnabled: false,
    promotionFolder: 'Cards',
    uiLanguage: 'en',
  });

  assert.equal(migrated.providers.some((provider) => provider.id === 'openai' && provider.apiKey === 'sk-test'), true);
  assert.equal(migrated.activeChatModelId, 'openai/gpt-6-1-sol');
  assert.equal(migrated.webGrounding, true);
  assert.equal(migrated.packExploration, 3);
  assert.equal(migrated.packRisk, undefined);
  assert.equal(migrated.packPityEnabled, false);
  assert.equal(migrated.uiLanguage, 'en');
});

test('default annotation agents start with one agent on the given model', () => {
  const agents = createDefaultAnnotationAgents('openai/gpt-6-luna');

  assert.equal(agents.length, 1);
  assert.equal(agents[0].label, 'AI 1');
  assert.equal(agents[0].modelId, 'openai/gpt-6-luna');
});

test('normalizeAISettings fills annotation defaults and language defaults', () => {
  const normalized = normalizeAISettings(baseSettings());

  assert.equal(normalized.annotationMode, 'parallel');
  assert.equal(normalized.annotationLanguageMode, 'auto-source');
  assert.equal(normalized.packLanguageMode, 'auto-source');
  assert.equal(normalized.annotationAgents.length, 1);
  assert.equal(normalized.annotationAgents[0].modelId, DEFAULT_MODEL_ID);
});

test('runtime settings use global annotation defaults when the codex file has no local agents', () => {
  const settings = normalizeAISettings(baseSettings({
    annotationMode: 'sequential',
    annotationLanguageMode: 'fixed',
    fixedAnnotationLanguage: 'en',
    packLanguageMode: 'bilingual',
  }));

  const runtime = buildEffectiveWorkbenchSettings(settings, {
    useGlobalDifficulty: true,
    useGlobalPackExploration: true,
    annotationMode: 'parallel',
    annotationLanguageMode: 'auto-source',
    packLanguageMode: 'auto-source',
    annotationAgents: [],
  });

  assert.equal(runtime.annotationMode, 'sequential');
  assert.equal(runtime.annotationLanguageMode, 'fixed');
  assert.equal(runtime.fixedAnnotationLanguage, 'en');
  assert.equal(runtime.packLanguageMode, 'bilingual');
  assert.equal(runtime.annotationAgents.length, 1);
});

test('difficulty and language instructions expose the control semantics', () => {
  assert.match(getDifficultyInstruction(1), /elementary-school/i);
  assert.match(getDifficultyInstruction(1), /No academic/i);
  assert.match(getDifficultyInstruction(1), /concrete real-life example/i);
  assert.match(getDifficultyInstruction(1), /1-2 short sentences/i);
  assert.match(getDifficultyInstruction(5), /graduate student or domain expert/i);
  assert.equal(getLanguageInstruction('fixed', 'ko', 'English'), 'Korean');
  assert.equal(getLanguageInstruction('bilingual', undefined, 'English'), 'Korean and English');
});

test('pack difficulty keeps rarity separate from visible difficulty', () => {
  const levelOne = getPackDifficultyInstruction(1);

  assert.match(levelOne, /Rarity is not difficulty/i);
  assert.match(levelOne, /elementary-school student/i);
  assert.match(levelOne, /TOPIC of the card must match the difficulty/i);
  assert.match(levelOne, /Legendary card is a BIG kid question/i);
});

test('sequential conversation instruction requires a real response turn', () => {
  const instruction = getSequentialConversationInstruction(1, true, true);

  assert.match(instruction, /Turn 2/i);
  assert.match(instruction, /PUSH BACK/);
  assert.match(instruction, /Name the previous agent/i);
  assert.match(instruction, /FINAL turn/);
  assert.equal(getSequentialConversationInstruction(undefined, false, false), '');
  assert.match(getSequentialConversationInstruction(0, false, false), /You open the debate/);
});

test('migrateLegacyAISettings carries over providerKeys for alternate providers', () => {
  const migrated = migrateLegacyAISettings({
    provider: 'openrouter',
    apiKey: 'or-live',
    modelId: 'openai/gpt-4o',
    webGrounding: false,
    customBaseUrl: '',
    providerKeys: {
      openai: 'sk-openai',
      ollama: '',
    },
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  });

  const openaiProvider = migrated.providers.find((provider) => provider.id === 'openai');
  assert.ok(openaiProvider);
  assert.equal(openaiProvider.apiKey, 'sk-openai');
  assert.equal(migrated.activeChatModelId, DEFAULT_MODEL_ID);
});

// ── 4.0 model catalog ──────────────────────────────────────────────────────

test('the default model is GPT-6.1 Sol via OpenRouter', () => {
  assert.equal(DEFAULT_CHAT_MODELS[0].id, DEFAULT_MODEL_ID);
  assert.equal(DEFAULT_CHAT_MODELS[0].model, 'openai/gpt-6.1-sol');
  assert.equal(normalizeAISettings({}).activeChatModelId, DEFAULT_MODEL_ID);
});

test('built-in model IDs are unique', () => {
  const ids = DEFAULT_CHAT_MODELS.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('plan catalogs ship the current Claude, GPT, and Gemini models', () => {
  const byProvider = (providerId) =>
    DEFAULT_CHAT_MODELS.filter((model) => model.providerId === providerId).map((model) => model.model);

  assert.deepEqual(byProvider('anthropic-plan'), [
    'sonnet',
    'opus',
    'haiku',
    'fable',
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-fable-5-1',
  ]);
  assert.deepEqual(byProvider('openai-plan'), ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5.6-sol']);
  assert.deepEqual(byProvider('gemini-plan'), ['gemini-3.1-pro-high', 'gemini-3.8-flash-medium']);
  assert.equal(DEFAULT_CHAT_MODELS.some((model) => /gpt-5\.5|claude-.*-4-5-plan|gemini-2/.test(model.id)), false);
});

test('Claude 4.6+ catalog entries use adaptive effort instead of a token budget', () => {
  for (const id of ['anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'anthropic-plan/claude-opus-5-5-plan']) {
    const model = DEFAULT_CHAT_MODELS.find((item) => item.id === id);
    assert.ok(model, id);
    assert.equal(model.thinking?.effort, 'medium', id);
    assert.equal(model.thinking?.budget_tokens, undefined, id);
  }
});

test('every retired model maps to a model that still ships', () => {
  const shipped = new Set(DEFAULT_CHAT_MODELS.map((model) => model.id));
  for (const [retired, replacement] of Object.entries(RETIRED_MODEL_REPLACEMENTS)) {
    assert.equal(shipped.has(retired), false, `${retired} is still shipped`);
    assert.equal(shipped.has(replacement), true, `${retired} -> ${replacement} does not ship`);
  }
  assert.equal(replaceRetiredModelId('my-custom/model'), 'my-custom/model');
});

test('normalizeAISettings moves retired selections forward and is repeatable', () => {
  const stored = baseSettings({
    activeChatModelId: 'openai-plan/gpt-5-5-plan',
    chatModels: [
      ...structuredClone(DEFAULT_CHAT_MODELS),
      {
        id: 'openai-plan/gpt-5-5-plan',
        providerType: 'openai-plan',
        providerId: 'openai-plan',
        label: 'GPT-5.5 (Plan)',
        model: 'gpt-5.5',
        supportsGrounding: false,
        supportsJsonSchema: false,
        supportsJsonObject: true,
        supportsAnnotations: false,
      },
    ],
    annotationAgents: [
      { id: 'agent-1', label: 'AI 1', modelId: 'anthropic-plan/claude-sonnet-4-5-plan', order: 1 },
      { id: 'agent-2', label: 'AI 2', modelId: 'gemini-plan/gemini-3-pro-preview-plan', order: 2 },
      { id: 'agent-3', label: 'Mine', modelId: 'custom/my-model', order: 3 },
    ],
  });

  const once = normalizeAISettings(stored);
  // GPT-5.6 Sol is verified on the OpenAI Plan connection; GPT-6 may be gated.
  assert.equal(once.activeChatModelId, 'openai-plan/gpt-5-6-sol-plan');
  assert.equal(once.chatModels.some((model) => model.id === 'openai-plan/gpt-5-5-plan'), false);
  assert.deepEqual(once.annotationAgents.map((agent) => agent.modelId), [
    'anthropic-plan/claude-sonnet-latest-plan',
    'gemini-plan/gemini-3-1-pro-high-plan',
    'custom/my-model',
  ]);

  const twice = normalizeAISettings(once);
  assert.deepEqual(twice, once);
});

test('stored copies of built-in models cannot override the shipped catalog', () => {
  const stale = structuredClone(DEFAULT_CHAT_MODELS).map((model) =>
    model.id === 'openai-plan/gpt-6-1-sol-plan' ? { ...model, label: 'Old label', model: 'gpt-5.5' } : model,
  );
  const normalized = normalizeAISettings(baseSettings({ chatModels: stale }));
  const model = normalized.chatModels.find((item) => item.id === 'openai-plan/gpt-6-1-sol-plan');

  assert.equal(model.label, 'GPT-6.1 Sol (Plan)');
  assert.equal(model.model, 'gpt-6.1-sol');
});

test('custom models survive normalization', () => {
  const custom = {
    id: 'openai/my-finetune',
    providerType: 'openai',
    providerId: 'openai',
    label: 'My fine-tune',
    model: 'ft:gpt-6-luna:me',
    supportsGrounding: false,
    supportsJsonSchema: true,
    supportsJsonObject: true,
    supportsAnnotations: false,
  };
  const normalized = normalizeAISettings(baseSettings({ chatModels: [...structuredClone(DEFAULT_CHAT_MODELS), custom] }));

  const stored = normalized.chatModels.find((model) => model.id === custom.id);
  assert.ok(stored);
  assert.equal(stored.label, custom.label);
  assert.equal(stored.model, custom.model);
});

test('.codex agents naming retired models are repaired on load', () => {
  const agents = normalizeAnnotationAgents(
    [{ id: 'a', label: 'Reader', modelId: 'openai/gpt-5-mini', order: 1 }],
    DEFAULT_MODEL_ID,
    { withDefaults: false },
  );

  assert.equal(agents[0].modelId, 'openai/gpt-6-luna');
});

// ── Execution state ───────────────────────────────────────────────────────

test('resolveActiveChatModel returns provider and model metadata for a valid active model', () => {
  const settings = baseSettings();
  settings.providers.find((provider) => provider.id === 'openrouter').apiKey = 'sk-or-test';

  const resolved = resolveActiveChatModel(settings);

  assert.ok(resolved);
  assert.equal(resolved.provider.id, 'openrouter');
  assert.equal(resolved.model.id, DEFAULT_MODEL_ID);
  assert.equal(canExecuteActiveModel(settings), true);
});

test('model-specific execution helpers resolve non-active annotation models', () => {
  const settings = normalizeAISettings(baseSettings());
  settings.providers.find((provider) => provider.id === 'openai').apiKey = 'sk-openai-test';

  const resolved = resolveChatModelById(settings, 'openai/gpt-6-luna');
  const state = getModelExecutionState(settings, 'openai/gpt-6-luna');
  const config = buildAIConfigForModel(settings, 'openai/gpt-6-luna');

  assert.ok(resolved);
  assert.equal(resolved.model.id, 'openai/gpt-6-luna');
  assert.equal(state.canExecute, true);
  assert.ok(config);
  assert.equal(config.modelId, 'gpt-6-luna');
  assert.equal(config.providerId, 'openai');
});

test('resolveActiveChatModel falls back when the active model is missing', () => {
  const resolved = resolveActiveChatModel(baseSettings({ activeChatModelId: 'missing-model' }));

  assert.ok(resolved);
  assert.equal(resolved.model.id, DEFAULT_MODEL_ID);
});

test('API-key models without a key cannot run and say why', () => {
  const settings = baseSettings({ activeChatModelId: 'openai/gpt-6-1-sol' });

  assert.equal(canExecuteActiveModel(settings), false);
  const state = getActiveModelExecutionState(settings);
  assert.equal(state.canExecute, false);
  assert.equal(state.code, 'missing_api_key');
});

test('an OpenAI Plan model without OAuth asks to connect', () => {
  const state = getActiveModelExecutionState(baseSettings({ activeChatModelId: 'openai-plan/gpt-6-1-sol-plan' }));

  assert.equal(state.canExecute, false);
  assert.equal(state.code, 'missing_oauth');
  assert.match(state.message, /Connect the active plan provider/i);
});

test('an OpenAI Plan access token is enough to run', () => {
  const settings = baseSettings({ activeChatModelId: 'openai-plan/gpt-6-1-sol-plan' });
  settings.providers.find((item) => item.id === 'openai-plan').oauth = {
    accessToken: 'oauth-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 600_000,
  };

  const state = getActiveModelExecutionState(settings);
  assert.equal(state.canExecute, true);
  assert.equal(state.code, 'ready');

  const config = buildAIConfig(settings);
  assert.ok(config);
  assert.equal(config.providerType, 'openai-plan');
  assert.equal(config.authToken, 'oauth-access-token');
  assert.equal(config.supportsJsonSchema, false);
});

test('an expired OpenAI Plan token stays runnable while a refresh token exists', () => {
  const settings = baseSettings({ activeChatModelId: 'openai-plan/gpt-6-1-sol-plan' });
  settings.providers.find((item) => item.id === 'openai-plan').oauth = {
    accessToken: 'oauth-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() - 60_000,
  };

  const state = getActiveModelExecutionState(settings);
  assert.equal(state.canExecute, true);
  assert.equal(state.code, 'ready');
});

test('Claude and Gemini Plan run through the desktop CLIs without stored tokens', () => {
  for (const type of ['anthropic-plan', 'gemini-plan']) {
    const definition = getProviderDefinition(type);
    assert.equal(definition.authStrategy, 'native-runtime', type);
    assert.equal(definition.requiresApiKey, false, type);
    assert.equal(definition.defaultBaseUrl ?? '', '', type);
  }

  const settings = baseSettings({ activeChatModelId: 'anthropic-plan/claude-sonnet-latest-plan' });
  const state = getActiveModelExecutionState(settings);
  assert.equal(state.canExecute, true);
  assert.equal(state.code, 'native_check_required');

  const config = buildAIConfig(settings);
  assert.ok(config);
  assert.equal(config.providerType, 'anthropic-plan');
  assert.equal(config.modelId, 'sonnet');
  assert.equal(config.authToken, undefined);

  const provider = settings.providers.find((item) => item.id === 'gemini-plan');
  assert.match(getProviderConnectionSummary(provider), /Antigravity CLI on this computer/);
});

test('native Plan models report unsupported_platform on mobile', () => {
  setNativeRuntimeAvailability(false);
  try {
    const state = getActiveModelExecutionState(baseSettings({ activeChatModelId: 'gemini-plan/gemini-3-8-flash-medium-plan' }));
    assert.equal(state.canExecute, false);
    assert.equal(state.code, 'unsupported_platform');
  } finally {
    setNativeRuntimeAvailability(true);
  }
});
