// ── CardElement: square tile with content-type color + hover actions ─────
//
// Visual contract:
//   - Background colour comes from CONTENT_TYPE_COLORS — every card carries
//     its content-type identity at a glance.
//   - Text is always rendered at #1F2430 (near-black). Pastel backgrounds
//     are tuned so this contrast is legible.
//   - Annotation chips (Skeptical reader / Question generator / etc.) use a
//     fixed dark grey palette regardless of card bg — consistent reading
//     surface. The chip header keeps the agent label colored, value text is
//     light.
//   - Tiles are uniform aspect (CSS grid handles sizing). Long text gets
//     truncated with a "더보기" toggle.
//   - Hover surfaces a star (pin) and trash icon at top-right.
//   - Archived / deleted cards are dimmed.

import { Component, MarkdownRenderer, type App } from "obsidian";
import type { WorkbenchCard, ContentType } from "../types";
import {
  CONTENT_TYPE_COLORS,
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  RARITY_COLORS,
} from "../types";
import { getAnnotationPreviewText, getVisibleAnnotations } from "../data/annotations";

export interface CardElementCallbacks {
  onTogglePinned?: (cardId: string) => void;
  onSoftDelete?: (cardId: string) => void;
  onRestore?: (cardId: string) => void;
  onPurge?: (cardId: string) => void;
  isTrashMode?: () => boolean;
  onMultiToggle?: (cardId: string) => void;
  onRangeSelect?: (cardId: string) => void;
  isMultiSelectMode?: () => boolean;
  isInMultiSelection?: (cardId: string) => boolean;
}

export class CardElement {
  el: HTMLElement;
  private app: App;
  private card: WorkbenchCard;
  private isSelected: boolean;
  private isTextExpanded = false;
  private isAnnotationsExpanded = false;
  private onClick: (id: string) => void;
  private onDoubleClick: (id: string) => void;
  private callbacks: CardElementCallbacks;
  private markdownComponent: Component;
  private textEl: HTMLElement | null = null;
  private toggleHost: HTMLElement | null = null;

  constructor(
    app: App,
    card: WorkbenchCard,
    onClick: (id: string) => void,
    onDoubleClick: (id: string) => void,
    callbacks: CardElementCallbacks = {},
  ) {
    this.app = app;
    this.card = card;
    this.isSelected = false;
    this.onClick = onClick;
    this.onDoubleClick = onDoubleClick;
    this.callbacks = callbacks;
    this.markdownComponent = new Component();
    this.markdownComponent.load();
    this.el = document.createElement("div");
    this.render();
  }

