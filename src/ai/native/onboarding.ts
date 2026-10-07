// Adapted from CMDS Achmage (MIT), NativeRuntimeService.getNativeRuntimeInstallGuide.
// Commands are displayed/copied only; the user runs them in the official shell.
import type { NativeRuntimeProvider } from "./types.ts";

export function nativeInstallGuide(provider: NativeRuntimeProvider, platform: string) {
  const windows = platform === "win32";
  const origin = provider === "claude" ? "https://claude.ai" : "https://antigravity.google/cli";
  return {
    command: windows ? `irm ${origin}/install.ps1 | iex` : `curl -fsSL ${origin}/install.sh | bash`,
    shell: windows ? "PowerShell" : platform === "darwin" ? "Terminal.app" : "Terminal",
    officialUrl: provider === "claude" ? "https://code.claude.com/docs/en/installation" : "https://antigravity.google/docs/cli/install",
  };
}
