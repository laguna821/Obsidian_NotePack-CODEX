// ── KanbanView: Columns Grouped by Content Type ─────────────────────────

import type { App } from "obsidian";
import type { WorkbenchDocumentStore } from "../stores/WorkbenchDocumentStore";
import type { ContentType } from "../types";
import { CONTENT_TYPE_LABELS, CONTENT_TYPE_ICONS, ALL_CONTENT_TYPES } from "../types";
import { CardElement } from "../components/CardElement";

// The kanban column order (subset of content types that are most useful)
const KANBAN_COLUMNS: ContentType[] = [
  "question", "claim", "idea", "reference", "task",
  "reflection", "definition", "thesis", "general",
];

export class KanbanView {
  containerEl: HTMLElement;
  private app: App;
  private store: WorkbenchDocumentStore;
  private cardElements: Map<string, CardElement> = new Map();
  private onClick: (id: string) => void;
  private onDoubleClick: (id: string) => void;

  constructor(
    parentEl: HTMLElement,
    store: WorkbenchDocumentStore,
    onClick: (id: string) => void,
    onDoubleClick: (id: string) => void,
    app: App,
  ) {
    this.app = app;
    this.store = store;
    this.onClick = onClick;
    this.onDoubleClick = onDoubleClick;
    this.containerEl = parentEl.createDiv({ cls: "np-kanban" });
    this.render();
  }

  render(): void {
    const cards = this.store.cards.filter((c) => !c.isArchived);
    const selectedId = this.store.selectedCardId;

    // Group cards by content type
    const groups = new Map<ContentType, typeof cards>();
    cards.forEach((card) => {
      const ct = card.contentType || "general";
      if (!groups.has(ct)) groups.set(ct, []);
      groups.get(ct)!.push(card);
    });

    // Clear old card elements
    this.cardElements.forEach((el) => el.destroy());
    this.cardElements.clear();
    this.containerEl.empty();

    const scrollContainer = this.containerEl.createDiv({ cls: "np-kanban-scroll" });

    // Only show columns that have cards or are in the priority list
    const activeColumns = KANBAN_COLUMNS.filter(
      (ct) => groups.has(ct) && groups.get(ct)!.length > 0,
    );

    // Also include any types not in the priority list that have cards
    for (const [ct] of groups) {
      if (!activeColumns.includes(ct)) {
        activeColumns.push(ct);
      }
    }

    activeColumns.forEach((ct) => {
      const columnCards = groups.get(ct) || [];
      if (columnCards.length === 0) return;

      const column = scrollContainer.createDiv({ cls: "np-kanban-column" });

      // Column header
      const header = column.createDiv({ cls: "np-kanban-column-header" });
      header.createSpan({
        text: `${CONTENT_TYPE_ICONS[ct]} ${CONTENT_TYPE_LABELS[ct]}`,
      });
      header.createSpan({
        cls: "np-kanban-column-count",
        text: `${columnCards.length}`,
      });

      // Column body
      const body = column.createDiv({ cls: "np-kanban-column-body" });

      columnCards
        .sort((a, b) => b.createdAt - a.createdAt)
        .forEach((card) => {
          const cardEl = new CardElement(this.app, card, this.onClick, this.onDoubleClick);
          cardEl.setSelected(card.id === selectedId);
          this.cardElements.set(card.id, cardEl);
          body.appendChild(cardEl.el);
        });
    });

    if (activeColumns.length === 0) {
      scrollContainer.createDiv({
        cls: "np-kanban-empty",
        text: "카드를 추가하면 유형별로 정리됩니다",
      });
    }
  }

  destroy(): void {
    this.cardElements.forEach((el) => el.destroy());
    this.cardElements.clear();
    this.containerEl.remove();
  }
}
