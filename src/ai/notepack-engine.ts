import { normalizePackPreferences, buildPreferenceInstruction, buildDepthInstruction } from "./pack-preferences";
// ── NotePack CODEX Generation Engine ──────────────────────────────────────
// Implements the full Common/Rare/Epic/Legendary rarity logic from CODEX v2.1

import type {
  WorkbenchCard,
  PackCard,
  PackSession,
  Rarity,
} from "../types";
import { RARITY_EFFECT_TEXT } from "../types";
import type { EffectiveWorkbenchRuntimeSettings } from "../data/runtime-settings";
import { getLanguageInstruction } from "../data/runtime-settings";
import { getDefaultPackDifficultyPrompt } from "./difficulty-presets";
import { buildAIConfig, chatCompletion } from "./providers";

// ── Rarity Sampling ─────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = { common: 0.88, rare: 0.10, epic: 0.018, legendary: 0.002 };

function adjustWeightsForRisk(
  risk: number,
  base: typeof DEFAULT_WEIGHTS,
): typeof DEFAULT_WEIGHTS {
  // Each risk level shifts 3% from common to rare/epic/legendary
  const shift = risk * 0.03;
  return {
    common: Math.max(0.5, base.common - shift),
    rare: base.rare + shift * 0.6,
    epic: base.epic + shift * 0.25,
    legendary: base.legendary + shift * 0.15,
  };
}

function sampleRarity(
  weights: typeof DEFAULT_WEIGHTS,
  pityCounter: number,
  pityEnabled: boolean,
): Rarity {
  // Pity: guarantee at least one Rare if 6+ packs without Rare+
  if (pityEnabled && pityCounter >= 6) {
    return "rare";
  }

  const r = Math.random();
  let cumulative = 0;

  cumulative += weights.legendary;
  if (r < cumulative) return "legendary";

  cumulative += weights.epic;
  if (r < cumulative) return "epic";

  cumulative += weights.rare;
  if (r < cumulative) return "rare";

  return "common";
}

function samplePackRarities(
  packSize: number,
  risk: number,
  pityCounter: number,
  pityEnabled: boolean,
): Rarity[] {
  const weights = adjustWeightsForRisk(risk, DEFAULT_WEIGHTS);
  const rarities: Rarity[] = [];

  for (let i = 0; i < packSize; i++) {
    // Only apply pity on the first card
    const pity = i === 0 ? pityCounter : 0;
    rarities.push(sampleRarity(weights, pity, pityEnabled));
  }

  return rarities;
}

// ── Seed Generation ─────────────────────────────────────────────────────

