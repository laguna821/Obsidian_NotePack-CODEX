import preset01 from "./01_starter_coach.md";
import preset02 from "./02_physics_blackboard.md";
import preset03 from "./03_scene_storyteller.md";
import preset04 from "./04_question_anchor.md";
import preset05 from "./05_claim_builder.md";
import preset06 from "./06_card_editor.md";
import preset07 from "./07_understanding_inspector.md";
import preset08 from "./08_first_principles.md";
import preset09 from "./09_sentence_knife.md";
import preset10 from "./10_final_reviewer.md";

export interface PersonaPresetEntry {
  id: string;
  label: string;
  personName: string;
  defaultIcon: string;
  defaultColor: string;
  body: string;
}

export const PERSONA_PRESET_ENTRIES: PersonaPresetEntry[] = [
  { id: "01_starter_coach",           label: "01. 최민준형 시작 코치",      personName: "최민준",   defaultIcon: "최", defaultColor: "#e07a3c", body: preset01 },
  { id: "02_physics_blackboard",      label: "02. 김상욱형 쉬운 칠판",      personName: "김상욱",   defaultIcon: "김", defaultColor: "#3c8dbc", body: preset02 },
  { id: "03_scene_storyteller",       label: "03. 김영하형 장면 이야기꾼",  personName: "김영하",   defaultIcon: "영", defaultColor: "#8e44ad", body: preset03 },
  { id: "04_question_anchor",         label: "04. 손석희형 질문 앵커",      personName: "손석희",   defaultIcon: "손", defaultColor: "#34495e", body: preset04 },
  { id: "05_claim_builder",           label: "05. 강원국형 주장 빌더",      personName: "강원국",   defaultIcon: "강", defaultColor: "#c0392b", body: preset05 },
  { id: "06_card_editor",             label: "06. 김정운형 카드 편집자",    personName: "김정운",   defaultIcon: "정", defaultColor: "#16a085", body: preset06 },
  { id: "07_understanding_inspector", label: "07. 파인만형 이해 검문관",    personName: "파인만",   defaultIcon: "🧪", defaultColor: "#27ae60", body: preset07 },
  { id: "08_first_principles",        label: "08. 머스크형 제1원칙 해체자", personName: "머스크",   defaultIcon: "🚀", defaultColor: "#2c3e50", body: preset08 },
  { id: "09_sentence_knife",          label: "09. 김훈형 문장칼 편집자",    personName: "김훈",     defaultIcon: "🔪", defaultColor: "#7f1d1d", body: preset09 },
  { id: "10_final_reviewer",          label: "10. 한강형 최종 감수자",      personName: "한강",     defaultIcon: "한", defaultColor: "#6c5ce7", body: preset10 },
];
