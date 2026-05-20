// ── CardPopoutView: single card opened in a separate Obsidian window ─────
//
// Reads the .codex file from disk, finds the card by id, lets the user edit
// it inline with sliders for font-size and line-height. Sliders persist on
// the card itself (popoutFontSize, popoutLineHeight) so reopening restores
// them. Edits are written back through the standard vault API which causes
// any open CodexFileView of the same path to reload.

import { ItemView, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type NotePackPlugin from "../../main";
import {
  parseCodexDocument,
  serializeCodexDocument,
} from "../data/codex-document";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { t } from "../i18n";
import type { WorkbenchCard } from "../types";

export const CARD_POPOUT_VIEW_TYPE = "notepack-codex-card-popout";

interface CardPopoutState {
  cardId: string;
  documentPath: string;
}

export class CardPopoutView extends ItemView {
  private readonly plugin: NotePackPlugin;
  private cardId = "";
  private documentPath = "";
  private editor: MarkdownEditor | null = null;
  private bodyEl: HTMLElement | null = null;
  private fontSize = 16;
  private lineHeight = 1.6;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: NotePackPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CARD_POPOUT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "NotePack Card";
  }

  getIcon(): string {
    return "sticky-note";
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const candidate = state as Partial<CardPopoutState> | null;
    if (candidate?.cardId && candidate.documentPath) {
      this.cardId = candidate.cardId;
      this.documentPath = candidate.documentPath;
      await this.renderCard();
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return {
      cardId: this.cardId,
      documentPath: this.documentPath,
    };
  }

  async onOpen(): Promise<void> {
    if (this.cardId && this.documentPath) {
      await this.renderCard();
    }
  }

  async onClose(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.flushSave();
    }
    this.editor?.destroy();
    this.editor = null;
  }

  private async renderCard(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("np-popout");

    const file = this.app.vault.getFileByPath(this.documentPath);
    if (!file) {
      container.createDiv({ cls: "np-popout-error", text: t("cardNotFound") });
      return;
    }

    const card = await this.loadCard(file);
    if (!card) {
      container.createDiv({ cls: "np-popout-error", text: t("cardNotFound") });
      return;
    }

    this.fontSize = card.popoutFontSize ?? 16;
    this.lineHeight = card.popoutLineHeight ?? 1.6;

    const sliderRow = container.createDiv({ cls: "np-popout-sliders" });
    const fontSection = sliderRow.createDiv({ cls: "np-popout-slider" });
    fontSection.createSpan({ text: t("popoutFontSize") });
    const fontInput = fontSection.createEl("input", {
      attr: { type: "range", min: "12", max: "32", step: "1" },
    });
    fontInput.value = String(this.fontSize);
    fontInput.addEventListener("input", () => {
      this.fontSize = Number(fontInput.value);
      this.applyTypography();
      this.scheduleMetaSave();
    });

    const lineSection = sliderRow.createDiv({ cls: "np-popout-slider" });
    lineSection.createSpan({ text: t("popoutLineHeight") });
    const lineInput = lineSection.createEl("input", {
      attr: { type: "range", min: "10", max: "24", step: "1" },
    });
    lineInput.value = String(Math.round(this.lineHeight * 10));
    lineInput.addEventListener("input", () => {
      this.lineHeight = Number(lineInput.value) / 10;
      this.applyTypography();
      this.scheduleMetaSave();
    });

    this.bodyEl = container.createDiv({ cls: "np-popout-body" });
    this.editor = new MarkdownEditor(this.bodyEl, {
      initialValue: card.text,
      minRows: 8,
      autoResizeMaxPx: 800,
      onChange: () => this.scheduleTextSave(),
      ariaLabel: "Edit card text in popout",
    });
    this.applyTypography();
  }

  private applyTypography(): void {
    if (!this.bodyEl) return;
    this.bodyEl.style.fontSize = `${this.fontSize}px`;
    this.bodyEl.style.lineHeight = String(this.lineHeight);
  }

  private async loadCard(file: TFile): Promise<WorkbenchCard | null> {
    try {
      const raw = await this.app.vault.read(file);
      const document = parseCodexDocument(raw, file.basename);
      return document.cards.find((card) => card.id === this.cardId) ?? null;
    } catch {
      return null;
    }
  }

  private scheduleTextSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, 400);
  }

  private scheduleMetaSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, 600);
  }

  private async flushSave(): Promise<void> {
    if (!this.editor) return;
    const file = this.app.vault.getFileByPath(this.documentPath);
    if (!file) return;

    try {
      const raw = await this.app.vault.read(file);
      const document = parseCodexDocument(raw, file.basename);
      const idx = document.cards.findIndex((card) => card.id === this.cardId);
      if (idx === -1) return;
      const next: WorkbenchCard = {
        ...document.cards[idx],
        text: this.editor.getValue(),
        popoutFontSize: this.fontSize,
        popoutLineHeight: this.lineHeight,
        updatedAt: Date.now(),
      };
      document.cards[idx] = next;
      await this.app.vault.modify(file, serializeCodexDocument(document));
    } catch (error) {
      console.warn("CardPopoutView save failed", error);
    }
  }
}
