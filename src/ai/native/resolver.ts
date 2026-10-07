// Finds the installed Claude Code / Antigravity executables.
// Candidate locations follow CMDS Achmage (MIT) `NativeCliResolver.ts`, whose
// Claude paths are adapted from Claudian 2.0.41 (MIT); see THIRD_PARTY_NOTICES.md.

import type { NativeRuntimeProvider } from "./types.ts";

export interface ResolverEnvironment {
  platform: string;
  home: string;
  env: Record<string, string | undefined>;
  pathDelimiter: string;
  joinPath: (...parts: string[]) => string;
  isFile: (path: string) => boolean;
  customPath?: string;
}

export function executableCandidates(provider: NativeRuntimeProvider, context: ResolverEnvironment): string[] {
  const { platform, home, env, joinPath } = context;
  const candidates: string[] = [];
  if (context.customPath?.trim()) candidates.push(context.customPath.trim());

  if (provider === "claude") {
    if (platform === "win32") {
      const localAppData = env.LOCALAPPDATA ?? joinPath(home, "AppData", "Local");
      const programFiles = env.ProgramFiles ?? "C:\\Program Files";
      candidates.push(
        joinPath(home, ".local", "bin", "claude.exe"),
        joinPath(localAppData, "Microsoft", "WinGet", "Links", "claude.exe"),
        joinPath(programFiles, "WinGet", "Links", "claude.exe"),
        joinPath(home, ".claude", "local", "claude.exe"),
        joinPath(localAppData, "Claude", "claude.exe"),
        joinPath(programFiles, "Claude", "claude.exe"),
        joinPath(env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Claude", "claude.exe"),
      );
    } else {
      candidates.push(joinPath(home, ".local", "bin", "claude"));
      if (platform === "darwin") candidates.push("/opt/homebrew/bin/claude", "/usr/local/bin/claude");
      candidates.push(
        joinPath(home, ".claude", "local", "claude"),
        joinPath(home, ".volta", "bin", "claude"),
        joinPath(home, ".asdf", "shims", "claude"),
        joinPath(home, ".npm-global", "bin", "claude"),
        "/usr/bin/claude",
      );
    }
  } else if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA ?? joinPath(home, "AppData", "Local");
    candidates.push(
      joinPath(localAppData, "agy", "bin", "agy.exe"),
      joinPath(home, ".local", "bin", "agy.exe"),
      joinPath(home, ".gemini", "antigravity-cli", "bin", "agy.exe"),
      joinPath(localAppData, "Antigravity", "bin", "agy.exe"),
      joinPath(localAppData, "Programs", "Antigravity", "agy.exe"),
      joinPath(localAppData, "Google", "Antigravity", "agy.exe"),
      joinPath(env.ProgramFiles ?? "C:\\Program Files", "Antigravity", "agy.exe"),
    );
  } else {
    candidates.push(
      joinPath(home, ".local", "bin", "agy"),
      joinPath(home, ".gemini", "antigravity-cli", "bin", "agy"),
      "/opt/homebrew/bin/agy",
      "/usr/local/bin/agy",
      "/usr/bin/agy",
    );
  }

  // Only real executables on PATH; Windows .cmd shims would need a shell.
  const names =
    provider === "claude"
      ? platform === "win32"
        ? ["claude.exe"]
        : ["claude"]
      : platform === "win32"
        ? ["agy.exe"]
        : ["agy"];
  const pathValue = env.PATH ?? env.Path ?? "";
  for (const entry of pathValue.split(context.pathDelimiter).map((value) => value.trim()).filter(Boolean)) {
    for (const name of names) candidates.push(joinPath(entry, name));
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveExecutable(provider: NativeRuntimeProvider, context: ResolverEnvironment): string | undefined {
  return executableCandidates(provider, context).find((candidate) => context.isFile(candidate));
}
