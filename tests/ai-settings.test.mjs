import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROVIDER_CATALOG,
  DEFAULT_CHAT_MODELS,
  buildAIConfig,
  buildAIConfigForModel,
  migrateLegacyAISettings,
  normalizeAISettings,
  resolveActiveChatModel,
  resolveChatModelById,
  canExecuteActiveModel,
  getActiveModelExecutionState,
  getModelExecutionState,
} from '../src/ai/settings-registry.ts';
import { createDefaultAnnotationAgents, getPersonaPreset } from '../src/ai/personas.ts';
import {
  buildEffectiveWorkbenchSettings,
  getDifficultyInstruction,
  getLanguageInstruction,
  getPackDifficultyInstruction,
  getSequentialConversationInstruction,
} from '../src/data/runtime-settings.ts';

test('migrateLegacyAISettings preserves a legacy OpenAI setup', () => {
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
  assert.equal(migrated.activeChatModelId, 'openai/gpt-4o');
  assert.equal(migrated.webGrounding, true);
  assert.equal(migrated.globalDifficulty, 3);
  assert.equal(migrated.packExploration, 3);
  assert.equal(migrated.packRisk, undefined);
  assert.equal(migrated.packPityEnabled, false);
  assert.equal(migrated.uiLanguage, 'en');
});

test('default annotation agents create two enabled personas across four slots', () => {
  const agents = createDefaultAnnotationAgents('openai/gpt-5-mini');

  assert.equal(agents.length, 4);
  assert.deepEqual(agents.map((agent) => agent.enabled), [true, true, false, false]);
  assert.equal(agents[0].personaPresetId, 'friendly-tutor');
  assert.equal(agents[1].personaPresetId, 'skeptical-reader');
  assert.equal(agents.every((agent) => agent.modelId === 'openai/gpt-5-mini'), true);
  assert.equal(getPersonaPreset('film-critic').label, 'Film critic');
});

test('normalizeAISettings fills annotation defaults and language defaults', () => {
  const normalized = normalizeAISettings({
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openrouter/openai-gpt-4o',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  });

  assert.equal(normalized.annotationMode, 'parallel');
  assert.equal(normalized.annotationLanguageMode, 'auto-source');
  assert.equal(normalized.packLanguageMode, 'auto-source');
  assert.equal(normalized.annotationAgents.length, 4);
  assert.equal(normalized.annotationAgents.filter((agent) => agent.enabled).length, 2);
});

test('runtime settings use global annotation defaults when the codex file has no local agents', () => {
  const settings = normalizeAISettings({
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openrouter/openai-gpt-4o',
    annotationMode: 'sequential',
    annotationLanguageMode: 'fixed',
    fixedAnnotationLanguage: 'en',
    packLanguageMode: 'bilingual',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  });

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
  assert.equal(runtime.annotationAgents.filter((agent) => agent.enabled).length, 2);
});

test('difficulty and language instructions expose the v2 control semantics', () => {
  assert.match(getDifficultyInstruction(1), /elementary-school/i);
  assert.match(getDifficultyInstruction(1), /No academic jargon/i);
  assert.match(getDifficultyInstruction(1), /concrete everyday example/i);
  assert.match(getDifficultyInstruction(1), /1-2 short sentences/i);
  assert.match(getDifficultyInstruction(5), /expert-level/i);
  assert.equal(getLanguageInstruction('fixed', 'ko', 'English'), 'Korean');
  assert.equal(getLanguageInstruction('bilingual', undefined, 'English'), 'Korean and English');
});

test('pack difficulty keeps rarity separate from visible difficulty', () => {
  const levelOne = getPackDifficultyInstruction(1);

  assert.match(levelOne, /Rarity is not difficulty/i);
  assert.match(levelOne, /young student/i);
  assert.match(levelOne, /Do not expose engine terms/i);
  assert.match(levelOne, /Legendary card should be a big question in simple words/i);
});

test('sequential conversation instruction requires a real response turn', () => {
  const instruction = getSequentialConversationInstruction(1, true, true);

  assert.match(instruction, /Turn 2/i);
  assert.match(instruction, /respond to one previous agent/i);
  assert.match(instruction, /not instructions to obey/i);
  assert.match(instruction, /final turn/i);
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
});

test('default built-in OpenAI Plan model uses GPT-5.4', () => {
  const model = DEFAULT_CHAT_MODELS.find((item) => item.providerId === 'openai-plan');

  assert.ok(model);
  assert.equal(model.id, 'openai-plan/gpt-5-4-plan');
  assert.equal(model.label, 'GPT-5.4 (Plan)');
  assert.equal(model.model, 'gpt-5.4');
  assert.equal(model.supportsJsonSchema, false);
  assert.equal(
    DEFAULT_CHAT_MODELS.some((item) => item.id === 'openai-plan/gpt-5-2-plan'),
    false,
  );
});

test('normalizeAISettings migrates legacy OpenAI Plan model IDs to GPT-5.4 without duplicates', () => {
  const migrated = normalizeAISettings({
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: [
      ...structuredClone(DEFAULT_CHAT_MODELS).filter((item) => item.id !== 'openai-plan/gpt-5-4-plan'),
      {
        id: 'openai-plan/gpt-5-2-plan',
        providerType: 'openai-plan',
        providerId: 'openai-plan',
        label: 'GPT-5.2 (Plan)',
        model: 'gpt-5.2',
        supportsGrounding: false,
        supportsJsonSchema: false,
        supportsJsonObject: true,
        supportsAnnotations: false,
      },
    ],
    activeChatModelId: 'openai-plan/gpt-5-2-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  });

  assert.equal(migrated.activeChatModelId, 'openai-plan/gpt-5-4-plan');
  assert.equal(
    migrated.chatModels.some((item) => item.id === 'openai-plan/gpt-5-2-plan'),
    false,
  );

  const openaiPlanModels = migrated.chatModels.filter((item) => item.providerId === 'openai-plan');
  assert.equal(openaiPlanModels.filter((item) => item.id === 'openai-plan/gpt-5-4-plan').length, 1);
});

test('resolveActiveChatModel returns provider and model metadata for a valid active model', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openrouter/openai-gpt-4o',
    webGrounding: true,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const openrouterProvider = settings.providers.find((provider) => provider.id === 'openrouter');
  openrouterProvider.apiKey = 'sk-or-test';

  const resolved = resolveActiveChatModel(settings);

  assert.ok(resolved);
  assert.equal(resolved.provider.id, 'openrouter');
  assert.equal(resolved.model.id, 'openrouter/openai-gpt-4o');
  assert.equal(canExecuteActiveModel(settings), true);
});

test('model-specific execution helpers resolve non-active annotation models', () => {
  const settings = normalizeAISettings({
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openrouter/openai-gpt-4o',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  });

  const openaiProvider = settings.providers.find((provider) => provider.id === 'openai');
  openaiProvider.apiKey = 'sk-openai-test';

  const resolved = resolveChatModelById(settings, 'openai/gpt-5-mini');
  const state = getModelExecutionState(settings, 'openai/gpt-5-mini');
  const config = buildAIConfigForModel(settings, 'openai/gpt-5-mini');

  assert.ok(resolved);
  assert.equal(resolved.model.id, 'openai/gpt-5-mini');
  assert.equal(state.canExecute, true);
  assert.ok(config);
  assert.equal(config.modelId, 'gpt-5-mini');
  assert.equal(config.providerId, 'openai');
});

test('resolveActiveChatModel falls back when the active model is missing', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'missing-model',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const resolved = resolveActiveChatModel(settings);

  assert.ok(resolved);
  assert.equal(resolved.model.id, 'openrouter/openai-gpt-4o');
});

test('canExecuteActiveModel rejects providers that require credentials but have none', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai/gpt-5',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  assert.equal(canExecuteActiveModel(settings), false);
});

test('getActiveModelExecutionState explains when an API-key model is missing credentials', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai/gpt-5',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const state = getActiveModelExecutionState(settings);

  assert.equal(state.canExecute, false);
  assert.equal(state.code, 'missing_api_key');
});

test('getActiveModelExecutionState explains when a plan model is missing OAuth', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai-plan/gpt-5-4-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const state = getActiveModelExecutionState(settings);

  assert.equal(state.canExecute, false);
  assert.equal(state.code, 'missing_oauth');
});

test('openai-plan OAuth access token is enough for execution without generated API keys', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai-plan/gpt-5-4-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const provider = settings.providers.find((item) => item.id === 'openai-plan');
  provider.oauth = {
    accessToken: 'oauth-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
  };

  const state = getActiveModelExecutionState(settings);

  assert.equal(state.canExecute, true);
  assert.equal(state.code, 'ready');

  const config = buildAIConfig(settings);
  assert.ok(config);
  assert.equal(config.authToken, 'oauth-access-token');
  assert.equal(config.supportsJsonSchema, false);
});

