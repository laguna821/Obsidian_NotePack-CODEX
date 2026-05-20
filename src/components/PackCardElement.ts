// ── PackCardElement: Individual Pack Card in Modal ────────────────────────

import type { PackCard, Rarity } from "../types";
import { RARITY_COLORS, RARITY_LABELS, RARITY_EFFECT_TEXT } from "../types";
import { t } from "../i18n";

export class PackCardElement {
  el: HTMLElement;
  private card: PackCard;
  private isExpanded = false;
  private onKeep: (cardId: number) => void;
  private onDiscard: (cardId: number) => void;

  constructor(
    card: PackCard,
    onKeep: (cardId: number) => void,
    onDiscard: (cardId: number) => void,
  ) {
    this.card = card;
    this.onKeep = onKeep;
    this.onDiscard = onDiscard;
    this.el = document.createElement("div");
    this.render();
  }

  private render(): void {
    const card = this.card;
    const color = RARITY_COLORS[card.rarity];

    this.el.className = `np-pack-card np-pack-card--${card.rarity}`;
    this.el.style.setProperty("--rarity-color", color);
    this.el.empty();

    // ── Rarity Badge ────────────────────────────────────────────

    const badge = this.el.createDiv({
      cls: `np-pack-card-badge np-pack-card-badge--${card.rarity}`,
    });
    badge.createSpan({ text: card.effect_text });

    // ── Card Name ───────────────────────────────────────────────

    this.el.createEl("h4", { cls: "np-pack-card-name", text: card.card_name });

    // ── Hook ────────────────────────────────────────────────────

    if (card.hook) {
      this.el.createEl("p", { cls: "np-pack-card-hook", text: card.hook });
    }

    // ── Main Question ───────────────────────────────────────────

    this.el.createDiv({ cls: "np-pack-card-question-label", text: "🃏 메인 질문" });
    this.el.createEl("p", { cls: "np-pack-card-question", text: card.main_question });

    // ── Tags ────────────────────────────────────────────────────

    if (card.suggested_tags.length > 0) {
      const tagsEl = this.el.createDiv({ cls: "np-pack-card-tags" });
      card.suggested_tags.forEach((tag) => {
        tagsEl.createSpan({ cls: "np-pack-card-tag", text: tag });
      });
    }

    // ── Expand/Collapse Toggle ──────────────────────────────────

    const toggleBtn = this.el.createEl("button", {
      cls: "np-pack-card-toggle",
      text: this.isExpanded ? "▲ 접기" : "▼ 상세 보기",
    });

    const detailsEl = this.el.createDiv({
      cls: `np-pack-card-details ${this.isExpanded ? "np-pack-card-details--open" : ""}`,
    });

    toggleBtn.addEventListener("click", () => {
      this.isExpanded = !this.isExpanded;
      detailsEl.classList.toggle("np-pack-card-details--open", this.isExpanded);
      toggleBtn.textContent = this.isExpanded ? "▲ 접기" : "▼ 상세 보기";
    });

    // ── Detail Content ──────────────────────────────────────────

    // Bridge steps
    if (card.bridge_steps.length > 0) {
      detailsEl.createDiv({ cls: "np-pack-card-section-title", text: "📍 브릿지 스텝" });
      const ol = detailsEl.createEl("ol", { cls: "np-pack-card-steps" });
      card.bridge_steps.forEach((step) => {
        ol.createEl("li", { text: step });
      });
    }

    // Write now
    if (card.write_now.length > 0) {
      detailsEl.createDiv({ cls: "np-pack-card-section-title", text: "✏️ 바로 쓰기" });
      const ul = detailsEl.createEl("ul", { cls: "np-pack-card-list" });
      card.write_now.forEach((item) => {
        ul.createEl("li", { text: item });
      });
    }

    // Followups
    if (card.followups.length > 0) {
      detailsEl.createDiv({ cls: "np-pack-card-section-title", text: "🔗 확장 질문" });
      const ul = detailsEl.createEl("ul", { cls: "np-pack-card-list" });
      card.followups.forEach((item) => {
        ul.createEl("li", { text: item });
      });
    }

    // Failure signal
    if (card.failure_signal) {
      detailsEl.createDiv({ cls: "np-pack-card-section-title", text: "⚠️ 실패 신호" });
      detailsEl.createEl("p", { cls: "np-pack-card-failure", text: card.failure_signal });
    }

    // Suggested links
    if (card.suggested_links.length > 0) {
      detailsEl.createDiv({ cls: "np-pack-card-section-title", text: "📎 추천 링크" });
      const ul = detailsEl.createEl("ul", { cls: "np-pack-card-list" });
      card.suggested_links.forEach((link) => {
        ul.createEl("li", { text: link });
      });
    }

    // ── Action Buttons ──────────────────────────────────────────

    const actionsEl = this.el.createDiv({ cls: "np-pack-card-actions" });

    const keepBtn = actionsEl.createEl("button", {
      cls: "np-pack-card-action np-pack-card-action--keep",
      text: `✅ ${t("keep")}`,
    });
    keepBtn.addEventListener("click", () => this.onKeep(card.id));

    const discardBtn = actionsEl.createEl("button", {
      cls: "np-pack-card-action np-pack-card-action--discard",
      text: `❌ ${t("discard")}`,
    });
    discardBtn.addEventListener("click", () => this.onDiscard(card.id));
  }

  markKept(): void {
    this.el.classList.add("np-pack-card--kept");
    const actions = this.el.querySelector(".np-pack-card-actions");
    if (actions) {
      actions.empty();
      actions.createSpan({ cls: "np-pack-card-kept-label", text: "✅ 유지됨" });
    }
  }

  markDiscarded(): void {
    this.el.classList.add("np-pack-card--discarded");
    const actions = this.el.querySelector(".np-pack-card-actions");
    if (actions) {
      actions.empty();
      actions.createSpan({ cls: "np-pack-card-discarded-label", text: "❌ 버려짐" });
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
