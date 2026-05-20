// ── BoardView: MikaNote-inspired tile grid + sort/filter/trash ─────────────

import type { App } from "obsidian";
import type { WorkbenchDocumentStore } from "../stores/WorkbenchDocumentStore";
import { CardElement } from "../components/CardElement";
import { t } from "../i18n";
import type { CardSizePreset, WorkbenchCard } from "../types";

type SortMode = "recent" | "created" | "title" | "type";

export interface BoardViewActions {
  onBulkAnnotate?: () => void;
  onMultiSeedPack?: () => void;
}

const PACK_MAX_SEEDS = 5;

const TRASH_PURGE_AFTER_DAYS = 30;

const TILE_SIZE_PX: Record<CardSizePreset, number> = {
  S: 170,
  M: 220,
  L: 280,
  XL: 340,
};

const TILE_TEXT_LINES: Record<CardSizePreset, number> = {
  S: 4,
  M: 5,
  L: 8,
  XL: 11,
};

const SIZE_ORDER: CardSizePreset[] = ["S", "M", "L", "XL"];

export class BoardView {
  containerEl: HTMLElement;
  private app: App;
  private store: WorkbenchDocumentStore;
  private cardElements: Map<string, CardElement> = new Map();
  private controlsEl: HTMLElement;
  private actionBarEl: HTMLElement;
  private actionBarCountEl: HTMLElement | null = null;
  private actionBarAnnotateBtn: HTMLButtonElement | null = null;
  private actionBarPackBtn: HTMLButtonElement | null = null;
  private actionBarRetryBtn: HTMLButtonElement | null = null;
  private pinnedSectionEl: HTMLElement;
  private pinnedHeaderCountEl: HTMLElement;
  private pinnedGridEl: HTMLElement;
  private dividerEl: HTMLElement;
  private gridEl: HTMLElement;
  private onClick: (id: string) => void;
  private onDoubleClick: (id: string) => void;
  private actions: BoardViewActions;
  private bulkFailedIds: Set<string> = new Set();

  private sortMode: SortMode = "recent";
  private trashMode = false;

  constructor(
    parentEl: HTMLElement,
    store: WorkbenchDocumentStore,
    onClick: (id: string) => void,
    onDoubleClick: (id: string) => void,
    app: App,
    actions: BoardViewActions = {},
  ) {
    this.app = app;
    this.store = store;
    this.onClick = onClick;
    this.onDoubleClick = onDoubleClick;
    this.actions = actions;
    this.containerEl = parentEl.createDiv({ cls: "np-board" });
    this.controlsEl = this.containerEl.createDiv({ cls: "np-board-controls" });
    this.actionBarEl = this.containerEl.createDiv({ cls: "np-board-action-bar" });
    this.actionBarEl.style.display = "none";

    this.pinnedSectionEl = this.containerEl.createDiv({ cls: "np-board-section np-board-section--pinned" });
    const pinnedHeader = this.pinnedSectionEl.createDiv({ cls: "np-board-section-header" });
    pinnedHeader.createSpan({ text: t("pinnedSectionTitle") });
    this.pinnedHeaderCountEl = pinnedHeader.createSpan({ cls: "np-board-section-header-count" });
    this.pinnedGridEl = this.pinnedSectionEl.createDiv({ cls: "np-board-grid np-board-grid--pinned" });
    this.dividerEl = this.containerEl.createDiv({ cls: "np-board-divider" });
    this.gridEl = this.containerEl.createDiv({ cls: "np-board-grid np-board-grid--main" });

    const backgroundClickHandler = (event: MouseEvent) => {
      if (event.target === this.gridEl
        || event.target === this.pinnedGridEl
        || event.target === this.dividerEl) {
        this.store.clearMultiSelection();
      }
    };
    this.gridEl.addEventListener("click", backgroundClickHandler);
    this.pinnedGridEl.addEventListener("click", backgroundClickHandler);
    this.dividerEl.addEventListener("click", backgroundClickHandler);

    this.purgeOldTrash();
    this.applyTileSize();
    this.renderControls();
    this.renderActionBar();
    this.render();
  }

  setBulkFailedIds(ids: Iterable<string>): void {
    this.bulkFailedIds = new Set(ids);
    this.renderActionBar();
  }

  applyMultiSelection(): void {
    const selected = this.store.selectedCardIds;
    for (const [id, cardEl] of this.cardElements) {
      cardEl.setMultiSelected(selected.has(id));
    }
    if (selected.size === 0) {
      this.bulkFailedIds.clear();
    }
    this.renderActionBar();
  }

  applyTileSize(): void {
    const preset = (this.store.localSettings.cardSize ?? "M") as CardSizePreset;
    const px = TILE_SIZE_PX[preset] ?? TILE_SIZE_PX.M;
    const lines = TILE_TEXT_LINES[preset] ?? TILE_TEXT_LINES.M;
    this.containerEl.style.setProperty("--np-tile-size", `${px}px`);
    this.containerEl.style.setProperty("--np-tile-text-lines", String(lines));
  }

