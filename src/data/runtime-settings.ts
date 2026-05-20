import type {
  AISettings,
  AnnotationAgentReference,
  AnnotationMode,
  CodexWorkbenchLocalSettings,
  DifficultyLevel,
  OutputLanguageMode,
  SupportedOutputLanguage,
} from "../types.ts";
import { normalizeAISettings } from "../ai/settings-registry.ts";
import { normalizeAnnotationAgents } from "../ai/personas.ts";

const DEFAULT_CODEX_LOCAL_SETTINGS: CodexWorkbenchLocalSettings = {
  useGlobalPackExploration: true,
  annotationMode: "parallel",
  annotationLanguageMode: "auto-source",
  packLanguageMode: "auto-source",
  annotationAgents: [],
};

const FIXED_PACK_DIFFICULTY: DifficultyLevel = 1;

export interface EffectiveWorkbenchRuntimeSettings {
  ai: AISettings;
  difficulty: DifficultyLevel;
  // Card draw + synthesis use a user-editable full prompt instead of the
  // built-in difficulty level. AI Annotation (enrich.ts) NEVER reads these —
  // persona tone stays insulated from difficulty changes.
  customPackDifficultyPrompt: string;
  customSynthesisPrompt: string;
  packExploration: number;
  annotationLanguageMode: OutputLanguageMode;
  fixedAnnotationLanguage?: SupportedOutputLanguage;
  packLanguageMode: OutputLanguageMode;
  fixedPackLanguage?: SupportedOutputLanguage;
  annotationMode: AnnotationMode;
  annotationAgents: AnnotationAgentReference[];
}

function clampExploration(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
}

export function buildEffectiveWorkbenchSettings(
  globalSettings: AISettings,
  localSettings: CodexWorkbenchLocalSettings = DEFAULT_CODEX_LOCAL_SETTINGS,
): EffectiveWorkbenchRuntimeSettings {
  const ai = normalizeAISettings(globalSettings);
  const hasLocalAnnotationAgents = Array.isArray(localSettings.annotationAgents) && localSettings.annotationAgents.length > 0;
  const difficulty: DifficultyLevel = FIXED_PACK_DIFFICULTY;
  const packExploration = localSettings.useGlobalPackExploration
    ? ai.packExploration
    : localSettings.packExplorationOverride ?? ai.packExploration;
  const annotationAgents = normalizeAnnotationAgents(
    hasLocalAnnotationAgents ? localSettings.annotationAgents : ai.annotationAgents,
    ai.activeChatModelId,
    { withDefaults: true },
  );

  return {
    ai,
    difficulty,
    customPackDifficultyPrompt: ai.customPackDifficultyPrompt ?? "",
    customSynthesisPrompt: ai.customSynthesisPrompt ?? "",
    packExploration: clampExploration(packExploration),
    annotationLanguageMode: hasLocalAnnotationAgents ? localSettings.annotationLanguageMode : ai.annotationLanguageMode,
    fixedAnnotationLanguage: hasLocalAnnotationAgents ? localSettings.fixedAnnotationLanguage : ai.fixedAnnotationLanguage,
    packLanguageMode: hasLocalAnnotationAgents ? localSettings.packLanguageMode : ai.packLanguageMode,
    fixedPackLanguage: hasLocalAnnotationAgents ? localSettings.fixedPackLanguage : ai.fixedPackLanguage,
    annotationMode: hasLocalAnnotationAgents ? localSettings.annotationMode : ai.annotationMode,
    annotationAgents,
  };
}

/**
 * @deprecated Synthesis now reads `runtime.customSynthesisPrompt` (with
 * fallback to the easy preset in `src/ai/difficulty-presets/`). This function
 * is preserved as a reference for the school-year tone scale but is no longer
 * wired into any live AI call. Do not call from new code.
 */
