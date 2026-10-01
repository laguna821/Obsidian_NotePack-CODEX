// Billing-safety classification for the native Plan runtimes.
//
// Ported from CMDS Achmage (MIT) `NativeRuntimeAuth.ts`, including the
// Team/Enterprise opt-in of CMDS R-044. The plugin only reads allowlisted
// `claude auth status` classifications, the names (never values) of
// credential environment variables, and whether managed-settings sources
// exist. It never reads tokens, emails, or organization identifiers.

import type {
  NativeProcessRunner,
  NativeRuntimeModel,
  NativeRuntimeProvider,
  PreparedNativePlanEnvironment,
  RuntimeAuthDecision,
} from "./types.ts";

const CLAUDE_BLOCKED_ENVIRONMENT = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_AWS_API_KEY",
  "ANTHROPIC_AWS_BASE_URL",
  "ANTHROPIC_AWS_WORKSPACE_ID",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_BEDROCK_MANTLE_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
  "ANTHROPIC_FOUNDRY_BASE_URL",
  "ANTHROPIC_FOUNDRY_RESOURCE",
  "ANTHROPIC_VERTEX_BASE_URL",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "ANTHROPIC_WORKSPACE_ID",
  "AWS_BEARER_TOKEN_BEDROCK",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
  "CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH",
  "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
  "CLAUDE_CODE_SKIP_FOUNDRY_AUTH",
  "CLAUDE_CODE_SKIP_MANTLE_AUTH",
  "CLAUDE_CODE_SKIP_VERTEX_AUTH",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_VERTEX",
]);

const CLAUDE_BOOLEAN_ROUTING_ENVIRONMENT = new Set([
  "CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH",
  "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
  "CLAUDE_CODE_SKIP_FOUNDRY_AUTH",
  "CLAUDE_CODE_SKIP_MANTLE_AUTH",
  "CLAUDE_CODE_SKIP_VERTEX_AUTH",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_VERTEX",
]);

const GEMINI_BLOCKED_ENVIRONMENT = new Set([
  "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
  "CLOUDSDK_CORE_PROJECT",
  "GCLOUD_PROJECT",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_API_KEY",
  "GOOGLE_CLOUD_LOCATION",
  "GEMINI_API_KEY",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_QUOTA_PROJECT",
  // Antigravity CLI sends model requests to this endpoint instead of Google's.
  "GOOGLE_GEMINI_BASE_URL",
  "GOOGLE_GENAI_USE_ENTERPRISE",
  "GOOGLE_GENAI_USE_VERTEXAI",
  "VERTEX_AI_PROJECT",
  "VERTEX_AI_LOCATION",
]);

const GEMINI_BOOLEAN_ROUTING_ENVIRONMENT = new Set(["GOOGLE_GENAI_USE_ENTERPRISE", "GOOGLE_GENAI_USE_VERTEXAI"]);

const CLAUDE_PERSONAL_SUBSCRIPTION_TYPES = new Set(["pro", "max"]);
// Team and Enterprise logins can receive organization-managed Claude Code
// settings that the plugin cannot read, so they need device-local opt-in.
const CLAUDE_ORGANIZATION_SUBSCRIPTION_TYPES = new Set(["team", "enterprise"]);

export const CLAUDE_ORGANIZATION_PLAN_OPT_IN_EVIDENCE = "organization plan requires opt-in";
export const CLAUDE_ORGANIZATION_PLAN_ALLOWED_EVIDENCE = "organization plan allowed by this device opt-in";

// `forcedLoginMethod` and `allowedProviders` appear only when a managed policy
// sets them (Claude Code 2.1.285); each passes only in its first-party value.
const CLAUDE_ALLOWED_ROOT_AUTH_FIELDS = new Set([
  "loggedIn",
  "authMethod",
  "apiProvider",
  "subscriptionType",
  "forcedLoginMethod",
  "allowedProviders",
]);

const CLAUDE_AUTH_MARKER_KEY_TOKENS = new Set([
  "auth",
  "authentication",
  "authorization",
  "bedrock",
  "billing",
  "credential",
  "credentials",
  "endpoint",
  "entitlement",
  "foundry",
  "gateway",
  "mantle",
  "oauth",
  "provenance",
  "provider",
  "quota",
  "source",
  "subscription",
  "token",
  "vertex",
]);

