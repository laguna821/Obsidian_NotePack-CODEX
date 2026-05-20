import type {
  CardStatus,
  CodexWorkbenchDocument,
  CodexWorkbenchLocalSettings,
  CodexWorkbenchMetadata,
  GhostNote,
  PackSession,
  Project,
  WorkbenchCard,
} from "../types.ts";
import { normalizeAnnotationAgents } from "../ai/personas.ts";

export const CODEX_DOCUMENT_SCHEMA_VERSION = 3;
export const CODEX_DOCUMENT_TYPE = "notepack-codex-workbench";

const FORBIDDEN_SECRET_KEYS = new Set([
  "apiKey",
  "accessToken",
  "refreshToken",
  "idToken",
  "generatedApiKey",
]);

const DEFAULT_CODEX_LOCAL_SETTINGS: CodexWorkbenchLocalSettings = {
  useGlobalPackExploration: true,
  annotationMode: "parallel",
  annotationLanguageMode: "auto-source",
  packLanguageMode: "auto-source",
  annotationAgents: [],
  cardSize: "M",
  inspectorWidth: 340,
  inspectorCollapsed: false,
  composerHeight: 80,
  offlineCaptureMode: false,
};

export class CodexDocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexDocumentParseError";
  }
}

export class UnsupportedCodexSchemaError extends Error {
  readonly schemaVersion: number;

  constructor(schemaVersion: number) {
    super(`This .codex file uses schema version ${schemaVersion}, which is newer than this plugin supports.`);
    this.schemaVersion = schemaVersion;
    this.name = "UnsupportedCodexSchemaError";
  }
}

