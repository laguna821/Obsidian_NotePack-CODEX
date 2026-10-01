import test from 'node:test';
import assert from 'node:assert/strict';

import { ClaudePlanRequestBlockedError } from '../src/ai/native/claude.ts';
import { NativeRuntimeService, assertClaudeVersionSupportsModel, parseVersion } from '../src/ai/native/runtime.ts';

const CLAUDE = '/home/me/.local/bin/claude';
const AGY = '/home/me/.local/bin/agy';

function authStatus(subscriptionType, extra = {}) {
  return JSON.stringify({
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    email: 'user@example.com',
    orgId: 'org',
    orgName: 'Example',
    subscriptionType,
    ...extra,
  });
}

const INIT = { type: 'system', subtype: 'init', model: 'claude-sonnet-5-5', apiKeySource: 'none', tools: [], mcp_servers: [] };
const RESULT = { type: 'result', subtype: 'success', is_error: false, result: 'OK' };

/**
 * A fake desktop: a Claude Code and an Antigravity install that answer the
 * calls NotePack makes. `state` can be changed between calls.
 */
function fakeDesktop(state = {}) {
  const config = {
    files: [CLAUDE, AGY],
    env: { PATH: '/usr/bin', HOME: '/home/me' },
    claudeVersion: '2.1.285 (Claude Code)',
    auth: authStatus('max'),
    authExit: 0,
    claudeEvents: [INIT, RESULT],
    agyModels: 'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\nclaude-sonnet-5-5\tClaude Sonnet 5.5\n',
    managed: [],
    ...state,
  };
  const calls = [];
  const written = new Map();
  const store = new Map();
  let now = 1_000_000;
  let tempCounter = 0;

  const runner = async (options) => {
    calls.push(options);
    const args = options.args;
    if (args[0] === '--version') {
      return { stdout: options.executable === CLAUDE ? `${config.claudeVersion}\n` : '1.2.14\n', stderr: '', exitCode: 0 };
    }
    if (args[0] === 'auth' && args[1] === 'status') {
      if (config.beforeAuth) await config.beforeAuth();
      return { stdout: config.auth, stderr: '', exitCode: config.authExit };
    }
    if (args[0] === 'models') {
      return { stdout: config.agyModels, stderr: '', exitCode: 0 };
    }
    if (options.executable === CLAUDE) {
      for (const event of config.claudeEvents) {
        if (options.signal?.aborted) break;
        options.onStdoutLine?.(JSON.stringify(event));
      }
      if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    options.onStdoutLine?.(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'GEMINI_OK' } }));
    return { stdout: '', stderr: '', exitCode: 0 };
  };

  const service = new NativeRuntimeService({
    runner,
    processEnv: () => ({ ...config.env }),
    platform: 'linux',
    homedir: () => '/home/me',
    pathDelimiter: ':',
    joinPath: (...parts) => parts.join('/'),
    isFile: (path) => config.files.includes(path),
    managedSettingsInspector: () => config.managed,
    makeTempDir: () => `/tmp/run-${(tempCounter += 1)}`,
    removeDir: (path) => written.set(`removed:${path}`, true),
    writeFile: (path, content) => written.set(path, content),
    store: {
      get: (key) => store.get(key),
      set: (key, value) => (value === undefined ? store.delete(key) : store.set(key, value)),
    },
    now: () => now,
    openTerminal: (command, onError) => {
      written.set('terminal', command);
      if (config.terminalFails) onError(new Error('spawn x-terminal-emulator ENOENT'));
    },
  });

  const authCalls = () => calls.filter((call) => call.args[0] === 'auth').length;
  return {
    service,
    config,
    calls,
    written,
    store,
    authCalls,
    advance: (ms) => {
      now += ms;
    },
  };
}

const claudeRequest = { model: 'sonnet', effort: 'medium', systemPrompt: 'S', prompt: 'P' };