  applyLocalSettings(): void {
    this.applyTileSize();
    const current = (this.store.localSettings.cardSize ?? "M") as CardSizePreset;
    this.controlsEl.querySelectorAll<HTMLButtonElement>(".np-board-size-btn").forEach((btn) => {
      btn.classList.toggle("np-board-size-btn--active", btn.textContent === current);
    });
    // CSS variables changed → each card's line-clamp re-flows. Ask each card
    // to re-evaluate its +/− toggle so it appears or disappears to match the
    // new overflow state.
    for (const cardEl of this.cardElements.values()) {
      cardEl.recomputeFoldToggle();
    }
  }

  render(): void {
    const { pinned, rest } = this.collectCards();
    const selectedId = this.store.selectedCardId;
    const allCards = [...pinned, ...rest];
    const currentIds = new Set(allCards.map((c) => c.id));

    for (const [id, el] of this.cardElements) {
      if (!currentIds.has(id)) {
        el.destroy();
        this.cardElements.delete(id);
      }
    }

    allCards.forEach((card) => {
      let cardEl = this.cardElements.get(card.id);
      if (cardEl) {
        cardEl.update(card, card.id === selectedId);
      } else {
        cardEl = new CardElement(this.app, card, this.onClick, this.onDoubleClick, {
          onTogglePinned: (id) => this.handleTogglePinned(id),
          onSoftDelete: (id) => this.store.softDeleteCard(id),
          onRestore: (id) => this.store.restoreCard(id),
          onPurge: (id) => this.store.deleteCard(id),
          isTrashMode: () => this.trashMode,
          onMultiToggle: (id) => this.store.toggleCardInSelection(id),
          onRangeSelect: (id) => this.store.selectRangeFromAnchor(id),
          isMultiSelectMode: () => this.store.multiSelectMode,
          isInMultiSelection: (id) => this.store.selectedCardIds.has(id),
        });
        this.cardElements.set(card.id, cardEl);
      }
    });

    this.pinnedGridEl.empty();
    this.gridEl.empty();

    const hasPinned = pinned.length > 0 && !this.trashMode;
    this.pinnedSectionEl.style.display = hasPinned ? "" : "none";
    this.dividerEl.style.display = hasPinned ? "" : "none";

    if (hasPinned) {
      this.pinnedHeaderCountEl.textContent = String(pinned.length);
      pinned.forEach((card) => {
        const cardEl = this.cardElements.get(card.id);
        if (cardEl) this.pinnedGridEl.appendChild(cardEl.el);
      });
    }

    rest.forEach((card) => {
      const cardEl = this.cardElements.get(card.id);
      if (cardEl) this.gridEl.appendChild(cardEl.el);
    });

    if (rest.length === 0 && pinned.length === 0) {
      this.gridEl.createDiv({
        cls: "np-board-empty",
        text: this.trashMode ? t("trashEmpty") : t("emptyBoard"),
      });
    }
  }

