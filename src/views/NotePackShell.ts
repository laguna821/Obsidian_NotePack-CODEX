import { Notice, setIcon, type App } from "obsidian";
import type NotePackPlugin from "../../main";
import { Composer } from "../components/Composer";
import { ComposerExpandModal } from "../components/ComposerExpandModal";
import { Inspector, type InspectorActions } from "../components/Inspector";
import { PackModal } from "../components/PackModal";
import { detectContentType } from "../ai/detect-content-type";
import { enrichCardAnnotations, getActiveAnnotationAgents, type EnrichContext } from "../ai/enrich";
import { generateSynthesis, shouldGenerateSynthesis } from "../ai/synthesis";
import {
  getActiveModelExecutionState,
  getModelExecutionState,
  getProviderDisplayName,
  resolveActiveChatModel,
} from "../ai/settings-registry";
import { buildEffectiveWorkbenchSettings, type EffectiveWorkbenchRuntimeSettings } from "../data/runtime-settings";
import { t } from "../i18n";
import type { WorkbenchDocumentStore, WorkbenchStoreEvent } from "../stores/WorkbenchDocumentStore";
import type { PackCard, ViewMode, WorkbenchCard } from "../types";
import { VaultService } from "../services/vault-service";
import { BoardView } from "./BoardView";
import { GraphView } from "./GraphView";
import { KanbanView } from "./KanbanView";
import { CARD_POPOUT_VIEW_TYPE } from "./CardPopoutView";

type ShellListener = [WorkbenchStoreEvent, () => void];

export interface NotePackShellOptions {
  app: App;
  plugin: NotePackPlugin;
  container: HTMLElement;
  store: WorkbenchDocumentStore;
  filePath?: string;
}

export class NotePackShell {
  private readonly app: App;
  private readonly plugin: NotePackPlugin;
  private readonly container: HTMLElement;
  private readonly store: WorkbenchDocumentStore;
  private filePath?: string;
  private readonly vaultService: VaultService;
  private readonly storeListeners: ShellListener[] = [];
  private readonly globalSettingsListener = () => {
    this.updateHeaderStatus();
    this.refreshInspector();
  };

  private composer: Composer | null = null;
  private inspector: Inspector | null = null;
  private currentView: BoardView | KanbanView | GraphView | null = null;
  private mainEl: HTMLElement | null = null;
  private providerStatusEl: HTMLElement | null = null;
  private offlineToggleEl: HTMLButtonElement | null = null;
  private headerTitleEl: HTMLElement | null = null;
  private headerPathEl: HTMLElement | null = null;
  private viewSwitcherEl: HTMLElement | null = null;
  private inspectorContainerEl: HTMLElement | null = null;
  private inspectorCollapseBtnEl: HTMLButtonElement | null = null;
  private inspectorResizeHandleEl: HTMLElement | null = null;
  private isResizingInspector = false;

  private readonly enrichControllers = new Map<string, AbortController>();
  private synthesisController: AbortController | null = null;
  private synthesisDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private synthesisInflight = false;
  private viewRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private viewRefreshLastAt = 0;

  constructor(options: NotePackShellOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.container = options.container;
    this.store = options.store;
    this.filePath = options.filePath;
    this.vaultService = new VaultService(this.app);
  }