function generateId(prefix = "codex"): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}`;
}

function now(): number {
  return Date.now();
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceCardStatus(value: unknown): CardStatus {
  if (value === "ready" || value === "error" || value === "archived") return value;
  return "ready";
}

function normalizeCard(raw: unknown): WorkbenchCard | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<WorkbenchCard>;
  const createdAt = coerceNumber(item.createdAt, now());
  const originalStatus = item.status;
  const status = coerceCardStatus(item.status);

  return {
    ...item,
    id: coerceString(item.id, generateId("card")),
    kind: item.kind ?? "capture",
    status,
    text: coerceString(item.text, ""),
    createdAt,
    updatedAt: coerceNumber(item.updatedAt, createdAt),
    statusText:
      originalStatus === "enriching"
        ? item.statusText || "Analysis was interrupted before this file was reopened."
        : item.statusText,
  };
}

function normalizeCards(raw: unknown): WorkbenchCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCard).filter((card): card is WorkbenchCard => Boolean(card));
}

function normalizeGhost(raw: unknown): GhostNote | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<GhostNote>;
  return {
    id: coerceString(item.id, generateId("ghost")),
    text: coerceString(item.text, ""),
    category: coerceString(item.category, ""),
    isGenerating: Boolean(item.isGenerating),
  };
}

function normalizeGhosts(raw: unknown): GhostNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeGhost).filter((ghost): ghost is GhostNote => Boolean(ghost));
}

function normalizePackHistory(raw: unknown): PackSession[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is PackSession => Boolean(item && typeof item === "object"))
    .map((session) => {
      const ids = Array.isArray(session.sourceCardIds)
        ? session.sourceCardIds.filter((id): id is string => typeof id === "string")
        : session.sourceCardId
          ? [session.sourceCardId]
          : [];
      return { ...session, sourceCardIds: ids };
    });
}

export function normalizeCodexLocalSettings(raw?: Partial<CodexWorkbenchLocalSettings>): CodexWorkbenchLocalSettings {
  const annotationMode =
    raw?.annotationMode === "single" || raw?.annotationMode === "parallel" || raw?.annotationMode === "sequential"
      ? raw.annotationMode
      : DEFAULT_CODEX_LOCAL_SETTINGS.annotationMode;
  const annotationLanguageMode =
    raw?.annotationLanguageMode === "auto-source" ||
    raw?.annotationLanguageMode === "ui-language" ||
    raw?.annotationLanguageMode === "fixed" ||
    raw?.annotationLanguageMode === "bilingual"
      ? raw.annotationLanguageMode
      : DEFAULT_CODEX_LOCAL_SETTINGS.annotationLanguageMode;
  const packLanguageMode =
    raw?.packLanguageMode === "auto-source" ||
    raw?.packLanguageMode === "ui-language" ||
    raw?.packLanguageMode === "fixed" ||
    raw?.packLanguageMode === "bilingual"
      ? raw.packLanguageMode
      : DEFAULT_CODEX_LOCAL_SETTINGS.packLanguageMode;

  const cardSize =
    raw?.cardSize === "S" || raw?.cardSize === "M" || raw?.cardSize === "L" || raw?.cardSize === "XL"
      ? raw.cardSize
      : DEFAULT_CODEX_LOCAL_SETTINGS.cardSize;
  const inspectorWidth =
    typeof raw?.inspectorWidth === "number" && Number.isFinite(raw.inspectorWidth)
      ? Math.max(240, Math.min(640, raw.inspectorWidth))
      : DEFAULT_CODEX_LOCAL_SETTINGS.inspectorWidth;
  const inspectorCollapsed =
    typeof raw?.inspectorCollapsed === "boolean"
      ? raw.inspectorCollapsed
      : DEFAULT_CODEX_LOCAL_SETTINGS.inspectorCollapsed;
  const composerHeight =
    typeof raw?.composerHeight === "number" && Number.isFinite(raw.composerHeight)
      ? Math.max(48, Math.min(480, raw.composerHeight))
      : DEFAULT_CODEX_LOCAL_SETTINGS.composerHeight;
  const offlineCaptureMode =
    typeof raw?.offlineCaptureMode === "boolean"
      ? raw.offlineCaptureMode
      : DEFAULT_CODEX_LOCAL_SETTINGS.offlineCaptureMode;

  return {
    ...DEFAULT_CODEX_LOCAL_SETTINGS,
    ...raw,
    useGlobalPackExploration:
      raw?.useGlobalPackExploration ?? DEFAULT_CODEX_LOCAL_SETTINGS.useGlobalPackExploration,
    annotationMode,
    annotationLanguageMode,
    packLanguageMode,
    annotationAgents: normalizeAnnotationAgents(raw?.annotationAgents, "", { withDefaults: false }),
    cardSize,
    inspectorWidth,
    inspectorCollapsed,
    composerHeight,
    offlineCaptureMode,
  };
}

export function createEmptyCodexDocument(
  title = "Untitled Codex",
  metadata?: CodexWorkbenchMetadata,
): CodexWorkbenchDocument {
  const timestamp = now();
  return {
    schemaVersion: CODEX_DOCUMENT_SCHEMA_VERSION,
    type: CODEX_DOCUMENT_TYPE,
    id: generateId(),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    cards: [],
    ghostNotes: [],
    packHistory: [],
    pityCounter: 0,
    localSettings: normalizeCodexLocalSettings(),
    metadata,
  };
}

export function createCodexDocumentFromProject(
  project: Project,
  metadata?: CodexWorkbenchMetadata,
): CodexWorkbenchDocument {
  const timestamp = now();
  return normalizeCodexDocument({
    schemaVersion: CODEX_DOCUMENT_SCHEMA_VERSION,
    type: CODEX_DOCUMENT_TYPE,
    id: project.id || generateId(),
    title: project.name || "Migrated Workbench",
    createdAt: timestamp,
    updatedAt: timestamp,
    cards: project.cards || [],
    ghostNotes: project.ghostNotes || [],
    packHistory: project.packHistory || [],
    pityCounter: project.pityCounter || 0,
    lastGhostBlockCount: project.lastGhostBlockCount,
    lastGhostTimestamp: project.lastGhostTimestamp,
    lastGhostTexts: project.lastGhostTexts,
    localSettings: normalizeCodexLocalSettings(),
    metadata,
  });
}

export function normalizeCodexDocument(raw: Partial<CodexWorkbenchDocument>): CodexWorkbenchDocument {
  const timestamp = now();
  return {
    schemaVersion: CODEX_DOCUMENT_SCHEMA_VERSION,
    type: CODEX_DOCUMENT_TYPE,
    id: coerceString(raw.id, generateId()),
    title: coerceString(raw.title, "Untitled Codex"),
    createdAt: coerceNumber(raw.createdAt, timestamp),
    updatedAt: coerceNumber(raw.updatedAt, timestamp),
    cards: normalizeCards(raw.cards),
    ghostNotes: normalizeGhosts(raw.ghostNotes),
    packHistory: normalizePackHistory(raw.packHistory),
    pityCounter: coerceNumber(raw.pityCounter, 0),
    lastGhostBlockCount:
      typeof raw.lastGhostBlockCount === "number" ? raw.lastGhostBlockCount : undefined,
    lastGhostTimestamp:
      typeof raw.lastGhostTimestamp === "number" ? raw.lastGhostTimestamp : undefined,
    lastGhostTexts: Array.isArray(raw.lastGhostTexts) ? raw.lastGhostTexts.filter((item) => typeof item === "string") : undefined,
    localSettings: normalizeCodexLocalSettings(raw.localSettings),
    metadata: raw.metadata,
  };
}

function isLegacyProjectShape(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Project>;
  return Array.isArray(candidate.cards) && Array.isArray(candidate.ghostNotes);
}

export function parseCodexDocument(raw: string, fallbackTitle = "Untitled Codex"): CodexWorkbenchDocument {
  if (!raw.trim()) return createEmptyCodexDocument(fallbackTitle);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CodexDocumentParseError(error instanceof Error ? error.message : "Invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new CodexDocumentParseError(".codex files must contain a JSON object.");
  }

  const candidate = parsed as Partial<CodexWorkbenchDocument>;
  if (!candidate.type && isLegacyProjectShape(parsed)) {
    return createCodexDocumentFromProject(parsed, { source: "import" });
  }

  const schemaVersion = coerceNumber(candidate.schemaVersion, CODEX_DOCUMENT_SCHEMA_VERSION);
  if (schemaVersion > CODEX_DOCUMENT_SCHEMA_VERSION) {
    throw new UnsupportedCodexSchemaError(schemaVersion);
  }

  if (candidate.type && candidate.type !== CODEX_DOCUMENT_TYPE) {
    throw new CodexDocumentParseError(`Unsupported .codex type: ${candidate.type}`);
  }

  return normalizeCodexDocument(candidate);
}

export function assertNoSecretsInCodexDocument(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretsInCodexDocument(item, `${path}[${index}]`));
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (FORBIDDEN_SECRET_KEYS.has(key)) {
      throw new Error(`Refusing to serialize .codex document containing secret field ${path}.${key}`);
    }
    assertNoSecretsInCodexDocument(child, `${path}.${key}`);
  });
}

export function serializeCodexDocument(document: CodexWorkbenchDocument): string {
  const normalized = normalizeCodexDocument({
    ...document,
    updatedAt: now(),
  });
  assertNoSecretsInCodexDocument(normalized);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
