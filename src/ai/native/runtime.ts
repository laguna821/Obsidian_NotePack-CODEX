// Native Plan runtime service: discovery, diagnosis, cached billing-safety
// verification, and single-shot requests. Desktop only.

import {
  assertRuntimeAuthAllowed,
  inspectClaudeManagedSettings,
  prepareNativePlanEnvironment,
  verifyAntigravityPlanAuth,
  verifyClaudePlanAuth,
} from "./auth.ts";
import { runAgyOnce } from "./antigravity.ts";
import { runClaudeOnce, type ClaudeEffort } from "./claude.ts";
import { launchVisibleTerminal, quoteForTerminal, requireNode, runNativeProcess } from "./process.ts";
import { resolveExecutable } from "./resolver.ts";
import type {
  NativeProcessRunner,
  NativeRuntimeProvider,
  NativeRuntimeSnapshot,
  RuntimeAuthDecision,
} from "./types.ts";

const REQUEST_TIMEOUT_MS = 5 * 60_000;
const CHECK_TIMEOUT_MS = 30_000;
const VERIFY_CACHE_MS = 60_000;
const LONG_SYSTEM_PROMPT_CHARS = 12_000;

const CONSENT_KEY = "notepack-codex:native-runtime-consent:claude-organization-plan";
// Bump when the consent text changes materially so earlier consent no longer counts.
const CONSENT_VERSION = "v1";
const CUSTOM_PATH_KEY_PREFIX = "notepack-codex:native-runtime-path:";

// Pinned Claude models need a Claude Code release that knows them.
const CLAUDE_MIN_VERSIONS: Array<{ pattern: RegExp; label: string; version: string }> = [
  { pattern: /^claude-opus-5-5/, label: "Claude Opus 5.5", version: "2.1.280" },
  { pattern: /^claude-sonnet-5-5/, label: "Claude Sonnet 5.5", version: "2.1.280" },
  { pattern: /^claude-fable-5-1/, label: "Claude Fable 5.1", version: "2.1.257" },
];

export interface DeviceStore {
  get(key: string): string | undefined;
  set(key: string, value: string | undefined): void;
}

export interface NativeRuntimeDeps {
  runner: NativeProcessRunner;
  processEnv: () => Record<string, string | undefined>;
  platform: string;
  homedir: () => string;
  pathDelimiter: string;
  joinPath: (...parts: string[]) => string;
  isFile: (path: string) => boolean;
  managedSettingsInspector: () => string[];
  makeTempDir: () => string;
  removeDir: (path: string) => void;
  writeFile: (path: string, content: string) => void;
  store: DeviceStore;
  now: () => number;
  openTerminal: (command: string, onError: (error: Error) => void) => void;
}

interface VerifiedRuntime {
  key: string;
  until: number;
  executablePath: string;
  env: Record<string, string | undefined>;
  decision: RuntimeAuthDecision;
  version?: string;
}

export class NativeRuntimeService {
  private readonly snapshots: Record<NativeRuntimeProvider, NativeRuntimeSnapshot> = {
    claude: { provider: "claude", status: "unknown", models: [] },
    gemini: { provider: "gemini", status: "unknown", models: [] },
  };
  private readonly listeners = new Set<() => void>();
  private readonly verified = new Map<NativeRuntimeProvider, VerifiedRuntime>();
  // Bumped whenever something a check depends on changes; a check that
  // started before the bump may neither cache nor publish its verdict.
  private readonly generations: Record<NativeRuntimeProvider, number> = { claude: 0, gemini: 0 };
  private readonly deps: NativeRuntimeDeps;

  constructor(deps: NativeRuntimeDeps) {
    this.deps = deps;
  }

