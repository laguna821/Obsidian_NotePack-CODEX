import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CHAT_MODELS, DEFAULT_PROVIDER_CATALOG } from '../src/ai/settings-registry.ts';
import { GLOBAL_PLUGIN_SCHEMA_VERSION, migrateGlobalPluginData } from '../src/data/global-data.ts';

// Shape written by NotePack 3.0.3: plaintext plan tokens for all three plans.
function savedByNotePack303() {
  const providers = structuredClone(DEFAULT_PROVIDER_CATALOG).map((provider) => {
    if (provider.id === 'openai-plan') {
      return { ...provider, oauth: { accessToken: 'openai-access', refreshToken: 'openai-refresh', expiresAt: 1 } };
    }
    if (provider.id === 'anthropic-plan') {
      return { ...provider, oauth: { accessToken: 'claude-access', refreshToken: 'claude-refresh', expiresAt: 1 } };
    }
    if (provider.id === 'gemini-plan') {
      return {
        ...provider,
        oauth: { accessToken: 'gemini-access', refreshToken: 'gemini-refresh', expiresAt: 1, email: 'user@example.com' },
        additionalSettings: { geminiByoClientId: 'client-id', geminiByoClientSecret: 'client-secret', keep: 'yes' },
      };
    }
    return provider;
  });

  return {
    schemaVersion: 3,
    settings: {
      providers,
      chatModels: structuredClone(DEFAULT_CHAT_MODELS),
      activeChatModelId: 'anthropic-plan/claude-sonnet-4-5-plan',
      webGrounding: false,
      packPityEnabled: true,
      promotionFolder: 'Cards',
      uiLanguage: 'ko',
    },
    recentWorkbenchPaths: ['NotePack CODEX/a.codex'],
    defaultWorkbenchFolder: 'NotePack CODEX',
    legacyMigration: { status: 'completed', migratedProjectIds: [], migratedPaths: [] },
  };
}

function provider(data, id) {
  return data.settings.providers.find((item) => item.id === id);
}

test('4.0 deletes Claude and Gemini Plan tokens but keeps OpenAI Plan', () => {
  const result = migrateGlobalPluginData(savedByNotePack303());

  assert.equal(result.data.schemaVersion, GLOBAL_PLUGIN_SCHEMA_VERSION);
  assert.deepEqual(result.migrationsApplied, ['plan-oauth-tokens-removed']);
  assert.equal(provider(result.data, 'anthropic-plan').oauth, undefined);
  assert.equal(provider(result.data, 'gemini-plan').oauth, undefined);
  assert.deepEqual(provider(result.data, 'gemini-plan').additionalSettings, { keep: 'yes' });
  assert.equal(provider(result.data, 'openai-plan').oauth.refreshToken, 'openai-refresh');
  assert.equal(result.data.settings.activeChatModelId, 'anthropic-plan/claude-sonnet-latest-plan');
  assert.deepEqual(result.data.recentWorkbenchPaths, ['NotePack CODEX/a.codex']);

  const serialized = JSON.stringify(result.data);
  for (const secret of ['claude-access', 'claude-refresh', 'gemini-access', 'gemini-refresh', 'client-secret']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test('the migration is repeatable and quiet once tokens are gone', () => {
  const first = migrateGlobalPluginData(savedByNotePack303());
  const second = migrateGlobalPluginData(structuredClone(first.data));

  assert.deepEqual(second.migrationsApplied, []);
  assert.deepEqual(second.data, first.data);
});

test('tokens written back by a synced 3.x client are removed again', () => {
  const first = migrateGlobalPluginData(savedByNotePack303());
  const writtenBack = structuredClone(first.data);
  writtenBack.schemaVersion = 3;
  provider(writtenBack, 'anthropic-plan').oauth = { accessToken: 'claude-access-2' };

  const again = migrateGlobalPluginData(writtenBack);

  assert.deepEqual(again.migrationsApplied, ['plan-oauth-tokens-removed']);
  assert.equal(again.data.schemaVersion, GLOBAL_PLUGIN_SCHEMA_VERSION);
  assert.equal(provider(again.data, 'anthropic-plan').oauth, undefined);
});

test('tokens kept in the legacy data backup are removed too', () => {
  const saved = savedByNotePack303();
  const backupSettings = structuredClone(saved.settings);
  saved.legacyDataBackup = { projects: [], activeProjectId: '', settings: backupSettings };
  for (const item of saved.settings.providers) {
    if (item.id !== 'openai-plan') delete item.oauth;
    delete item.additionalSettings;
  }

  const result = migrateGlobalPluginData(saved);

  assert.deepEqual(result.migrationsApplied, ['plan-oauth-tokens-removed']);
  const backupProviders = result.data.legacyDataBackup.settings.providers;
  assert.equal(backupProviders.find((item) => item.id === 'anthropic-plan').oauth, undefined);
  assert.equal(backupProviders.find((item) => item.id === 'gemini-plan').oauth, undefined);
  assert.equal(backupProviders.find((item) => item.id === 'openai-plan').oauth.accessToken, 'openai-access');
});

test('fresh installs report no migrations', () => {
  const result = migrateGlobalPluginData(undefined);

  assert.equal(result.data.schemaVersion, GLOBAL_PLUGIN_SCHEMA_VERSION);
  assert.deepEqual(result.migrationsApplied, []);
});
