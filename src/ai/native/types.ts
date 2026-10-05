// Shared types for the native Plan runtimes. Claude Plan runs the user's own
// installed Claude Code CLI and Gemini Plan runs the Antigravity CLI; NotePack
// never stores or forwards their login tokens.

export type NativeRuntimeProvider = "claude" | "gemini";

/** Machine-readable reason for a runtime decision. Never persisted. */
export type RuntimeAuthDecisionCode =
  | "subscription"
  | "organization-subscription"
  | "organization-opt-in-required"
  | "login-required"
  | "environment-override"
  | "managed-settings"
  | "billing-marker"
  | "subscription-unknown"
  | "unknown-schema"
  | "catalog-ready"
  | "catalog-unavailable";

export interface RuntimeAuthDecision {
  status: "subscription" | "login-required" | "billing-blocked" | "quota-unverified";
  allowed: boolean;
  reason: string;
  /** Non-secret classifications only. Never include credential values. */
  evidence: string[];
  code?: RuntimeAuthDecisionCode;
}

export interface PreparedNativePlanEnvironment {
  provider: NativeRuntimeProvider;
  env: Record<string, string | undefined>;
  /** Names only. Values are deliberately neither retained nor exposed. */
  blockedVariables: string[];
}

export interface NativeProcessOptions {
  executable: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  stdin?: string;
  timeoutMs?: number;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export interface NativeProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type NativeProcessRunner = (options: NativeProcessOptions) => Promise<NativeProcessResult>;

export interface NativeRuntimeModel {
  id: string;
  label: string;
}

export type NativeRuntimeStatus =
  | "unknown"
  | "checking"
  | "not-installed"
  | "login-required"
  | "blocked"
  | "ready"
  | "error";

export interface NativeRuntimeSnapshot {
  provider: NativeRuntimeProvider;
  status: NativeRuntimeStatus;
  executablePath?: string;
  version?: string;
  models: NativeRuntimeModel[];
  decision?: RuntimeAuthDecision;
  error?: string;
  checkedAt?: number;
}
