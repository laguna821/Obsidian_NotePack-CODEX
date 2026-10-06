import { Notice } from "obsidian";
import { CardGuidance } from "./CardGuidance";
// ── PackCardElement: Individual Pack Card in Modal ────────────────────────

import type { PackCard } from "../types";
import { RARITY_COLORS } from "../types";
import { t } from "../i18n";

export class PackCardElement {
  el: HTMLElement;
  private card: PackCard;
  get cardId(): number { return this.card.id; }
  private guidance: CardGuidance | null = null;
  private onKeep: (cardId: number) => void;
  private onDiscard: (cardId: number) => void;
  private onGuidance?: (signal: AbortSignal) => Promise<PackCard>;

  constructor(
    card: PackCard,
    onKeep: (cardId: number) => void,
    onDiscard: (cardId: number) => void,
    onGuidance?: (signal: AbortSignal) => Promise<PackCard>,
  ) {
    this.card = card;
    this.onKeep = onKeep;
    this.onDiscard = onDiscard;
    this.onGuidance = onGuidance;
    this.el = createDiv();
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

    this.guidance = new CardGuidance(this.el.createDiv(), card, this.onGuidance);

    // ── Action Buttons ──────────────────────────────────────────

    const actionsEl = this.el.createDiv({ cls: "np-pack-card-actions" });

    const copy = actionsEl.createEl("button", { text: "질문 복사" });
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(card.main_question).then(() => new Notice("질문을 복사했습니다."), () => new Notice("복사하지 못했습니다. 질문을 선택해서 복사해주세요."));
    });

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
    this.guidance?.destroy();
    this.el.remove();
  }
}
