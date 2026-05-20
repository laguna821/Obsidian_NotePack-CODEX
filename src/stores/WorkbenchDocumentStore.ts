import type {
  CardKind,
  CodexWorkbenchDocument,
  CodexWorkbenchLocalSettings,
  GhostNote,
  PackSession,
  ViewMode,
  WorkbenchCard,
} from "../types.ts";
import { normalizeCodexDocument, normalizeCodexLocalSettings } from "../data/codex-document.ts";

export type WorkbenchStoreEvent =
  | "cards-changed"
  | "document-changed"
  | "view-changed"
  | "selection-changed"
  | "multi-selection-changed"
  | "ghost-changed"
  | "local-settings-changed";

type Listener = () => void;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export class WorkbenchDocumentStore {
  private document: CodexWorkbenchDocument;
  private listeners: Map<WorkbenchStoreEvent, Set<Listener>> = new Map();
  private saveCallback: ((document: CodexWorkbenchDocument) => void) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  selectedCardId: string | null = null;
  selectedCardIds: Set<string> = new Set();
  multiSelectMode: boolean = false;
  private multiSelectAnchorId: string | null = null;
  viewMode: ViewMode = "board";

  constructor(document: CodexWorkbenchDocument) {
    this.document = normalizeCodexDocument(document);
  }

  setSaveCallback(cb: (document: CodexWorkbenchDocument) => void): void {
    this.saveCallback = cb;
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.document.updatedAt = Date.now();
      this.saveCallback?.(this.document);
      this.emit("document-changed");
    }, 250);
  }

  flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.document.updatedAt = Date.now();
    this.saveCallback?.(this.document);
    this.emit("document-changed");
  }

  on(event: WorkbenchStoreEvent, listener: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off(event: WorkbenchStoreEvent, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: WorkbenchStoreEvent): void {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  get title(): string {
    return this.document.title;
  }

  setTitle(title: string): void {
    const nextTitle = title.trim() || "Untitled Codex";
    if (this.document.title === nextTitle) return;
    this.document = normalizeCodexDocument({
      ...this.document,
      title: nextTitle,
      updatedAt: Date.now(),
    });
    this.emit("document-changed");
    this.scheduleSave();
  }

  getDocument(): CodexWorkbenchDocument {
    return this.document;
  }

  updateDocumentMeta(patch: Partial<CodexWorkbenchDocument>): void {
    this.document = normalizeCodexDocument({ ...this.document, ...patch, updatedAt: Date.now() });
    this.scheduleSave();
  }

  get localSettings(): CodexWorkbenchLocalSettings {
    return this.document.localSettings;
  }

  updateLocalSettings(patch: Partial<CodexWorkbenchLocalSettings>): void {
    this.document.localSettings = normalizeCodexLocalSettings({
      ...this.document.localSettings,
      ...patch,
    });
    this.emit("local-settings-changed");
    this.scheduleSave();
  }

  get cards(): WorkbenchCard[] {
    return this.document.cards;
  }

  getCard(id: string): WorkbenchCard | undefined {
    return this.document.cards.find((card) => card.id === id);
  }

  addCard(text: string, kind: CardKind = "capture", extra?: Partial<WorkbenchCard>): WorkbenchCard {
    const timestamp = Date.now();
    const card: WorkbenchCard = {
      id: generateId(),
      kind,
      status: "enriching",
      text,
      createdAt: timestamp,
      updatedAt: timestamp,
      contentType: "general",
      ...extra,
    };

    this.document.cards.push(card);
    this.emit("cards-changed");
    this.scheduleSave();
    return card;
  }

  updateCard(id: string, patch: Partial<WorkbenchCard>): void {
    const idx = this.document.cards.findIndex((card) => card.id === id);
    if (idx === -1) return;
    this.document.cards[idx] = { ...this.document.cards[idx], ...patch, updatedAt: Date.now() };
    this.emit("cards-changed");
    if (this.selectedCardId === id) this.emit("selection-changed");
    this.scheduleSave();
  }

  deleteCard(id: string): void {
    this.document.cards = this.document.cards.filter((card) => card.id !== id);
    if (this.selectedCardId === id) {
      this.selectedCardId = null;
      this.emit("selection-changed");
    }
    if (this.selectedCardIds.delete(id)) {
      this.emit("multi-selection-changed");
    }
    this.emit("cards-changed");
    this.scheduleSave();
  }

  softDeleteCard(id: string): void {
    const idx = this.document.cards.findIndex((card) => card.id === id);
    if (idx === -1) return;
    this.document.cards[idx] = {
      ...this.document.cards[idx],
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (this.selectedCardId === id) {
      this.selectedCardId = null;
      this.emit("selection-changed");
    }
    if (this.selectedCardIds.delete(id)) {
      this.emit("multi-selection-changed");
    }
    this.emit("cards-changed");
    this.scheduleSave();
  }

  restoreCard(id: string): void {
    const idx = this.document.cards.findIndex((card) => card.id === id);
    if (idx === -1) return;
    const next = { ...this.document.cards[idx], updatedAt: Date.now() };
    delete (next as Partial<WorkbenchCard>).deletedAt;
    this.document.cards[idx] = next;
    this.emit("cards-changed");
    this.scheduleSave();
  }

  purgeCardsDeletedBefore(timestamp: number): number {
    const before = this.document.cards.length;
    this.document.cards = this.document.cards.filter((card) => {
      return !(typeof card.deletedAt === "number" && card.deletedAt < timestamp);
    });
    const removed = before - this.document.cards.length;
    if (removed > 0) {
      this.emit("cards-changed");
      this.scheduleSave();
    }
    return removed;
  }

  setCardColor(id: string, color: string | undefined): void {
    this.updateCard(id, { color });
  }

  selectCard(id: string | null): void {
    this.selectedCardId = id;
    this.emit("selection-changed");
  }

  get selectedCard(): WorkbenchCard | undefined {
    if (!this.selectedCardId) return undefined;
    return this.getCard(this.selectedCardId);
  }

  toggleCardInSelection(id: string): void {
    if (!this.getCard(id)) return;
    if (this.selectedCardIds.has(id)) {
      this.selectedCardIds.delete(id);
    } else {
      this.selectedCardIds.add(id);
      this.multiSelectAnchorId = id;
    }
    this.emit("multi-selection-changed");
  }

  selectRangeFromAnchor(toId: string): void {
    if (!this.getCard(toId)) return;
    const visibleCards = this.cards.filter((card) => !card.deletedAt);
    const toIndex = visibleCards.findIndex((c) => c.id === toId);
    if (toIndex === -1) return;
    const anchor = this.multiSelectAnchorId;
    const fromIndex = anchor ? visibleCards.findIndex((c) => c.id === anchor) : -1;
    if (fromIndex === -1) {
      this.selectedCardIds.add(toId);
      this.multiSelectAnchorId = toId;
      this.emit("multi-selection-changed");
      return;
    }
    const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    for (let i = start; i <= end; i++) {
      this.selectedCardIds.add(visibleCards[i].id);
    }
    this.emit("multi-selection-changed");
  }

  setMultiSelection(ids: string[]): void {
    this.selectedCardIds = new Set(ids.filter((id) => this.getCard(id)));
    if (ids.length > 0) {
      this.multiSelectAnchorId = ids[ids.length - 1];
    }
    this.emit("multi-selection-changed");
  }

  clearMultiSelection(): void {
    if (this.selectedCardIds.size === 0 && this.multiSelectAnchorId === null) return;
    this.selectedCardIds.clear();
    this.multiSelectAnchorId = null;
    this.emit("multi-selection-changed");
  }

  setMultiSelectMode(on: boolean): void {
    if (this.multiSelectMode === on) return;
    this.multiSelectMode = on;
    if (!on) {
      this.selectedCardIds.clear();
      this.multiSelectAnchorId = null;
    }
    this.emit("multi-selection-changed");
  }

  get selectedCards(): WorkbenchCard[] {
    const out: WorkbenchCard[] = [];
    for (const id of this.selectedCardIds) {
      const card = this.getCard(id);
      if (card) out.push(card);
    }
    return out;
  }

  get ghostNotes(): GhostNote[] {
    return this.document.ghostNotes;
  }

  addGhostNote(ghost: GhostNote): void {
    this.document.ghostNotes.push(ghost);
    this.emit("ghost-changed");
    this.scheduleSave();
  }

  updateGhostNote(id: string, patch: Partial<GhostNote>): void {
    const idx = this.document.ghostNotes.findIndex((ghost) => ghost.id === id);
    if (idx === -1) return;
    this.document.ghostNotes[idx] = { ...this.document.ghostNotes[idx], ...patch };
    this.emit("ghost-changed");
    this.scheduleSave();
  }

  removeGhostNote(id: string): void {
    this.document.ghostNotes = this.document.ghostNotes.filter((ghost) => ghost.id !== id);
    this.emit("ghost-changed");
    this.scheduleSave();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.emit("view-changed");
  }

  addPackSession(session: PackSession): void {
    this.document.packHistory.push(session);
    if (this.document.packHistory.length > 10) {
      this.document.packHistory = this.document.packHistory.slice(-10);
    }
    this.scheduleSave();
  }

  incrementPity(): void {
    this.document.pityCounter += 1;
    this.scheduleSave();
  }

  resetPity(): void {
    this.document.pityCounter = 0;
    this.scheduleSave();
  }

  get pityCounter(): number {
    return this.document.pityCounter || 0;
  }

  get enrichedCards(): WorkbenchCard[] {
    return this.cards.filter(
      (card) => card.status === "ready" && card.category && card.deletedAt === undefined,
    );
  }

  get activeCards(): WorkbenchCard[] {
    return this.cards.filter((card) => card.deletedAt === undefined);
  }

  get trashedCards(): WorkbenchCard[] {
    return this.cards.filter((card) => card.deletedAt !== undefined);
  }
}
