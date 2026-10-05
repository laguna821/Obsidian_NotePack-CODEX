// Built-in chat model IDs that NotePack no longer ships, mapped to the model
// that replaces them. Applied on every load to settings, annotation agents,
// and the agents stored inside .codex workbench files, so a Dropbox-synced
// copy written by an older NotePack is repaired again on the next load.
//
// Only built-in IDs belong here; custom models a user created are never
// touched.

export const RETIRED_MODEL_REPLACEMENTS: Readonly<Record<string, string>> = {
  // OpenAI Plan: gpt-5.5 retires on 2026-10-14. Existing selections move to
  // GPT-5.6 Sol, which is verified on this connection and stays available
  // during the GPT-6 rollout; GPT-6.1 Sol is offered first in the list.
  "openai-plan/gpt-5-5-plan": "openai-plan/gpt-5-6-sol-plan",
  "openai-plan/gpt-5-5-instant-plan": "openai-plan/gpt-5-6-sol-plan",
  "openai-plan/gpt-5-4-plan": "openai-plan/gpt-5-6-sol-plan",
  "openai-plan/gpt-5-2-plan": "openai-plan/gpt-5-6-sol-plan",

  // Claude Plan now runs Claude Code; old pinned IDs move to the latest alias.
  "anthropic-plan/claude-sonnet-4-5-plan": "anthropic-plan/claude-sonnet-latest-plan",
  "anthropic-plan/claude-sonnet-4-6-plan": "anthropic-plan/claude-sonnet-latest-plan",
  "anthropic-plan/claude-opus-4-5-plan": "anthropic-plan/claude-opus-latest-plan",
  "anthropic-plan/claude-haiku-4-5-plan": "anthropic-plan/claude-haiku-latest-plan",

  // Gemini Plan now runs the Antigravity CLI, which uses its own model IDs.
  "gemini-plan/gemini-2-5-flash-plan": "gemini-plan/gemini-3-8-flash-medium-plan",
  "gemini-plan/gemini-3-flash-plan": "gemini-plan/gemini-3-8-flash-medium-plan",
  "gemini-plan/gemini-3-1-flash-lite-plan": "gemini-plan/gemini-3-8-flash-medium-plan",
  "gemini-plan/gemini-2-5-pro-plan": "gemini-plan/gemini-3-1-pro-high-plan",
  "gemini-plan/gemini-3-pro-preview-plan": "gemini-plan/gemini-3-1-pro-high-plan",

  // API-key providers.
  "openrouter/openai-gpt-4o": "openrouter/openai-gpt-6-1-sol",
  "openrouter/anthropic-claude-sonnet-4-5": "openrouter/anthropic-claude-sonnet-5-5",
  "openrouter/google-gemini-2.5-pro": "openrouter/google-gemini-3-8-flash",
  "anthropic/claude-opus-4-5": "anthropic/claude-opus-5-5",
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-5-5",
  "openai/gpt-5.5": "openai/gpt-6-1-sol",
  "openai/gpt-5.5-instant": "openai/gpt-6-luna",
  "openai/gpt-5": "openai/gpt-6-1-sol",
  "openai/gpt-5-mini": "openai/gpt-6-luna",
  "openai/gpt-4o": "openai/gpt-6-1-sol",
  "openai/gpt-4o-mini": "openai/gpt-6-luna",
  "openai/gpt-4.1": "openai/gpt-6-1-sol",
  "openai/gpt-4.1-mini": "openai/gpt-6-luna",
  "openai/o4-mini": "openai/gpt-6-luna",
  "gemini/gemini-2.5-pro": "gemini/gemini-3-1-pro-preview",
  "gemini/gemini-2.5-flash": "gemini/gemini-3-8-flash",
  // Both pointed at DeepSeek V4 Flash (non-thinking / thinking) before retiring.
  "deepseek/deepseek-chat": "deepseek/deepseek-flash",
  "deepseek/deepseek-reasoner": "deepseek/deepseek-flash",
  // xAI redirects the retired Grok 4.1 Fast slugs to Grok 4.3.
  "xai/grok-4-1-fast": "xai/grok-4-3",
  "xai/grok-4-1-fast-non-reasoning": "xai/grok-4-3",
};

export function isRetiredModelId(modelId: string | undefined): boolean {
  return Boolean(modelId && Object.prototype.hasOwnProperty.call(RETIRED_MODEL_REPLACEMENTS, modelId));
}

export function replaceRetiredModelId(modelId: string): string {
  return isRetiredModelId(modelId) ? RETIRED_MODEL_REPLACEMENTS[modelId] : modelId;
}
