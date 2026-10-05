// Request shapes shared by the provider calls. Kept free of Obsidian imports so
// the unit tests can load them directly.

import type { AIClaudeEffort, AIThinkingConfig } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  response_format?: Record<string, unknown>;
  web_search_options?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Public answer text only; thinking/reasoning blocks must never be emitted. */
  onTextDelta?: (delta: string) => void;
}

/** Gemini 3 uses levels; earlier Gemini models retain their token budget. */
export function geminiThinkingConfig(model: string, thinking?: AIThinkingConfig): Record<string, unknown> | undefined {
  if (!thinking?.enabled) return undefined;
  if (thinking.effort !== undefined) {
    if (!/^gemini-3(?:[.-]|$)/i.test(model)) throw new Error("이 Gemini 모델은 추론 강도 대신 토큰 예산을 사용합니다.");
    if (!["low", "medium", "high"].includes(thinking.effort)) throw new Error("Gemini 추론 강도는 low, medium, high 중에서 선택해주세요.");
    // A persisted legacy budget may coexist in settings, but not on the wire.
    return { thinkingLevel: thinking.effort };
  }
  return thinking.budget_tokens === undefined ? undefined : { thinkingBudget: thinking.budget_tokens };
}

// Reasoning models (o-series, GPT-5, GPT-6) and Claude 4.7+ (including 5.x,
// Fable, and Mythos) reject non-default temperature. OpenRouter slugs use dots.
export function rejectsSampling(model: string): boolean {
  const bare = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return /^(?:o\d|gpt-5|gpt-6)/i.test(bare) || /^claude-(?:opus-4[.-][7-9]|opus-5|sonnet-5|fable|mythos)/i.test(bare);
}

export function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

type AnthropicThinkingStyle = "adaptive" | "always-on" | "budget";

// Claude 4.6+ runs adaptive thinking controlled by effort and rejects
// budget_tokens and non-default sampling; Fable/Mythos think on every request
// and reject an explicit thinking parameter. Haiku 4.5 and older keep budgets.
export function anthropicThinkingStyle(model: string): AnthropicThinkingStyle {
  if (/claude-(?:fable|mythos)-/i.test(model)) return "always-on";
  if (/claude-(?:opus-(?:4-[6-9]|5)|sonnet-(?:4-6|5))/i.test(model)) return "adaptive";
  return "budget";
}

export function buildAnthropicMessagesBody(
  model: string,
  thinking: AIThinkingConfig | undefined,
  options: Pick<ChatCompletionOptions, "messages" | "temperature">,
): Record<string, unknown> {
  const systemPrompt = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  const messages = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  const style = anthropicThinkingStyle(model);
  const body: Record<string, unknown> = { model, messages };
  if (systemPrompt) body.system = systemPrompt;

  if (style === "budget") {
    const budget = thinking?.enabled ? thinking.budget_tokens ?? 4096 : undefined;
    body.max_tokens = budget ? budget + 4096 : 4096;
    if (budget) body.thinking = { type: "enabled", budget_tokens: budget };
    else if (options.temperature !== undefined) body.temperature = options.temperature;
    return body;
  }

  // Thinking tokens count toward max_tokens, so leave room for both.
  body.max_tokens = 16000;
  if (style === "adaptive") body.thinking = { type: "adaptive" };
  body.output_config = { effort: thinking?.effort ?? (thinking?.enabled === false ? "low" : "medium") };
  return body;
}

// The native CLIs take one system prompt plus one prompt. NotePack requests are
// usually [system, user]; longer histories are flattened into a transcript.
export function splitMessagesForCli(messages: ChatMessage[]): { systemPrompt: string; prompt: string } {
  const systemPrompt = messages
    .filter((message) => message.role === "system")
    .map((message) => normalizeMessageContent(message.content))
    .join("\n\n")
    .trim();
  const turns = messages.filter((message) => message.role !== "system");
  if (turns.length === 1 && turns[0].role === "user") {
    return { systemPrompt, prompt: normalizeMessageContent(turns[0].content) };
  }
  const prompt = turns
    .map((message) => `[${message.role === "assistant" ? "ASSISTANT" : "USER"}]\n${normalizeMessageContent(message.content)}`)
    .join("\n\n");
  return { systemPrompt, prompt };
}

export function claudeCliEffort(model: string, thinking: AIThinkingConfig | undefined): AIClaudeEffort | undefined {
  // Haiku does not take an effort level.
  if (/haiku/i.test(model)) return undefined;
  if (thinking?.effort) return thinking.effort;
  return thinking?.enabled === false ? "low" : "medium";
}
