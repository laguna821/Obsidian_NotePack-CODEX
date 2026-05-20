import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpenAIPlanCodexRequestBody,
  createOpenAIPlanHeaders,
  extractOpenAIPlanErrorMessage,
  parseOpenAIPlanCodexSse,
} from '../src/ai/openai-plan.ts';

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
      expiresAt: Date.now() + 60_000,
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
