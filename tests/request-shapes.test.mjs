import test from 'node:test';
import assert from 'node:assert/strict';

import {
  anthropicThinkingStyle,
  buildAnthropicMessagesBody,
  claudeCliEffort,
  rejectsSampling,
  splitMessagesForCli,
} from '../src/ai/request-shapes.ts';

const messages = [
  { role: 'system', content: 'Rules A' },
  { role: 'system', content: 'Rules B' },
  { role: 'user', content: 'Question' },
];

test('Claude models map to the thinking style their API accepts', () => {
  assert.equal(anthropicThinkingStyle('claude-opus-5-5'), 'adaptive');
  assert.equal(anthropicThinkingStyle('claude-sonnet-5-5'), 'adaptive');
  assert.equal(anthropicThinkingStyle('claude-opus-4-6'), 'adaptive');
  assert.equal(anthropicThinkingStyle('claude-sonnet-4-6'), 'adaptive');
  assert.equal(anthropicThinkingStyle('claude-fable-5-1'), 'always-on');
  assert.equal(anthropicThinkingStyle('claude-haiku-4-5'), 'budget');
  assert.equal(anthropicThinkingStyle('claude-sonnet-4-5'), 'budget');
});

test('adaptive models get thinking, an explicit effort, and no sampling or budget', () => {
  const body = buildAnthropicMessagesBody('claude-opus-5-5', { enabled: true, effort: 'high', budget_tokens: 8000 }, {
    messages,
    temperature: 0.7,
  });

  assert.deepEqual(body, {
    model: 'claude-opus-5-5',
    messages: [{ role: 'user', content: 'Question' }],
    system: 'Rules A\n\nRules B',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
  });
});

test('turning thinking off on adaptive models lowers effort instead of disabling it', () => {
  const body = buildAnthropicMessagesBody('claude-sonnet-5-5', { enabled: false }, { messages });

  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal(buildAnthropicMessagesBody('claude-sonnet-5-5', undefined, { messages }).output_config.effort, 'medium');
});

test('Fable omits the thinking parameter', () => {
  const body = buildAnthropicMessagesBody('claude-fable-5-1', { enabled: true, effort: 'max' }, { messages, temperature: 1 });

  assert.equal('thinking' in body, false);
  assert.equal('temperature' in body, false);
  assert.deepEqual(body.output_config, { effort: 'max' });
});

test('Haiku 4.5 keeps the token-budget shape', () => {
  const withThinking = buildAnthropicMessagesBody('claude-haiku-4-5', { enabled: true, budget_tokens: 2048 }, { messages, temperature: 0.2 });
  assert.deepEqual(withThinking.thinking, { type: 'enabled', budget_tokens: 2048 });
  assert.equal(withThinking.max_tokens, 2048 + 4096);
  assert.equal('temperature' in withThinking, false);
  assert.equal('output_config' in withThinking, false);

  const plain = buildAnthropicMessagesBody('claude-haiku-4-5', undefined, { messages, temperature: 0.2 });
  assert.equal(plain.temperature, 0.2);
  assert.equal(plain.max_tokens, 4096);
  assert.equal('thinking' in plain, false);
});

test('reasoning models and Claude 4.7+ drop temperature', () => {
  for (const model of [
    'gpt-6.1-sol',
    'openai/gpt-6-luna',
    'gpt-5-mini',
    'o4-mini',
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-opus-4.7',
    'claude-opus-4-8',
    'claude-fable-5-1',
  ]) {
    assert.equal(rejectsSampling(model), true, model);
  }
  for (const model of ['deepseek-flash', 'anthropic/claude-sonnet-4.6', 'claude-opus-4-6', 'claude-haiku-4-5', 'mistral-large-latest']) {
    assert.equal(rejectsSampling(model), false, model);
  }
});

test('CLI requests split into one system prompt and one prompt', () => {
  assert.deepEqual(splitMessagesForCli(messages), { systemPrompt: 'Rules A\n\nRules B', prompt: 'Question' });
  assert.deepEqual(
    splitMessagesForCli([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Reply' },
      { role: 'user', content: 'Second' },
    ]),
    { systemPrompt: '', prompt: '[USER]\nFirst\n\n[ASSISTANT]\nReply\n\n[USER]\nSecond' },
  );
});

test('Claude CLI effort follows the model settings; Haiku gets none', () => {
  assert.equal(claudeCliEffort('opus', { enabled: true, effort: 'xhigh' }), 'xhigh');
  assert.equal(claudeCliEffort('claude-sonnet-5-5', { enabled: false }), 'low');
  assert.equal(claudeCliEffort('sonnet', undefined), 'medium');
  assert.equal(claudeCliEffort('haiku', { enabled: true, effort: 'high' }), undefined);
});
