// ── ComposerExpandModal: full-room composer with extended toolbar + preview
//
// Opens a roomy modal for composing longer notes with an expanded markdown
// toolbar on the editor side and a live MarkdownRenderer preview on the
// right. Submit creates a card; close-without-submit hands the text back to
// the caller (so the inline composer can keep editing it).

import { Component, MarkdownRenderer, Modal, type App } from "obsidian";
import { t } from "../i18n";
import { MarkdownEditor } from "./MarkdownEditor";

export interface ComposerExpandModalCallbacks {
  onSubmit: (text: string) => void;
  onDismiss: (text: string) => void;
}

export class ComposerExpandModal extends Modal {
  private readonly initialText: string;
  private readonly callbacks: ComposerExpandModalCallbacks;
  private editor: MarkdownEditor | null = null;
  private previewEl: HTMLElement | null = null;
  private previewComponent: Component | null = null;
  private previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissedBySubmit = false;

  constructor(app: App, initialText: string, callbacks: ComposerExpandModalCallbacks) {
    super(app);
    this.initialText = initialText;
    this.callbacks = callbacks;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("np-composer-modal-frame");
    contentEl.addClass("np-composer-modal");

    const header = contentEl.createDiv({ cls: "np-composer-modal-header" });
    header.createEl("h2", {
      cls: "np-composer-modal-title",
      text: t("composerExpandTitle"),
    });
    header.createDiv({
      cls: "np-composer-modal-subtitle",
      text: t("composerExpandSubtitle"),
    });

    const body = contentEl.createDiv({ cls: "np-composer-modal-body" });
    const editorPane = body.createDiv({ cls: "np-composer-modal-pane np-composer-modal-pane--editor" });
    const previewPane = body.createDiv({ cls: "np-composer-modal-pane np-composer-modal-pane--preview" });
    previewPane.createDiv({ cls: "np-composer-modal-pane-label", text: t("composerExpandPreviewLabel") });
    this.previewEl = previewPane.createDiv({ cls: "np-composer-modal-preview" });
    this.previewComponent = new Component();
    this.previewComponent.load();

    this.editor = new MarkdownEditor(editorPane, {
      placeholder: t("composerPlaceholder"),
      initialValue: this.initialText,
      minRows: 12,
      autoResizeMaxPx: 800,
      onChange: () => this.schedulePreviewUpdate(),
      toolbarMode: "extended",
      ariaLabel: t("composerExpandTitle"),
    });

    const footer = contentEl.createDiv({ cls: "np-composer-modal-footer" });
    const cancelBtn = footer.createEl("button", {
      cls: "np-composer-modal-btn np-composer-modal-btn--cancel",
      text: t("composerExpandCancel"),
    });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = footer.createEl("button", {
      cls: "np-composer-modal-btn np-composer-modal-btn--submit",
      text: t("addNote"),
    });
    submitBtn.addEventListener("click", () => this.submit());

    this.editor.containerEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    this.renderPreview();
    setTimeout(() => this.editor?.focus(), 0);
  }

  private submit(): void {
    const value = this.editor?.getValue().trim() ?? "";
    if (!value) return;
    this.dismissedBySubmit = true;
    this.callbacks.onSubmit(value);
    this.close();
  }

  private schedulePreviewUpdate(): void {
    if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer);
    this.previewDebounceTimer = setTimeout(() => {
      this.previewDebounceTimer = null;
      this.renderPreview();
    }, 150);
  }

  private renderPreview(): void {
    if (!this.previewEl || !this.previewComponent) return;
    const text = this.editor?.getValue() ?? "";
    if (!text.trim()) {
      this.previewEl.empty();
      this.previewEl.addClass("np-composer-modal-preview--empty");
      this.previewEl.createDiv({
        cls: "np-composer-modal-preview-placeholder",
        text: t("composerExpandPreviewEmpty"),
      });
      return;
    }
    this.previewEl.removeClass("np-composer-modal-preview--empty");
    this.previewComponent.unload();
    this.previewComponent = new Component();
    this.previewComponent.load();
    this.previewEl.empty();
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    void MarkdownRenderer.render(this.app, text, this.previewEl, sourcePath, this.previewComponent);
  }

  onClose(): void {
    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = null;
    }
    this.previewComponent?.unload();
    this.previewComponent = null;
    if (!this.dismissedBySubmit) {
      const value = this.editor?.getValue() ?? "";
      this.callbacks.onDismiss(value);
    }
    this.editor?.destroy();
    this.editor = null;
    this.contentEl.empty();
  }
}