export interface ClaudePlanAuthPolicy {
  /** Device-local opt-in for Team/Enterprise organization logins. */
  allowOrganizationPlans?: boolean;
}

export type ManagedSettingsInspector = () => string[];

export function prepareNativePlanEnvironment(
  provider: NativeRuntimeProvider,
  source: Record<string, string | undefined>,
): PreparedNativePlanEnvironment {
  const blockedSet = provider === "claude" ? CLAUDE_BLOCKED_ENVIRONMENT : GEMINI_BLOCKED_ENVIRONMENT;
  const booleanRoutingSet =
    provider === "claude" ? CLAUDE_BOOLEAN_ROUTING_ENVIRONMENT : GEMINI_BOOLEAN_ROUTING_ENVIRONMENT;
  const env: Record<string, string | undefined> = {};
  const blockedVariables: string[] = [];

  for (const [name, value] of Object.entries(source)) {
    // Windows variable names are case-insensitive; classify case-insensitively
    // so a mixed-case credential variable can never reach the CLI.
    const canonicalName = name.toUpperCase();
    if (!blockedSet.has(canonicalName)) {
      env[name] = value;
      continue;
    }
    if (
      typeof value === "string" &&
      value.trim() &&
      !(booleanRoutingSet.has(canonicalName) && isExplicitlyDisabled(value))
    ) {
      blockedVariables.push(canonicalName);
    }
  }

  return { provider, env, blockedVariables: [...new Set(blockedVariables)].sort() };
}

export async function verifyClaudePlanAuth(
  executablePath: string,
  options: {
    environment: PreparedNativePlanEnvironment;
    runner: NativeProcessRunner;
    managedSettingsInspector: ManagedSettingsInspector;
    signal?: AbortSignal;
  } & ClaudePlanAuthPolicy,
): Promise<RuntimeAuthDecision> {
  const { environment } = options;
  if (environment.blockedVariables.length > 0) {
    return blockedEnvironmentDecision("Claude", environment.blockedVariables);
  }

  let managedSettingsEvidence: string[];
  try {
    managedSettingsEvidence = options.managedSettingsInspector();
  } catch {
    managedSettingsEvidence = ["managed settings inspection failed closed"];
  }

  // `auth status` runs even with managed settings present: it makes no model
  // request and is the only way to tell an organization login (which can opt
  // in) from a personal one (which stays blocked).
  const result = await options.runner({
    executable: executablePath,
    args: ["auth", "status"],
    env: environment.env,
    signal: options.signal,
    timeoutMs: 30_000,
  });
  if (result.exitCode !== 0) {
    return {
      status: "login-required",
      allowed: false,
      reason: "Sign in to Claude Code with an eligible Claude subscription.",
      evidence: ["claude auth status reported signed out"],
      code: "login-required",
    };
  }

  const decision = classifyClaudeAuthStatus(result.stdout, environment, {
    allowOrganizationPlans: options.allowOrganizationPlans,
  });
  return managedSettingsEvidence.length > 0
    ? applyManagedSettingsEvidence(decision, managedSettingsEvidence)
    : decision;
}

function applyManagedSettingsEvidence(
  decision: RuntimeAuthDecision,
  managedSettingsEvidence: string[],
): RuntimeAuthDecision {
  // An organization's consent covers settings the organization manages,
  // whether they arrive from the server or from this computer's policy.
  if (decision.code === "organization-subscription" || decision.code === "organization-opt-in-required") {
    return { ...decision, evidence: [...decision.evidence, ...managedSettingsEvidence] };
  }
  if (decision.status === "login-required") return decision;
  return {
    status: "billing-blocked",
    allowed: false,
    reason:
      "Claude Plan is blocked because administrator-managed Claude Code settings on this computer could supply an API key, gateway, cloud provider, or credential helper.",
    evidence: managedSettingsEvidence,
    code: "managed-settings",
  };
}