export function getDifficultyInstruction(difficulty: DifficultyLevel): string {
  // Grade-level reading targets. The user picks a school year and the AI is
  // bound to that vocabulary AND idea complexity. Level 1 must literally read
  // like an elementary class — not "easy-sounding academic prose".
  switch (difficulty) {
    case 1:
      return [
        "TARGET READER: a Korean elementary-school student (about 4th-6th grade, age 10-12).",
        "VOCABULARY: only words a 10-year-old uses every day. No academic, philosophical, or business words. Banned examples (do not use any of these or their synonyms): 메타인지, 인식론, 존재론, 프레임, 메커니즘, 구조, 전제, 조건, 인과, 본질, 가치, 효율, 최적화, 패러다임, 객체, 추상화, 개념, 사유, 담론, 통찰, 함의, 시사점, 유의미, 상관관계, 표상, 상정, 도출, 정합성, epistemology, ontology, framework, mechanism, paradigm, abstraction, operationalize, metacognition, hermeneutic, phenomenological. If you catch yourself reaching for a word like that, stop and use a kid word instead.",
        "SENTENCE STYLE: short sentences, 15 Korean characters or fewer per clause when possible. Use 해요/이에요 style or even friendlier. Add fun emoji occasionally if it fits.",
        "IDEA COMPLEXITY: one idea per sentence. No nested abstractions. Use a single concrete real-life example a kid would recognize — 학교, 친구, 만화, 게임, 간식, 강아지, 운동회 — instead of generic abstractions.",
        "ENERGY: warm, playful, curious — like a cool older sibling explaining, not a teacher lecturing.",
        "FORBIDDEN STYLE: do NOT use simple words to dress up a complex thought. If the underlying idea is not something a 10-year-old can grasp in one read, simplify the IDEA itself, not just the wording.",
        "LENGTH: annotations are 1-2 short sentences max.",
        "Self-check before answering: would a 5th grader read this aloud and understand it on first try? If no, rewrite simpler.",
      ].join("\n");
    case 2:
      return [
        "TARGET READER: a Korean middle-school student (about 7th-9th grade, age 13-15).",
        "VOCABULARY: everyday Korean plus a few common school subjects' terms (역사, 과학, 문학) when natural. Still no philosophy, no business jargon, no academic abstractions.",
        "SENTENCE STYLE: short to medium sentences. Keep paragraphs to 1-2 sentences.",
        "IDEA COMPLEXITY: one main idea + one supporting example. You may introduce one technical term if you immediately explain it in plain Korean parentheses.",
        "ENERGY: friendly, encouraging, slightly more thoughtful than Level 1.",
        "Self-check: would a 14-year-old find this readable AND interesting? If it sounds like a textbook, rewrite.",
      ].join("\n");
    case 3:
      return [
        "TARGET READER: a Korean high-school student (10th-12th grade, age 16-18).",
        "VOCABULARY: clear modern Korean. Common academic terms (논증, 근거, 가설, 비교) are allowed when they earn their place. Avoid graduate-level theory vocabulary.",
        "SENTENCE STYLE: full sentences. Some structure (예: 먼저… 다음은…) is fine.",
        "IDEA COMPLEXITY: a main claim with reasons and at least one counter-consideration is appropriate.",
        "ENERGY: focused, intellectually curious, like a good teacher who respects the reader.",
      ].join("\n");
    case 4:
      return [
        "TARGET READER: a Korean undergraduate university student.",
        "VOCABULARY: domain terms appropriate to the field are welcome. Theoretical lenses, methodological distinctions, and conceptual contrasts are useful when they sharpen the point.",
        "IDEA COMPLEXITY: name tensions, limitations, edge cases. Multiple competing framings can co-exist.",
        "STYLE: precise rather than decorative. Don't pad with academic-flavored filler.",
      ].join("\n");
    case 5:
      return [
        "TARGET READER: a Korean graduate student or domain expert.",
        "VOCABULARY: full disciplinary vocabulary is fair game. Compact conceptual language preferred.",
        "IDEA COMPLEXITY: surface load-bearing assumptions, methodological stakes, second-order implications, productive disanalogies.",
        "STYLE: argument-dense. Each sentence should do real work; remove anything ornamental.",
      ].join("\n");
    default:
      return "Write for a Korean high-school-level reader.";
  }
}

/**
 * @deprecated Card draw now reads `runtime.customPackDifficultyPrompt` (with
 * fallback to the easy preset in `src/ai/difficulty-presets/`). This function
 * is preserved as a reference for the school-year card-draw scale but is no
 * longer wired into any live AI call. Do not call from new code.
 */
export function getPackDifficultyInstruction(difficulty: DifficultyLevel): string {
  const shared = [
    "Rarity is NOT difficulty. Common/Rare/Epic/Legendary controls how far the card travels from the source note.",
    "The user's difficulty setting controls the school-year level of vocabulary AND of the underlying topic itself — not just the wording.",
    "WARNING: do not produce 'easy-sounding wording wrapped around a hard topic'. The TOPIC of the card must match the difficulty too.",
  ];

  switch (difficulty) {
    case 1:
      return [
        ...shared,
        "TARGET: Korean elementary-school student (4th-6th grade).",
        "TOPIC SCOPE: pick prompts a kid actually cares about — friends, classes, games, family, hobbies, daily small choices. Do NOT pick philosophy, epistemology, abstract theory, business strategy, or research methodology, even dressed in cute words.",
        "VOCABULARY: every visible string (card_name, hook, main_question, bridge_steps, write_now, followups) uses only kid Korean. Banned: 메타인지, 인식론, 존재론, 패러다임, 메커니즘, 구조, 전제, 본질, 가치, 효율, 최적화, 추상화, 개념, MDL, consilience, meta-epistemic, operationalize.",
        "QUESTION FEEL: each main_question sounds like a question a curious kid would ask out loud. Answerable in 5-10 minutes.",
        "STEPS: every write_now is a small action a 5th grader can finish in one sitting.",
        "Even a Legendary card is a BIG kid question (예: '내가 좋아하는 일이 진짜 평생 좋아할 일인지 어떻게 알아?'), not an expert-sounding question in baby words.",
      ].join("\n");
    case 2:
      return [
        ...shared,
        "TARGET: Korean middle-school student (7th-9th grade).",
        "TOPIC SCOPE: school subjects, friendships, identity, simple media analysis, light life questions. Avoid graduate-level theory.",
        "VOCABULARY: everyday Korean + at most one school-subject term per card with a simple gloss.",
        "Main questions should feel practical and answerable in 10-15 minutes. Write-now steps build confidence.",
      ].join("\n");
    case 3:
      return [
        ...shared,
        "TARGET: Korean high-school student (10th-12th grade).",
        "TOPIC SCOPE: real reasoning, ethical dilemmas, comparison of viewpoints, civic and cultural topics. Light academic concepts welcome.",
        "VOCABULARY: clean modern Korean, common academic terms (논증, 근거, 가설) when earned.",
        "Cards may have a counter-consideration or alternative angle.",
      ].join("\n");
    case 4:
      return [
        ...shared,
        "TARGET: Korean undergraduate university student.",
        "TOPIC SCOPE: disciplinary problems, methodological choices, conceptual tensions, real research-adjacent questions.",
        "VOCABULARY: domain terms welcome when they sharpen the point.",
        "Still make each write_now actionable in one sitting.",
      ].join("\n");
    case 5:
      return [
        ...shared,
        "TARGET: Korean graduate-level researcher or domain expert.",
        "TOPIC SCOPE: load-bearing theoretical assumptions, methodological stakes, model limits, second-order implications.",
        "VOCABULARY: full disciplinary vocabulary. Compact and dense is fine.",
        "Legendary cards may expose integration across frames, productive disanalogies, or meta-level critique.",
      ].join("\n");
    default:
      return [...shared, "TARGET: Korean high-school student."].join("\n");
  }
}

