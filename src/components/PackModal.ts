import { Modal, Notice, type App } from "obsidian";
import { generatePack } from "../ai/notepack-engine";
import { getActiveModelExecutionState } from "../ai/settings-registry";
import {
  getOutputLanguageModeLabel,
  type EffectiveWorkbenchRuntimeSettings,
} from "../data/runtime-settings";
import { t } from "../i18n";
import type { WorkbenchDocumentStore } from "../stores/WorkbenchDocumentStore";
import type { PackCard, PackSession, WorkbenchCard } from "../types";
import { PackCardElement } from "./PackCardElement";

const PACK_SIZE = 5;
const STAGE_SEED_MIN_MS = 300;

export class PackModal extends Modal {
  private readonly store: WorkbenchDocumentStore;
  private readonly runtime: EffectiveWorkbenchRuntimeSettings;
  private readonly sourceCards: WorkbenchCard[];
  private readonly onKeepCard: (packCard: PackCard) => void;

  private session: PackSession | null = null;
  private cardElements: PackCardElement[] = [];
  private contentInnerEl: HTMLElement | null = null;
  private isGenerating = false;
  private stageTextEl: HTMLElement | null = null;
  private rerollButtonEl: HTMLButtonElement | null = null;

  constructor(
    app: App,
    store: WorkbenchDocumentStore,
    runtime: EffectiveWorkbenchRuntimeSettings,
    sourceCards: WorkbenchCard[],
    onKeepCard: (packCard: PackCard) => void,
  ) {
    super(app);
    this.store = store;
    this.runtime = runtime;
    this.sourceCards = sourceCards;
    this.onKeepCard = onKeepCard;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    this.modalEl.addClass("np-pack-modal-frame");
    contentEl.addClass("np-pack-modal");

    const header = contentEl.createDiv({ cls: "np-pack-modal-header" });
    header.createEl("h2", {
      cls: "np-pack-modal-title",
      text: t("packModalTitle"),
    });

    const sourcePreview = header.createDiv({ cls: "np-pack-modal-source" });
    if (this.sourceCards.length === 1) {
      const source = this.sourceCards[0];
      sourcePreview.createSpan({ cls: "np-pack-modal-source-label", text: "Source card:" });
      sourcePreview.createSpan({
        cls: "np-pack-modal-source-text",
        text: source.text.substring(0, 80) + (source.text.length > 80 ? "..." : ""),
      });
    } else {
      sourcePreview.createSpan({
        cls: "np-pack-modal-source-label",
        text: t("packMultiSeedLabel").replace("{n}", String(this.sourceCards.length)) + ":",
      });
      const chips = sourcePreview.createDiv({ cls: "np-pack-modal-source-chips" });
      this.sourceCards.forEach((source, i) => {
        const chip = chips.createSpan({ cls: "np-pack-modal-source-chip" });
        chip.createSpan({ cls: "np-pack-modal-source-chip-index", text: `#${i + 1}` });
        chip.createSpan({
          cls: "np-pack-modal-source-chip-text",
          text: source.text.substring(0, 50) + (source.text.length > 50 ? "..." : ""),
        });
      });
    }

    const controls = contentEl.createDiv({ cls: "np-pack-modal-controls" });

    const explorationGroup = controls.createDiv({ cls: "np-pack-modal-control-group" });
    explorationGroup.createSpan({ cls: "np-pack-modal-control-label", text: `${t("explorationLabel")}:` });
    explorationGroup.createSpan({
      cls: "np-pack-modal-risk-value",
      text: `${this.runtime.packExploration}`,
    });

    const languageGroup = controls.createDiv({ cls: "np-pack-modal-control-group" });
    languageGroup.createSpan({ cls: "np-pack-modal-control-label", text: "Language:" });
    languageGroup.createSpan({
      cls: "np-pack-modal-risk-value",
      text: getOutputLanguageModeLabel(this.runtime.packLanguageMode, this.runtime.fixedPackLanguage),
    });

    const rerollButton = controls.createEl("button", {
      cls: "np-pack-modal-reroll",
      text: t("reroll"),
    });
    rerollButton.addEventListener("click", async () => {
      if (this.isGenerating) return;
      await this.generate();
    });
    this.rerollButtonEl = rerollButton;

    this.contentInnerEl = contentEl.createDiv({ cls: "np-pack-modal-cards" });

    const footer = contentEl.createDiv({ cls: "np-pack-modal-footer" });
    const doneButton = footer.createEl("button", {
      cls: "np-pack-modal-done",
      text: t("packDone"),
    });
    doneButton.addEventListener("click", () => this.close());

    await this.generate();
  }

