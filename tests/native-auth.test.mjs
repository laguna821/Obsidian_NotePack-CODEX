import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAUDE_ORGANIZATION_PLAN_ALLOWED_EVIDENCE,
  CLAUDE_ORGANIZATION_PLAN_OPT_IN_EVIDENCE,
  assertRuntimeAuthAllowed,
  classifyAntigravityCatalog,
  classifyClaudeAuthStatus,
  inspectClaudeManagedSettings,
  parseAntigravityModels,
  prepareNativePlanEnvironment,
  verifyClaudePlanAuth,
} from '../src/ai/native/auth.ts';

// Shape of `claude auth status` in Claude Code 2.1.285, with fake values.
function authStatus(overrides = {}) {
  return JSON.stringify({
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    analyticsDisabled: false,
    projectsDirectory: '/home/user/.claude/projects',
    configDirectory: '/home/user/.claude',
    email: 'user@example.com',
    orgId: '00000000-0000-0000-0000-000000000000',
    orgName: 'Example',
    subscriptionType: 'max',
    ...overrides,
  });
}

const cleanEnvironment = prepareNativePlanEnvironment('claude', { PATH: '/usr/bin' });

// ── Environment ───────────────────────────────────────────────────────────

test('credential and routing variables are withheld from the CLI and reported by name', () => {
  const prepared = prepareNativePlanEnvironment('claude', {
    PATH: '/usr/bin',
    anthropic_api_key: 'sk-secret',
    ANTHROPIC_BASE_URL: 'https://gateway.example',
    CLAUDE_CODE_USE_BEDROCK: '0',
    CLAUDE_CODE_USE_VERTEX: 'false',
    CLAUDE_CODE_OAUTH_TOKEN: '   ',
  });

  assert.deepEqual(prepared.blockedVariables, ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL']);
  assert.deepEqual(Object.keys(prepared.env), ['PATH']);
  assert.equal(JSON.stringify(prepared).includes('sk-secret'), false);
});

test('Gemini Plan withholds Google API and Cloud project variables', () => {
  const prepared = prepareNativePlanEnvironment('gemini', {
    GEMINI_API_KEY: 'g-key',
    GOOGLE_CLOUD_PROJECT: 'billing-project',
    GOOGLE_GEMINI_BASE_URL: 'https://gateway.example',
    GOOGLE_GENAI_USE_VERTEXAI: 'false',
    HOME: '/home/user',
  });

  assert.deepEqual(prepared.blockedVariables, ['GEMINI_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_GEMINI_BASE_URL']);
  assert.deepEqual(Object.keys(prepared.env), ['HOME']);
});

// ── Claude auth status classification ─────────────────────────────────────

test('Pro and Max logins are allowed', () => {
  for (const subscriptionType of ['pro', 'max']) {
    const decision = classifyClaudeAuthStatus(authStatus({ subscriptionType }), cleanEnvironment);
    assert.equal(decision.allowed, true, subscriptionType);
    assert.equal(decision.code, 'subscription');
  }
});

test('Team and Enterprise logins wait for opt-in with an organization message', () => {
  for (const subscriptionType of ['team', 'enterprise']) {
    const decision = classifyClaudeAuthStatus(authStatus({ subscriptionType }), cleanEnvironment);
    assert.equal(decision.allowed, false, subscriptionType);
    assert.equal(decision.status, 'billing-blocked');
    assert.equal(decision.code, 'organization-opt-in-required');
    assert.match(decision.reason, /Team or Enterprise organization account/);
    assert.doesNotMatch(decision.reason, /API|gateway|helper/i);
    assert.ok(decision.evidence.includes(CLAUDE_ORGANIZATION_PLAN_OPT_IN_EVIDENCE));
  }
});

test('Team and Enterprise logins are allowed after opt-in on this device', () => {
  for (const subscriptionType of ['team', 'enterprise']) {
    const decision = classifyClaudeAuthStatus(authStatus({ subscriptionType }), cleanEnvironment, {
      allowOrganizationPlans: true,
    });
    assert.equal(decision.allowed, true, subscriptionType);
    assert.equal(decision.code, 'organization-subscription');
    assert.ok(decision.evidence.includes(CLAUDE_ORGANIZATION_PLAN_ALLOWED_EVIDENCE));
  }
});

test('billing markers block every plan, opt-in or not', () => {
  const cases = [
    { apiKeySource: 'ANTHROPIC_API_KEY' },
    { apiProvider: 'bedrock' },
    { authMethod: 'api_key' },
    { allowedProviders: ['anthropic', 'gateway'] },
    { forcedLoginMethod: 'console' },
    { gatewayUrl: 'https://gateway.example' },
    { account: { billingType: 'usage' } },
  ];
  for (const overrides of cases) {
    for (const subscriptionType of ['max', 'team']) {
      const decision = classifyClaudeAuthStatus(authStatus({ subscriptionType, ...overrides }), cleanEnvironment, {
        allowOrganizationPlans: true,
      });
      assert.equal(decision.allowed, false, JSON.stringify(overrides));
      assert.equal(decision.code, 'billing-marker', JSON.stringify(overrides));
    }
  }
});

test('policy fields pass only with their first-party values', () => {
  const decision = classifyClaudeAuthStatus(
    authStatus({ subscriptionType: 'team', forcedLoginMethod: 'claudeai', allowedProviders: ['anthropic'] }),
    cleanEnvironment,
    { allowOrganizationPlans: true },
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'organization-subscription');
});

test('signed-out, unknown, and incomplete statuses fail closed', () => {
  assert.equal(classifyClaudeAuthStatus(JSON.stringify({ loggedIn: false }), cleanEnvironment).code, 'login-required');
  assert.equal(classifyClaudeAuthStatus('Logged in as someone', cleanEnvironment).code, 'unknown-schema');
  assert.equal(
    classifyClaudeAuthStatus(authStatus({ subscriptionType: null }), cleanEnvironment).code,
    'subscription-unknown',
  );
  assert.equal(
    classifyClaudeAuthStatus(authStatus({ subscriptionType: 'free' }), cleanEnvironment).code,
    'billing-marker',
  );
});

test('an environment override outranks the account type', () => {
  const environment = prepareNativePlanEnvironment('claude', { ANTHROPIC_AUTH_TOKEN: 't' });
  const decision = classifyClaudeAuthStatus(authStatus({ subscriptionType: 'team' }), environment, {
    allowOrganizationPlans: true,
  });

  assert.equal(decision.code, 'environment-override');
  assert.deepEqual(decision.evidence, ['environment variable present: ANTHROPIC_AUTH_TOKEN']);
});

// ── verifyClaudePlanAuth ──────────────────────────────────────────────────

function authRunner(stdout, exitCode = 0) {
  const calls = [];
  const runner = async (options) => {
    calls.push(options.args);
    return { stdout, stderr: '', exitCode };
  };
  return { runner, calls };
}

test('environment overrides are rejected before Claude Code runs', async () => {
  const { runner, calls } = authRunner(authStatus());
  const decision = await verifyClaudePlanAuth('/bin/claude', {
    environment: prepareNativePlanEnvironment('claude', { ANTHROPIC_API_KEY: 'k' }),
    runner,
    managedSettingsInspector: () => [],
  });

  assert.equal(decision.code, 'environment-override');
  assert.deepEqual(calls, []);
});

test('managed settings block personal plans but keep the organization flow', async () => {
  const inspector = () => ['managed settings file present'];

  const personal = await verifyClaudePlanAuth('/bin/claude', {
    environment: cleanEnvironment,
    runner: authRunner(authStatus({ subscriptionType: 'max' })).runner,
    managedSettingsInspector: inspector,
  });
  assert.equal(personal.allowed, false);
  assert.equal(personal.code, 'managed-settings');

  const waiting = await verifyClaudePlanAuth('/bin/claude', {
    environment: cleanEnvironment,
    runner: authRunner(authStatus({ subscriptionType: 'team' })).runner,
    managedSettingsInspector: inspector,
  });
  assert.equal(waiting.code, 'organization-opt-in-required');
  assert.ok(waiting.evidence.includes('managed settings file present'));

  const allowed = await verifyClaudePlanAuth('/bin/claude', {
    environment: cleanEnvironment,
    runner: authRunner(authStatus({ subscriptionType: 'enterprise' })).runner,
    managedSettingsInspector: inspector,
    allowOrganizationPlans: true,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.code, 'organization-subscription');
});

test('a failing managed-settings inspection fails closed for personal plans', async () => {
  const decision = await verifyClaudePlanAuth('/bin/claude', {
    environment: cleanEnvironment,
    runner: authRunner(authStatus()).runner,
    managedSettingsInspector: () => {
      throw new Error('registry unavailable');
    },
  });

  assert.equal(decision.code, 'managed-settings');
  assert.deepEqual(decision.evidence, ['managed settings inspection failed closed']);
});

test('a non-zero auth status exit means sign-in is required', async () => {
  const { runner, calls } = authRunner('', 1);
  const decision = await verifyClaudePlanAuth('/bin/claude', {
    environment: cleanEnvironment,
    runner,
    managedSettingsInspector: () => [],
  });

  assert.equal(decision.status, 'login-required');
  assert.deepEqual(calls, [['auth', 'status']]);
  assert.throws(() => assertRuntimeAuthAllowed('claude', decision), /Claude Plan request blocked/);
});

test('managed settings are detected on Windows without reading them', () => {
  const join = (...parts) => parts.join('\\');
  const evidence = inspectClaudeManagedSettings({
    platform: 'win32',
    programFiles: 'C:\\Program Files',
    existsSync: (path) => path === 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
    readdirSync: () => [],
    joinPath: join,
    spawnSync: (_command, args) =>
      args[1].startsWith('HKLM') ? { status: 0 } : { status: null, error: new Error('spawn failed') },
  });

  assert.deepEqual(evidence, [
    'machine policy registry present',
    'managed settings file present',
    'user policy registry inspection failed closed',
  ]);

  const clean = inspectClaudeManagedSettings({
    platform: 'win32',
    existsSync: () => false,
    readdirSync: () => [],
    joinPath: join,
    spawnSync: () => ({ status: 1 }),
  });
  assert.deepEqual(clean, []);
});

// ── Antigravity ───────────────────────────────────────────────────────────

const AGY_MODELS_OUTPUT = [
  '\u001b[1mAvailable models\u001b[0m',
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
  'gemini-3.1-pro-high\tGemini 3.1 Pro (High)',
  'claude-sonnet-5-5\tClaude Sonnet 5.5',
  'gpt-oss-120b\tGPT-OSS 120B',
  'gemini-3.8-flash-high\tduplicate',
  'gemini-3.6-flash-low   Gemini 3.6 Flash (Low)',
  '',
].join('\n');

test('agy models output keeps only Gemini models with their labels', () => {
  assert.deepEqual(parseAntigravityModels(AGY_MODELS_OUTPUT), [
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
    { id: 'gemini-3.6-flash-low', label: 'Gemini 3.6 Flash (Low)' },
  ]);
});

test('Antigravity catalog decisions', () => {
  assert.equal(classifyAntigravityCatalog(0, AGY_MODELS_OUTPUT, AGY_MODELS_OUTPUT).code, 'catalog-ready');
  assert.equal(classifyAntigravityCatalog(1, 'Error: not signed in', '').code, 'login-required');
  assert.equal(classifyAntigravityCatalog(1, 'unexpected failure', '').code, 'catalog-unavailable');
  assert.equal(classifyAntigravityCatalog(0, 'claude-sonnet-5-5\tClaude', 'claude-sonnet-5-5\tClaude').code, 'catalog-unavailable');
  const cloud = classifyAntigravityCatalog(0, `${AGY_MODELS_OUTPUT}\nquota project: my-project`, AGY_MODELS_OUTPUT);
  assert.equal(cloud.code, 'billing-marker');
  assert.equal(cloud.allowed, false);
});