  mount(): void {
    this.container.empty();
    this.container.addClass("np-container");

    const headerEl = this.container.createDiv({ cls: "np-header" });
    const leftHeader = headerEl.createDiv({ cls: "np-header-left" });
    this.headerTitleEl = leftHeader.createSpan({ cls: "np-header-title", text: this.store.title || "NotePack CODEX" });
    const helpButton = leftHeader.createSpan({
      cls: "np-header-help",
      text: "?",
      attr: { role: "button", tabindex: "0", title: t("whatIsCodexBody"), "aria-label": t("whatIsCodex") },
    });
    helpButton.addEventListener("click", () => new Notice(t("whatIsCodexBody"), 8000));
    this.headerPathEl = leftHeader.createSpan({ cls: "np-header-project", text: this.filePath || "" });

    this.viewSwitcherEl = headerEl.createDiv({ cls: "np-view-switcher" });
    this.renderViewSwitcher(this.viewSwitcherEl);

    const rightHeader = headerEl.createDiv({ cls: "np-header-right" });
    this.providerStatusEl = rightHeader.createSpan({ cls: "np-header-provider" });
    this.updateHeaderStatus();
    this.offlineToggleEl = rightHeader.createEl("button", {
      cls: "np-header-offline-toggle",
      attr: { type: "button", title: t("offlineCaptureHint") },
    });
    this.offlineToggleEl.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = !(this.store.localSettings.offlineCaptureMode ?? false);
      this.store.updateLocalSettings({ offlineCaptureMode: next });
    });
    this.updateOfflineToggle();

    this.composer = new Composer(this.container, (text) => this.handleCapture(text), {
      app: this.app,
      initialHeight: this.store.localSettings.composerHeight,
      onHeightChange: (height) => {
        this.store.updateLocalSettings({ composerHeight: height });
      },
      onExpand: (currentText) => this.openComposerExpandModal(currentText),
    });

    this.mainEl = this.container.createDiv({ cls: "np-main" });
    const viewContainer = this.mainEl.createDiv({ cls: "np-view-container" });
    const inspectorContainer = this.mainEl.createDiv({ cls: "np-inspector-container" });
    this.inspectorContainerEl = inspectorContainer;

    this.inspectorResizeHandleEl = inspectorContainer.createDiv({ cls: "np-inspector-resize-handle" });
    this.attachInspectorResizeHandler();

    this.inspectorCollapseBtnEl = inspectorContainer.createEl("button", {
      cls: "np-inspector-collapse-btn",
      attr: { type: "button" },
    });
    this.inspectorCollapseBtnEl.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = !(this.store.localSettings.inspectorCollapsed ?? false);
      this.store.updateLocalSettings({ inspectorCollapsed: next });
    });

    this.renderActiveView(viewContainer);
    this.inspector = new Inspector(inspectorContainer, this.buildInspectorActions(), this.app);
    this.refreshInspector();
    this.applyInspectorLayoutFromSettings();
    this.renderSynthesisBanner();

    this.listen("cards-changed", () => this.refreshView());
    this.listen("selection-changed", () => this.refreshInspector());
    this.listen("multi-selection-changed", () => {
      if (this.currentView instanceof BoardView) {
        this.currentView.applyMultiSelection();
      }
    });
    this.listen("view-changed", () => {
      if (!this.mainEl) return;
      const activeContainer = this.mainEl.querySelector(".np-view-container") as HTMLElement | null;
      if (activeContainer) this.renderActiveView(activeContainer);
      if (this.viewSwitcherEl) this.renderViewSwitcher(this.viewSwitcherEl);
    });
    this.listen("ghost-changed", () => this.renderSynthesisBanner());
    this.listen("document-changed", () => this.updateFileIdentity(this.filePath));
    this.listen("local-settings-changed", () => {
      this.globalSettingsListener();
      this.applyInspectorLayoutFromSettings();
      this.updateOfflineToggle();
      if (this.currentView instanceof BoardView) {
        this.currentView.applyLocalSettings();
      }
    });
    this.plugin.settingsStore.onChange(this.globalSettingsListener);
  }

  private applyInspectorLayoutFromSettings(): void {
    if (!this.inspectorContainerEl || !this.inspectorCollapseBtnEl) return;
    const ls = this.store.localSettings;
    const width = typeof ls.inspectorWidth === "number" ? ls.inspectorWidth : 340;
    const collapsed = ls.inspectorCollapsed ?? false;
    if (!this.isResizingInspector) {
      this.inspectorContainerEl.style.setProperty("--np-inspector-width", `${width}px`);
    }
    this.inspectorContainerEl.classList.toggle("np-inspector-container--collapsed", collapsed);
    this.inspectorCollapseBtnEl.empty();
    setIcon(this.inspectorCollapseBtnEl, collapsed ? "chevron-left" : "chevron-right");
    this.inspectorCollapseBtnEl.setAttribute(
      "aria-label",
      collapsed ? t("inspectorExpand") : t("inspectorCollapse"),
    );
    this.inspectorCollapseBtnEl.setAttribute(
      "title",
      collapsed ? t("inspectorExpand") : t("inspectorCollapse"),
    );
  }

  private attachInspectorResizeHandler(): void {
    const handle = this.inspectorResizeHandleEl;
    const container = this.inspectorContainerEl;
    if (!handle || !container) return;

    handle.addEventListener("pointerdown", (event: PointerEvent) => {
      if (this.store.localSettings.inspectorCollapsed) return;
      event.preventDefault();
      event.stopPropagation();
      this.isResizingInspector = true;
      handle.addClass("np-inspector-resize-handle--active");
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";

      const startX = event.clientX;
      const startWidth = container.getBoundingClientRect().width;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const next = Math.max(240, Math.min(640, startWidth - delta));
        container.style.setProperty("--np-inspector-width", `${next}px`);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        handle.removeClass("np-inspector-resize-handle--active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        const finalWidth = parseInt(
          getComputedStyle(container).getPropertyValue("--np-inspector-width"),
          10,
        );
        this.isResizingInspector = false;
        if (Number.isFinite(finalWidth) && finalWidth > 0) {
          this.store.updateLocalSettings({ inspectorWidth: finalWidth });
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  updateFileIdentity(filePath?: string, displayTitle?: string): void {
    this.filePath = filePath;
    if (this.headerTitleEl) {
      this.headerTitleEl.textContent = displayTitle || this.store.title || "NotePack CODEX";
    }
    if (this.headerPathEl) {
      this.headerPathEl.textContent = filePath || "";
      this.headerPathEl.classList.toggle("np-header-project--empty", !filePath);
    }
  }

  private listen(event: WorkbenchStoreEvent, listener: () => void): void {
    this.store.on(event, listener);
    this.storeListeners.push([event, listener]);
  }

  private getRuntimeSettings(): EffectiveWorkbenchRuntimeSettings {
    return buildEffectiveWorkbenchSettings(this.plugin.settingsStore.settings, this.store.localSettings);
  }

  private updateOfflineToggle(): void {
    if (!this.offlineToggleEl) return;
    const on = this.store.localSettings.offlineCaptureMode ?? false;
    this.offlineToggleEl.classList.toggle("np-header-offline-toggle--active", on);
    this.offlineToggleEl.textContent = on
      ? `● ${t("offlineCaptureToggle")}`
      : `○ ${t("offlineCaptureToggle")}`;
  }

  private updateHeaderStatus(): void {
    if (!this.providerStatusEl) return;

    const runtime = this.getRuntimeSettings();
    const settings = runtime.ai;
    const resolved = resolveActiveChatModel(settings);
    const executionState = getActiveModelExecutionState(settings);
    const agentCount = getActiveAnnotationAgents(runtime).length;
    const modeLabel = `${runtime.annotationMode} ${agentCount} AI`;

    if (!resolved) {
      this.providerStatusEl.className = "np-header-provider np-header-provider--warning";
      this.providerStatusEl.textContent = executionState.message;
      return;
    }

    const providerLabel = getProviderDisplayName(resolved.provider);
    this.providerStatusEl.className = `np-header-provider ${executionState.canExecute ? "" : "np-header-provider--warning"}`.trim();
    let text = executionState.canExecute
      ? `${providerLabel} | ${resolved.model.label} | ${modeLabel}`
      : `${providerLabel} | ${resolved.model.label} | ${modeLabel} | ${executionState.message}`;
    if (this.enrichControllers.size > 1) {
      text += ` | ${this.enrichControllers.size} pending`;
    }
    this.providerStatusEl.textContent = text;
  }

  private renderViewSwitcher(container: HTMLElement): void {
    container.empty();

    const modes: Array<{ mode: ViewMode; label: string }> = [
      { mode: "board", label: t("board") },
      { mode: "graph", label: t("graph") },
    ];

    modes.forEach(({ mode, label }) => {
      const button = container.createEl("button", {
        cls: `np-view-btn ${this.store.viewMode === mode ? "np-view-btn--active" : ""}`,
        text: label,
      });
      button.addEventListener("click", () => this.store.setViewMode(mode));
    });
  }

  private renderActiveView(container: HTMLElement): void {
    this.currentView?.destroy();
    container.empty();

    const onClick = (id: string) => this.store.selectCard(id);
    const onDoubleClick = (id: string) => this.store.selectCard(id);

    switch (this.store.viewMode) {
      case "kanban":
        this.currentView = new KanbanView(container, this.store, onClick, onDoubleClick, this.app);
        break;
      case "graph":
        this.currentView = new GraphView(container, this.store, onClick);
        break;
      case "board":
      default:
        this.currentView = new BoardView(container, this.store, onClick, onDoubleClick, this.app, {
          onBulkAnnotate: () => this.bulkAnnotateSelected(),
          onMultiSeedPack: () => this.openPackModalForCards(this.store.selectedCards),
        });
        break;
    }
  }

  private async bulkAnnotateSelected(): Promise<void> {
    const cards = this.store.selectedCards.filter((c) => !c.deletedAt && !c.isArchived);
    if (cards.length === 0) return;
    const runtime = this.getRuntimeSettings();
    const executionState = getActiveModelExecutionState(runtime.ai);
    if (!executionState.canExecute) {
      new Notice(executionState.message);
      return;
    }
    const confirmMsg = t("bulkAnnotateConfirm").replace("{n}", String(cards.length));
    if (!window.confirm(confirmMsg)) return;
    const { succeeded, failedIds } = await this.runBulkAnnotateQueue(cards.map((c) => c.id), 3);
    const doneMsg = t("bulkAnnotateDone")
      .replace("{done}", String(succeeded))
      .replace("{failed}", String(failedIds.length));
    new Notice(doneMsg, 5000);
    if (this.currentView instanceof BoardView) {
      this.currentView.setBulkFailedIds(failedIds);
    }
    this.store.setMultiSelectMode(false);
  }

  private async runBulkAnnotateQueue(
    ids: string[],
    concurrency: number,
  ): Promise<{ succeeded: number; failedIds: string[] }> {
    let succeeded = 0;
    const failedIds: string[] = [];
    for (let i = 0; i < ids.length; i += concurrency) {
      const chunk = ids.slice(i, i + concurrency);
      await Promise.allSettled(
        chunk.map(async (id) => {
          await this.enrichCardBackground(id);
          const card = this.store.getCard(id);
          if (card?.status === "ready" && (card.annotation || card.annotations?.some((a) => a.status === "ready"))) {
            succeeded += 1;
          } else {
            failedIds.push(id);
          }
        }),
      );
    }
    return { succeeded, failedIds };
  }

  private async handleCapture(text: string): Promise<void> {
    const heuristicType = detectContentType(text);
    const offline = this.store.localSettings.offlineCaptureMode ?? false;
    const card = this.store.addCard(text, "capture", {
      contentType: heuristicType,
      status: offline ? "ready" : "enriching",
    });

    this.store.selectCard(card.id);
    if (!offline) {
      this.enrichCardBackground(card.id);
    }
    this.checkSynthesisTrigger();
  }

  private async enrichCardBackground(cardId: string): Promise<void> {
    const runtime = this.getRuntimeSettings();
    const agents = getActiveAnnotationAgents(runtime);
    const runnableAgents = agents.filter((agent) => getModelExecutionState(runtime.ai, agent.modelId).canExecute);
    if (agents.length === 0 || runnableAgents.length === 0) {
      const executionState = agents[0]
        ? getModelExecutionState(runtime.ai, agents[0].modelId)
        : getActiveModelExecutionState(runtime.ai);
      this.store.updateCard(cardId, {
        status: "ready",
        statusText: executionState.message,
      });
      return;
    }

    this.enrichControllers.get(cardId)?.abort();
    const controller = new AbortController();
    this.enrichControllers.set(cardId, controller);
    this.updateHeaderStatus();

    try {
      const card = this.store.getCard(cardId);
      if (!card) return;

      this.store.updateCard(cardId, {
        status: "enriching",
        annotations: agents.map((agent, index) => ({
          id: `annotation-running-${agent.id}-${Date.now()}`,
          agentId: agent.id,
          label: agent.label,
          icon: agent.icon,
          color: agent.color,
          modelId: agent.modelId,
          mode: runtime.annotationMode,
          sequenceIndex: runtime.annotationMode === "sequential" ? index : undefined,
          status: "running",
          annotation: "",
          createdAt: Date.now(),
        })),
      });

      const context: EnrichContext[] = this.store.enrichedCards
        .filter((candidate) => candidate.id !== cardId)
        .slice(-15)
        .map((candidate) => ({
          id: candidate.id,
          text: candidate.text,
          category: candidate.category,
          annotation: candidate.annotation,
        }));

      const annotations = await enrichCardAnnotations(runtime, card, context, {
        signal: controller.signal,
        onTurnComplete: (snapshot) => {
          if (controller.signal.aborted) return;
          // Stream sequential debate turns into the UI as they arrive so the
          // user sees agents respond one at a time, not all at once.
          this.store.updateCard(cardId, { annotations: [...snapshot] });
        },
      });
      if (controller.signal.aborted) return;

      const primaryAnnotation = annotations.find((annotation) => annotation.status === "ready");
      const hasReadyAnnotation = Boolean(primaryAnnotation);
      const hasErrorAnnotation = annotations.some((annotation) => annotation.status === "error");

      this.store.updateCard(cardId, {
        status: hasReadyAnnotation ? "ready" : hasErrorAnnotation ? "error" : "ready",
        contentType: primaryAnnotation?.contentType ?? card.contentType,
        category: primaryAnnotation?.category ?? card.category,
        annotation: primaryAnnotation?.annotation ?? card.annotation,
        confidence: primaryAnnotation?.confidence ?? card.confidence,
        influencedByIds: primaryAnnotation?.influencedByIds ?? card.influencedByIds,
        isUnrelated: primaryAnnotation?.isUnrelated ?? card.isUnrelated,
        sources: primaryAnnotation?.sources ?? card.sources,
        annotations,
        statusText: hasReadyAnnotation
          ? ""
          : annotations.find((annotation) => annotation.status === "error")?.errorMessage ?? "Annotation failed",
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      this.store.updateCard(cardId, {
        status: "error",
        statusText: error instanceof Error ? error.message : "Enrichment failed",
      });
    } finally {
      if (this.enrichControllers.get(cardId) === controller) {
        this.enrichControllers.delete(cardId);
        this.updateHeaderStatus();
      }
    }
  }

  private checkSynthesisTrigger(): void {
    if (this.synthesisDebounceTimer) clearTimeout(this.synthesisDebounceTimer);
    this.synthesisDebounceTimer = setTimeout(() => {
      this.synthesisDebounceTimer = null;
      void this.runSynthesisIfDue();
    }, 500);
  }

  private async runSynthesisIfDue(): Promise<void> {
    if (this.synthesisInflight) return;

    const document = this.store.getDocument();
    const shouldGenerate = shouldGenerateSynthesis(
      this.store.enrichedCards,
      this.store.ghostNotes,
      document.lastGhostBlockCount || 0,
      document.lastGhostTimestamp || 0,
    );

    if (!shouldGenerate) return;

    this.synthesisController?.abort();
    const controller = new AbortController();
    this.synthesisController = controller;
    this.synthesisInflight = true;

    const ghostId = `ghost-${Date.now()}`;
    this.store.addGhostNote({
      id: ghostId,
      text: "",
      category: "",
      isGenerating: true,
    });

    try {
      const result = await generateSynthesis(
        this.getRuntimeSettings(),
        this.store.enrichedCards,
        document.lastGhostTexts || [],
      );

      if (controller.signal.aborted) {
        this.store.removeGhostNote(ghostId);
        return;
      }

      this.store.updateGhostNote(ghostId, {
        text: result.text,
        category: result.category,
        isGenerating: false,
      });

      this.store.updateDocumentMeta({
        lastGhostBlockCount: this.store.enrichedCards.length,
        lastGhostTimestamp: Date.now(),
        lastGhostTexts: [...(document.lastGhostTexts || []).slice(-4), result.text],
      });
    } catch {
      this.store.removeGhostNote(ghostId);
    } finally {
      this.synthesisInflight = false;
      if (this.synthesisController === controller) this.synthesisController = null;
    }
  }

  private renderSynthesisBanner(): void {
    this.container.querySelectorAll(".np-synthesis-banner").forEach((element) => element.remove());

    const ghosts = this.store.ghostNotes.filter((note) => !note.isGenerating && note.text);
    if (ghosts.length === 0) return;

    const latestGhost = ghosts[ghosts.length - 1];
    const banner = this.container.createDiv({ cls: "np-synthesis-banner" });
    banner.createSpan({ cls: "np-synthesis-icon", text: "S" });
    banner.createSpan({ cls: "np-synthesis-text", text: latestGhost.text });

    const actions = banner.createDiv({ cls: "np-synthesis-actions" });
    const claimButton = actions.createEl("button", {
      cls: "np-synthesis-action",
      text: t("claimSynthesis"),
    });
    claimButton.addEventListener("click", () => {
      this.store.addCard(latestGhost.text, "synthesis", {
        contentType: "thesis",
        category: latestGhost.category,
        status: "ready",
        synthesisRole: "emergent-thesis",
      });
      this.store.removeGhostNote(latestGhost.id);
    });

    const dismissButton = actions.createEl("button", {
      cls: "np-synthesis-action np-synthesis-action--dismiss",
      text: t("dismissSynthesis"),
    });
    dismissButton.addEventListener("click", () => this.store.removeGhostNote(latestGhost.id));
  }

  private buildInspectorActions(): InspectorActions {
    return {
      onDrawPack: (cardId) => this.openPackModal(cardId),
      onPromote: (cardId) => this.promoteCard(cardId),
      onArchive: (cardId) => {
        this.store.updateCard(cardId, { isArchived: true });
        this.store.selectCard(null);
        new Notice("Card archived");
      },
      onDelete: (cardId) => {
        this.enrichControllers.get(cardId)?.abort();
        this.enrichControllers.delete(cardId);
        this.store.deleteCard(cardId);
        new Notice("Card deleted");
      },
      onSoftDelete: (cardId) => {
        this.enrichControllers.get(cardId)?.abort();
        this.enrichControllers.delete(cardId);
        this.store.softDeleteCard(cardId);
      },
      onRestore: (cardId) => {
        this.store.restoreCard(cardId);
      },
      onReEnrich: (cardId) => {
        this.store.updateCard(cardId, { status: "enriching", statusText: "" });
        this.enrichCardBackground(cardId);
      },
      onEdit: (cardId, newText) => {
        this.store.updateCard(cardId, { text: newText, status: "enriching", statusText: "" });
        this.enrichCardBackground(cardId);
      },
      onTogglePopout: (cardId) => {
        void this.openCardPopout(cardId);
      },
      onNavigateToCard: (cardId) => {
        if (!this.store.getCard(cardId)) return;
        this.store.selectCard(cardId);
      },
      getCardById: (cardId) => this.store.getCard(cardId),
      getDrawPackState: (card) => {
        if (card.status === "enriching") {
          return { enabled: false, reason: "AI analysis is still running for this card." };
        }
        if (card.status === "error") {
          return { enabled: false, reason: "Re-run analysis on this card before drawing a pack." };
        }
        if (card.status !== "ready") {
          return { enabled: false, reason: "This card is not ready for pack generation yet." };
        }

        const executionState = getActiveModelExecutionState(this.getRuntimeSettings().ai);
        if (!executionState.canExecute) {
          return { enabled: false, reason: executionState.message };
        }

        return { enabled: true };
      },
    };
  }

  private openComposerExpandModal(currentText: string): void {
    const modal = new ComposerExpandModal(this.app, currentText, {
      onSubmit: (text) => {
        this.composer?.setValue("");
        void this.handleCapture(text);
      },
      onDismiss: (text) => {
        // Sync edited text back to the inline composer so the user keeps the
        // draft (unless they explicitly submitted from inside the modal).
        if (text !== currentText) {
          this.composer?.setValue(text);
        }
      },
    });
    modal.open();
  }

  private async openCardPopout(cardId: string): Promise<void> {
    if (!this.filePath) {
      new Notice("Save this workbench first before opening a popout.");
      return;
    }
    const leaf = this.app.workspace.openPopoutLeaf();
    await leaf.setViewState({
      type: CARD_POPOUT_VIEW_TYPE,
      active: true,
      state: { cardId, documentPath: this.filePath },
    });
  }

  private openPackModal(cardId: string): void {
    const card = this.store.getCard(cardId);
    if (!card) return;
    this.openPackModalForCards([card]);
  }

  private openPackModalForCards(cards: WorkbenchCard[]): void {
    if (cards.length === 0) return;
    if (cards.length > 5) {
      new Notice(t("packSeedTooMany"));
      return;
    }
    const notReady = cards.filter((c) => c.status !== "ready");
    if (notReady.length > 0) {
      new Notice(t("packSeedNotReady"));
      return;
    }

    const runtime = this.getRuntimeSettings();
    const executionState = getActiveModelExecutionState(runtime.ai);
    if (!executionState.canExecute) {
      new Notice(executionState.message);
      return;
    }

    const sourceCardIds = cards.length > 1 ? cards.map((c) => c.id) : undefined;
    const modal = new PackModal(this.app, this.store, runtime, cards, (packCard: PackCard) => {
      this.store.addCard(packCard.main_question, "growth", {
        title: packCard.card_name,
        contentType: "question",
        category: packCard.card_name,
        annotation: packCard.hook,
        rarity: packCard.rarity,
        sourceCardId: cards[0].id,
        sourceCardIds,
        status: "ready",
        questionType: packCard.questionType,
        lens: packCard.lens,
      });
    });

    modal.open();
  }

  private async promoteCard(cardId: string): Promise<void> {
    const card = this.store.getCard(cardId);
    if (!card) return;

    try {
      const runtime = this.getRuntimeSettings();
      const folder = runtime.ai.promotionFolder || "Cards";
      const author = (runtime.ai.noteAuthor || "").trim() || undefined;
      const path = await this.vaultService.promoteCard(card, folder, author);
      this.store.updateCard(cardId, { notePath: path, kind: "vault-note" });
      new Notice(`Note created: ${path}`);
    } catch (error) {
      new Notice(`Failed to create note: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private refreshView(): void {
    // Throttle to ~80ms so high-frequency cards-changed bursts (sequential bulk
    // annotation streaming) don't thrash gridEl.empty()→appendChild and steal
    // pointer events from hover/click handlers mid-cycle.
    if (this.viewRefreshTimer) return;
    const now = Date.now();
    const sinceLast = now - this.viewRefreshLastAt;
    if (sinceLast >= 80) {
      this.viewRefreshLastAt = now;
      this.doRefreshView();
      return;
    }
    this.viewRefreshTimer = setTimeout(() => {
      this.viewRefreshTimer = null;
      this.viewRefreshLastAt = Date.now();
      this.doRefreshView();
    }, 80 - sinceLast);
  }

  private doRefreshView(): void {
    if (this.currentView instanceof BoardView) this.currentView.render();
    if (this.currentView instanceof KanbanView) this.currentView.render();
    if (this.currentView instanceof GraphView) this.currentView.render();
  }

  private refreshInspector(): void {
    this.inspector?.showCard(this.store.selectedCard);
  }

  destroy(): void {
    this.storeListeners.forEach(([event, listener]) => this.store.off(event, listener));
    this.storeListeners.length = 0;
    this.plugin.settingsStore.offChange(this.globalSettingsListener);
    if (this.synthesisDebounceTimer) {
      clearTimeout(this.synthesisDebounceTimer);
      this.synthesisDebounceTimer = null;
    }
    if (this.viewRefreshTimer) {
      clearTimeout(this.viewRefreshTimer);
      this.viewRefreshTimer = null;
    }
    this.synthesisController?.abort();
    this.synthesisController = null;
    this.enrichControllers.forEach((controller) => controller.abort());
    this.enrichControllers.clear();
    this.currentView?.destroy();
    this.composer?.destroy();
    this.inspector?.destroy();
    this.container.empty();
  }
}
