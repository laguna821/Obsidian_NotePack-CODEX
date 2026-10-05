import { type App, Modal } from "obsidian";
import { t } from "../i18n";

/**
 * Asks a yes/no question in an Obsidian modal instead of window.confirm.
 * Resolves false when the user cancels or dismisses the modal.
 */
export function confirmAction(
  app: App,
  message: string,
  confirmLabel: string,
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, message, confirmLabel, destructive, resolve).open();
  });
}

class ConfirmModal extends Modal {
  private readonly message: string;
  private readonly confirmLabel: string;
  private readonly destructive: boolean;
  private readonly onResult: (confirmed: boolean) => void;
  private confirmed = false;

  constructor(
    app: App,
    message: string,
    confirmLabel: string,
    destructive: boolean,
    onResult: (confirmed: boolean) => void,
  ) {
    super(app);
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.destructive = destructive;
    this.onResult = onResult;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    for (const line of this.message.split("\n")) {
      contentEl.createEl("p", { text: line });
    }

    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: t("confirmCancel") }).addEventListener("click", () => {
      this.close();
    });
    const confirmButton = actions.createEl("button", {
      text: this.confirmLabel,
      cls: this.destructive ? "mod-warning" : "mod-cta",
    });
    confirmButton.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.onResult(this.confirmed);
  }
}
