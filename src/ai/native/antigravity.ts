// Single-shot Gemini Plan requests through the Antigravity CLI (`agy`).
// Headless protocol follows CMDS Achmage (MIT) `AntigravityProvider.ts`
// (R-024): the prompt is the value right after `-p`, and NDJSON events use an
// `event` discriminator with `step_update` deltas and a nested `result`.

import type { NativeProcessRunner } from "./types.ts";

// Windows limits a whole command line to 32,767 characters, and Antigravity
// takes the prompt as a command-line value. Fail clearly before that limit.
export const ANTIGRAVITY_MAX_PROMPT_CHARS_WINDOWS = 24_000;
export const ANTIGRAVITY_MAX_PROMPT_CHARS = 120_000;

const SAFE_FAILURE_STATUSES = new Set(["CANCELLED", "ERROR", "FAILED", "RATE_LIMITED", "RESOURCE_EXHAUSTED", "UNAUTHORIZED"]);

export class AntigravityPromptTooLongError extends Error {
  constructor(limit: number) {
    super(
      `Gemini Plan can send at most about ${limit.toLocaleString("en-US")} characters per request through the Antigravity CLI on this computer. Shorten the selection or use a Gemini API key provider.`,
    );
    this.name = "AntigravityPromptTooLongError";
  }
}

export function buildAgyArgs(params: { prompt: string; model: string }): string[] {
  return ["-p", params.prompt, "--output-format", "stream-json", "--model", params.model, "--mode", "plan"];
}

export function combineAgyPrompt(systemPrompt: string, prompt: string): string {
  return [systemPrompt.trim(), prompt.trim()].filter(Boolean).join("\n\n");
}

export function extractAntigravityTextDelta(event: Record<string, unknown>): string {
  if (event.type !== "step_update" && event.event !== "step_update") return "";
  for (const key of ["delta", "text", "content", "output"]) {
    if (typeof event[key] === "string") return event[key] as string;
  }
  const step = asRecord(event.step_update ?? event.step);
  if (step) {
    for (const key of ["delta", "text", "content", "output", "text_delta"]) {
      if (typeof step[key] === "string") return step[key] as string;
    }
  }
  return "";
}

export function extractAntigravityResultEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  if (event.type !== "result" && event.event !== "result") return null;
  return asRecord(event.result) ?? event;
}

/** Reads the `AGY_ERROR: {...}` line Antigravity prints on failures (exit code 3). */
export function parseAgyError(stderr: string): string | undefined {
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(/^\s*AGY_ERROR:\s*(.+)$/);
    if (!match) continue;
    try {
      const parsed = asRecord(JSON.parse(match[1]) as unknown);
      const message = parsed?.message ?? parsed?.error ?? parsed?.status;
      if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
    } catch {
      return match[1].trim().slice(0, 300);
    }
  }
  return undefined;
}

export async function runAgyOnce(
  runner: NativeProcessRunner,
  request: {
    executablePath: string;
    env: Record<string, string | undefined>;
    cwd: string;
    model: string;
    systemPrompt: string;
    prompt: string;
    platform: string;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<{ content: string }> {
  const prompt = combineAgyPrompt(request.systemPrompt, request.prompt);
  const limit = request.platform === "win32" ? ANTIGRAVITY_MAX_PROMPT_CHARS_WINDOWS : ANTIGRAVITY_MAX_PROMPT_CHARS;
  if (prompt.length > limit) throw new AntigravityPromptTooLongError(limit);

  const deltas: string[] = [];
  let finalValue: unknown;
  let failureStatus: string | undefined;
  let failed = false;

  const result = await runner({
    executable: request.executablePath,
    args: buildAgyArgs({ prompt, model: request.model }),
    cwd: request.cwd,
    env: request.env,
    signal: request.signal,
    timeoutMs: request.timeoutMs,
    onStdoutLine: (line) => {
      const event = parseJsonLine(line);
      if (!event) return;
      const delta = extractAntigravityTextDelta(event);
      if (delta) deltas.push(delta);
      const resultEvent = extractAntigravityResultEvent(event);
      if (resultEvent) {
        finalValue = resultEvent.response ?? resultEvent.result ?? resultEvent.output ?? resultEvent.content ?? resultEvent.text;
        if (typeof resultEvent.status === "string" && resultEvent.status.toUpperCase() !== "SUCCESS") {
          failed = true;
          const status = resultEvent.status.trim().toUpperCase();
          failureStatus = SAFE_FAILURE_STATUSES.has(status) ? status : undefined;
        }
      }
    },
  });

  if (result.exitCode !== 0 || failed) {
    const detail = parseAgyError(result.stderr) ?? failureStatus;
    throw new Error(`Gemini Plan (Antigravity) request failed${detail ? `: ${detail}` : "."}`);
  }
  const content = (typeof finalValue === "string" ? finalValue : deltas.join("")).trim();
  if (!content) throw new Error("Antigravity completed without returning an answer.");
  return { content };
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(line) as unknown);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
