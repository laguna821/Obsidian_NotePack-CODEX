import { renderPackPreferences } from "./PackPreferenceControls";
import { DOMAINS, normalizePackPreferences, type PackPreferences } from "../ai/pack-preferences";
import { Modal, Notice, type App } from "obsidian";
import { generatePack, generateCardGuidance } from "../ai/notepack-engine";
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
  private readonly onPreferencesSave?: (preferences: PackPreferences) => void;
  private readonly onKeepCard: (packCard: PackCard, packId: string) => void;

  private session: PackSession | null = null;
  private closed = false;
  private preferenceField: HTMLFieldSetElement | null = null;
  private preferencePanel: HTMLDetailsElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private cardElements: PackCardElement[] = [];
  private contentInnerEl: HTMLElement | null = null;
  private isGenerating = false;
  private stageTextEl: HTMLElement | null = null;
  private rerollButtonEl: HTMLButtonElement | null = null;
  private generationController: AbortController | null = null;

  constructor(
    app: App,
    store: WorkbenchDocumentStore,
    runtime: EffectiveWorkbenchRuntimeSettings,
    sourceCards: WorkbenchCard[],
    onKeepCard: (packCard: PackCard, packId: string) => void,
    onPreferencesSave?: (preferences: PackPreferences) => void,
  ) {
    super(app);
    this.store = store;
    this.runtime = runtime;
    this.sourceCards = sourceCards;
    this.onKeepCard = onKeepCard;
    this.onPreferencesSave = onPreferencesSave;
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

    this.preferencePanel = contentEl.createEl("details", { cls: "np-pack-preference-panel" });
    this.preferencePanel.open = true;
    this.preferencePanel.createEl("summary", { text: "이번 팩 설정" });
    this.preferenceField = this.preferencePanel.createEl("fieldset", { cls: "np-pack-preference-field" });
    this.preferenceField.createEl("legend", { text: "분야·등급·사고 성향" });
    const preferenceControls = this.preferenceField.createDiv();
    renderPackPreferences(preferenceControls, normalizePackPreferences(this.runtime.ai.packPreferences, this.runtime.ai), value => {
      this.runtime.ai.packPreferences = value;
      this.onPreferencesSave?.(value);
    });

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
      text: "카드 다섯 장 뽑기",
    });
    rerollButton.addEventListener("click", () => {
      if (this.isGenerating) return;
      void this.generate();
    });
    this.rerollButtonEl = rerollButton;
    this.cancelButton = controls.createEl("button", { text: "생성 취소" });
    this.cancelButton.hidden = true;
    this.cancelButton.addEventListener("click", () => this.generationController?.abort());

    this.contentInnerEl = contentEl.createDiv({ cls: "np-pack-modal-cards" });

    const footer = contentEl.createDiv({ cls: "np-pack-modal-footer" });
    const doneButton = footer.createEl("button", {
      cls: "np-pack-modal-done",
      text: t("packDone"),
    });
    doneButton.addEventListener("click", () => this.close());

    this.contentInnerEl.createEl("p", { text: "설정을 고른 뒤 카드 뽑기를 눌러주세요." });
  }

  private async generate(): Promise<void> {
    if (!this.contentInnerEl) return;
    if (this.isGenerating) return;

    this.isGenerating = true;
    if (this.preferenceField) this.preferenceField.disabled = true;
    if (this.cancelButton) this.cancelButton.hidden = false;
    this.rerollButtonEl?.setAttr("disabled", "true");
    this.rerollButtonEl?.addClass("np-pack-modal-reroll--busy");

    this.contentInnerEl.empty();
    this.cardElements.forEach(card => card.destroy());
    this.cardElements = [];
    this.renderLoadingSkeleton();
    this.setStageText(t("packStageSeed"));

    const seedStageStartedAt = Date.now();
    const controller = new AbortController();
    this.generationController = controller;

    try {
      const sourceIds = new Set(this.sourceCards.map((c) => c.id));
      const nearbyCards = this.store.cards.filter(
        (card) => !sourceIds.has(card.id) && card.status === "ready",
      );

      const elapsedInSeed = Date.now() - seedStageStartedAt;
      if (elapsedInSeed < STAGE_SEED_MIN_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, STAGE_SEED_MIN_MS - elapsedInSeed));
      }
      if (controller.signal.aborted) return;
      this.setStageText(t("packStageGenerating"));

      const nextSession = await generatePack(
        this.runtime,
        this.sourceCards,
        nearbyCards,
        this.store.pityCounter,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      this.session = nextSession;
      if (this.preferencePanel) this.preferencePanel.open = false;
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
      // Closing the modal cancels the request; there is nothing left to render.
      if (this.closed || !this.contentInnerEl) return;
      this.contentInnerEl.empty();
      this.stageTextEl = null;
      const errorEl = this.contentInnerEl.createDiv({ cls: "np-pack-modal-error" });
      errorEl.createEl("h4", { text: controller.signal.aborted ? "생성을 취소했습니다" : "카드를 생성하지 못했습니다" });
      errorEl.createEl("p", {
        text: controller.signal.aborted ? "이전 팩은 그대로 유지됩니다." : error instanceof Error ? error.message : "Unknown error",
      });

      this.renderCards();
      const executionState = getActiveModelExecutionState(this.runtime.ai);
      if (!controller.signal.aborted && !executionState.canExecute) {
        errorEl.createEl("p", {
          cls: "np-pack-modal-error-hint",
          text: executionState.message || t("noApiKey"),
        });
      }
    } finally {
      if (this.generationController === controller) this.generationController = null;
      if (!this.closed && controller.signal.aborted && this.stageTextEl) {
        this.contentInnerEl?.empty(); this.stageTextEl = null;
        this.contentInnerEl?.createEl("p", { text: "생성을 취소했습니다. 이전 팩은 유지됩니다." });
        this.renderCards();
      }
      this.isGenerating = false;
      if (this.preferenceField) this.preferenceField.disabled = false;
      if (this.cancelButton) this.cancelButton.hidden = true;
      if (this.session) this.rerollButtonEl?.setText("다시 뽑기");
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
    infoEl.createSpan({ text: `${this.session.cards.length}장의 글감` });
    if (this.session.generationSettings) {
      const settings = this.session.generationSettings;
      infoEl.createSpan({ text: `${DOMAINS[settings.domain]} · ${settings.promptMode === "custom" ? "사용자 난도 프롬프트" : `난도 ${settings.difficulty}`}` });
    }

    const grid = this.contentInnerEl.createDiv({ cls: "np-pack-modal-grid" });
    this.session.cards.forEach((card, index) => {
      const cardEl = new PackCardElement(
        card,
        (cardId) => this.handleKeep(cardId),
        (cardId) => this.handleDiscard(cardId),
        async signal => {
          const session = this.session!;
          const next = await generateCardGuidance(this.runtime, card, signal);
          signal.throwIfAborted();
          if (this.closed || this.session !== session) throw new Error("팩이 변경되어 도움 생성을 중단했습니다.");
          this.store.updatePackGuidance(session.packId, card.id, card.main_question, next);
          return next;
        },
      );
      cardEl.el.classList.add("np-pack-card--entering");
      cardEl.el.style.animationDelay = `${index * 80}ms`;
      if (this.session!.keptIds.includes(card.id)) cardEl.markKept();
      else if (this.session!.discardedIds.includes(card.id)) cardEl.markDiscarded();
      this.cardElements.push(cardEl);
      grid.appendChild(cardEl.el);
    });
  }

  private handleKeep(cardId: number): void {
    if (!this.session) return;

    const card = this.session.cards.find((item) => item.id === cardId);
    if (!card) return;

    if (this.session.keptIds.includes(cardId) || this.session.discardedIds.includes(cardId)) return;
    if (!this.session.keptIds.includes(cardId)) {
      this.session.keptIds.push(cardId);
    }

    const cardEl = this.cardElements.find(
      (element) => element.cardId === cardId,
    );
    if (cardEl) cardEl.markKept();

    this.onKeepCard(card, this.session.packId);
    new Notice(`Kept "${card.card_name}"`);
  }

  private handleDiscard(cardId: number): void {
    if (!this.session) return;

    if (this.session.keptIds.includes(cardId) || this.session.discardedIds.includes(cardId)) return;
    if (!this.session.discardedIds.includes(cardId)) {
      this.session.discardedIds.push(cardId);
    }

    const card = this.session.cards.find((item) => item.id === cardId);
    const cardEl = this.cardElements.find(
      (element) => element.cardId === cardId,
    );
    if (cardEl) cardEl.markDiscarded();

    new Notice("Card discarded");

    const totalDecided = this.session.keptIds.length + this.session.discardedIds.length;
    if (totalDecided >= this.session.cards.length) {
      window.setTimeout(() => {
        new Notice("Pack complete");
      }, 500);
    }
  }

  onClose(): void {
    this.closed = true;
    this.generationController?.abort();
    this.generationController = null;
    this.cardElements.forEach((cardEl) => cardEl.destroy());
    this.cardElements = [];
    this.modalEl.removeClass("np-pack-modal-frame");
    this.contentEl.empty();
  }
}
