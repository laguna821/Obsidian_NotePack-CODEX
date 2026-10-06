import { Setting } from "obsidian";
import { AXES, DOMAINS, PACK_PRESETS, applyPackPreset, normalizePackPreferences, type PackPreferences, type ThinkingPreference } from "../ai/pack-preferences";

export function renderPackPreferences(el: HTMLElement, initial: PackPreferences, onChange: (value: PackPreferences) => void): void {
  let p = normalizePackPreferences(initial);
  el.addClass("np-pack-preferences");
  const update = (patch: Partial<PackPreferences>) => { p = normalizePackPreferences({ ...p, ...patch }); onChange(p); };
  const render = () => {
    el.empty();
    const presets = el.createDiv({ cls: "np-pack-presets" });
    for (const [id, preset] of Object.entries(PACK_PRESETS)) {
      presets.createEl("button", { text: preset.label, attr: { type: "button" } }).addEventListener("click", () => {
        p = applyPackPreset(p, id as keyof typeof PACK_PRESETS); onChange(p); render();
      });
    }
    new Setting(el).setName("분야").addDropdown(d => d.addOptions(DOMAINS).setValue(p.domain).onChange(v => update({ domain: v as PackPreferences["domain"] })));
    new Setting(el).setName("등급").setDesc("자동은 탐색도에 따라 섞어 뽑습니다.")
      .addDropdown(d => d.addOptions({ auto: "자동", common: "기본", rare: "희귀", epic: "영웅", legendary: "전설" }).setValue(p.rarity).onChange(v => update({ rarity: v as PackPreferences["rarity"] })));
    new Setting(el).setName("난도").setDesc("문장을 어렵게 쓰는 정도가 아니라, 답을 생각하는 깊이입니다.")
      .addDropdown(d => d.addOptions({ "1": "1 · 쉬움", "2": "2 · 가볍게", "3": "3 · 보통", "4": "4 · 깊게", "5": "5 · 어려움" }).setValue(String(p.difficulty)).setDisabled(p.promptMode === "custom").onChange(v => update({ difficulty: Number(v) })));
    new Setting(el).setName("질문 먼저 받기 · 실험")
      .setDesc("켜면 다섯 질문을 먼저 받고, 작성 도움은 원하는 카드에서 별도로 만듭니다. 끄면 처음부터 함께 생성합니다.")
      .addToggle(toggle => toggle.setValue(p.questionFirst).onChange(questionFirst => update({ questionFirst })));
    const details = el.createEl("details");
    details.createEl("summary", { text: "사고 성향 조절" });
    details.createEl("p", { text: "더 탐색하고 싶은 방향을 높여주세요. 각 카드가 반드시 수행해야 할 단계나 능력 점수는 아닙니다." });
    for (const [axis, label] of Object.entries(AXES)) {
      new Setting(details).setName(label).addSlider(s => s.setLimits(0,10,1).setValue(p.weights[axis as ThinkingPreference]).setDynamicTooltip().onChange(n => {
        const weights = { ...p.weights, [axis]: n };
        update({ weights });
        if (!Object.values(weights).some(value => value > 0)) { render(); el.querySelector("details")?.setAttribute("open", ""); }
      }));
    }
    new Setting(el).setName("난도 지시").addDropdown(d => d.addOptions({ guided: "위 설정 사용", custom: "저장한 사용자 프롬프트 사용" }).setValue(p.promptMode).onChange(v => { update({ promptMode: v as PackPreferences["promptMode"] }); render(); }));
    if (p.promptMode === "custom") el.createEl("p", { text: "사용자 프롬프트의 난도 지시가 적용됩니다. 분야·사고 성향·등급은 위 설정을 사용합니다." });
  };
  render();
}