  private collectCards(): { pinned: WorkbenchCard[]; rest: WorkbenchCard[] } {
    const pool = this.trashMode ? this.store.trashedCards : this.store.activeCards;
    const filtered = pool.filter((card) => {
      if (card.isArchived && !this.trashMode) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => this.compareCards(a, b));

    if (this.trashMode) {
      return { pinned: [], rest: sorted };
    }

    const pinned: WorkbenchCard[] = [];
    const rest: WorkbenchCard[] = [];
    sorted.forEach((card) => {
      if (card.isPinned) pinned.push(card);
      else rest.push(card);
    });
    return { pinned, rest };
  }

  private compareCards(a: WorkbenchCard, b: WorkbenchCard): number {
    switch (this.sortMode) {
      case "created":
        return b.createdAt - a.createdAt;
      case "title":
        return (a.title || a.text).localeCompare(b.title || b.text);
      case "type":
        return (a.contentType || "general").localeCompare(b.contentType || "general");
      case "recent":
      default:
        return b.updatedAt - a.updatedAt;
    }
  }

  private purgeOldTrash(): void {
    const cutoff = Date.now() - TRASH_PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    this.store.purgeCardsDeletedBefore(cutoff);
  }

  private renderControls(): void {
    this.controlsEl.empty();

    const sortGroup = this.controlsEl.createDiv({ cls: "np-board-control-group" });
    sortGroup.createSpan({ cls: "np-board-control-label", text: t("sortBy") });
    const sortSelect = sortGroup.createEl("select", { cls: "np-board-sort" });
    const sortOptions: Array<{ value: SortMode; label: string }> = [
      { value: "recent", label: t("sortRecent") },
      { value: "created", label: t("sortCreated") },
      { value: "title", label: t("sortTitle") },
      { value: "type", label: t("sortType") },
    ];
    sortOptions.forEach((opt) => {
      const optEl = sortSelect.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === this.sortMode) optEl.selected = true;
    });
    sortSelect.addEventListener("change", () => {
      this.sortMode = sortSelect.value as SortMode;
      this.render();
    });

    const sizeGroup = this.controlsEl.createDiv({ cls: "np-board-control-group np-board-size-group" });
    sizeGroup.createSpan({ cls: "np-board-control-label", text: t("cardSizeLabel") });
    const segmented = sizeGroup.createDiv({ cls: "np-board-size-segmented" });
    const currentSize = (this.store.localSettings.cardSize ?? "M") as CardSizePreset;
    SIZE_ORDER.forEach((preset) => {
      const btn = segmented.createEl("button", {
        cls: `np-board-size-btn${preset === currentSize ? " np-board-size-btn--active" : ""}`,
        text: preset,
        attr: { type: "button", "aria-label": `${t("cardSizeLabel")} ${preset}` },
      });
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (preset === (this.store.localSettings.cardSize ?? "M")) return;
        this.store.updateLocalSettings({ cardSize: preset });
      });
    });

    if (!this.trashMode) {
      const multiSelectButton = this.controlsEl.createEl("button", {
        cls: `np-board-multiselect-toggle ${this.store.multiSelectMode ? "np-board-multiselect-toggle--active" : ""}`,
        text: this.store.multiSelectMode ? t("multiSelectExit") : t("multiSelectEnter"),
      });
      multiSelectButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.store.setMultiSelectMode(!this.store.multiSelectMode);
        this.renderControls();
      });
    }

    const trashButton = this.controlsEl.createEl("button", {
      cls: `np-board-trash-toggle ${this.trashMode ? "np-board-trash-toggle--active" : ""}`,
      text: this.trashMode ? t("hideTrash") : t("showTrash"),
    });
    trashButton.addEventListener("click", () => {
      this.trashMode = !this.trashMode;
      this.renderControls();
      this.render();
    });
  }

  private renderActionBar(): void {
    const selected = this.store.selectedCardIds;
    const count = selected.size;
    if (count === 0) {
      this.actionBarEl.style.display = "none";
      this.actionBarEl.empty();
      this.actionBarCountEl = null;
      this.actionBarAnnotateBtn = null;
      this.actionBarPackBtn = null;
      this.actionBarRetryBtn = null;
      return;
    }

    this.actionBarEl.style.display = "";
    this.actionBarEl.empty();

    this.actionBarCountEl = this.actionBarEl.createSpan({
      cls: "np-board-action-bar-count",
      text: t("multiSelectionCount").replace("{n}", String(count)),
    });

    if (this.actions.onBulkAnnotate) {
      const btn = this.actionBarEl.createEl("button", {
        cls: "np-board-action-bar-btn",
        text: t("bulkAnnotate"),
        attr: { type: "button" },
      });
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.actions.onBulkAnnotate?.();
      });
      this.actionBarAnnotateBtn = btn;
    }

    if (this.actions.onMultiSeedPack) {
      const btn = this.actionBarEl.createEl("button", {
        cls: "np-board-action-bar-btn",
        text: t("bulkDrawPack"),
        attr: { type: "button" },
      });
      const cards = this.store.selectedCards;
      const tooMany = cards.length > PACK_MAX_SEEDS;
      const notReady = cards.some((c) => c.status !== "ready");
      if (tooMany || notReady) {
        btn.disabled = true;
        btn.title = tooMany ? t("packSeedTooMany") : t("packSeedNotReady");
      }
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.actions.onMultiSeedPack?.();
      });
      this.actionBarPackBtn = btn;
    }

    if (this.bulkFailedIds.size > 0) {
      const btn = this.actionBarEl.createEl("button", {
        cls: "np-board-action-bar-btn np-board-action-bar-btn--warn",
        text: t("bulkAnnotateRetryFailed").replace("{n}", String(this.bulkFailedIds.size)),
        attr: { type: "button" },
      });
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.store.setMultiSelection(Array.from(this.bulkFailedIds));
        this.bulkFailedIds.clear();
        this.actions.onBulkAnnotate?.();
      });
      this.actionBarRetryBtn = btn;
    }

    const clearBtn = this.actionBarEl.createEl("button", {
      cls: "np-board-action-bar-btn np-board-action-bar-btn--ghost",
      text: t("actionClearSelection"),
      attr: { type: "button" },
    });
    clearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.bulkFailedIds.clear();
      this.store.clearMultiSelection();
    });
  }

  private handleTogglePinned(cardId: string): void {
    const card = this.store.getCard(cardId);
    if (!card) return;
    this.store.updateCard(cardId, { isPinned: !card.isPinned });
  }

  destroy(): void {
    this.cardElements.forEach((el) => el.destroy());
    this.cardElements.clear();
    this.containerEl.remove();
  }
}