test('a missing CLI is reported as not installed', async () => {
  const desktop = fakeDesktop({ files: [] });
  const snapshot = await desktop.service.diagnose('claude');

  assert.equal(snapshot.status, 'not-installed');
  assert.equal(desktop.calls.length, 0);
});

test('a Max login is ready and the check is reused for a minute', async () => {
  const desktop = fakeDesktop();
  const snapshot = await desktop.service.diagnose('claude');

  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.version, '2.1.285 (Claude Code)');
  assert.equal(snapshot.executablePath, CLAUDE);
  assert.equal(await desktop.service.completeWithClaude(claudeRequest), 'OK');
  assert.equal(await desktop.service.completeWithClaude(claudeRequest), 'OK');
  assert.equal(desktop.authCalls(), 1);

  const request = desktop.calls.find((call) => call.args[0] === '-p');
  assert.equal(request.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(request.cwd, '/tmp/run-1');
  assert.ok(desktop.written.get('removed:/tmp/run-1'));
});

test('an expired check that now blocks is never served from the old cache', async () => {
  const desktop = fakeDesktop();
  await desktop.service.diagnose('claude');
  desktop.config.auth = JSON.stringify({ loggedIn: false });
  desktop.config.authExit = 1;
  desktop.advance(61_000);

  await assert.rejects(desktop.service.completeWithClaude(claudeRequest), /Claude Plan request blocked: Sign in/);
  assert.equal(desktop.service.getSnapshot('claude').status, 'login-required');
  await assert.rejects(desktop.service.completeWithClaude(claudeRequest), /Claude Plan request blocked/);
});

