import type { PackCard } from "../types";
import { DOMAINS } from "../ai/pack-preferences";

/** Explicit, cancellable support shared by the pack and saved-card inspector. */
export class CardGuidance {
  private controller: AbortController | null = null;
  private disposed = false;
  private open = false;
  private parent: HTMLElement;
  private card: PackCard;
  private load?: (signal: AbortSignal) => Promise<PackCard>;
  constructor(parent: HTMLElement, card: PackCard, load?: (signal: AbortSignal) => Promise<PackCard>) {
    this.parent = parent;
    this.card = card;
    this.load = load;
    this.render();
  }

  private render(): void {
    this.parent.empty();
    const details = this.parent.createEl("details", { cls: "np-card-guidance" });
    details.open = this.open;
    details.addEventListener("toggle", () => { this.open = details.open; });
    details.createEl("summary", { text: "작성 도움 · 선택" });
    if (this.card.guidanceStatus === "pending") {
      details.createEl("p", { text: "이 질문의 작성 도움을 별도로 만듭니다. 현재 선택한 모델로 추가 요청 1회가 발생합니다." });
      const start = details.createEl("button", { text: "작성 도움 만들기", attr: { type: "button" } });
      start.disabled = !this.load;
      start.addEventListener("click", () => void this.generate());
      return;
    }
    details.createEl("h4", { text: this.card.card_name });
    if (this.card.generationSettings) {
      const p = this.card.generationSettings;
      details.createEl("p", { text: "생성 설정: " + DOMAINS[p.domain] + " · " + (p.promptMode === "custom" ? "사용자 난도 프롬프트" : "난도 " + p.difficulty) });
    }
    if (this.card.hook) details.createEl("p", { text: this.card.hook });
    for (const [title, values] of [
      ["생각 이어가기", this.card.bridge_steps], ["바로 쓰기", this.card.write_now],
      ["확장 질문", this.card.followups], ["추천 링크", this.card.suggested_links],
    ] as [string, string[]][]) {
      if (!values.length) continue;
      details.createEl("h5", { text: title });
      const list = details.createEl("ul");
      values.forEach(text => list.createEl("li", { text }));
    }
    if (this.card.failure_signal) details.createEl("p", { text: "되짚어볼 조건: " + this.card.failure_signal });
  }

  private async generate(): Promise<void> {
    if (!this.load || this.controller || this.disposed) return;
    const controller = new AbortController();
    this.controller = controller;
    this.parent.empty();
    const status = this.parent.createEl("p", { text: "작성 도움을 만들고 있습니다. 질문은 그대로 유지됩니다.", attr: { role: "status" } });
    const cancel = this.parent.createEl("button", { text: "도움 생성 취소", attr: { type: "button" } });
    cancel.addEventListener("click", () => { controller.abort(); cancel.disabled = true; status.textContent = "취소하고 있습니다…"; });
    let errorText = "";
    try {
      const next = await this.load(controller.signal);
      if (controller.signal.aborted || this.disposed) return;
      this.card = next;
    } catch (error) {
      errorText = controller.signal.aborted ? "도움 생성을 취소했습니다." : error instanceof Error ? error.message : "작성 도움을 만들지 못했습니다.";
    } finally {
      this.controller = null;
      if (!this.disposed) {
        this.open = true;
        this.render();
        if (errorText) this.parent.createEl("p", { text: errorText + " 질문은 유지됩니다.", attr: { role: "status" } });
      }
    }
  }

  destroy(): void { this.disposed = true; this.controller?.abort(); }
}
