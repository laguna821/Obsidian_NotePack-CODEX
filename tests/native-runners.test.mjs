import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ClaudePlanRequestBlockedError,
  buildClaudeArgs,
  evaluateClaudeInitEvent,
  parseClaudeStreamEvent,
  runClaudeOnce,
} from '../src/ai/native/claude.ts';
import {
  ANTIGRAVITY_MAX_PROMPT_CHARS_WINDOWS,
  AntigravityPromptTooLongError,
  buildAgyArgs,
  extractAntigravityTextDelta,
  parseAgyError,
  runAgyOnce,
} from '../src/ai/native/antigravity.ts';
import { executableCandidates, resolveExecutable } from '../src/ai/native/resolver.ts';

const posixJoin = (...parts) => parts.join('/');
const winJoin = (...parts) => parts.join('\\');

const INIT = {
  type: 'system',
  subtype: 'init',
  model: 'claude-opus-5-5',
  apiKeySource: 'none',
  tools: [],
  mcp_servers: [],
};
const ASSISTANT = { type: 'assistant', message: { content: [{ type: 'text', text: '{"answer":' }, { type: 'text', text: '42}' }] } };
const RESULT = { type: 'result', subtype: 'success', is_error: false, result: '{"answer":42}' };

// Emits stream-json lines like Claude Code; stops early when the guard aborts.
function streamingRunner(events, { exitCode = 0, stderr = '' } = {}) {
  const calls = [];
  const runner = async (options) => {
    calls.push(options);
    for (const event of events) {
      if (options.signal?.aborted) break;
      options.onStdoutLine?.(typeof event === 'string' ? event : JSON.stringify(event));
    }
    if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    return { stdout: '', stderr, exitCode };
  };
  return { runner, calls };
}

function claudeRequest(runner, overrides = {}) {
  return runClaudeOnce(runner, {
    executablePath: '/bin/claude',
    env: { PATH: '/usr/bin' },
    cwd: '/tmp/run',
    model: 'claude-opus-5-5',
    effort: 'medium',
    systemPrompt: 'Answer in JSON.',
    prompt: 'What is the answer?',
    guard: { organization: false },
    timeoutMs: 1000,
    ...overrides,
  });
}

// ── Claude Code ───────────────────────────────────────────────────────────

test('Claude Code runs headless with no tools, MCP servers, or user settings', () => {
  const args = buildClaudeArgs({ model: 'opus', effort: 'high', systemPrompt: 'S' });

  assert.deepEqual(args.slice(0, 3), ['-p', '--setting-sources', '']);
  for (const flag of ['--strict-mcp-config', '--tools=', '--no-session-persistence', '--safe-mode', '--disable-slash-commands', '--no-chrome']) {
    assert.ok(args.includes(flag), flag);
  }
  assert.deepEqual(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2), ['--permission-mode', 'dontAsk']);
  assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', 'opus']);
  assert.deepEqual(args.slice(-4), ['--system-prompt', 'S', '--effort', 'high']);

  const fromFile = buildClaudeArgs({ model: 'claude-sonnet-5-5', systemPromptFile: '/tmp/s.md' });
  assert.ok(fromFile.includes('--system-prompt-file'));
  assert.equal(fromFile.includes('--system-prompt'), false);
  assert.equal(fromFile.includes('--effort'), false);
});

test('the init guard stops API-key sessions and organization MCP servers', () => {
  assert.equal(evaluateClaudeInitEvent(INIT, { organization: false }), undefined);
  assert.equal(evaluateClaudeInitEvent({ ...INIT, apiKeySource: undefined }, { organization: true }), undefined);
  assert.match(
    evaluateClaudeInitEvent({ ...INIT, apiKeySource: 'ANTHROPIC_API_KEY' }, { organization: false }),
    /API key source/,
  );
  assert.match(
    evaluateClaudeInitEvent({ ...INIT, mcp_servers: [{ name: 'org', status: 'connected' }] }, { organization: true }),
    /MCP servers/,
  );
  assert.match(evaluateClaudeInitEvent({ ...INIT, tools: ['mcp__org__search'] }, { organization: true }), /MCP servers/);
  // Personal plans rely on --strict-mcp-config instead of the MCP check.
  assert.equal(evaluateClaudeInitEvent({ ...INIT, mcp_servers: [{ name: 'x' }] }, { organization: false }), undefined);
});

