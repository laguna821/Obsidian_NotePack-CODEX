import { Component, MarkdownRenderer, type App } from "obsidian";
import type { WorkbenchCard } from "../types";
import { CONTENT_TYPE_LABELS, RARITY_COLORS, RARITY_LABELS } from "../types";
import { getPrimaryAnnotation, getVisibleAnnotations } from "../data/annotations";
import { t } from "../i18n";
import { MarkdownEditor } from "./MarkdownEditor";

export interface DrawPackState {
  enabled: boolean;
  reason?: string;
}

export interface InspectorActions {
  onDrawPack: (cardId: string) => void;
  onPromote: (cardId: string) => void;
  onArchive: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onSoftDelete: (cardId: string) => void;
  onRestore: (cardId: string) => void;
  onReEnrich: (cardId: string) => void;
  onEdit: (cardId: string, newText: string) => void;
  onTogglePopout: (cardId: string) => void;
  onNavigateToCard: (cardId: string) => void;
  getCardById: (cardId: string) => WorkbenchCard | undefined;
  getDrawPackState: (card: WorkbenchCard) => DrawPackState;
}

export class Inspector {
  containerEl: HTMLElement;
  private app: App;
  private card: WorkbenchCard | null = null;
  private actions: InspectorActions;
  private isEditing = false;
  private editor: MarkdownEditor | null = null;
  private markdownComponent: Component;
  private expandedAnnotations: Set<string> = new Set();

  constructor(parentEl: HTMLElement, actions: InspectorActions, app: App) {
    this.app = app;
    this.actions = actions;
    this.containerEl = parentEl.createDiv({ cls: "np-inspector" });
    this.markdownComponent = new Component();
    this.markdownComponent.load();
    this.renderEmpty();
  }

  private renderEmpty(): void {
    this.containerEl.empty();
    this.containerEl.createDiv({
      cls: "np-inspector-empty",
      text: t("noCardSelected"),
    });
  }

  showCard(card: WorkbenchCard | undefined): void {
    if (!card) {
      this.card = null;
      this.isEditing = false;
      this.renderEmpty();
      return;
    }

    const isSameCard = this.card?.id === card.id;
    this.card = card;
    if (isSameCard && this.isEditing) return;
    this.isEditing = false;
    this.renderCard();
  }

  private renderCard(): void {
    const card = this.card!;
    const drawPackState = this.actions.getDrawPackState(card);

    this.containerEl.empty();

    const header = this.containerEl.createDiv({ cls: "np-inspector-header" });
    header.createSpan({
      cls: "np-inspector-type",
      text: CONTENT_TYPE_LABELS[card.contentType || "general"],
    });

    if (card.rarity) {
      const rarityEl = header.createSpan({
        cls: `np-inspector-rarity np-inspector-rarity--${card.rarity}`,
        text: RARITY_LABELS[card.rarity],
      });
      rarityEl.style.setProperty("--rarity-color", RARITY_COLORS[card.rarity]);
    }

    this.renderTextSection(card);
    this.renderEnrichmentSection(card);

    if (card.status === "enriching") {
      this.containerEl.createDiv({
        cls: "np-inspector-status np-inspector-status--enriching",
        text: t("enriching"),
      });
    } else if (card.status === "error") {
      this.containerEl.createDiv({
        cls: "np-inspector-status np-inspector-status--error",
        text: `${t("error")}: ${card.statusText || "Unknown"}`,
      });
    }

    const actions = this.containerEl.createDiv({ cls: "np-inspector-actions" });

    if (card.deletedAt) {
      const restoreBtn = actions.createEl("button", {
        cls: "np-inspector-action np-inspector-action--primary",
        text: t("restore"),
      });
      restoreBtn.addEventListener("click", () => this.actions.onRestore(card.id));

      const purgeBtn = actions.createEl("button", {
        cls: "np-inspector-action np-inspector-action--danger",
        text: t("purgeForever"),
      });
      purgeBtn.addEventListener("click", () => this.actions.onDelete(card.id));
      return;
    }

    const drawButton = actions.createEl("button", {
      cls: "np-inspector-action np-inspector-action--primary",
      text: t("drawPack"),
    });
    drawButton.disabled = !drawPackState.enabled;
    drawButton.addEventListener("click", () => {
      if (!drawPackState.enabled) return;
      this.actions.onDrawPack(card.id);
    });

    if (!drawPackState.enabled && drawPackState.reason) {
      actions.createDiv({
        cls: "np-inspector-action-hint",
        text: drawPackState.reason,
      });
    }

    const promoteBtn = actions.createEl("button", {
      cls: "np-inspector-action",
      text: t("promoteToNote"),
    });
    promoteBtn.addEventListener("click", () => this.actions.onPromote(card.id));

    const popoutBtn = actions.createEl("button", {
      cls: "np-inspector-action",
      text: t("openInPopout"),
    });
    popoutBtn.addEventListener("click", () => this.actions.onTogglePopout(card.id));

    if (card.status === "ready" || card.status === "error") {
      const reEnrichBtn = actions.createEl("button", {
        cls: "np-inspector-action",
        text: t("reEnrich"),
      });
      reEnrichBtn.addEventListener("click", () => this.actions.onReEnrich(card.id));
    }

    const archiveBtn = actions.createEl("button", {
      cls: "np-inspector-action np-inspector-action--muted",
      text: t("archive"),
    });
    archiveBtn.addEventListener("click", () => this.actions.onArchive(card.id));

    const deleteBtn = actions.createEl("button", {
      cls: "np-inspector-action np-inspector-action--danger",
      text: t("delete"),
    });
    deleteBtn.addEventListener("click", () => this.actions.onSoftDelete(card.id));
  }