export function classifyClaudeAuthStatus(
  output: string,
  environment: PreparedNativePlanEnvironment = prepareNativePlanEnvironment("claude", {}),
  policy: ClaudePlanAuthPolicy = {},
): RuntimeAuthDecision {
  if (environment.blockedVariables.length > 0) {
    return blockedEnvironmentDecision("Claude", environment.blockedVariables);
  }
  const parsed = parseRecord(output);
  if (!parsed || parsed.loggedIn !== true) {
    const signedOut = parsed?.loggedIn === false;
    return {
      status: signedOut ? "login-required" : "billing-blocked",
      allowed: false,
      reason: signedOut
        ? "Sign in to Claude Code with an eligible Claude subscription."
        : "Claude authentication metadata was not recognized, so Plan billing cannot be verified.",
      evidence: [signedOut ? "auth status explicitly reported logged out" : "unknown auth status schema"],
      code: signedOut ? "login-required" : "unknown-schema",
    };
  }

  const authMethod = normalizedString(parsed.authMethod);
  const apiProvider = normalizedString(parsed.apiProvider);
  const subscriptionType = normalizedString(parsed.subscriptionType);
  // Billing markers come before the organization branch, so a Team account
  // that also routes through an API key is never told opting in would help.
  if (hasBlockedClaudeAuthMetadata(parsed)) {
    return {
      status: "billing-blocked",
      allowed: false,
      reason:
        "Claude is configured for API, helper, gateway, or cloud-provider billing instead of subscription Plan usage.",
      evidence: ["auth metadata contains a non-subscription billing marker"],
      code: "billing-marker",
    };
  }

  const isFirstPartyClaudeLogin = authMethod === "claude.ai" && apiProvider === "firstparty";
  const evidence = ["authMethod=claude.ai", "apiProvider=firstParty", `subscriptionType=${subscriptionType}`];
  if (isFirstPartyClaudeLogin && subscriptionType && CLAUDE_PERSONAL_SUBSCRIPTION_TYPES.has(subscriptionType)) {
    return {
      status: "subscription",
      allowed: true,
      reason: "Claude Code reported an eligible first-party Pro/Max subscription login.",
      evidence,
      code: "subscription",
    };
  }

  if (isFirstPartyClaudeLogin && subscriptionType && CLAUDE_ORGANIZATION_SUBSCRIPTION_TYPES.has(subscriptionType)) {
    if (policy.allowOrganizationPlans) {
      return {
        status: "subscription",
        allowed: true,
        reason:
          "Claude Code reported a first-party Team/Enterprise login that this computer allows. Settings managed by the organization may apply to these requests.",
        evidence: [...evidence, CLAUDE_ORGANIZATION_PLAN_ALLOWED_EVIDENCE],
        code: "organization-subscription",
      };
    }
    return {
      status: "billing-blocked",
      allowed: false,
      reason:
        "Claude Code is signed in with a Team or Enterprise organization account. Its administrators can apply Claude Code settings to these requests, so NotePack waits until you allow organization accounts on this computer.",
      evidence: [...evidence, CLAUDE_ORGANIZATION_PLAN_OPT_IN_EVIDENCE],
      code: "organization-opt-in-required",
    };
  }

  return {
    status: "billing-blocked",
    allowed: false,
    reason: "Claude is signed in, but an eligible first-party subscription was not explicitly identified.",
    evidence: ["subscription provenance is incomplete or unknown"],
    code: "subscription-unknown",
  };
}

/**
 * Detects managed Claude settings without reading their values. Any managed
 * source outranks command-line settings and may inject billing credentials.
 */
export function inspectClaudeManagedSettings(deps: {
  platform: string;
  programFiles?: string;
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
  joinPath: (...parts: string[]) => string;
  spawnSync: (command: string, args: string[]) => { status: number | null; error?: unknown };
}): string[] {
  const evidence: string[] = [];
  const managedRoot =
    deps.platform === "win32"
      ? deps.joinPath(deps.programFiles ?? "C:\\Program Files", "ClaudeCode")
      : deps.platform === "darwin"
        ? "/Library/Application Support/ClaudeCode"
        : "/etc/claude-code";

  if (deps.existsSync(deps.joinPath(managedRoot, "managed-settings.json"))) {
    evidence.push("managed settings file present");
  }
  const dropInDirectory = deps.joinPath(managedRoot, "managed-settings.d");
  if (deps.existsSync(dropInDirectory)) {
    try {
      if (deps.readdirSync(dropInDirectory).some((name) => !name.startsWith(".") && name.endsWith(".json"))) {
        evidence.push("managed settings drop-in present");
      }
    } catch {
      evidence.push("managed settings drop-in could not be inspected");
    }
  }

  if (deps.platform === "win32") {
    for (const [scope, registryKey] of [
      ["machine", "HKLM\\SOFTWARE\\Policies\\ClaudeCode"],
      ["user", "HKCU\\SOFTWARE\\Policies\\ClaudeCode"],
    ] as const) {
      const result = deps.spawnSync("reg.exe", ["query", registryKey]);
      if (result.status === 0) evidence.push(`${scope} policy registry present`);
      if (result.error || result.status === null) {
        evidence.push(`${scope} policy registry inspection failed closed`);
      }
    }
  } else if (deps.platform === "darwin") {
    const result = deps.spawnSync("/usr/bin/defaults", ["read", "com.anthropic.claudecode"]);
    if (result.status === 0) evidence.push("managed preferences domain present");
    if (result.error || result.status === null) {
      evidence.push("managed preferences inspection failed closed");
    }
  }

  return [...new Set(evidence)].sort();
}

