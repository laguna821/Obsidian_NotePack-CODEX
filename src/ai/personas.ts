import type {
  AnnotationAgentReference,
  OutputLanguageMode,
  SupportedOutputLanguage,
} from "../types";

export const MAX_ANNOTATION_AGENTS = 10;

const VALID_OUTPUT_LANGUAGE_MODES = new Set<OutputLanguageMode>([
  "auto-source",
  "ui-language",
  "fixed",
  "bilingual",
]);

const VALID_SUPPORTED_LANGUAGES = new Set<SupportedOutputLanguage>([
  "ko",
  "en",
  "ja",
  "zh",
  "es",
  "fr",
]);

const LEGACY_PERSONA_LABELS = new Set([
  "Friendly tutor",
  "Skeptical reader",
  "Writing coach",
  "Question generator",
  "Concretizer",
  "Reader response",
  "Concept analyst",
  "Film critic",
]);

function normalizeIcon(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Array.from(trimmed).slice(0, 2).join("");
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return undefined;
}

export function createDefaultAnnotationAgents(modelId: string): AnnotationAgentReference[] {
  return [
    {
      id: "agent-1",
      label: "AI 1",
      modelId,
      customInstruction: undefined,
      order: 1,
    },
  ];
}

export interface NormalizeAnnotationAgentOptions {
  withDefaults?: boolean;
}

export function normalizeAnnotationAgents(
  agents: AnnotationAgentReference[] | undefined,
  fallbackModelId: string,
  options: NormalizeAnnotationAgentOptions = {},
): AnnotationAgentReference[] {
  const withDefaults = options.withDefaults ?? true;
  const source = Array.isArray(agents) && agents.length > 0
    ? agents
    : withDefaults
      ? createDefaultAnnotationAgents(fallbackModelId)
      : [];

  return source.slice(0, MAX_ANNOTATION_AGENTS).map((agent, index) => {
    const outputLanguageMode = VALID_OUTPUT_LANGUAGE_MODES.has(agent.outputLanguageMode as OutputLanguageMode)
      ? agent.outputLanguageMode
      : undefined;
    const fixedOutputLanguage = VALID_SUPPORTED_LANGUAGES.has(agent.fixedOutputLanguage as SupportedOutputLanguage)
      ? agent.fixedOutputLanguage
      : undefined;

    const rawLabel = (agent.label || "").trim();
    const label = !rawLabel || LEGACY_PERSONA_LABELS.has(rawLabel)
      ? `AI ${index + 1}`
      : rawLabel;

    return {
      id: agent.id || `agent-${index + 1}`,
      label,
      icon: normalizeIcon(agent.icon),
      color: normalizeColor(agent.color),
      modelId: agent.modelId || fallbackModelId,
      customInstruction: agent.customInstruction?.trim() || undefined,
      order: Number.isFinite(agent.order) ? agent.order : index + 1,
      outputLanguageMode,
      fixedOutputLanguage,
    };
  }).sort((left, right) => left.order - right.order);
}
