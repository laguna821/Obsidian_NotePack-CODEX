import type { Rarity } from "../types";

export const DOMAINS = { mixed: "자유롭게", daily: "일상", social: "사회", politics: "정치", economy: "경제", art: "예술", humanities: "인문", philosophy: "철학", science: "과학", management: "경영·UX" } as const;
export const AXES = { recall: "경험·지식 떠올리기", elaboration: "분석·연결", inference: "추론", evaluation: "비판·판단", perspective: "관점 전환", monitoring: "자기 생각 돌아보기", creation: "상상·창작" } as const;
export type PackDomain = keyof typeof DOMAINS;
export type ThinkingPreference = keyof typeof AXES;
export interface PackPreferences {
  version: 1;
  difficulty: number;
  domain: PackDomain;
  rarity: Rarity | "auto";
  weights: Record<ThinkingPreference, number>;
  promptMode: "guided" | "custom";
  questionFirst: boolean;
}
const equalWeights = () => Object.fromEntries(Object.keys(AXES).map(k => [k, 1])) as PackPreferences["weights"];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clamp = (value: unknown, fallback: number, max: number, min = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

/** Old experimental settings remain in storage; only compatible preferences are read. */
export function normalizePackPreferences(value?: unknown, legacySettings?: unknown): PackPreferences {
  const settings = record(legacySettings), old = record(settings.cardBuilder), input = record(value);
  const weights = record(input.weights ?? old.axisMix), normalized = equalWeights();
  for (const axis of Object.keys(AXES) as ThinkingPreference[]) normalized[axis] = clamp(weights[axis], 1, 10);
  if (!Object.values(normalized).some(n => n > 0)) Object.assign(normalized, equalWeights());
  if (input.weights === undefined && old.axisMix === undefined && typeof old.primaryAxis === "string" && Object.hasOwn(AXES, old.primaryAxis)) normalized[old.primaryAxis as ThinkingPreference] = 5;
  const domain = input.domain ?? old.domain, rarity = input.rarity ?? old.rarityMode;
  const custom = settings.cardBuilderMode === "custom" || settings.cardBuilderMode !== "guided" && typeof settings.customPackDifficultyPrompt === "string" && Boolean(settings.customPackDifficultyPrompt.trim());
  return {
    version: 1, difficulty: clamp(input.difficulty ?? old.difficulty, 2, 5, 1),
    domain: typeof domain === "string" && Object.hasOwn(DOMAINS, domain) ? domain as PackDomain : "mixed",
    rarity: ["common", "rare", "epic", "legendary"].includes(String(rarity)) ? rarity as Rarity : "auto",
    weights: normalized,
    questionFirst: input.questionFirst === true,
    promptMode: input.promptMode === "custom" || input.promptMode !== "guided" && custom ? "custom" : "guided",
  };
}

/** Relative exploration weights, not a measurement of the finished question. */
export function preferenceShares(preferences: PackPreferences): Record<ThinkingPreference, number> {
  const weights = normalizePackPreferences(preferences).weights;
  const total = Object.values(weights).reduce((a,b) => a+b,0);
  return Object.fromEntries(Object.entries(weights).map(([axis,n]) => [axis, n / total])) as Record<ThinkingPreference, number>;
}
export function buildPreferenceInstruction(preferences: PackPreferences): string {
  const p = normalizePackPreferences(preferences);
  const mix = Object.entries(preferenceShares(p)).filter(([,n]) => n > 0).sort((a,b) => b[1]-a[1]).map(([axis,n]) => AXES[axis as ThinkingPreference] + " " + Math.round(n*100) + "%").join(", ");
  return [
    p.domain === "mixed" ? "Explore varied subject areas across the pack." : "The user selected " + DOMAINS[p.domain] + ". Find worthwhile questions in this field; the source is a starting spark, not the required subject of every question.",
    "Thinking interests across the pack: " + mix + ". Favor these interests naturally, without turning each question into a checklist or a prescribed sequence of tasks. Choose the actual question types and lenses yourself.",
  ].join("\n");
}
const DEPTH = [
  "Choose approachable questions that the reader can start answering from everyday experience.",
  "Ask familiar questions with room to examine a reason or an alternative.",
  "Choose questions worth exploring beyond the first obvious answer.",
  "Choose substantial questions with competing explanations, values, or implications.",
  "Choose deep open questions about the grounds and limits of our concepts, explanations, or judgments. A short question may open a large inquiry; do not prescribe all the steps of an answer.",
];
export function buildDepthInstruction(difficulty: number): string {
  return DEPTH[clamp(difficulty,2,5,1)-1] + "\nAt every level, make the question immediately intelligible. Depth belongs in answering, not in missing context or difficult wording.";
}
export const PACK_PRESETS = {
  balanced: { label: "균형", difficulty: 2, weights: { recall:1, elaboration:1, inference:1, evaluation:1, perspective:1, monitoring:1, creation:1 } },
  analytical: { label: "비판·탐구", difficulty: 4, weights: { recall:1, elaboration:3, inference:4, evaluation:4, perspective:2, monitoring:1, creation:1 } },
  creative: { label: "상상·발상", difficulty: 3, weights: { recall:1, elaboration:2, inference:1, evaluation:1, perspective:4, monitoring:1, creation:5 } },
  reflective: { label: "경험·성찰", difficulty: 3, weights: { recall:4, elaboration:2, inference:1, evaluation:2, perspective:2, monitoring:5, creation:1 } },
} as const;
export function applyPackPreset(p: PackPreferences, id: keyof typeof PACK_PRESETS): PackPreferences {
  const preset = PACK_PRESETS[id];
  return normalizePackPreferences({ ...p, difficulty: preset.difficulty, weights: { ...preset.weights }, promptMode: "guided" });
}
