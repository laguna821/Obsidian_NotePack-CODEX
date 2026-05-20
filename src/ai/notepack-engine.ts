// ── NotePack CODEX Generation Engine ──────────────────────────────────────
// Implements the full Common/Rare/Epic/Legendary rarity logic from CODEX v2.1

import type {
  WorkbenchCard,
  PackCard,
  PackSession,
  Rarity,
  AIConfig,
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

const PACK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          rarity: { type: "string", enum: ["common", "rare", "epic", "legendary"] },
          card_name: { type: "string" },
          hook: { type: "string" },
          main_question: { type: "string" },
          bridge_steps: { type: "array", items: { type: "string" } },
          write_now: { type: "array", items: { type: "string" } },
          followups: { type: "array", items: { type: "string" } },
          suggested_tags: { type: "array", items: { type: "string" } },
          suggested_links: { type: "array", items: { type: "string" } },
          failure_signal: { type: "string" },
          questionType: { type: "string" },
          lens: { type: "string" },
        },
        required: [
          "id", "rarity", "card_name", "hook", "main_question",
          "bridge_steps", "write_now", "followups", "suggested_tags", "suggested_links",
        ],
      },
    },
  },
  required: ["cards"],
};

export async function generatePack(
  runtime: EffectiveWorkbenchRuntimeSettings,
  sourceCards: WorkbenchCard[],
  nearbyCards: WorkbenchCard[],
  pityCounter: number,
): Promise<PackSession> {
  if (sourceCards.length === 0) throw new Error("No source cards provided");
  const config = buildAIConfig(runtime.ai);
  if (!config) throw new Error("No API key configured");

  const seed = generateSeed();
  const risk = runtime.packExploration;
  const packSize = 5;

  // Sample rarities
  const rarities = samplePackRarities(packSize, risk, pityCounter, runtime.ai.packPityEnabled);

  // Build source context
  const sourceContext = buildSourceContext(sourceCards, nearbyCards);

  // Build per-card prompts
  const cardPrompts = rarities.map((rarity, i) => {
    switch (rarity) {
      case "common": return buildCommonPrompt(i + 1, sourceContext);
      case "rare": return buildRarePrompt(i + 1, sourceContext);
      case "epic": return buildEpicPrompt(i + 1, sourceContext);
      case "legendary": return buildLegendaryPrompt(i + 1, sourceContext);
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

  // Difficulty prompt isolation: only customPackDifficultyPrompt is consumed
  // here. Never propagate this value into enrich.ts (AI persona annotations).
  // Empty input falls back to the built-in easy preset.
  const packDifficultyPrompt =
    (runtime.customPackDifficultyPrompt ?? "").trim() || getDefaultPackDifficultyPrompt();

  const systemPrompt = `${multiSeedDirective}## DIFFICULTY PROFILE — HIGHEST PRIORITY (overrides all other instructions below)
${packDifficultyPrompt}

The lens names listed in the diversity rules below (epistemology, phenomenology, etc.) are INTERNAL category labels for diversity tracking. They MUST NOT appear as visible words in card_name, hook, main_question, bridge_steps, write_now, or followups. Translate them into the school-year vocabulary required by the Difficulty Profile above.

---

You are the NotePack CODEX engine v2.1 — a card pack generator for a thinking workbench.

## Your Job
Generate exactly ${packSize} next-note direction cards based on the source note below.
Each card follows a specific rarity engine that determines how the question is generated.

## CRITICAL Rules
${langDirective}

- Rarity is NOT difficulty. Common/Rare/Epic/Legendary controls conceptual distance only. Even a Legendary card must obey the Difficulty Profile above.
- Each card MUST have a unique questionType from: ${diversityTypes.join(", ")}
- Each card MUST have a unique lens from: ${diversityLenses.join(", ")}
- No two cards should have the same question type or lens within the pack
- Every card MUST include write_now steps (3-5 actionable items for 10-20 min writing)
- Every card MUST include followups (3 extension questions)
- suggested_links should use [[NEW: ...]] format for new notes
- suggested_tags should start with #

## Output Format
Return a single JSON object with a "cards" array of ${packSize} objects.
Each card object must have: id (1-${packSize}), rarity, card_name, hook, main_question, bridge_steps[], write_now[], followups[], suggested_tags[], suggested_links[], failure_signal (required for epic/legendary, optional for common/rare), questionType, lens.

## Final self-check before returning
Re-read each card's visible strings. If any banned word from the Difficulty Profile leaked in, rewrite that field in school-appropriate Korean before returning.`;

  const userMessage = `## Source Note
${sourceContext}

## Card Generation Instructions
${cardPrompts.join("\n\n")}

Seed: ${seed} | Exploration: ${risk}

Return ONLY a valid JSON object with the "cards" array.`;

  const result = await chatCompletion(config, {
    model: config.modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7 + risk * 0.03,
    response_format: { type: "json_object" },
  });

  // Parse the result
  let parsedCards: PackCard[];
  try {
    const parsed = JSON.parse(extractJsonCandidate(result.content) ?? result.content);
    const rawCards = parsed.cards || parsed;
    parsedCards = (Array.isArray(rawCards) ? rawCards : [rawCards]).map((c: any, i: number) => ({
      id: c.id ?? i + 1,
      rarity: rarities[i] || "common",
      effect_text: RARITY_EFFECT_TEXT[rarities[i] || "common"],
      card_name: c.card_name || `Card ${i + 1}`,
      hook: c.hook || "",
      main_question: c.main_question || "",
      bridge_steps: c.bridge_steps || [],
      write_now: c.write_now || [],
      followups: c.followups || [],
      suggested_tags: c.suggested_tags || [],
      suggested_links: c.suggested_links || [],
      failure_signal: c.failure_signal || "",
      obsidian_template: buildObsidianTemplate(c, rarities[i] || "common", seed),
      questionType: c.questionType || "",
      lens: c.lens || "",
    }));
  } catch (e) {
    throw new Error(`Failed to parse pack generation result: ${result.content.substring(0, 300)}`);
  }

  // Ensure we have exactly packSize cards
  while (parsedCards.length < packSize) {
    parsedCards.push({
      id: parsedCards.length + 1,
      rarity: "common",
      effect_text: RARITY_EFFECT_TEXT.common,
      card_name: "생성 실패",
      hook: "카드 생성에 실패했습니다. 다시 시도해주세요.",
      main_question: "",
      bridge_steps: [],
      write_now: [],
      followups: [],
      suggested_tags: [],
      suggested_links: [],
      obsidian_template: "",
    });
  }

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
    cards: parsedCards.slice(0, packSize),
    keptIds: [],
    discardedIds: [],
  };

  return session;
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

function buildObsidianTemplate(card: any, rarity: Rarity, seed: string): string {
  const tags = (card.suggested_tags || []).map((t: string) => `  - ${t}`).join("\n");
  const links = (card.suggested_links || []).map((l: string) => `  - ${l}`).join("\n");

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
- Q: ${card.main_question || ""}

## 왜 이 질문이 지금 나왔나(Bridge)
${(card.bridge_steps || []).map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}

## 10분 초안(무조건 쓰기)
${(card.write_now || []).map((s: string) => `- ${s}`).join("\n")}

## 확장(선택)
${(card.followups || []).map((s: string) => `- ${s}`).join("\n")}

## 다음 액션
- NEW 노트 제안:
${(card.suggested_links || []).filter((l: string) => l.includes("NEW")).map((l: string) => `  - ${l}`).join("\n")}
`;
}

function extractJsonCandidate(content: string): string | null {
  const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end > start) return content.slice(start, end + 1).trim();
  return null;
}