  private render(): void {
    const card = this.card;
    const contentType: ContentType = card.contentType || "general";
    const tileColor = card.color || CONTENT_TYPE_COLORS[contentType];

    this.el.className = `np-tile np-tile--${card.status} np-tile--kind-${card.kind}`;
    if (this.isSelected) this.el.classList.add("np-tile--selected");
    if (this.callbacks.isInMultiSelection?.(card.id)) this.el.classList.add("np-tile--multi-selected");
    if (card.isPinned) this.el.classList.add("np-tile--pinned");
    if (card.isArchived) this.el.classList.add("np-tile--archived");
    if (card.deletedAt) this.el.classList.add("np-tile--trashed");
    if (this.isAnnotationsExpanded || this.isTextExpanded) {
      this.el.classList.add("np-tile--expanded");
    }
    if (card.rarity && card.rarity !== "common") {
      this.el.classList.add(`np-tile--${card.rarity}`);
      this.el.style.setProperty("--np-rarity-color", RARITY_COLORS[card.rarity]);
    }
    this.el.style.setProperty("--np-tile-bg", tileColor);

    this.el.empty();
    this.el.dataset.cardId = card.id;

    this.renderTopBar(contentType);
    this.renderHoverActions();
    this.renderBody();
    this.renderAnnotations();
    this.renderFooter();

    this.el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.shiftKey && this.callbacks.onRangeSelect) {
        this.callbacks.onRangeSelect(card.id);
        return;
      }
      const multiMode = this.callbacks.isMultiSelectMode?.() ?? false;
      if ((event.ctrlKey || event.metaKey || multiMode) && this.callbacks.onMultiToggle) {
        this.callbacks.onMultiToggle(card.id);
        return;
      }
      this.onClick(card.id);
    });
    this.el.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      this.onDoubleClick(card.id);
    });
  }

  setMultiSelected(on: boolean): void {
    this.el.classList.toggle("np-tile--multi-selected", on);
  }

  private renderTopBar(contentType: ContentType): void {
    const top = this.el.createDiv({ cls: "np-tile-top" });
    const typeBadge = top.createDiv({ cls: "np-tile-type" });
    typeBadge.createSpan({ cls: "np-tile-type-icon", text: CONTENT_TYPE_ICONS[contentType] || "📝" });
    typeBadge.createSpan({ cls: "np-tile-type-label", text: CONTENT_TYPE_LABELS[contentType] || "Note" });

    if (this.card.category) {
      top.createSpan({ cls: "np-tile-category", text: this.card.category });
    }

    if (this.card.status === "enriching") {
      top.createSpan({ cls: "np-tile-status np-tile-status--enriching", text: "분석 중" });
    } else if (this.card.status === "error") {
      top.createSpan({ cls: "np-tile-status np-tile-status--error", text: "오류" });
    }
  }

  private renderHoverActions(): void {
    const card = this.card;
    const trashMode = this.callbacks.isTrashMode?.() ?? false;
    const actions = this.el.createDiv({ cls: "np-tile-actions" });

    if (trashMode) {
      this.makeActionButton(actions, "↩", "복구", (event) => {
        event.stopPropagation();
        this.callbacks.onRestore?.(card.id);
      });
      this.makeActionButton(actions, "✕", "영구 삭제", (event) => {
        event.stopPropagation();
        this.callbacks.onPurge?.(card.id);
      }, "np-tile-action--danger");
      return;
    }

    const pinLabel = card.isPinned ? "고정 해제" : "고정";
    this.makeActionButton(actions, card.isPinned ? "★" : "☆", pinLabel, (event) => {
      event.stopPropagation();
      this.callbacks.onTogglePinned?.(card.id);
    }, card.isPinned ? "np-tile-action--active" : "");

    this.makeActionButton(actions, "✕", "휴지통으로", (event) => {
      event.stopPropagation();
      this.callbacks.onSoftDelete?.(card.id);
    }, "np-tile-action--danger");
  }

  private makeActionButton(
    parent: HTMLElement,
    text: string,
    title: string,
    handler: (event: MouseEvent) => void,
    extraCls = "",
  ): void {
    const btn = parent.createEl("button", {
      cls: `np-tile-action ${extraCls}`.trim(),
      text,
      attr: { type: "button", title, "aria-label": title },
    });
    btn.addEventListener("click", handler);
  }

  private renderBody(): void {
    const card = this.card;
    const body = this.el.createDiv({ cls: "np-tile-body" });

    if (card.title) {
      body.createEl("p", { cls: "np-tile-title", text: card.title });
    }

    const textEl = body.createDiv({ cls: "np-tile-text" });
    if (this.isTextExpanded) textEl.addClass("np-tile-text--full");

    // Reset the markdown component to prevent stacking embedded children
    // (e.g., link previews) on repeated renders of the same card.
    this.markdownComponent.unload();
    this.markdownComponent = new Component();
    this.markdownComponent.load();

    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    void MarkdownRenderer.render(this.app, card.text, textEl, sourcePath, this.markdownComponent);

    // Overflow can only be measured after async markdown commits AND after
    // the current line-clamp (which scales with --np-tile-text-lines) lays
    // out. evaluateFoldToggle is also called externally on board-size
    // changes so the +/− button reappears when the new size would clip.
    const toggleHost = body.createDiv({ cls: "np-tile-fold-host" });
    this.textEl = textEl;
    this.toggleHost = toggleHost;
    requestAnimationFrame(() => this.evaluateFoldToggle());
  }

  private evaluateFoldToggle(): void {
    const textEl = this.textEl;
    const toggleHost = this.toggleHost;
    if (!textEl || !toggleHost) return;
    if (!textEl.isConnected) return;
    toggleHost.empty();
    const isOverflowing = this.isTextExpanded || textEl.scrollHeight > textEl.clientHeight + 1;
    if (!isOverflowing) return;
    const toggle = toggleHost.createEl("button", {
      cls: "np-tile-fold-toggle",
      text: this.isTextExpanded ? "−" : "+",
      attr: {
        type: "button",
        "aria-label": this.isTextExpanded ? "접기" : "더보기",
        title: this.isTextExpanded ? "접기" : "더보기",
      },
    });
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      this.isTextExpanded = !this.isTextExpanded;
      this.render();
    });
  }

  recomputeFoldToggle(): void {
    requestAnimationFrame(() => this.evaluateFoldToggle());
  }

  private renderAnnotations(): void {
    const card = this.card;
    const annotations = getVisibleAnnotations(card);
    if (annotations.length === 0) return;
    if (card.status !== "ready" && card.status !== "enriching" && card.status !== "error") return;

    const wrapper = this.el.createDiv({ cls: "np-tile-anno-block" });

    const summary = wrapper.createEl("button", {
      cls: "np-tile-anno-toggle",
      attr: { type: "button" },
    });
    const runningCount = annotations.filter((a) => a.status === "running").length;
    const errorCount = annotations.filter((a) => a.status === "error").length;
    const readyCount = annotations.filter((a) => a.status === "ready").length;

    let label = `🤖 AI 주석 ${annotations.length}`;
    if (runningCount > 0) label += ` · 분석 중 ${runningCount}`;
    else if (errorCount > 0) label += ` · 오류 ${errorCount}`;
    else label += ` · 준비됨 ${readyCount}`;
    summary.createSpan({ cls: "np-tile-anno-toggle-label", text: label });
    summary.createSpan({
      cls: "np-tile-anno-toggle-caret",
      text: this.isAnnotationsExpanded ? "▴" : "▾",
    });
    summary.addEventListener("click", (event) => {
      event.stopPropagation();
      this.isAnnotationsExpanded = !this.isAnnotationsExpanded;
      this.render();
    });

    if (!this.isAnnotationsExpanded) return;

    const list = wrapper.createDiv({ cls: "np-tile-annotations" });
    annotations.forEach((annotation) => {
      const chip = list.createDiv({
        cls: `np-tile-anno np-tile-anno--${annotation.status}`,
      });
      const labelText = annotation.label || annotation.agentId || "AI";
      chip.createSpan({ cls: "np-tile-anno-label", text: labelText });
      chip.createSpan({
        cls: "np-tile-anno-text",
        text: getAnnotationPreviewText(annotation, 220),
      });
    });
  }

  private renderFooter(): void {
    const card = this.card;
    if (card.status === "ready" && card.confidence != null) {
      const bar = this.el.createDiv({ cls: "np-tile-confidence" });
      const fill = bar.createDiv({ cls: "np-tile-confidence-fill" });
      fill.style.width = `${Math.min(100, card.confidence)}%`;
    }
    if (card.status === "error" && card.statusText) {
      this.el.createDiv({ cls: "np-tile-error", text: card.statusText });
    }
  }

  update(card: WorkbenchCard, selected: boolean): void {
    const needsRerender =
      this.card.status !== card.status ||
      this.card.contentType !== card.contentType ||
      this.card.category !== card.category ||
      this.card.annotation !== card.annotation ||
      this.card.annotations !== card.annotations ||
      this.card.text !== card.text ||
      this.card.title !== card.title ||
      this.card.confidence !== card.confidence ||
      this.card.color !== card.color ||
      this.card.isPinned !== card.isPinned ||
      this.card.isArchived !== card.isArchived ||
      this.card.deletedAt !== card.deletedAt ||
      this.isSelected !== selected;

    this.card = card;
    this.isSelected = selected;
    if (needsRerender) this.render();
  }

  setSelected(selected: boolean): void {
    this.isSelected = selected;
    this.el.classList.toggle("np-tile--selected", selected);
  }

  destroy(): void {
    this.markdownComponent.unload();
    this.el.remove();
  }
}