test('credential variables in the environment block Claude Plan and never reach the CLI', async () => {
  const desktop = fakeDesktop({ env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-secret' } });
  const snapshot = await desktop.service.diagnose('claude');

  assert.equal(snapshot.status, 'blocked');
  assert.equal(snapshot.decision.code, 'environment-override');
  assert.equal(desktop.authCalls(), 0);
  assert.equal(desktop.calls.every((call) => !('ANTHROPIC_API_KEY' in call.env)), true);
});

test('a Team login needs device opt-in, and opted-in requests require the init check', async () => {
  const desktop = fakeDesktop({ auth: authStatus('team'), claudeEvents: [RESULT] });

  const waiting = await desktop.service.diagnose('claude');
  assert.equal(waiting.status, 'blocked');
  assert.equal(waiting.decision.code, 'organization-opt-in-required');
  await assert.rejects(desktop.service.completeWithClaude(claudeRequest), /Team or Enterprise organization account/);

  desktop.service.setClaudeOrganizationPlans(true);
  assert.equal(desktop.service.allowsClaudeOrganizationPlans(), true);
  assert.deepEqual([...desktop.store.entries()], [['notepack-codex:native-runtime-consent:claude-organization-plan', 'v1']]);
  const allowed = await desktop.service.diagnose('claude');
  assert.equal(allowed.status, 'ready');
  assert.equal(allowed.decision.code, 'organization-subscription');

  // Without the init event the organization answer is discarded.
  await assert.rejects(desktop.service.completeWithClaude(claudeRequest), ClaudePlanRequestBlockedError);
  desktop.config.claudeEvents = [INIT, RESULT];
  assert.equal(await desktop.service.completeWithClaude(claudeRequest), 'OK');

  desktop.service.setClaudeOrganizationPlans(false);
  assert.equal(desktop.store.size, 0);
  await assert.rejects(desktop.service.completeWithClaude(claudeRequest), /Team or Enterprise/);
});

test('revoking Team consent during a check never lets the old verdict run requests', async () => {
  let releaseAuth;
  let authStarted;
  const started = new Promise((resolve) => {
    authStarted = resolve;
  });
  const desktop = fakeDesktop({
    auth: authStatus('team'),
    beforeAuth: () => {
      authStarted();
      return new Promise((resolve) => {
        releaseAuth = resolve;
      });
    },
  });
  desktop.service.setClaudeOrganizationPlans(true);

  const request = desktop.service.completeWithClaude(claudeRequest);
  await started;
  desktop.service.setClaudeOrganizationPlans(false);
  desktop.config.beforeAuth = undefined;
  releaseAuth();

  await assert.rejects(request, /Team or Enterprise organization account/);
  assert.equal(desktop.calls.some((call) => call.args[0] === '-p'), false);
  assert.equal(desktop.service.getSnapshot('claude').decision.code, 'organization-opt-in-required');
  await assert.rejects(desktop.service.completeWithClaude(claudeRequest), /Team or Enterprise/);
});

test('pinned models check the installed Claude Code version', async () => {
  const desktop = fakeDesktop({ claudeVersion: '2.1.270 (Claude Code)' });

  await assert.rejects(
    desktop.service.completeWithClaude({ ...claudeRequest, model: 'claude-opus-5-5' }),
    /Claude Opus 5\.5 needs Claude Code 2\.1\.280 or later \(installed: 2\.1\.270\)/,
  );
  assert.equal(await desktop.service.completeWithClaude({ ...claudeRequest, model: 'claude-fable-5-1' }), 'OK');
  assert.equal(await desktop.service.completeWithClaude({ ...claudeRequest, model: 'opus' }), 'OK');
});

test('long system prompts go through a temporary file', async () => {
  const desktop = fakeDesktop();
  const systemPrompt = 'rule\n'.repeat(3000);
  await desktop.service.completeWithClaude({ ...claudeRequest, systemPrompt });

  const request = desktop.calls.find((call) => call.args[0] === '-p');
  const index = request.args.indexOf('--system-prompt-file');
  assert.ok(index > 0);
  assert.equal(request.args[index + 1], '/tmp/run-1/system-prompt.md');
  assert.equal(desktop.written.get('/tmp/run-1/system-prompt.md'), systemPrompt);
  assert.equal(request.args.includes(systemPrompt), false);
});

test('Gemini Plan lists Antigravity Gemini models and answers requests', async () => {
  const desktop = fakeDesktop();
  const snapshot = await desktop.service.diagnose('gemini');

  assert.equal(snapshot.status, 'ready');
  assert.deepEqual(snapshot.models, [{ id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' }]);
  assert.equal(
    await desktop.service.completeWithGemini({ model: 'gemini-3.8-flash-medium', systemPrompt: 'S', prompt: 'P' }),
    'GEMINI_OK',
  );
});

test('custom paths and login terminals use the device store', () => {
  const desktop = fakeDesktop({ files: ['/opt/claude'] });
  desktop.service.setCustomPath('claude', ' /opt/claude ');

  assert.equal(desktop.service.getCustomPath('claude'), '/opt/claude');
  assert.equal(desktop.service.resolveExecutable('claude'), '/opt/claude');
  const manual = [];
  desktop.service.openLoginTerminal('claude', (command) => manual.push(command));
  assert.match(desktop.written.get('terminal'), /\/opt\/claude.* auth login$/);
  assert.deepEqual(manual, []);
  desktop.config.terminalFails = true;
  desktop.service.openLoginTerminal('claude', (command) => manual.push(command));
  assert.equal(manual.length, 1);
  assert.match(manual[0], /\/opt\/claude.* auth login$/);
  assert.throws(() => desktop.service.openLoginTerminal('gemini', () => {}), /Antigravity CLI is not installed/);
});

test('version helpers', () => {
  assert.deepEqual(parseVersion('2.1.285 (Claude Code)'), [2, 1, 285]);
  assert.equal(parseVersion('unknown'), undefined);
  assert.doesNotThrow(() => assertClaudeVersionSupportsModel('claude-sonnet-5-5', '2.1.280'));
  assert.doesNotThrow(() => assertClaudeVersionSupportsModel('claude-sonnet-5-5', undefined));
  assert.throws(() => assertClaudeVersionSupportsModel('claude-fable-5-1', '2.1.256'), /2\.1\.257/);
});
