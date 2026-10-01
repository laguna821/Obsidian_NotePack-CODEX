// Child-process plumbing for the native Plan runtimes (desktop only).
// Adapted from CMDS Achmage (MIT) `NativeProcess.ts`.

import type { NativeProcessOptions, NativeProcessResult } from "./types.ts";

type ChildProcessModule = typeof import("child_process");
type ChildProcess = import("child_process").ChildProcess;

/** Node's require, resolved lazily so mobile builds and tests never touch it. */
export function getNodeRequire(): NodeRequire {
  const candidate = (globalThis as { require?: NodeRequire }).require;
  if (typeof candidate === "function") return candidate;
  return (0, eval)("require") as NodeRequire;
}

export function requireNode<T>(id: string): T {
  return getNodeRequire()(id) as T;
}

const activeChildren = new Set<ChildProcess>();

/** Stops every runtime process still running, e.g. when the plugin unloads. */
export function terminateAllNativeProcesses(): void {
  for (const child of activeChildren) terminateProcessTree(child);
  activeChildren.clear();
}

export class NativeProcessTimeoutError extends Error {
  constructor(seconds: number) {
    super(`The runtime did not finish within ${seconds} seconds and was stopped.`);
    this.name = "NativeProcessTimeoutError";
  }
}

export function runNativeProcess(options: NativeProcessOptions): Promise<NativeProcessResult> {
  const { spawn } = requireNode<ChildProcessModule>("child_process");

  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let settled = false;
    let timedOut = false;

    const abort = () => terminateProcessTree(child);
    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            terminateProcessTree(child);
          }, options.timeoutMs)
        : undefined;
    if (options.signal?.aborted) {
      abort();
    } else {
      options.signal?.addEventListener("abort", abort, { once: true });
    }

    const finish = () => {
      settled = true;
      activeChildren.delete(child);
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    if (options.stdin !== undefined) {
      // A process that exits before reading its input raises EPIPE on stdin;
      // the exit code already reports that failure.
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(options.stdin);
    }
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      stdoutBuffer = emitLines(stdoutBuffer + chunk, options.onStdoutLine);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      stderrBuffer = emitLines(stderrBuffer + chunk, options.onStderrLine);
    });
    child.on("error", (error) => {
      if (settled) return;
      finish();
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      finish();
      if (stdoutBuffer) options.onStdoutLine?.(stdoutBuffer);
      if (stderrBuffer) options.onStderrLine?.(stderrBuffer);
      if (options.signal?.aborted) {
        reject(new DOMException("Request aborted", "AbortError"));
        return;
      }
      if (timedOut) {
        reject(new NativeProcessTimeoutError(Math.round((options.timeoutMs ?? 0) / 1000)));
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

/**
 * Opens a visible terminal so the user can sign in to the CLI themselves.
 * Spawn failures (for example no terminal emulator on Linux) go to `onError`.
 */
export function launchVisibleTerminal(command: string, onError: (error: Error) => void): void {
  const { spawn } = requireNode<ChildProcessModule>("child_process");
  let child: ChildProcess;
  if (process.platform === "win32") {
    const encoded = Buffer.from(command, "utf16le").toString("base64");
    child = spawn(
      "cmd.exe",
      ["/d", "/s", "/c", "start", "", "powershell.exe", "-NoExit", "-NoProfile", "-EncodedCommand", encoded],
      { detached: true, stdio: "ignore", windowsHide: false },
    );
  } else if (process.platform === "darwin") {
    const appleScript = ["on run argv", 'tell application "Terminal" to do script (item 1 of argv)', "end run"].join(
      "\n",
    );
    child = spawn("osascript", ["-e", appleScript, command], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("x-terminal-emulator", ["-e", "bash", "-lc", command], { detached: true, stdio: "ignore" });
  }
  child.once("error", onError);
  child.unref();
}

export function quoteForTerminal(value: string): string {
  if (process.platform === "win32") return `& '${value.replace(/'/g, "''")}'`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function emitLines(value: string, callback?: (line: string) => void): string {
  const lines = value.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  for (const line of lines) callback?.(line);
  return remainder;
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const { spawn } = requireNode<ChildProcessModule>("child_process");
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    // Without taskkill, stop at least the direct child.
    killer.once("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
}