  getSnapshot(provider: NativeRuntimeProvider): NativeRuntimeSnapshot {
    return this.snapshots[provider];
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  allowsClaudeOrganizationPlans(): boolean {
    return this.deps.store.get(CONSENT_KEY) === CONSENT_VERSION;
  }

  setClaudeOrganizationPlans(allowed: boolean): void {
    this.deps.store.set(CONSENT_KEY, allowed ? CONSENT_VERSION : undefined);
    this.invalidate("claude");
  }

  getCustomPath(provider: NativeRuntimeProvider): string {
    return this.deps.store.get(CUSTOM_PATH_KEY_PREFIX + provider) ?? "";
  }

  setCustomPath(provider: NativeRuntimeProvider, value: string): void {
    this.deps.store.set(CUSTOM_PATH_KEY_PREFIX + provider, value.trim() || undefined);
    this.invalidate(provider);
  }

  resolveExecutable(provider: NativeRuntimeProvider): string | undefined {
    const customPath = this.getCustomPath(provider);
    return resolveExecutable(provider, {
      platform: this.deps.platform,
      home: this.deps.homedir(),
      env: this.deps.processEnv(),
      pathDelimiter: this.deps.pathDelimiter,
      joinPath: this.deps.joinPath,
      isFile: this.deps.isFile,
      customPath: customPath && this.deps.isFile(customPath) ? customPath : undefined,
    });
  }

  async diagnose(provider: NativeRuntimeProvider, signal?: AbortSignal): Promise<NativeRuntimeSnapshot> {
    this.invalidate(provider);
    const generation = this.generations[provider];
    this.publish({ ...this.snapshots[provider], status: "checking", error: undefined });
    let snapshot: NativeRuntimeSnapshot;
    try {
      snapshot = (await this.check(provider, signal)).snapshot;
    } catch (error) {
      snapshot = {
        provider,
        status: "error",
        models: [],
        error: error instanceof Error ? error.message : String(error),
        checkedAt: this.deps.now(),
      };
    }
    // A newer check or a settings change superseded this one.
    if (generation !== this.generations[provider]) return this.snapshots[provider];
    this.publish(snapshot);
    return snapshot;
  }

  async completeWithClaude(request: {
    model: string;
    effort?: ClaudeEffort;
    systemPrompt: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const runtime = await this.ensureAllowed("claude", request.signal);
    assertClaudeVersionSupportsModel(request.model, runtime.version);
    const cwd = this.deps.makeTempDir();
    try {
      let systemPromptFile: string | undefined;
      if (request.systemPrompt.length > LONG_SYSTEM_PROMPT_CHARS) {
        systemPromptFile = this.deps.joinPath(cwd, "system-prompt.md");
        this.deps.writeFile(systemPromptFile, request.systemPrompt);
      }
      const result = await runClaudeOnce(this.deps.runner, {
        executablePath: runtime.executablePath,
        env: runtime.env,
        cwd,
        model: request.model,
        effort: request.effort,
        systemPrompt: request.systemPrompt,
        systemPromptFile,
        prompt: request.prompt,
        guard: { organization: runtime.decision.code === "organization-subscription" },
        signal: request.signal,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      return result.content;
    } finally {
      this.deps.removeDir(cwd);
    }
  }

  async completeWithGemini(request: {
    model: string;
    systemPrompt: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const runtime = await this.ensureAllowed("gemini", request.signal);
    const cwd = this.deps.makeTempDir();
    try {
      const result = await runAgyOnce(this.deps.runner, {
        executablePath: runtime.executablePath,
        env: runtime.env,
        cwd,
        model: request.model,
        systemPrompt: request.systemPrompt,
        prompt: request.prompt,
        platform: this.deps.platform,
        signal: request.signal,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      return result.content;
    } finally {
      this.deps.removeDir(cwd);
    }
  }

  /** `onError` receives the command to run by hand when no terminal opens. */
  openLoginTerminal(provider: NativeRuntimeProvider, onError: (command: string) => void): void {
    const executablePath = this.resolveExecutable(provider);
    if (!executablePath) {
      throw new Error(provider === "claude" ? "Claude Code is not installed." : "Antigravity CLI is not installed.");
    }
    // The account may change in the terminal; the next request checks again.
    this.invalidate(provider);
    const quoted = quoteForTerminal(executablePath);
    const command = provider === "claude" ? `${quoted} auth login` : quoted;
    this.deps.openTerminal(command, () => onError(command));
  }

  private async ensureAllowed(provider: NativeRuntimeProvider, signal?: AbortSignal): Promise<VerifiedRuntime> {
    const label = provider === "claude" ? "Claude" : "Gemini";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cached = this.verified.get(provider);
      if (cached && cached.key === this.cacheKey(provider) && cached.until > this.deps.now()) return cached;
      const generation = this.generations[provider];
      const { snapshot, runtime } = await this.check(provider, signal);
      // Consent, the executable, or the login changed during the check.
      if (generation !== this.generations[provider]) continue;
      this.publish(snapshot);
      if (!runtime) {
        if (snapshot.decision) assertRuntimeAuthAllowed(provider, snapshot.decision);
        throw new Error(snapshot.error ?? `${label} Plan is not ready.`);
      }
      return runtime;
    }
    throw new Error(`${label} Plan settings changed while the connection was being checked. Try again.`);
  }

  private invalidate(provider: NativeRuntimeProvider): void {
    this.generations[provider] += 1;
    this.verified.delete(provider);
  }

  private cacheKey(provider: NativeRuntimeProvider): string {
    return verificationKey(this.resolveExecutable(provider), provider === "claude" && this.allowsClaudeOrganizationPlans());
  }

  private async check(
    provider: NativeRuntimeProvider,
    signal?: AbortSignal,
  ): Promise<{ snapshot: NativeRuntimeSnapshot; runtime?: VerifiedRuntime }> {
    // A new check replaces the previous verdict; a stale "allowed" entry must
    // never outlive a check that blocks or fails.
    this.verified.delete(provider);
    const generation = this.generations[provider];
    const checkedAt = this.deps.now();
    // Read the executable and consent once, so the cache key describes exactly
    // what this check verified.
    const executablePath = this.resolveExecutable(provider);
    const allowOrganizationPlans = provider === "claude" && this.allowsClaudeOrganizationPlans();
    if (!executablePath) {
      return {
        snapshot: {
          provider,
          status: "not-installed",
          models: [],
          error: provider === "claude" ? "Claude Code is not installed." : "Antigravity CLI is not installed.",
          checkedAt,
        },
      };
    }

    const environment = prepareNativePlanEnvironment(provider, this.deps.processEnv());
    if (provider === "claude") environment.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
    const versionResult = await this.deps.runner({
      executable: executablePath,
      args: ["--version"],
      env: environment.env,
      signal,
      timeoutMs: CHECK_TIMEOUT_MS,
    });
    if (versionResult.exitCode !== 0) {
      throw new Error(`${provider === "claude" ? "Claude Code" : "Antigravity CLI"} version check failed.`);
    }
    const version = firstLine(versionResult.stdout);

    let decision: RuntimeAuthDecision;
    let models: NativeRuntimeSnapshot["models"] = [];
    if (provider === "claude") {
      decision = await verifyClaudePlanAuth(executablePath, {
        environment,
        runner: this.deps.runner,
        managedSettingsInspector: this.deps.managedSettingsInspector,
        signal,
        allowOrganizationPlans,
      });
    } else {
      const result = await verifyAntigravityPlanAuth(executablePath, {
        environment,
        runner: this.deps.runner,
        signal,
      });
      decision = result.decision;
      models = result.models;
    }

    let runtime: VerifiedRuntime | undefined;
    if (decision.allowed) {
      runtime = {
        key: verificationKey(executablePath, allowOrganizationPlans),
        until: checkedAt + VERIFY_CACHE_MS,
        executablePath,
        env: environment.env,
        decision,
        version,
      };
      if (generation === this.generations[provider]) this.verified.set(provider, runtime);
    }

    return {
      snapshot: {
        provider,
        status: decision.allowed ? "ready" : decision.status === "login-required" ? "login-required" : "blocked",
        executablePath,
        version,
        models,
        decision,
        error: decision.allowed ? undefined : decision.reason,
        checkedAt,
      },
      runtime,
    };
  }

  private publish(snapshot: NativeRuntimeSnapshot): void {
    this.snapshots[snapshot.provider] = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function verificationKey(executablePath: string | undefined, allowOrganizationPlans: boolean): string {
  return `${executablePath ?? ""}|${allowOrganizationPlans}`;
}

export function assertClaudeVersionSupportsModel(model: string, version: string | undefined): void {
  const requirement = CLAUDE_MIN_VERSIONS.find((item) => item.pattern.test(model));
  const installed = parseVersion(version);
  if (!requirement || !installed) return;
  if (compareVersions(installed, parseVersion(requirement.version)!) < 0) {
    throw new Error(
      `${requirement.label} needs Claude Code ${requirement.version} or later (installed: ${installed.join(".")}). Update Claude Code, then run the check again in NotePack settings.`,
    );
  }
}

export function parseVersion(value: string | undefined): number[] | undefined {
  const match = value?.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compareVersions(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

let deviceStore: DeviceStore | undefined;

/**
 * Sets where device-local values (the Team/Enterprise consent and executable
 * paths) persist. The plugin passes Obsidian's per-vault local storage, which
 * never syncs with the vault. Until then nothing persists and guards stay closed.
 */
export function setNativeRuntimeDeviceStore(store: DeviceStore | undefined): void {
  deviceStore = store;
}

const configuredDeviceStore: DeviceStore = {
  get: (key) => deviceStore?.get(key),
  set: (key, value) => deviceStore?.set(key, value),
};

export function createDesktopNativeRuntimeDeps(): NativeRuntimeDeps {
  const fs = requireNode<typeof import("fs")>("fs");
  const os = requireNode<typeof import("os")>("os");
  const path = requireNode<typeof import("path")>("path");
  const { spawnSync } = requireNode<typeof import("child_process")>("child_process");
  return {
    runner: runNativeProcess,
    processEnv: () => ({ ...process.env }),
    platform: process.platform,
    homedir: () => os.homedir(),
    pathDelimiter: path.delimiter,
    joinPath: (...parts) => path.join(...parts),
    isFile: (candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    },
    managedSettingsInspector: () =>
      inspectClaudeManagedSettings({
        platform: process.platform,
        programFiles: process.env.ProgramFiles,
        existsSync: (candidate) => fs.existsSync(candidate),
        readdirSync: (candidate) => fs.readdirSync(candidate),
        joinPath: (...parts) => path.join(...parts),
        spawnSync: (command, args) => {
          const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
          return { status: result.status, error: result.error };
        },
      }),
    makeTempDir: () => fs.mkdtempSync(path.join(os.tmpdir(), "notepack-codex-runtime-")),
    removeDir: (candidate) => {
      try {
        fs.rmSync(candidate, { recursive: true, force: true });
      } catch {
        // The operating system clears its temporary directory eventually.
      }
    },
    writeFile: (candidate, content) => fs.writeFileSync(candidate, content, "utf8"),
    store: configuredDeviceStore,
    now: () => Date.now(),
    openTerminal: launchVisibleTerminal,
  };
}

let sharedRuntime: NativeRuntimeService | undefined;

/** The desktop runtime service, created on first use. */
export function getNativeRuntime(): NativeRuntimeService {
  sharedRuntime ??= new NativeRuntimeService(createDesktopNativeRuntimeDeps());
  return sharedRuntime;
}