  private async generate(): Promise<void> {
    if (!this.contentInnerEl) return;
    if (this.isGenerating) return;

    this.isGenerating = true;
    this.rerollButtonEl?.setAttr("disabled", "true");
    this.rerollButtonEl?.addClass("np-pack-modal-reroll--busy");

    this.contentInnerEl.empty();
    this.cardElements = [];
    this.renderLoadingSkeleton();
    this.setStageText(t("packStageSeed"));

    const seedStageStartedAt = Date.now();

    try {
      const sourceIds = new Set(this.sourceCards.map((c) => c.id));
      const nearbyCards = this.store.cards.filter(
        (card) => !sourceIds.has(card.id) && card.status === "ready",
      );

      const elapsedInSeed = Date.now() - seedStageStartedAt;
      if (elapsedInSeed < STAGE_SEED_MIN_MS) {
        await new Promise((resolve) => setTimeout(resolve, STAGE_SEED_MIN_MS - elapsedInSeed));
      }
      this.setStageText(t("packStageGenerating"));

      this.session = await generatePack(
        this.runtime,
        this.sourceCards,
        nearbyCards,
        this.store.pityCounter,
      );

      this.setStageText(t("packStageFinishing"));

      const hasRarePlus = this.session.cards.some((card) => card.rarity !== "common");
      if (hasRarePlus) {
        this.store.resetPity();
      } else {
        this.store.incrementPity();
      }

      this.store.addPackSession(this.session);
      this.contentInnerEl.empty();
      this.stageTextEl = null;
      this.renderCards();
    } catch (error) {
      this.contentInnerEl.empty();
      this.stageTextEl = null;
      const errorEl = this.contentInnerEl.createDiv({ cls: "np-pack-modal-error" });
      errorEl.createEl("h4", { text: "Failed to generate card pack" });
      errorEl.createEl("p", {
        text: error instanceof Error ? error.message : "Unknown error",
      });

      const executionState = getActiveModelExecutionState(this.runtime.ai);
      if (!executionState.canExecute) {
        errorEl.createEl("p", {
          cls: "np-pack-modal-error-hint",
          text: executionState.message || t("noApiKey"),
        });
      }
    } finally {
      this.isGenerating = false;
      this.rerollButtonEl?.removeAttribute("disabled");
      this.rerollButtonEl?.removeClass("np-pack-modal-reroll--busy");
    }
  }

  private renderLoadingSkeleton(): void {
    if (!this.contentInnerEl) return;

    const skeletonGrid = this.contentInnerEl.createDiv({ cls: "np-pack-modal-grid np-pack-modal-grid--skeleton" });
    for (let i = 0; i < PACK_SIZE; i += 1) {
      const card = skeletonGrid.createDiv({ cls: "np-pack-card-skeleton" });
      card.style.animationDelay = `${i * 90}ms`;
      card.createDiv({ cls: "np-pack-card-skeleton-badge" });
      card.createDiv({ cls: "np-pack-card-skeleton-line np-pack-card-skeleton-line--name" });
      card.createDiv({ cls: "np-pack-card-skeleton-line np-pack-card-skeleton-line--hook" });
      card.createDiv({ cls: "np-pack-card-skeleton-line np-pack-card-skeleton-line--question" });
      card.createDiv({ cls: "np-pack-card-skeleton-line np-pack-card-skeleton-line--question-short" });
    }

    this.stageTextEl = this.contentInnerEl.createDiv({
      cls: "np-pack-modal-stage-text",
      text: t("packStageSeed"),
    });
  }

  private setStageText(text: string): void {
    if (this.stageTextEl) {
      this.stageTextEl.setText(text);
    }
  }

  private renderCards(): void {
    if (!this.session || !this.contentInnerEl) return;

    const infoEl = this.contentInnerEl.createDiv({ cls: "np-pack-modal-info" });
    infoEl.createSpan({ text: `Seed: ${this.session.seed}` });
    infoEl.createSpan({ text: `Exploration: ${this.session.exploration ?? this.session.risk}` });
    infoEl.createSpan({ text: `Pity: ${this.store.pityCounter}` });

    const grid = this.contentInnerEl.createDiv({ cls: "np-pack-modal-grid" });
    this.session.cards.forEach((card, index) => {
      const cardEl = new PackCardElement(
        card,
        (cardId) => this.handleKeep(cardId),
        (cardId) => this.handleDiscard(cardId),
      );
      cardEl.el.classList.add("np-pack-card--entering");
      cardEl.el.style.animationDelay = `${index * 80}ms`;
      this.cardElements.push(cardEl);
      grid.appendChild(cardEl.el);
    });
  }

  private handleKeep(cardId: number): void {
    if (!this.session) return;

    const card = this.session.cards.find((item) => item.id === cardId);
    if (!card) return;

    if (!this.session.keptIds.includes(cardId)) {
      this.session.keptIds.push(cardId);
    }

    const cardEl = this.cardElements.find(
      (element) => element.el.querySelector(".np-pack-card-name")?.textContent === card.card_name,
    );
    if (cardEl) cardEl.markKept();

    this.onKeepCard(card);
    new Notice(`Kept "${card.card_name}"`);
  }

  private handleDiscard(cardId: number): void {
    if (!this.session) return;

    if (!this.session.discardedIds.includes(cardId)) {
      this.session.discardedIds.push(cardId);
    }

    const card = this.session.cards.find((item) => item.id === cardId);
    const cardEl = this.cardElements.find(
      (element) => element.el.querySelector(".np-pack-card-name")?.textContent === card?.card_name,
    );
    if (cardEl) cardEl.markDiscarded();

    new Notice("Card discarded");

    const totalDecided = this.session.keptIds.length + this.session.discardedIds.length;
    if (totalDecided >= this.session.cards.length) {
      setTimeout(() => {
        new Notice("Pack complete");
      }, 500);
    }
  }

  onClose(): void {
    this.cardElements.forEach((cardEl) => cardEl.destroy());
    this.cardElements = [];
    this.modalEl.removeClass("np-pack-modal-frame");
    this.contentEl.empty();
  }
}