test('stream events yield text, the final result, and errors', () => {
  assert.deepEqual(parseClaudeStreamEvent(ASSISTANT), { text: '{"answer":42}', error: undefined });
  assert.deepEqual(parseClaudeStreamEvent(RESULT), { finalText: '{"answer":42}', error: undefined });
  assert.deepEqual(parseClaudeStreamEvent({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Overloaded' }), {
    finalText: undefined,
    error: 'Overloaded',
  });
  assert.deepEqual(parseClaudeStreamEvent({ type: 'stream_event' }), {});
});

test('a Claude request sends the prompt on stdin and returns the final result', async () => {
  const { runner, calls } = streamingRunner([INIT, ASSISTANT, 'not json', RESULT]);
  const result = await claudeRequest(runner);

  assert.deepEqual(result, { content: '{"answer":42}', resolvedModel: 'claude-opus-5-5' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stdin, 'What is the answer?');
  assert.equal(calls[0].cwd, '/tmp/run');
  assert.ok(calls[0].args.includes('claude-opus-5-5'));
});

test('an API-key session is stopped and reported as blocked, not cancelled', async () => {
  const { runner } = streamingRunner([{ ...INIT, apiKeySource: 'apiKeyHelper' }, ASSISTANT, RESULT]);

  await assert.rejects(claudeRequest(runner), (error) => {
    assert.ok(error instanceof ClaudePlanRequestBlockedError);
    assert.match(error.message, /API key source/);
    return true;
  });
});

test('organization sessions must report their settings; personal ones need not', async () => {
  await assert.rejects(
    claudeRequest(streamingRunner([ASSISTANT, RESULT]).runner, { guard: { organization: true } }),
    ClaudePlanRequestBlockedError,
  );
  const personal = await claudeRequest(streamingRunner([ASSISTANT, RESULT]).runner);
  assert.equal(personal.content, '{"answer":42}');
  const organization = await claudeRequest(streamingRunner([INIT, RESULT]).runner, { guard: { organization: true } });
  assert.equal(organization.content, '{"answer":42}');
});

test('a user cancellation stays an AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(claudeRequest(streamingRunner([INIT, RESULT]).runner, { signal: controller.signal }), {
    name: 'AbortError',
  });
});

test('Claude failures surface their message', async () => {
  await assert.rejects(
    claudeRequest(streamingRunner([INIT, { type: 'result', subtype: 'error_max_turns', is_error: true, result: 'Usage limit reached' }]).runner),
    /Usage limit reached/,
  );
  await assert.rejects(
    claudeRequest(streamingRunner([], { exitCode: 1, stderr: 'line 1\nline 2\nError: model not found' }).runner),
    /model not found/,
  );
  await assert.rejects(claudeRequest(streamingRunner([INIT]).runner), /without returning an answer/);
});

// ── Antigravity ───────────────────────────────────────────────────────────

function agyRunner(events, { exitCode = 0, stderr = '' } = {}) {
  const calls = [];
  const runner = async (options) => {
    calls.push(options);
    for (const event of events) options.onStdoutLine?.(JSON.stringify(event));
    return { stdout: '', stderr, exitCode };
  };
  return { runner, calls };
}

function agyRequest(runner, overrides = {}) {
  return runAgyOnce(runner, {
    executablePath: '/bin/agy',
    env: {},
    cwd: '/tmp/run',
    model: 'gemini-3.8-flash-medium',
    systemPrompt: 'Be brief.',
    prompt: 'Hello',
    platform: 'linux',
    timeoutMs: 1000,
    ...overrides,
  });
}