  private renderTextSection(card: WorkbenchCard): void {
    const textSection = this.containerEl.createDiv({ cls: "np-inspector-section" });
    const textHeader = textSection.createDiv({ cls: "np-inspector-section-header" });
    textHeader.createDiv({ cls: "np-inspector-label", text: "Note" });

    const enterEditMode = (): void => {
      if (this.isEditing) return;
      this.isEditing = true;
      this.renderCard();
    };

    if (!this.isEditing) {
      const editButton = textHeader.createEl("button", {
        cls: "np-inspector-edit-button",
        text: "Edit",
      });
      editButton.addEventListener("click", enterEditMode);

      const textEl = textSection.createDiv({ cls: "np-inspector-text" });
      // Reset markdown component to release prior children before re-rendering.
      this.markdownComponent.unload();
      this.markdownComponent = new Component();
      this.markdownComponent.load();
      const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
      void MarkdownRenderer.render(this.app, card.text, textEl, sourcePath, this.markdownComponent);
      textEl.addEventListener("dblclick", enterEditMode);
      return;
    }

    const editorHost = textSection.createDiv({ cls: "np-inspector-edit-host" });

    const cancelEdit = (): void => {
      this.isEditing = false;
      this.renderCard();
    };

    const saveEdit = (): void => {
      const newText = this.editor?.getValue().trim() ?? "";
      if (!newText) {
        editorHost.classList.add("np-inspector-edit--error");
        editorHost.setAttribute("aria-invalid", "true");
        return;
      }

      this.isEditing = false;
      if (newText !== card.text) {
        this.actions.onEdit(card.id, newText);
      }
      this.renderCard();
    };

    this.editor?.destroy();
    this.editor = new MarkdownEditor(editorHost, {
      initialValue: card.text,
      minRows: 5,
      autoResizeMaxPx: 360,
      ariaLabel: "Edit card text",
    });

    const editActions = textSection.createDiv({ cls: "np-inspector-edit-actions" });
    const saveButton = editActions.createEl("button", {
      cls: "np-inspector-edit-action np-inspector-edit-action--save",
      text: "Save",
    });
    const cancelButton = editActions.createEl("button", {
      cls: "np-inspector-edit-action",
      text: "Cancel",
    });

    saveButton.addEventListener("click", saveEdit);
    cancelButton.addEventListener("click", cancelEdit);

    this.editor.containerEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveEdit();
      }
    });

    setTimeout(() => this.editor?.focus(), 0);
  }

  private renderEnrichmentSection(card: WorkbenchCard): void {
    const primaryAnnotation = getPrimaryAnnotation(card);
    const sources = primaryAnnotation?.sources ?? card.sources;
    const annotations = getVisibleAnnotations(card);

    if (!card.category && annotations.length === 0 && card.confidence == null && (!sources || sources.length === 0)) {
      return;
    }

    const enrichSection = this.containerEl.createDiv({ cls: "np-inspector-section np-inspector-enrich-box" });
    const stickyHeader = enrichSection.createDiv({ cls: "np-inspector-enrich-sticky" });
    const stickyTitleRow = stickyHeader.createDiv({ cls: "np-inspector-enrich-sticky-row" });
    stickyTitleRow.createDiv({ cls: "np-inspector-label", text: t("enrichment") });

    const expandableAnnotations = annotations.filter((a) => a.status === "ready");
    if (expandableAnnotations.length > 1) {
      const cardId = card.id;
      const allExpanded = expandableAnnotations.every((annotation, index) =>
        this.expandedAnnotations.has(`${cardId}::${annotation.id ?? annotation.agentId ?? index}`),
      );
      const bulkBtn = stickyTitleRow.createEl("button", {
        cls: "np-inspector-bulk-toggle",
        text: allExpanded ? t("inspectorCollapseAll") : t("inspectorExpandAll"),
      });
      bulkBtn.addEventListener("click", () => {
        if (allExpanded) {
          expandableAnnotations.forEach((annotation, index) => {
            this.expandedAnnotations.delete(`${cardId}::${annotation.id ?? annotation.agentId ?? index}`);
          });
        } else {
          expandableAnnotations.forEach((annotation, index) => {
            this.expandedAnnotations.add(`${cardId}::${annotation.id ?? annotation.agentId ?? index}`);
          });
        }
        this.renderCard();
      });
    }

    if (card.category) {
      const categoryRow = stickyHeader.createDiv({ cls: "np-inspector-row" });
      categoryRow.createSpan({ cls: "np-inspector-label-sm", text: t("category") });
      categoryRow.createSpan({ cls: "np-inspector-value", text: card.category });
    }

    if (annotations.length > 0) {
      const annotationList = enrichSection.createDiv({ cls: "np-inspector-annotations" });
      annotations.forEach((annotation, index) => {
        const isSequential = annotation.mode === "sequential" && annotation.sequenceIndex != null;
        const item = annotationList.createDiv({
          cls: `np-inspector-annotation-card np-inspector-annotation-card--${annotation.status} ${
            isSequential ? "np-inspector-annotation-card--sequential" : ""
          }`,
        });

        if (annotation.color && /^#[0-9a-f]{6}$/i.test(annotation.color)) {
          item.style.setProperty("--np-ai-blue", annotation.color);
          item.style.setProperty("--np-ai-blue-bg", `color-mix(in srgb, ${annotation.color} 9%, var(--np-bg))`);
          item.style.setProperty("--np-ai-blue-border", `color-mix(in srgb, ${annotation.color} 34%, var(--np-border))`);
        }

        const annotationKey = `${card.id}::${annotation.id ?? annotation.agentId ?? index}`;
        const isExpanded = this.expandedAnnotations.has(annotationKey)
          || annotation.status === "running"
          || annotation.status === "error";

        const itemHeader = item.createEl("button", {
          cls: "np-inspector-annotation-header",
          attr: { type: "button" },
        });
        itemHeader.classList.toggle("is-expanded", isExpanded);
        const agentEl = itemHeader.createSpan({ cls: "np-inspector-annotation-agent" });
        const iconText = (annotation.icon && annotation.icon.trim()) ? annotation.icon.trim() : "🤖";
        agentEl.createSpan({ cls: "np-ai-robot", text: iconText });
        agentEl.createSpan({ text: annotation.label || annotation.agentId || `AI ${index + 1}` });

        if (isSequential) {
          itemHeader.createSpan({
            cls: "np-inspector-annotation-status",
            text: `Turn ${annotation.sequenceIndex! + 1}`,
          });
        }
        if (annotation.status === "running") {
          itemHeader.createSpan({
            cls: "np-inspector-annotation-status np-inspector-annotation-status--running",
            text: t("inspectorAnnotationGenerating"),
          });
        } else if (annotation.status === "error") {
          itemHeader.createSpan({
            cls: "np-inspector-annotation-status np-inspector-annotation-status--error",
            text: t("inspectorAnnotationError"),
          });
        }

        if (annotation.status === "ready") {
          const toggleLabel = itemHeader.createSpan({
            cls: "np-inspector-annotation-toggle",
            text: isExpanded ? t("inspectorAnnotationCollapse") : t("inspectorAnnotationExpand"),
          });
          toggleLabel.createSpan({
            cls: "np-inspector-annotation-caret",
            text: isExpanded ? " ▴" : " ▾",
          });
        }

        if (!isExpanded && annotation.status === "ready") {
          const summary = annotation.oneLineSummary?.trim()
            || annotation.annotation.split(/[.!?。…]\s*/).filter(Boolean)[0]?.trim()
            || annotation.annotation.slice(0, 60);
          item.createEl("p", {
            cls: "np-inspector-annotation-summary",
            text: summary,
          });
        }

        itemHeader.addEventListener("click", (event) => {
          event.preventDefault();
          if (annotation.status !== "ready") return;
          if (this.expandedAnnotations.has(annotationKey)) {
            this.expandedAnnotations.delete(annotationKey);
          } else {
            this.expandedAnnotations.add(annotationKey);
          }
          this.renderCard();
        });

        if (!isExpanded) return;

        if (annotation.modelId) {
          item.createDiv({ cls: "np-inspector-annotation-meta", text: annotation.modelId });
        }
        if (annotation.status === "error") {
          item.createEl("p", {
            cls: "np-inspector-annotation np-inspector-annotation--error",
            text: annotation.errorMessage || t("inspectorAnnotationError"),
          });
        } else if (annotation.status === "running") {
          item.createEl("p", {
            cls: "np-inspector-annotation np-inspector-annotation--running",
            text: t("inspectorAnnotationGenerating"),
          });
        } else {
          const body = item.createDiv({ cls: "np-inspector-annotation" });
          void MarkdownRenderer.render(this.app, annotation.annotation, body, "", this.markdownComponent);
          this.renderAnnotationReferences(item, card.id, annotation.influencedByIds);
        }
      });
    }

    if (primaryAnnotation?.confidence != null || card.confidence != null) {
      const confidenceRow = enrichSection.createDiv({ cls: "np-inspector-row" });
      confidenceRow.createSpan({ cls: "np-inspector-label-sm", text: t("confidence") });
      confidenceRow.createSpan({ cls: "np-inspector-value", text: `${primaryAnnotation?.confidence ?? card.confidence}%` });
    }

    if (sources && sources.length > 0) {
      const sourceSection = enrichSection.createDiv({ cls: "np-inspector-sources" });
      sourceSection.createDiv({ cls: "np-inspector-label-sm", text: t("sources") });
      sources.forEach((source) => {
        const link = sourceSection.createEl("a", {
          cls: "np-inspector-source-link",
          text: source.title || source.siteName,
          href: source.url,
        });
        link.setAttr("target", "_blank");
      });
    }
  }

  private renderAnnotationReferences(
    container: HTMLElement,
    selfCardId: string,
    influencedByIds: string[] | undefined,
  ): void {
    if (!influencedByIds || influencedByIds.length === 0) return;
    const uniqueIds = Array.from(new Set(influencedByIds)).filter((id) => id && id !== selfCardId);
    if (uniqueIds.length === 0) return;

    const section = container.createDiv({ cls: "np-inspector-annotation-refs" });
    section.createSpan({
      cls: "np-inspector-annotation-refs-label",
      text: t("inspectorAnnotationReferences"),
    });
    const chipList = section.createDiv({ cls: "np-inspector-annotation-refs-list" });

    uniqueIds.forEach((targetId) => {
      const target = this.actions.getCardById(targetId);
      const chip = chipList.createEl("button", {
        cls: "np-inspector-annotation-ref",
        attr: { type: "button" },
      });
      if (!target) {
        chip.classList.add("np-inspector-annotation-ref--missing");
        chip.createSpan({ cls: "np-inspector-annotation-ref-preview", text: t("inspectorAnnotationReferenceMissing") });
        chip.disabled = true;
        return;
      }
      const category = (target.category || "").trim();
      if (category) {
        chip.createSpan({ cls: "np-inspector-annotation-ref-category", text: category });
      }
      const preview = (target.text || "").replace(/\s+/g, " ").trim();
      chip.createSpan({
        cls: "np-inspector-annotation-ref-preview",
        text: preview.length > 60 ? `${preview.slice(0, 60)}…` : preview,
      });
      chip.addEventListener("click", (event) => {
        event.preventDefault();
        this.actions.onNavigateToCard(targetId);
      });
    });
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = null;
    this.markdownComponent.unload();
    this.containerEl.remove();
  }
}
