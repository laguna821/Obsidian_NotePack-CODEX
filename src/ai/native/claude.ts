// Single-shot Claude Plan requests through the user's installed Claude Code CLI.
// Protocol and session guard follow CMDS Achmage (MIT) `ClaudeAgentProvider.ts`
// (R-024 headless protocol, R-044 session guard).

import type { NativeProcessRunner } from "./types.ts";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeSessionGuard {
  /** A Team/Enterprise login this computer opted in to. */
  organization: boolean;
}

export class ClaudePlanRequestBlockedError extends Error {
  constructor(reason: string) {
    super(`Claude Plan request blocked: ${reason}`);
    this.name = "ClaudePlanRequestBlockedError";
  }
}

export function buildClaudeArgs(params: {
  model: string;
  effort?: ClaudeEffort;
  systemPrompt?: string;
  systemPromptFile?: string;
}): string[] {
  const args = [
    "-p",
    "--setting-sources",
    "",
    "--verbose",
    "--output-format",
    "stream-json",
    "--no-session-persistence",
    "--safe-mode",
    "--permission-mode",
    "dontAsk",
    "--no-chrome",
    "--disable-slash-commands",
    // No MCP server (including claude.ai connectors) joins the session.
    "--strict-mcp-config",
    "--tools=",
    "--model",
    params.model,
  ];
  if (params.systemPromptFile) {
    args.push("--system-prompt-file", params.systemPromptFile);
  } else {
    args.push("--system-prompt", params.systemPrompt ?? "");
  }
  if (params.effort) args.push("--effort", params.effort);
  return args;
}

/**
 * Checks the `system/init` event Claude Code prints before working on the
 * prompt. It cannot prevent a request already sent; it stops the process as
 * soon as the session shows a route the Plan guard would have blocked.
 */
export function evaluateClaudeInitEvent(event: Record<string, unknown>, guard: ClaudeSessionGuard): string | undefined {
  const apiKeySource = event.apiKeySource;
  if (apiKeySource !== undefined && apiKeySource !== null && String(apiKeySource).trim().toLowerCase() !== "none") {
    return "Claude Code selected an API key source instead of the subscription login.";
  }
  if (!guard.organization) return undefined;
  const mcpServers = event.mcp_servers;
  const tools = event.tools;
  if (
    (Array.isArray(mcpServers) && mcpServers.length > 0) ||
    (Array.isArray(tools) && tools.some((tool) => typeof tool === "string" && tool.startsWith("mcp__")))
  ) {
    return "Organization-managed MCP servers were attached to the Claude Code session.";
  }
  return undefined;
}

export interface ClaudeStreamParse {
  text?: string;
  finalText?: string;
  error?: string;
}

export function parseClaudeStreamEvent(event: Record<string, unknown>): ClaudeStreamParse {
  if (event.type === "assistant") {
    const message = asRecord(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const text = content
      .map((part) => asRecord(part))
      .filter((part): part is Record<string, unknown> => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("");
    return {
      text: text || undefined,
      error: typeof event.error === "string" ? `Claude Code request failed: ${event.error}` : undefined,
    };
  }
  if (event.type === "result") {
    const failed = event.is_error === true || (typeof event.subtype === "string" && event.subtype !== "success");
    const result = typeof event.result === "string" ? event.result : undefined;
    return {
      finalText: failed ? undefined : result,
      error: failed ? result || (typeof event.error === "string" ? event.error : "Claude Code request failed.") : undefined,
    };
  }
  return {};
}

export async function runClaudeOnce(
  runner: NativeProcessRunner,
  request: {
    executablePath: string;
    env: Record<string, string | undefined>;
    cwd: string;
    model: string;
    effort?: ClaudeEffort;
    systemPrompt: string;
    systemPromptFile?: string;
    prompt: string;
    guard: ClaudeSessionGuard;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<{ content: string; resolvedModel?: string }> {
  let sawInit = false;
  let violation: string | undefined;
  let resolvedModel: string | undefined;
  let finalText: string | undefined;
  let assistantText = "";
  let requestError: string | undefined;

  // A separate controller lets the session guard stop the process without the
  // stop being reported as a user cancellation.
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (request.signal?.aborted) controller.abort();
  else request.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    let result;
    try {
      result = await runner({
        executable: request.executablePath,
        args: buildClaudeArgs({
          model: request.model,
          effort: request.effort,
          systemPrompt: request.systemPrompt,
          systemPromptFile: request.systemPromptFile,
        }),
        cwd: request.cwd,
        env: request.env,
        stdin: request.prompt,
        signal: controller.signal,
        timeoutMs: request.timeoutMs,
        onStdoutLine: (line) => {
          if (violation) return;
          const event = parseJsonLine(line);
          if (!event) return;
          if (event.type === "system" && event.subtype === "init") {
            sawInit = true;
            if (typeof event.model === "string") resolvedModel = event.model;
            violation = evaluateClaudeInitEvent(event, request.guard);
            if (violation) controller.abort();
            return;
          }
          const parsed = parseClaudeStreamEvent(event);
          if (parsed.text) assistantText += parsed.text;
          if (parsed.finalText !== undefined) finalText = parsed.finalText;
          if (parsed.error) requestError = parsed.error;
        },
      });
    } catch (error) {
      if (violation) throw new ClaudePlanRequestBlockedError(violation);
      throw error;
    }

    if (violation) throw new ClaudePlanRequestBlockedError(violation);
    // Organization sessions must report their configuration before an answer
    // is accepted. Pro/Max keeps working if a future CLI changes the event.
    if (request.guard.organization && !sawInit) {
      throw new ClaudePlanRequestBlockedError(
        "Claude Code did not report its session settings, so the organization request was discarded.",
      );
    }
    if (requestError) throw new Error(requestError);
    if (result.exitCode !== 0) {
      const detail = (result.stderr.trim() || result.stdout.trim()).split(/\r?\n/).slice(-3).join(" ").slice(0, 400);
      throw new Error(detail || "Claude Code failed. Open NotePack settings and check the Claude Plan connection.");
    }
    const content = (finalText ?? assistantText).trim();
    if (!content) throw new Error("Claude Code completed without returning an answer.");
    return { content, resolvedModel };
  } finally {
    request.signal?.removeEventListener("abort", forwardAbort);
  }
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
