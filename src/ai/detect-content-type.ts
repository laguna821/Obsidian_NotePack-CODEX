// ── Heuristic Content Type Detection ──────────────────────────────────────
// Direct port from Nodepad's detect-content-type.ts

import type { ContentType } from "../types";

const URL_REGEX = /https?:\/\/[^\s]+/i;

export function detectContentType(text: string): ContentType {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Quote: starts with quotation marks
  if (/^["'\u201C\u201D\u2018\u2019\u300C\u300D]/.test(trimmed)) {
    return "quote";
  }

  // Task: starts with checkbox syntax, TODO/FIXME, or action verbs
  if (
    /^\[[\sx]?\]/i.test(trimmed) ||
    /^(todo|fixme|hack|buy|call|send|finish|complete|remind|need to|해야|할 일|사야)\b/i.test(trimmed)
  ) {
    return "task";
  }

  // Question: starts with ? or ends with ? within first sentence
  if (trimmed.startsWith("?") || /^[^.!]{3,}\?/.test(trimmed)) {
    return "question";
  }

  // Definition: contains "is defined as", "means", "refers to" (EN + KO)
  if (
    /\b(is defined as|means|refers to|is the)\b/i.test(lower) ||
    /(이란|이라 함은|의 정의|을 의미|를 뜻)/i.test(trimmed)
  ) {
    return "definition";
  }

  // Comparison: contains "vs", "compared to" etc. (EN + KO)
  if (
    /\b(vs\.?|versus|compared to|on the other hand|differs from|difference between)\b/i.test(lower) ||
    /(반면|비교하면|차이점|대조적으로|~와 비교)/i.test(trimmed)
  ) {
    return "comparison";
  }

  // Reference: contains a URL
  if (URL_REGEX.test(trimmed)) {
    return "reference";
  }

  // Idea: starts with "what if", Korean equivalents
  if (
    /^(what if|could we|imagine|how about|maybe we)\b/i.test(trimmed) ||
    /^(만약|~하면 어떨까|혹시|아이디어)/i.test(trimmed)
  ) {
    return "idea";
  }

  // Reflection: contains reflective patterns
  if (
    /\b(i remember|looking back|in retrospect|upon reflection|thinking about it)\b/i.test(lower) ||
    /(돌이켜보면|생각해보니|되돌아보면|회고)/i.test(trimmed)
  ) {
    return "reflection";
  }

  // Opinion: contains opinion markers
  if (
    /\b(i think|i feel|i believe|imo|imho|in my opinion|personally)\b/i.test(lower) ||
    /(내 생각에|나는 ~라고|개인적으로|~인 것 같)/i.test(trimmed)
  ) {
    return "opinion";
  }

  // Entity: short, no verb-like structure
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 3 && !trimmed.includes(".") && !trimmed.includes("!")) {
    return "entity";
  }

  // Claim: assertive statements
  if (wordCount >= 4 && wordCount <= 25 && !trimmed.endsWith("?")) {
    return "claim";
  }

  // Narrative: longer text blocks
  if (wordCount > 25) {
    return "narrative";
  }

  return "general";
}
