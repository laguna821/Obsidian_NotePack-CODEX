import packEasy from "./pack_01_easy.md";
import packNormal from "./pack_02_normal.md";
import packHard from "./pack_03_hard.md";
import packUltra from "./pack_04_ultra.md";
import synthEasy from "./synthesis_01_easy.md";
import synthNormal from "./synthesis_02_normal.md";
import synthHard from "./synthesis_03_hard.md";
import synthUltra from "./synthesis_04_ultra.md";

export interface DifficultyPresetEntry {
  id: string;
  label: string;
  shortLabel: string;
  body: string;
}

export const PACK_DIFFICULTY_PRESETS: DifficultyPresetEntry[] = [
  { id: "pack_01_easy",   label: "쉬움 (초등 4-6학년)",         shortLabel: "쉬움",         body: packEasy },
  { id: "pack_02_normal", label: "보통 (고등학생)",             shortLabel: "보통",         body: packNormal },
  { id: "pack_03_hard",   label: "어려움 (학부생)",             shortLabel: "어려움",       body: packHard },
  { id: "pack_04_ultra",  label: "매우 어려움 (대학원/전문가)", shortLabel: "매우 어려움", body: packUltra },
];

export const SYNTHESIS_DIFFICULTY_PRESETS: DifficultyPresetEntry[] = [
  { id: "synthesis_01_easy",   label: "쉬움 (초등 4-6학년)",         shortLabel: "쉬움",         body: synthEasy },
  { id: "synthesis_02_normal", label: "보통 (고등학생)",             shortLabel: "보통",         body: synthNormal },
  { id: "synthesis_03_hard",   label: "어려움 (학부생)",             shortLabel: "어려움",       body: synthHard },
  { id: "synthesis_04_ultra",  label: "매우 어려움 (대학원/전문가)", shortLabel: "매우 어려움", body: synthUltra },
];

export function getDefaultPackDifficultyPrompt(): string {
  return packEasy;
}

export function getDefaultSynthesisPrompt(): string {
  return synthEasy;
}