export function getSequentialConversationInstruction(
  sequenceIndex: number | undefined,
  hasPreviousAnnotations: boolean,
  isFinalTurn: boolean,
): string {
  if (sequenceIndex === undefined) return "";

  const turn = sequenceIndex + 1;
  const base = [
    `This is Turn ${turn} of a LIVE DEBATE between AI personas about the user's note.`,
    "This is NOT a polite roundtable where everyone agrees and adds. It is a real argument where each agent fights for its own angle.",
    "The user is watching the debate to learn from the friction between perspectives. Friction is the product.",
  ];

  if (hasPreviousAnnotations) {
    base.push(
      "You MUST quote or paraphrase ONE specific claim from a previous turn and PUSH BACK on it.",
      "Default stance is DISAGREEMENT: find what the previous agent missed, oversimplified, exaggerated, or got wrong.",
      "If you genuinely cannot disagree, then PROBE: pose a sharp question that exposes a hidden assumption in their take.",
      "Forbidden patterns: 'Skeptical reader 말에 덧붙이자면', 'I agree and would add', 'Building on this', '정말 좋은 지적이에요'. These are conflict-avoidance — do not write them.",
      "Allowed openers (pick the energy that fits): '잠깐, 그건 좀 다른데', '근데 이건 어떻게 설명할래?', '그게 진짜 그래?', '내 생각엔 정반대인데', '그 전제가 의심스러워'. Or in English: 'Actually, that misses…', 'But what about…', 'I'd push back: …'.",
      "Name the previous agent you are pushing on (e.g., 'Skeptical reader는 …라고 했는데') so the user can follow the volley.",
      "Stay in YOUR persona's voice — don't blur into the previous agent's style.",
    );
  } else {
    base.push(
      "You open the debate. Stake out a clear, sharp angle that the next agents will want to attack or defend against.",
      "Avoid wishy-washy summaries. Take a position.",
    );
  }

  if (isFinalTurn) {
    base.push(
      "This is the FINAL turn. Do NOT smooth over the disagreement.",
      "You may name the unresolved tension in one short sentence, then end with one concrete writing action the user can do now while the debate is still alive in their head.",
    );
  }

  return base.join("\n");
}

export function getDifficultyLabel(difficulty: DifficultyLevel): string {
  switch (difficulty) {
    case 1:
      return "1 - Very easy";
    case 2:
      return "2 - Easy";
    case 4:
      return "4 - Deep";
    case 5:
      return "5 - Expert";
    case 3:
    default:
      return "3 - Normal";
  }
}

export function getLanguageInstruction(
  mode: OutputLanguageMode,
  fixedLanguage: SupportedOutputLanguage | undefined,
  fallback: string,
): string {
  if (mode === "fixed" && fixedLanguage) return languageCodeToLabel(fixedLanguage);
  if (mode === "ui-language") return fallback;
  if (mode === "bilingual") return "Korean and English";
  return "the source note language";
}

export function getOutputLanguageModeLabel(
  mode: OutputLanguageMode,
  fixedLanguage?: SupportedOutputLanguage,
): string {
  if (mode === "fixed" && fixedLanguage) return `Always ${languageCodeToLabel(fixedLanguage)}`;
  if (mode === "ui-language") return "Interface language";
  if (mode === "bilingual") return "Korean + English";
  return "Source note language";
}

function languageCodeToLabel(language: SupportedOutputLanguage): string {
  switch (language) {
    case "ko":
      return "Korean";
    case "en":
      return "English";
    case "ja":
      return "Japanese";
    case "zh":
      return "Chinese";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
  }
}
