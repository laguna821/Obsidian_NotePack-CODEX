// CMDS Achmage's install -> detect -> official sign-in -> check flow,
// adapted to Obsidian components without adding a second token store.
import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "../i18n";
import { getNativeRuntime } from "../ai/native/runtime";
import { nativeInstallGuide } from "../ai/native/onboarding";
import type { NativeRuntimeProvider, NativeRuntimeSnapshot } from "../ai/native/types";

export function runtimeStatusLabel(snapshot: NativeRuntimeSnapshot): string {
  switch (snapshot.status) {
    case "checking": return t("settingsRuntimeStatusChecking");
    case "not-installed": return t("settingsRuntimeStatusNotInstalled");
    case "login-required": return t("settingsRuntimeStatusLoginRequired");
    case "blocked": return t("settingsRuntimeStatusBlocked");
    case "ready": return t(snapshot.requestVerifiedAt ? "settingsRuntimeResponseVerified" : "settingsRuntimeStatusReady");
    case "error": return t("settingsRuntimeStatusError");
    default: return t("settingsRuntimeStatusUnknown");
  }
}

export class NativePlanConnectionModal extends Modal {
  private unsubscribe?: () => void;
  private closed = false;
  private provider: NativeRuntimeProvider;
  private onChecked: () => Promise<void>;
  constructor(app: App, provider: NativeRuntimeProvider, onChecked: () => Promise<void>) {
    super(app); this.provider = provider; this.onChecked = onChecked;
  }

  onOpen(): void {
    this.closed = false;
    const runtime = getNativeRuntime();
    const title = this.provider === "claude" ? "Claude" : "Gemini";
    this.titleEl.setText(`${title} · ${t("settingsPlanConnections")}`);
    this.contentEl.createEl("p", { text: t("settingsRuntimeSharedLogin") });
    const guide = nativeInstallGuide(this.provider, process.platform);
    const install = this.contentEl.createDiv();
    new Setting(install).setName(`1. ${t("settingsRuntimeInstallGuide")}`).setHeading();
    install.createEl("p", { text: t("settingsRuntimeInstallSteps").replace("{shell}", guide.shell) });
    install.createEl("pre").createEl("code", { text: guide.command });
    const actions = install.createDiv({ cls: "notepack-settings-card-actions" });
    actions.createEl("button", { text: t("settingsRuntimeCopyInstall") }).addEventListener("click", () => {
      void navigator.clipboard.writeText(guide.command).then(() => new Notice(t("settingsRuntimeCopied")))
        .catch(() => new Notice(t("settingsRuntimeCopyFailed")));
    });
    actions.createEl("button", { text: t("settingsRuntimeOpenTerminal") }).addEventListener("click", () => {
      runtime.openSetupTerminal(() => new Notice(t("settingsRuntimeOpenTerminalFailed")));
    });
    actions.createEl("button", { text: t("settingsRuntimeOfficialGuide") }).addEventListener("click", () => window.open(guide.officialUrl, "_blank"));
    const login = this.contentEl.createDiv();
    new Setting(login).setName(`2. ${t("settingsRuntimeOpenLogin")}`).setHeading();
    login.createEl("p", { text: t(this.provider === "claude" ? "settingsRuntimeClaudeLoginSteps" : "settingsRuntimeGeminiLoginSteps") });
    const loginButton = login.createEl("button", { text: t("settingsRuntimeOpenLogin"), cls: "mod-cta" });
    loginButton.addEventListener("click", () => {
      try { runtime.openLoginTerminal(this.provider, command => new Notice(t("settingsRuntimeTerminalFailed").replace("{command}", command), 15000)); }
      catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
    });
    new Setting(this.contentEl).setName(`3. ${t("settingsRuntimeCheck")}`).setHeading();
    this.contentEl.createEl("p", { text: t("settingsRuntimeLoginHint") });
    const check = this.contentEl.createEl("button", { text: t("settingsRuntimeCheck") });
    check.addEventListener("click", () => { void this.onChecked(); });
    const status = this.contentEl.createDiv({ attr: { role: "status", "aria-live": "polite" } });
    const paint = () => {
      if (this.closed) return;
      const snapshot = runtime.getSnapshot(this.provider);
      loginButton.disabled = !snapshot.executablePath || snapshot.status === "checking";
      check.disabled = snapshot.status === "checking";
      install.toggleClass("notepack-hidden", Boolean(snapshot.executablePath));
      status.setText([runtimeStatusLabel(snapshot), snapshot.error].filter(Boolean).join(" · "));
    };
    this.unsubscribe = runtime.onChange(paint);
    paint();
    void this.onChecked();
  }
  onClose(): void { this.closed = true; this.unsubscribe?.(); this.contentEl.empty(); }
}
