// ── Composer: Quick Capture Input ─────────────────────────────────────────

import type { App } from "obsidian";
import { t } from "../i18n";
import { MarkdownEditor } from "./MarkdownEditor";

export interface ComposerOptions {
  app: App;
  initialHeight?: number;
  onHeightChange?: (height: number) => void;
  onExpand?: (currentText: string) => void;
}

export class Composer {
  containerEl: HTMLElement;
  private editor: MarkdownEditor;
  private submitBtnEl: HTMLButtonElement;
  private onSubmit: (text: string) => void;

  constructor(parentEl: HTMLElement, onSubmit: (text: string) => void, opts: ComposerOptions) {
    this.onSubmit = onSubmit;
    this.containerEl = parentEl.createDiv({ cls: "np-composer" });

    const inputRow = this.containerEl.createDiv({ cls: "np-composer-row" });

    this.editor = new MarkdownEditor(inputRow, {
      placeholder: t("composerPlaceholder"),
      minRows: 2,
      enterToSubmit: true,
      autoResizeMaxPx: 480,
      onSubmit: () => this.submit(),
      app: opts.app,
      livePreview: true,
      resizable: true,
      initialHeight: opts.initialHeight,
      onHeightChange: opts.onHeightChange,
      onExpand: opts.onExpand ? () => opts.onExpand!(this.editor.getValue()) : undefined,
    });

    this.submitBtnEl = inputRow.createEl("button", {
      cls: "np-composer-submit",
      text: t("addNote"),
    });
    this.submitBtnEl.addEventListener("click", () => this.submit());
  }

  getValue(): string {
    return this.editor.getValue();
  }

  setValue(value: string): void {
    this.editor.setValue(value);
  }

  private submit(): void {
    const text = this.editor.getValue().trim();
    if (!text) return;
    this.onSubmit(text);
    this.editor.setValue("");
    this.editor.focus();
  }

  focus(): void {
    this.editor.focus();
  }

  destroy(): void {
    this.editor.destroy();
    this.containerEl.remove();
  }
}