function generateSeed(): string {
  return "S-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Per-Rarity Prompt Construction ──────────────────────────────────────

function buildCommonPrompt(cardIndex: number, sourceContext: string): string {
  return `## Card ${cardIndex} — COMMON Engine (Exploit / Deep Extension)

Generate a card that **directly extends** the source note.
Use one of these question templates:
- Define/Distinguish: "What is X in one sentence?" / "Key difference between X and Y?"
- Operationalize: "3 measurable indicators for X?"
- Mechanism: "Minimal cause-effect chain for X?"
- Boundary: "Conditions where X works and doesn't work?"
- Counterexample: "2 counter-examples that break X — what do they reveal?"
- Compare: "X vs Y on the same criteria?"
- Design: "Minimum experiment/prototype to apply X?"

Add a "Desirable Difficulty Spice" (one of: retrieval twist, counterexample twist, boundary twist, measurement twist).

The question should produce a first paragraph within 10-20 minutes.

${sourceContext}`;
}

function buildRarePrompt(cardIndex: number, sourceContext: string): string {
  return `## Card ${cardIndex} — RARE Engine (Bridge / Weak Ties / Adjacent Possible)

Generate a card that bridges to an **adjacent domain or method**.

You MUST select one Bridge Type:
1) Method Transfer — Apply a method from another field
2) Category Shift — Move up (abstract) or down (concrete)
3) Analogy Mapping — Find a system with the same structure
4) Reframing — Redefine the problem via mechanism/constraint/objective
5) Constraint Injection — Add time/resource/ethics/policy constraints

You MUST provide Bridge Steps (2-4 steps):
(Current topic) → (Mediating concept) → (Adjacent domain) → (New question/output)

The bridge must be logically plausible in one sentence. Output must include a checklist, rubric, protocol, or one-page design.

${sourceContext}`;
}

function buildEpicPrompt(cardIndex: number, sourceContext: string): string {
  return `## Card ${cardIndex} — EPIC Engine (Bisociation / Conceptual Blending)

Generate a card that **collides two frames** to produce a third insight.

You MUST:
1) Define Frame A (conventional frame of the source) and Frame B (a different lens)
2) List 2 implicit assumptions per frame
3) Find the collision point as a one-sentence tension
4) Create a question that resolves the tension productively
5) Include a failure_signal: "If X is observed, this frame breaks"

Use one Blend Operator:
- Assumption Swap, Double-Objective, Level Jump, or Paradox Harness

The write-now plan must include: thesis, evidence, counterexample, reframing (20 min plan). One followup must be a meta-question about methodology/assumptions.

${sourceContext}`;
}

function buildLegendaryPrompt(cardIndex: number, sourceContext: string): string {
  return `## Card ${cardIndex} — LEGENDARY Engine (MDL / Consilience / Meta-Epistemic)

Generate a card that attempts a **compressed integration** across 3 clusters.

You MUST:
1) Identify 3 clusters: Phenomenon/Cases, Mechanism/Systems, Norms/Epistemology
2) Compress them into a 1-2 sentence integrative frame
3) Convert to a testable/arguable question
4) Include a MANDATORY failure_signal: "If X is observed, this integration loses credibility"

Use one Legendary Pattern:
A) Model-Limit: "How much does our model/measurement create the phenomenon?"
B) Whole-Part: "Where does local optimization cause global degradation?"
C) Language-Reality Gap: "Where does changing the definition change the same data's meaning?"
D) Three-Lens Unification: "Minimal common structure across cognitive, social, and technological?"

The write-now plan: 1 paragraph big picture → 1 paragraph case → 1 paragraph falsification (30 min plan). One followup must ask "what assumption should be discarded?"

${sourceContext}`;
}

// ── Main Generation Function ────────────────────────────────────────────

export async function generatePack(
  runtime: EffectiveWorkbenchRuntimeSettings,
  sourceCards: WorkbenchCard[],
  nearbyCards: WorkbenchCard[],
  pityCounter: number,
  signal?: AbortSignal,
): Promise<PackSession> {
  if (sourceCards.length === 0) throw new Error("No source cards provided");
  const config = buildAIConfig(runtime.ai);
  if (!config) throw new Error("No API key configured");

  signal?.throwIfAborted();
  const started = Date.now();
  const preferences = normalizePackPreferences(runtime.ai.packPreferences, runtime.ai);
  const seed = generateSeed();
  const risk = runtime.packExploration;
  const packSize = 5;

  // Sample rarities
  const rarities = preferences.rarity === "auto"
    ? samplePackRarities(packSize, risk, pityCounter, runtime.ai.packPityEnabled)
    : Array<Rarity>(packSize).fill(preferences.rarity);

  // Build source context
  const sourceContext = buildSourceContext(sourceCards, nearbyCards);

  // Build per-card prompts
  const cardPrompts = rarities.map((rarity, i) => {
    switch (rarity) {
      case "common": return buildCommonPrompt(i + 1, "");
      case "rare": return buildRarePrompt(i + 1, "");
      case "epic": return buildEpicPrompt(i + 1, "");
      case "legendary": return buildLegendaryPrompt(i + 1, "");
    }
  });

  // Detect language (across all seeds)
  const combinedSeedText = sourceCards.map((c) => c.text).join(" ");
  const isKorean = /[\uAC00-\uD7AF]/.test(combinedSeedText);
  const fallbackLanguage = runtime.ai.uiLanguage === "ko" ? "Korean" : "English";
  const targetLanguage =
    runtime.packLanguageMode === "auto-source"
      ? isKorean
        ? "Korean"
        : "English"
      : getLanguageInstruction(runtime.packLanguageMode, runtime.fixedPackLanguage, fallbackLanguage);
  const langDirective = `All card content (card_name, hook, main_question, bridge_steps, write_now, followups, suggested_tags, suggested_links) MUST be in ${targetLanguage}.`;

  const diversityTypes = [
    "define", "evidence", "mechanism", "boundary", "compare",
    "operationalize", "critique", "synthesize", "design", "pedagogy",
  ];
  const diversityLenses = [
    "measurement", "epistemology", "systems", "rhetoric", "ethics",
    "history", "practice", "computation", "phenomenology", "culture",
  ];

  const multiSeedDirective = sourceCards.length > 1
    ? `## Multi-Seed Synthesis Mode (priority instruction)
The user provided ${sourceCards.length} source notes as joint seeds (not as a sequence).
Your job is NOT to extend each seed separately. Instead:
- Identify conceptual overlap, tension, or bridge between the seeds.
- Each generated card MUST reference at least 2 seeds in its hook or bridge_steps.
- At least one card MUST attempt a synthesis no single seed alone would produce.

---

`
    : "";

  // Pack preferences do not change AI persona annotations or synthesis.
  // Preserve an explicitly selected custom prompt; otherwise use the depth setting.
  const packDifficultyPrompt =
    preferences.promptMode === "custom"
      ? (runtime.customPackDifficultyPrompt ?? "").trim() || getDefaultPackDifficultyPrompt()
      : buildDepthInstruction(preferences.difficulty);

  const systemPrompt = `${multiSeedDirective}## DIFFICULTY PROFILE — HIGHEST PRIORITY (overrides all other instructions below)
${packDifficultyPrompt}

The lens names below are internal diversity labels. Write naturally for the reader rather than displaying the label.

---

You are the NotePack CODEX engine v2.1 — a card pack generator for a thinking workbench.

## Your Job
Generate exactly ${packSize} next-note direction cards based on the source note below.
Each card follows a specific rarity engine that determines how the question is generated.

## CRITICAL Rules
${langDirective}

- Rarity selects the thinking structure described by each engine. Difficulty controls how demanding the inquiry is within that structure; it must not make the sentence harder to understand.
- Common stays near the source. Rare, Epic, and Legendary may leave it entirely: do not force the source scene, names, or an explanation of the connection into the question.
- main_question is a standalone writing topic: understandable without the source or the guide. Let it invite thought rather than list tasks. Put optional writing support in write_now and followups.
- Do not invent personal experiences or real-world facts. Clearly introduce any imagined situation.
- Each card MUST have a unique questionType from: ${diversityTypes.join(", ")}
- Each card MUST have a unique lens from: ${diversityLenses.join(", ")}
- No two cards should have the same question type or lens within the pack
- Every card MUST include write_now steps (3-5 actionable items for 10-20 min writing)
- Every card MUST include followups (3 extension questions)
- suggested_links should use [[NEW: ...]] format for new notes
- suggested_tags should start with #

## User preferences
${buildPreferenceInstruction(preferences)}

## Output Format
Return a single JSON object with a "cards" array of ${packSize} objects.
Each card object must have: id (1-${packSize}), rarity, card_name, hook, main_question, bridge_steps[], write_now[], followups[], suggested_tags[], suggested_links[], failure_signal (required for epic/legendary, optional for common/rare), questionType, lens.

## Final self-check before returning
Read the main questions on their own: preserve their meaning and make them natural, clear, and distinct.`;

  const userMessage = `## Source Note
${sourceContext}

## Card Generation Instructions
${cardPrompts.join("\n\n")}

Seed: ${seed} | Exploration: ${risk}

Return ONLY a valid JSON object with the "cards" array.`;

  const result = await chatCompletion(config, {
    model: config.modelId,
    messages: [
      { role: "system", content: preferences.questionFirst ? systemPrompt + QUESTION_FIRST_OUTPUT : systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7 + risk * 0.03,
    response_format: { type: "json_object" },
    signal,
  });

  signal?.throwIfAborted();
  const parsedCards = preferences.questionFirst
    ? parseQuestionFirstResponse(result.content, rarities, seed, targetLanguage)
    : parsePackResponse(result.content, rarities, seed);
  for (const card of parsedCards) card.generationSettings = structuredClone(preferences);

  const session: PackSession = {
    packId: seed,
    sourceCardId: sourceCards[0].id,
    sourceCardIds: sourceCards.map((c) => c.id),
    createdAt: Date.now(),
    seed,
    contextMode: "obsidian",
    exploration: risk,
    risk,
    style: "탐구",
    weights: adjustWeightsForRisk(risk, DEFAULT_WEIGHTS),
    cards: parsedCards,
    generationSettings: structuredClone(preferences),
    generationMs: Date.now() - started,
    keptIds: [],
    discardedIds: [],
  };

  return session;
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Keep the full-pack prompt unchanged when this option is off. Rarity engines
// still guide the question; only the requested public output changes.
const QUESTION_FIRST_OUTPUT = `

## Question-first output — replaces all support/output field requirements above
Generate the same thoughtful, standalone questions using the rarity engines above.
For this request return ONLY {"cards":[...]} with five objects containing exactly:
id, card_name, main_question, questionType, lens.
Writing support will be requested separately if the reader wants it. Do not output
hook, bridge_steps, write_now, followups, failure_signal, tags, links, or explanations.
Do not squeeze the omitted support into main_question. Preserve the question's depth
and make it immediately understandable on its own.`;

function parseQuestionFirstResponse(content: string, rarities: Rarity[], seed: string, language: string): PackCard[] {
  let parsed: unknown;
  try { parsed = JSON.parse(extractJsonCandidate(content) ?? content); }
  catch { throw new Error("카드 응답을 읽지 못했습니다. 이전 팩은 유지됩니다."); }
  const cards = asRecord(parsed)?.cards;
  if (!Array.isArray(cards)) throw new Error("카드 목록이 없습니다. 이전 팩은 유지됩니다.");
  const completeShape = cards.map(value => ({ ...asRecord(value), hook: "", bridge_steps: [], write_now: [], followups: [], suggested_tags: [], suggested_links: [], failure_signal: "" }));
  return parsePackResponse(JSON.stringify({ cards: completeShape }), rarities, seed).map(card => ({
    ...card, guidanceStatus: "pending", guidanceLanguage: language,
  }));
}

/** One explicit request. Return new data only; never rewrite the existing question. */
export async function generateCardGuidance(runtime: EffectiveWorkbenchRuntimeSettings, card: PackCard, signal?: AbortSignal): Promise<PackCard> {
  signal?.throwIfAborted();
  if (card.guidanceStatus !== "pending") return card;
  const config = buildAIConfig(runtime.ai);
  if (!config) throw new Error("No API key configured");
  const started = Date.now();
  const language = card.guidanceLanguage || (/\p{Script=Hangul}/u.test(card.main_question) ? "Korean" : "English");
  const result = await chatCompletion(config, {
    model: config.modelId,
    messages: [{ role: "system", content: `Provide optional writing support for the fixed question supplied as data. Do not answer it for the reader or rewrite it. Do not invent the reader's experiences, facts, citations, or an absent source note. Clearly mark imagined examples. Use ${language}.
Return one JSON object with ONLY hook (string), bridge_steps (array of 2-4 strings), write_now (array of 3-5 practical steps), followups (array of 3 questions), suggested_tags (array of #tags), suggested_links (array of [[NEW: title]] strings), failure_signal (string).
Support the actual question and its rarity without forcing a prescribed conclusion. Keep the support concise.` },
    { role: "user", content: JSON.stringify({ main_question: card.main_question, card_name: card.card_name, rarity: card.rarity, questionType: card.questionType, lens: card.lens }) }],
    response_format: { type: "json_object" }, signal,
  });
  signal?.throwIfAborted();
  let data: Record<string, unknown> | undefined;
  try { data = asRecord(JSON.parse(extractJsonCandidate(result.content) ?? result.content)); }
  catch { throw new Error("작성 도움 응답을 읽지 못했습니다. 질문은 그대로 유지됩니다."); }
  if (!data || typeof data.hook !== "string" || typeof data.failure_signal !== "string") throw new Error("작성 도움 형식이 올바르지 않습니다.");
  const fields = ["bridge_steps", "write_now", "followups", "suggested_tags", "suggested_links"] as const;
  for (const field of fields) {
    if (!Array.isArray(data[field]) || !(data[field] as unknown[]).every(v => typeof v === "string")) throw new Error("작성 도움 형식이 올바르지 않습니다.");
  }
  if (!(data.write_now as string[]).some(text => text.trim())) throw new Error("작성 도움이 비어 있습니다.");
  const next: PackCard = { ...card, guidanceStatus: "ready", guidanceMs: Date.now() - started,
    hook: data.hook, failure_signal: data.failure_signal,
    bridge_steps: data.bridge_steps as string[], write_now: data.write_now as string[], followups: data.followups as string[],
    suggested_tags: data.suggested_tags as string[], suggested_links: data.suggested_links as string[],
  };
  const seed = card.obsidian_template.match(/^seed: (.*)$/m)?.[1] || "";
  next.obsidian_template = buildObsidianTemplate(next, card.rarity, seed);
  return next;
}

function buildSourceContext(sources: WorkbenchCard[], nearby: WorkbenchCard[]): string {
  if (sources.length === 1) {
    const source = sources[0];
    let ctx = `### Source Card
- Title: ${source.title || source.text.substring(0, 50)}
- Text: ${source.text}
- Type: ${source.contentType || "general"}
- Category: ${source.category || "uncategorized"}`;

    if (source.annotation) {
      ctx += `\n- AI Annotation: ${source.annotation}`;
    }

    if (source.influencedByIds && source.influencedByIds.length > 0) {
      const relatedTexts = nearby
        .filter((c) => source.influencedByIds?.includes(c.id))
        .map((c) => `  - [${c.category || "general"}] ${c.text.substring(0, 80)}`)
        .join("\n");
      if (relatedTexts) {
        ctx += `\n\n### Related Notes\n${relatedTexts}`;
      }
    }

    if (nearby.length > 0) {
      const tags = [...new Set(nearby.flatMap((c) => (c.category ? [c.category] : [])))];
      if (tags.length > 0) {
        ctx += `\n\n### Available Context Tags: ${tags.join(", ")}`;
      }
    }

    return ctx;
  }

  // Multi-seed case
  const seedBlocks = sources.map((source, i) => {
    const lines = [
      `#### Seed ${i + 1}: ${source.title || source.text.substring(0, 50)}`,
      `- Text: ${source.text}`,
      `- Type: ${source.contentType || "general"}`,
      `- Category: ${source.category || "uncategorized"}`,
    ];
    if (source.annotation) lines.push(`- AI Annotation: ${source.annotation}`);
    return lines.join("\n");
  });

  let ctx = `### Source Notes (${sources.length} seeds)
${seedBlocks.join("\n\n")}`;

  // Cross-seed cues
  const categories = sources.map((s) => s.category).filter((c): c is string => Boolean(c));
  const categoryCounts = new Map<string, number>();
  for (const c of categories) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
  const sharedCategories = [...categoryCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([cat]) => cat);

  const allRelated = sources.flatMap((s) => s.influencedByIds || []);
  const relatedCounts = new Map<string, number>();
  for (const id of allRelated) relatedCounts.set(id, (relatedCounts.get(id) ?? 0) + 1);
  const sharedRelatedIds = [...relatedCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  if (sharedCategories.length > 0 || sharedRelatedIds.length > 0) {
    ctx += `\n\n### Cross-seed cues (auto)`;
    if (sharedCategories.length > 0) {
      ctx += `\n- Common categories: ${sharedCategories.join(", ")}`;
    }
    if (sharedRelatedIds.length > 0) {
      const sharedTexts = nearby
        .filter((c) => sharedRelatedIds.includes(c.id))
        .map((c) => `[${c.category || "general"}] ${c.text.substring(0, 60)}`);
      if (sharedTexts.length > 0) {
        ctx += `\n- Shared related notes: ${sharedTexts.join(" | ")}`;
      }
    }
  }

  const allInfluencedByIds = new Set(sources.flatMap((s) => s.influencedByIds || []));
  if (allInfluencedByIds.size > 0) {
    const relatedTexts = nearby
      .filter((c) => allInfluencedByIds.has(c.id))
      .map((c) => `  - [${c.category || "general"}] ${c.text.substring(0, 80)}`)
      .join("\n");
    if (relatedTexts) {
      ctx += `\n\n### Related Notes (combined)\n${relatedTexts}`;
    }
  }

  if (nearby.length > 0) {
    const tags = [...new Set(nearby.flatMap((c) => (c.category ? [c.category] : [])))];
    if (tags.length > 0) {
      ctx += `\n\n### Available Context Tags: ${tags.join(", ")}`;
    }
  }

  return ctx;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textField(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function listField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Builds a pack card from one card object of the model's JSON reply. */
function toPackCard(raw: Record<string, unknown>, index: number, rarity: Rarity, seed: string): PackCard {
  const card = {
    id: typeof raw.id === "number" ? raw.id : index + 1,
    rarity,
    effect_text: RARITY_EFFECT_TEXT[rarity],
    card_name: textField(raw.card_name, `Card ${index + 1}`),
    hook: textField(raw.hook),
    main_question: textField(raw.main_question),
    bridge_steps: listField(raw.bridge_steps),
    write_now: listField(raw.write_now),
    followups: listField(raw.followups),
    suggested_tags: listField(raw.suggested_tags),
    suggested_links: listField(raw.suggested_links),
    failure_signal: textField(raw.failure_signal),
    questionType: textField(raw.questionType),
    lens: textField(raw.lens),
  };
  return { ...card, obsidian_template: buildObsidianTemplate(card, rarity, seed) };
}

type TemplateFields = Pick<
  PackCard,
  "main_question" | "bridge_steps" | "write_now" | "followups" | "suggested_tags" | "suggested_links"
>;

export function buildObsidianTemplate(card: TemplateFields, rarity: Rarity, seed: string): string {
  const tags = card.suggested_tags.map((t) => "  - " + JSON.stringify(t)).join("\n");
  const links = card.suggested_links.map((l) => "  - " + JSON.stringify(l)).join("\n");

  return `---
type: card
rarity: ${rarity}
seed: ${seed}
tags:
  - card/${rarity}
${tags}
links:
${links}
---

## 🃏 질문(카드 텍스트)
- Q: ${card.main_question}

## 왜 이 질문이 지금 나왔나(Bridge)
${card.bridge_steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## 작성 도움(선택)
${card.write_now.map((s) => `- ${s}`).join("\n")}

## 확장(선택)
${card.followups.map((s) => `- ${s}`).join("\n")}

## 다음 액션
- NEW 노트 제안:
${card.suggested_links.filter((l) => l.includes("NEW")).map((l) => `  - ${l}`).join("\n")}
`;
}

export function extractJsonCandidate(content: string): string | null {
  const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end > start) return content.slice(start, end + 1).trim();
  return null;
}

/** Structural validation only. Never fill missing cards or call a model again. */
export function parsePackResponse(content: string, rarities: Rarity[], seed: string): PackCard[] {
  let parsed: unknown;
  try { parsed = JSON.parse(extractJsonCandidate(content) ?? content); }
  catch { throw new Error("카드 응답을 읽지 못했습니다. 다시 뽑기를 눌러주세요."); }
  const cards = asRecord(parsed)?.cards;
  if (!Array.isArray(cards) || cards.length !== rarities.length) throw new Error("카드 다섯 장이 모두 도착하지 않았습니다. 이전 팩은 유지됩니다.");
  const seen = new Set<number>();
  for (const value of cards) {
    const c = asRecord(value);
    if (!c || typeof c.id !== "number" || !Number.isInteger(c.id) || c.id < 1 || c.id > rarities.length || seen.has(c.id)) throw new Error("카드 번호가 올바르지 않습니다. 다시 뽑기를 눌러주세요.");
    seen.add(c.id);
    if (typeof c.main_question !== "string" || !c.main_question.trim() || typeof c.card_name !== "string" || !c.card_name.trim()) throw new Error("비어 있는 카드가 있어 팩을 저장하지 않았습니다.");
    for (const field of ["bridge_steps","write_now","followups","suggested_tags","suggested_links"]) {
      if (!Array.isArray(c[field]) || !(c[field] as unknown[]).every(v => typeof v === "string")) throw new Error("카드 도움말 형식을 읽지 못했습니다. 다시 뽑기를 눌러주세요.");
    }
  }
  return cards.sort((a,b) => a.id-b.id).map((c,i) => toPackCard(c,i,rarities[i],seed));
}