// ── Gemini Plan (Antigravity CLI) ──────────────────────────────────────────

export async function verifyAntigravityPlanAuth(
  executablePath: string,
  options: {
    environment: PreparedNativePlanEnvironment;
    runner: NativeProcessRunner;
    signal?: AbortSignal;
  },
): Promise<{ decision: RuntimeAuthDecision; models: NativeRuntimeModel[] }> {
  const { environment } = options;
  if (environment.blockedVariables.length > 0) {
    return { decision: blockedEnvironmentDecision("Gemini", environment.blockedVariables), models: [] };
  }

  // Antigravity 1.2.x prints `id<TAB>label` lines; `models --json` no longer exists.
  const result = await options.runner({
    executable: executablePath,
    args: ["models"],
    env: environment.env,
    signal: options.signal,
    timeoutMs: 30_000,
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  return { decision: classifyAntigravityCatalog(result.exitCode, combined, result.stdout), models: parseAntigravityModels(result.stdout) };
}

export function classifyAntigravityCatalog(exitCode: number, combinedOutput: string, stdout: string): RuntimeAuthDecision {
  if (hasPlainTextGoogleCloudMarker(combinedOutput)) {
    return {
      status: "billing-blocked",
      allowed: false,
      reason: "Antigravity reported Google Cloud, ADC, enterprise, or consumption-billing provenance.",
      evidence: ["runtime output contains a Cloud billing marker"],
      code: "billing-marker",
    };
  }
  if (exitCode !== 0 || hasAntigravityLoginRequiredText(combinedOutput)) {
    const loginRequired = hasAntigravityLoginRequiredText(combinedOutput);
    return {
      status: loginRequired ? "login-required" : "quota-unverified",
      allowed: false,
      reason: loginRequired
        ? "Open the Antigravity CLI and sign in with Google."
        : "Antigravity did not return a readable model catalog.",
      evidence: [loginRequired ? "agy models reported signed out" : "agy models failed"],
      code: loginRequired ? "login-required" : "catalog-unavailable",
    };
  }
  if (parseAntigravityModels(stdout).length === 0) {
    return {
      status: "quota-unverified",
      allowed: false,
      reason: "Antigravity returned no Gemini models. Update the CLI and run `agy models` in a terminal.",
      evidence: ["agy models returned no Gemini models"],
      code: "catalog-unavailable",
    };
  }
  // Antigravity exposes no machine-readable quota source; a signed-in catalog
  // is accepted in compatibility mode unless Cloud billing markers appear.
  return {
    status: "subscription",
    allowed: true,
    reason:
      "Antigravity is signed in and returned a Gemini model catalog. The CLI does not expose the account quota source to NotePack.",
    evidence: ["agy models returned a non-empty Gemini catalog", "no explicit API or Google Cloud override detected"],
    code: "catalog-ready",
  };
}

export function parseAntigravityModels(output: string): NativeRuntimeModel[] {
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
  const models: NativeRuntimeModel[] = [];
  for (const rawLine of output.replace(ansi, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(?:fetching|available\s+models?|models?|loading)\b/i.test(line)) continue;
    const [id, ...labelParts] = line.split(/\t+|\s{2,}/);
    const modelId = id?.trim() ?? "";
    // Only Gemini models belong to Gemini Plan; Antigravity also lists other vendors.
    if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(modelId)) continue;
    const label = labelParts.join(" ").trim() || modelId;
    if (!models.some((model) => model.id === modelId)) models.push({ id: modelId, label });
  }
  return models;
}

function hasPlainTextGoogleCloudMarker(value: string): boolean {
  return /\b(?:adc|enterprise|google\s+cloud|service[_ -]?account|vertex)\b|\bconsumption(?:[- ]billing)?\b|\b(?:billing|quota)?\s*project(?:\s+id)?\s*[:=]/i.test(
    value,
  );
}

function hasAntigravityLoginRequiredText(value: string): boolean {
  return /\b(?:not\s+(?:signed|logged)\s*in|(?:please\s+)?sign\s*in\s+with\s+google|login\s+required|unauthenticated|authentication\s+(?:failed|required)|no\s+(?:valid\s+)?credentials?)\b/i.test(
    value,
  );
}

// ── Shared ─────────────────────────────────────────────────────────────────

export function assertRuntimeAuthAllowed(provider: NativeRuntimeProvider, decision: RuntimeAuthDecision): void {
  if (decision.allowed) return;
  const label = provider === "claude" ? "Claude Plan" : "Gemini Plan";
  throw new Error(`${label} request blocked: ${decision.reason}`);
}

function blockedEnvironmentDecision(label: string, variables: string[]): RuntimeAuthDecision {
  return {
    status: "billing-blocked",
    allowed: false,
    reason: `${label} Plan is blocked because API, token, gateway, or cloud-provider environment credentials would take precedence.`,
    evidence: variables.map((name) => `environment variable present: ${name}`),
    code: "environment-override",
  };
}

function hasBlockedClaudeAuthMetadata(record: Record<string, unknown>, isRoot = true): boolean {
  for (const [key, value] of Object.entries(record)) {
    if (isRoot && CLAUDE_ALLOWED_ROOT_AUTH_FIELDS.has(key)) {
      if (!isAllowedClaudeRootAuthField(key, value) && hasActiveMarker(value)) return true;
    } else if (isClaudeAuthMarkerKey(key) && hasActiveMarker(value)) {
      return true;
    }
    if (containsBlockedClaudeAuthMetadata(value)) return true;
  }
  return false;
}

function containsBlockedClaudeAuthMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBlockedClaudeAuthMetadata);
  return isRecord(value) ? hasBlockedClaudeAuthMetadata(value, false) : false;
}