test('Antigravity runs in plan mode with the prompt after -p', async () => {
  assert.deepEqual(buildAgyArgs({ prompt: 'P', model: 'gemini-3.1-pro-high' }), [
    '-p',
    'P',
    '--output-format',
    'stream-json',
    '--model',
    'gemini-3.1-pro-high',
    '--mode',
    'plan',
  ]);

  const { runner, calls } = agyRunner([
    { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'Hi' } },
    { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: ' there' } },
    { event: 'result', result: { status: 'SUCCESS', response: 'Hi there\n' } },
  ]);
  assert.deepEqual(await agyRequest(runner), { content: 'Hi there' });
  assert.equal(calls[0].args[1], 'Be brief.\n\nHello');
});

test('Antigravity deltas are used when no final response arrives', async () => {
  assert.equal(extractAntigravityTextDelta({ event: 'step_update', step_update: { text_delta: 'x' } }), 'x');
  const { runner } = agyRunner([{ event: 'step_update', step_update: { text_delta: 'partial answer' } }]);
  assert.deepEqual(await agyRequest(runner), { content: 'partial answer' });
});

test('Antigravity failures report AGY_ERROR details and failed statuses', async () => {
  assert.equal(parseAgyError('noise\nAGY_ERROR: {"message":"Quota exhausted for gemini-3.1-pro-high"}'), 'Quota exhausted for gemini-3.1-pro-high');
  assert.equal(parseAgyError('AGY_ERROR: plain text'), 'plain text');
  assert.equal(parseAgyError('no marker'), undefined);

  await assert.rejects(
    agyRequest(agyRunner([], { exitCode: 3, stderr: 'AGY_ERROR: {"message":"Quota exhausted"}' }).runner),
    /Quota exhausted/,
  );
  await assert.rejects(
    agyRequest(agyRunner([{ event: 'result', result: { status: 'RATE_LIMITED' } }]).runner),
    /RATE_LIMITED/,
  );
  await assert.rejects(
    agyRequest(agyRunner([{ event: 'result', result: { status: 'SOMETHING_SECRET user@example.com' } }]).runner),
    (error) => !error.message.includes('example.com'),
  );
});

test('long Gemini prompts fail before the Windows command-line limit', async () => {
  const long = 'x'.repeat(ANTIGRAVITY_MAX_PROMPT_CHARS_WINDOWS);
  const { runner, calls } = agyRunner([{ event: 'result', result: { status: 'SUCCESS', response: 'ok' } }]);

  await assert.rejects(agyRequest(runner, { prompt: long, platform: 'win32' }), AntigravityPromptTooLongError);
  assert.equal(calls.length, 0);
  assert.deepEqual(await agyRequest(runner, { prompt: long, platform: 'linux' }), { content: 'ok' });
});

// ── Executable discovery ──────────────────────────────────────────────────

test('Windows discovery prefers the native installer and only real .exe files on PATH', () => {
  const context = {
    platform: 'win32',
    home: 'C:\\Users\\me',
    env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PATH: 'C:\\npm;C:\\Tools;c:\\npm' },
    pathDelimiter: ';',
    joinPath: winJoin,
    isFile: (path) => path === 'C:\\Tools\\claude.exe',
  };
  const candidates = executableCandidates('claude', context);

  assert.equal(candidates[0], 'C:\\Users\\me\\.local\\bin\\claude.exe');
  assert.ok(candidates.includes('C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\claude.exe'));
  assert.equal(candidates.some((path) => path.endsWith('.cmd')), false);
  assert.equal(candidates.filter((path) => path.toLowerCase() === 'c:\\npm\\claude.exe').length, 1);
  assert.equal(resolveExecutable('claude', context), 'C:\\Tools\\claude.exe');
});

test('a custom executable path is tried first', () => {
  const context = {
    platform: 'linux',
    home: '/home/me',
    env: { PATH: '/usr/bin' },
    pathDelimiter: ':',
    joinPath: posixJoin,
    isFile: () => true,
    customPath: ' /opt/agy/bin/agy ',
  };

  assert.equal(resolveExecutable('gemini', context), '/opt/agy/bin/agy');
  assert.equal(executableCandidates('gemini', { ...context, customPath: undefined })[0], '/home/me/.local/bin/agy');
});
