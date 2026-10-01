import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpenAIPlanCodexRequestBody,
  createOpenAIPlanHeaders,
  extractOpenAIPlanErrorMessage,
  parseOpenAIPlanCodexSse,
  resolveOpenAIPlanOAuth,
} from '../src/ai/openai-plan.ts';

function sse(events) {
  return events.map((event) => `event: message\ndata: ${JSON.stringify(event)}\n`).join('\n');
}

function fakeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`;
}

test('buildOpenAIPlanCodexRequestBody maps system messages to instructions and the rest to input text', () => {
  const body = buildOpenAIPlanCodexRequestBody({
    model: 'gpt-5.4',
    messages: [
      { role: 'system', content: 'Follow the house style.' },
      { role: 'user', content: 'Question one' },
      { role: 'assistant', content: 'Interim answer' },
      { role: 'user', content: 'Question two' },
    ],
    temperature: 0.3,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'Card Output',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
  });

  assert.equal(body.model, 'gpt-5.4');
  assert.equal(body.instructions, 'Follow the house style.');
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.temperature, undefined);
  assert.equal(body.text, undefined);
  assert.deepEqual(body.input, [
    {
      role: 'user',
      content: [{ type: 'input_text', text: 'Question one' }],
    },
    {
      role: 'assistant',
      content: 'Interim answer',
    },
    {
      role: 'user',
      content: [{ type: 'input_text', text: 'Question two' }],
    },
  ]);
});

test('extractOpenAIPlanErrorMessage surfaces backend JSON error messages', () => {
  const message = extractOpenAIPlanErrorMessage(
    JSON.stringify({
      error: {
        message: 'Unknown parameter: text.format',
        type: 'invalid_request_error',
        code: 'unknown_parameter',
      },
    }),
  );

  assert.equal(message, 'Unknown parameter: text.format');
});

test('createOpenAIPlanHeaders uses the OAuth access token and optional account id', async () => {
  const result = await createOpenAIPlanHeaders({
    oauth: {
      accessToken: 'oauth-access-token',
      refreshToken: 'refresh-token',
      accountId: 'acct_123',
      expiresAt: Date.now() + 10 * 60_000,
    },
  });

  assert.equal(result.headers.Authorization, 'Bearer oauth-access-token');
  assert.equal(result.headers['ChatGPT-Account-Id'], 'acct_123');
  assert.equal(result.headers['Content-Type'], 'application/json');
});

test('parseOpenAIPlanCodexSse collects final assistant text from buffered SSE data', () => {
  const payload = [
    'event: message',
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    '',
    'event: message',
    'data: {"type":"response.output_text.delta","delta":" world"}',
    '',
    'event: message',
    'data: {"type":"response.completed"}',
    '',
  ].join('\n');

  const parsed = parseOpenAIPlanCodexSse(payload);

  assert.equal(parsed.content, 'Hello world');
  assert.deepEqual(parsed.annotations, undefined);
});

test('buildOpenAIPlanCodexRequestBody sends the reasoning effort, including GPT-6 levels', () => {
  const body = buildOpenAIPlanCodexRequestBody({
    model: 'gpt-6.1-sol',
    messages: [{ role: 'user', content: 'Hi' }],
    reasoning_effort: 'max',
  });

  assert.deepEqual(body.reasoning, { effort: 'max' });
});

test('a token inside the refresh window is refreshed and the rotated token returned', async () => {
  const now = 1_000_000;
  const calls = [];
  const oauth = await resolveOpenAIPlanOAuth({
    now,
    oauth: { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: now + 30_000, accountId: 'acct_old' },
    refresh: async (refreshToken) => {
      calls.push(refreshToken);
      return {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        id_token: fakeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_new' } }),
      };
    },
  });

  assert.deepEqual(calls, ['old-refresh']);
  assert.equal(oauth.accessToken, 'new-access');
  assert.equal(oauth.refreshToken, 'new-refresh');
  assert.equal(oauth.expiresAt, now + 3_600_000);
  assert.equal(oauth.accountId, 'acct_new');
});

test('a refresh that does not rotate keeps the previous refresh token', async () => {
  const now = 1_000_000;
  const oauth = await resolveOpenAIPlanOAuth({
    now,
    oauth: { accessToken: 'old-access', refreshToken: 'keep-me', expiresAt: now - 1, accountId: 'acct_1' },
    refresh: async () => ({ access_token: 'new-access' }),
  });

  assert.equal(oauth.refreshToken, 'keep-me');
  assert.equal(oauth.accountId, 'acct_1');
});

test('an expired token without a refresh handler fails clearly', async () => {
  await assert.rejects(
    resolveOpenAIPlanOAuth({ oauth: { accessToken: 'a', refreshToken: 'r', expiresAt: 0 } }),
    /refresh is unavailable/,
  );
  await assert.rejects(resolveOpenAIPlanOAuth({ oauth: { accessToken: '', refreshToken: '' } }), /Connect OpenAI Plan/);
  await assert.rejects(
    resolveOpenAIPlanOAuth({ oauth: { accessToken: 'a', expiresAt: 0 } }),
    /Reconnect OpenAI Plan/,
  );
});

test('a failed response never returns its partial text', () => {
  const payload = sse([
    { type: 'response.output_text.delta', delta: 'Half an ans' },
    { type: 'response.failed', response: { error: { message: 'The model gpt-6.1-sol is not available for this client.' } } },
  ]);

  assert.throws(() => parseOpenAIPlanCodexSse(payload), /not available for this client/);
});

test('an error event without content surfaces its message', () => {
  assert.throws(
    () => parseOpenAIPlanCodexSse(sse([{ type: 'error', error: { message: 'Rate limit reached' } }])),
    /Rate limit reached/,
  );
});

test('the completed response text wins over streamed deltas', () => {
  const payload = sse([
    { type: 'response.output_text.delta', delta: 'draft' },
    {
      type: 'response.completed',
      response: { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] },
    },
  ]);

  assert.equal(parseOpenAIPlanCodexSse(payload).content, '{"ok":true}');
});