function isAllowedClaudeRootAuthField(key: string, value: unknown): boolean {
  if (key === "loggedIn") return value === true;
  if (key === "allowedProviders") {
    // Exactly the first-party API; any other entry lets policy route through a gateway.
    return Array.isArray(value) && value.length === 1 && normalizedString(value[0]) === "anthropic";
  }
  const normalized = normalizedString(value);
  if (key === "authMethod") return normalized === "claude.ai";
  if (key === "apiProvider") return normalized === "firstparty";
  if (key === "forcedLoginMethod") return normalized === "claudeai";
  if (key === "subscriptionType") {
    return (
      normalized !== undefined &&
      (CLAUDE_PERSONAL_SUBSCRIPTION_TYPES.has(normalized) || CLAUDE_ORGANIZATION_SUBSCRIPTION_TYPES.has(normalized))
    );
  }
  return false;
}

function isClaudeAuthMarkerKey(key: string): boolean {
  const tokens = key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z\d]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  const compact = tokens.join("");
  return (
    tokens.some((token) => CLAUDE_AUTH_MARKER_KEY_TOKENS.has(token)) ||
    /billing|credential|endpoint|entitlement|foundry|gateway|mantle|oauth|provenance|provider|quota|subscription|token|vertex|bedrock|apikey|managedsettings/.test(
      compact,
    ) ||
    compact === "auth" ||
    compact.endsWith("auth") ||
    /authentication|authorization|auth(?:method|override|provider|source|status|token|enabled)/.test(compact) ||
    (compact.endsWith("source") && compact !== "resource") ||
    compact === "accounttype" ||
    compact === "organizationtype" ||
    compact === "plantype"
  );
}

function hasActiveMarker(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return false;
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

function isExplicitlyDisabled(value: string): boolean {
  return /^(?:0|false)$/i.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