test('buildAIConfig uses OAuth access token for openai-plan execution', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai-plan/gpt-5-4-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const provider = settings.providers.find((item) => item.id === 'openai-plan');
  provider.oauth = {
    accessToken: 'oauth-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
  };

  const config = buildAIConfig(settings);

  assert.ok(config);
  assert.equal(config.providerType, 'openai-plan');
  assert.equal(config.authToken, 'oauth-access-token');
});

test('openai-plan expired access token stays executable when a refresh token exists', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai-plan/gpt-5-4-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const provider = settings.providers.find((item) => item.id === 'openai-plan');
  provider.oauth = {
    accessToken: 'oauth-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() - 60_000,
  };

  const state = getActiveModelExecutionState(settings);

  assert.equal(state.canExecute, true);
  assert.equal(state.code, 'ready');
});

test('openai-plan without both access and refresh token requires reconnect', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'openai-plan/gpt-5-4-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const provider = settings.providers.find((item) => item.id === 'openai-plan');
  provider.oauth = {
    accessToken: '',
    refreshToken: '',
  };

  const state = getActiveModelExecutionState(settings);

  assert.equal(state.canExecute, false);
  assert.equal(state.code, 'missing_oauth');
  assert.match(state.message, /Connect the active plan provider/i);
});

test('gemini-plan still uses its OAuth access token directly', () => {
  const settings = {
    providers: structuredClone(DEFAULT_PROVIDER_CATALOG),
    chatModels: structuredClone(DEFAULT_CHAT_MODELS),
    activeChatModelId: 'gemini-plan/gemini-3-pro-preview-plan',
    webGrounding: false,
    packRisk: 2,
    packPityEnabled: true,
    promotionFolder: 'Cards',
    uiLanguage: 'ko',
  };

  const provider = settings.providers.find((item) => item.id === 'gemini-plan');
  provider.oauth = {
    accessToken: 'gemini-oauth-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
    email: 'user@example.com',
  };

  const config = buildAIConfig(settings);

  assert.ok(config);
  assert.equal(config.providerType, 'gemini-plan');
  assert.equal(config.authToken, 'gemini-oauth-token');
});
