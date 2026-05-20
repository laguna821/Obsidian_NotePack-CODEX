// ── Content Types (ported from Nodepad) ────────────────────────────────────

export type ContentType =
  | "entity"
  | "claim"
  | "question"
  | "task"
  | "idea"
  | "reference"
  | "quote"
  | "definition"
  | "opinion"
  | "reflection"
  | "narrative"
  | "comparison"
  | "thesis"
  | "general";

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  entity: "Entity",
  claim: "Claim",
  question: "Question",
  task: "Task",
  idea: "Idea",
  reference: "Reference",
  quote: "Quote",
  definition: "Definition",
  opinion: "Opinion",
  reflection: "Reflection",
  narrative: "Narrative",
  comparison: "Comparison",
  thesis: "Thesis",
  general: "Note",
};

export const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  entity: "🌐",
  claim: "⚡",
  question: "❓",
  task: "☑️",
  idea: "💡",
  reference: "🔗",
  quote: "💬",
  definition: "📖",
  opinion: "🗣️",
  reflection: "✨",
  narrative: "📜",
  comparison: "⚖️",
  thesis: "🎯",
  general: "📝",
};

export const ALL_CONTENT_TYPES: ContentType[] = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];

// Pastel palette per content type. Hand-tuned so all backgrounds keep
// readable contrast with #1f2430 dark text and a fixed dark annotation chip.
export const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  entity: "#CDE8C6",
  claim: "#FFC9C0",
  question: "#FFE9A8",
  task: "#C2D9F2",
  idea: "#FFD7AB",
  reference: "#D4C5F0",
  quote: "#F7C7DC",
  definition: "#CFDDE8",
  opinion: "#E1EDB1",
  reflection: "#E0D4F1",
  narrative: "#EFE2C2",
  comparison: "#C5E8D8",
  thesis: "#FFC4B0",
  general: "#E5E5E5",
};

// ── Card Rarity ────────────────────────────────────────────────────────────

export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "기본",
  rare: "주목",
  epic: "핵심",
  legendary: "원형",
};

export const RARITY_EFFECT_TEXT: Record<Rarity, string> = {
  common: "기본 카드",
  rare: "✨ 주목 카드",
  epic: "💡 핵심 카드",
  legendary: "🌟 원형 카드",
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: "#9aa4b2",
  rare: "#4fa3ff",
  epic: "#b26bff",
  legendary: "#ffb14f",
};

// ── Card Kind ──────────────────────────────────────────────────────────────

export type CardKind = "capture" | "growth" | "synthesis" | "vault-note";

export type CardStatus = "enriching" | "ready" | "error" | "archived";

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type OutputLanguageMode = "auto-source" | "ui-language" | "fixed" | "bilingual";

export type SupportedOutputLanguage = "ko" | "en" | "ja" | "zh" | "es" | "fr";

export type AnnotationMode = "single" | "parallel" | "sequential";

export interface AnnotationAgentReference {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  modelId: string;
  customInstruction?: string;
  outputLanguageMode?: OutputLanguageMode;
  fixedOutputLanguage?: SupportedOutputLanguage;
  order: number;
}

export interface AnnotationResult {
  id: string;
  agentId?: string;
  label?: string;
  icon?: string;
  color?: string;
  modelId?: string;
  personaPresetId?: string;
  mode?: AnnotationMode;
  sequenceIndex?: number;
  status: "running" | "ready" | "error";
  contentType?: ContentType;
  category?: string;
  annotation: string;
  oneLineSummary?: string;
  confidence?: number | null;
  influencedByIds?: string[];
  isUnrelated?: boolean;
  sources?: { url: string; title: string; siteName: string }[];
  createdAt: number;
  errorMessage?: string;
}

// ── Enrichment Payload ─────────────────────────────────────────────────────

export interface EnrichmentPayload {
  contentType: ContentType;
  category: string;
  annotation: string;
  oneLineSummary: string;
  confidence: number | null;
  influencedByIds: string[];
  isUnrelated: boolean;
  mergeTarget: string | null;
  sources?: { url: string; title: string; siteName: string }[];
}

// ── Workbench Card ─────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  text: string;
  isDone: boolean;
  timestamp: number;
}

export interface WorkbenchCard {
  id: string;
  kind: CardKind;
  status: CardStatus;
  title?: string;
  text: string;
  createdAt: number;
  updatedAt: number;

  // Enrichment
  contentType?: ContentType;
  category?: string;
  annotation?: string;
  confidence?: number | null;
  influencedByIds?: string[];
  isUnrelated?: boolean;
  sources?: { url: string; title: string; siteName: string }[];
  annotations?: AnnotationResult[];
  subTasks?: SubTask[];

  // Pack origin (for growth cards)
  sourcePackId?: string;
  sourceCardId?: string;
  sourceCardIds?: string[];
  rarity?: Rarity;
  questionType?: string;
  lens?: string;
  outputType?: string;

  // Vault link
  notePath?: string;

  // Synthesis
  synthesisRole?: "emergent-thesis" | "bridge";

  // UI state
  isPinned?: boolean;
  isArchived?: boolean;
  statusText?: string;

  // Visual / lifecycle (added v3)
  color?: string;
  deletedAt?: number;
  popoutFontSize?: number;
  popoutLineHeight?: number;
}

// ── Pack Card (generated in modal) ─────────────────────────────────────────

export interface PackCard {
  id: number;
  rarity: Rarity;
  effect_text: string;
  card_name: string;
  hook: string;
  main_question: string;
  bridge_steps: string[];
  write_now: string[];
  followups: string[];
  suggested_tags: string[];
  suggested_links: string[];
  failure_signal?: string;
  obsidian_template: string;
  art_prompt_en?: string;
  // Diversity matrix
  questionType?: string;
  lens?: string;
  outputType?: string;
}

// ── Pack Session ───────────────────────────────────────────────────────────

export interface PackSession {
  packId: string;
  sourceCardId: string;
  sourceCardIds?: string[];
  createdAt: number;
  seed: string;
  contextMode: "obsidian" | "prompt" | "random";
  deck?: string;
  exploration?: number;
  risk: number;
  style: string;
  weights: { common: number; rare: number; epic: number; legendary: number };
  cards: PackCard[];
  keptIds: number[];
  discardedIds: number[];
}

// ── Ghost / Synthesis Note ─────────────────────────────────────────────────

export interface GhostNote {
  id: string;
  text: string;
  category: string;
  isGenerating: boolean;
}

// ── AI Provider Types ──────────────────────────────────────────────────────

export type LegacyAIProvider = "openrouter" | "openai" | "ollama";

export type AIProviderType =
  | "anthropic-plan"
  | "openai-plan"
  | "gemini-plan"
  | "anthropic"
  | "openai"
  | "gemini"
  | "xai"
  | "deepseek"
  | "mistral"
  | "perplexity"
  | "openrouter"
  | "ollama"
  | "lm-studio"
  | "azure-openai"
  | "openai-compatible";

export type AIProviderFamily = "openai-compatible" | "anthropic" | "gemini";

export interface AIProviderAdditionalSettingDefinition {
  label: string;
  key: string;
  placeholder?: string;
  type: "text" | "toggle";
  required: boolean;
  description?: string;
}

export interface AIProviderAdditionalSettings {
  [key: string]: string | boolean | undefined;
}

export interface AIOAuthState {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  idToken?: string;
  generatedApiKey?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  accountId?: string;
  email?: string;
  managedProjectId?: string;
}

export interface AIProviderDefinition {
  type: AIProviderType;
  label: string;
  defaultProviderId: string | null;
  defaultBaseUrl?: string;
  baseUrlPlaceholder?: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  authStrategy: "none" | "apiKey" | "oauth" | "apiKey-or-oauth";
  family: AIProviderFamily;
  keyUrl?: string;
  keyPlaceholder?: string;
  mobileSupported: boolean;
  warning?: string;
  additionalSettings: AIProviderAdditionalSettingDefinition[];
}

export interface AIProviderRecord {
  type: AIProviderType;
  id: string;
  apiKey?: string;
  baseUrl?: string;
  oauth?: AIOAuthState;
  additionalSettings?: AIProviderAdditionalSettings;
}

export interface AIThinkingConfig {
  enabled: boolean;
  budget_tokens?: number;
}

export interface AIReasoningConfig {
  enabled: boolean;
  reasoning_effort?: "low" | "medium" | "high";
}

export interface AIChatModel {
  id: string;
  providerType: AIProviderType;
  providerId: string;
  label: string;
  model: string;
  description?: string;
  supportsGrounding: boolean;
  groundingModelId?: string;
  supportsJsonSchema?: boolean;
  supportsJsonObject?: boolean;
  supportsAnnotations?: boolean;
  enable?: boolean;
  thinking?: AIThinkingConfig;
  reasoning?: AIReasoningConfig;
}

export interface AISettings {
  providers: AIProviderRecord[];
  chatModels: AIChatModel[];
  activeChatModelId: string;
  webGrounding: boolean;
  annotationMode: AnnotationMode;
  annotationLanguageMode: OutputLanguageMode;
  fixedAnnotationLanguage?: SupportedOutputLanguage;
  packLanguageMode: OutputLanguageMode;
  fixedPackLanguage?: SupportedOutputLanguage;
  annotationAgents: AnnotationAgentReference[];
  annotationMaxSentences: number;
  packExploration: number;
  packRisk?: number;
  packPityEnabled: boolean;
  promotionFolder: string;
  noteAuthor: string;
  customPackDifficultyPrompt: string;
  customSynthesisPrompt: string;
  uiLanguage: "ko" | "en";
}

export interface LegacyAISettings {
  provider?: LegacyAIProvider;
  apiKey?: string;
  modelId?: string;
  webGrounding?: boolean;
  customBaseUrl?: string;
  providerKeys?: Partial<Record<LegacyAIProvider, string>>;
  packRisk?: number;
  packPityEnabled?: boolean;
  promotionFolder?: string;
  uiLanguage?: "ko" | "en";
}

export interface AIConfig {
  provider: AIProviderRecord;
  providerDefinition: AIProviderDefinition;
  model: AIChatModel;
  modelId: string;
  providerType: AIProviderType;
  providerId: string;
  providerFamily: AIProviderFamily;
  baseUrl: string;
  authToken?: string;
  apiKey?: string;
  managedProjectId?: string;
  supportsGrounding: boolean;
  supportsJsonSchema: boolean;
  supportsJsonObject: boolean;
  supportsAnnotations: boolean;
}

// ── Project / Workspace ────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  cards: WorkbenchCard[];
  ghostNotes: GhostNote[];
  lastGhostBlockCount?: number;
  lastGhostTimestamp?: number;
  lastGhostTexts?: string[];
  packHistory?: PackSession[];
  pityCounter?: number;
}

export type CardSizePreset = "S" | "M" | "L" | "XL";

export interface CodexWorkbenchLocalSettings {
  useGlobalPackExploration: boolean;
  packExplorationOverride?: number;
  annotationMode: AnnotationMode;
  annotationLanguageMode: OutputLanguageMode;
  fixedAnnotationLanguage?: SupportedOutputLanguage;
  packLanguageMode: OutputLanguageMode;
  fixedPackLanguage?: SupportedOutputLanguage;
  annotationAgents: AnnotationAgentReference[];
  cardSize?: CardSizePreset;
  inspectorWidth?: number;
  inspectorCollapsed?: boolean;
  composerHeight?: number;
  offlineCaptureMode?: boolean;
}

export interface CodexWorkbenchMetadata {
  createdWithPluginVersion?: string;
  updatedWithPluginVersion?: string;
  source?: "new" | "legacy-migration" | "template" | "import";
  templateId?: string;
  migratedFromProjectId?: string;
  migratedAt?: number;
}

export interface CodexWorkbenchDocument {
  schemaVersion: 2 | 3;
  type: "notepack-codex-workbench";
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cards: WorkbenchCard[];
  ghostNotes: GhostNote[];
  packHistory: PackSession[];
  pityCounter: number;
  lastGhostBlockCount?: number;
  lastGhostTimestamp?: number;
  lastGhostTexts?: string[];
  localSettings: CodexWorkbenchLocalSettings;
  metadata?: CodexWorkbenchMetadata;
}

export interface LegacyMigrationState {
  status: "not-started" | "completed" | "failed";
  lastRunAt?: number;
  migratedProjectIds: string[];
  migratedPaths: string[];
  errorMessage?: string;
}

// ── View Mode ──────────────────────────────────────────────────────────────

export type ViewMode = "board" | "kanban" | "graph";

// ── Plugin Data (persisted) ────────────────────────────────────────────────

export interface LegacyNotePackPluginData {
  projects: Project[];
  activeProjectId: string;
  settings: AISettings;
}

export type NotePackPluginData = LegacyNotePackPluginData;

export interface NotePackGlobalPluginData {
  schemaVersion: 2 | 3;
  settings: AISettings;
  recentWorkbenchPaths: string[];
  lastOpenedWorkbenchPath?: string;
  defaultWorkbenchFolder: string;
  legacyMigration: LegacyMigrationState;
  legacyDataBackup?: LegacyNotePackPluginData;
}

export const DEFAULT_SETTINGS: AISettings = {
  providers: [],
  chatModels: [],
  activeChatModelId: "",
  webGrounding: false,
  annotationMode: "parallel",
  annotationLanguageMode: "auto-source",
  packLanguageMode: "auto-source",
  annotationAgents: [],
  annotationMaxSentences: 4,
  packExploration: 2,
  packRisk: 2,
  packPityEnabled: true,
  promotionFolder: "Cards",
  noteAuthor: "",
  customPackDifficultyPrompt: "",
  customSynthesisPrompt: "",
  uiLanguage: "ko",
};

export const DEFAULT_CODEX_LOCAL_SETTINGS: CodexWorkbenchLocalSettings = {
  useGlobalPackExploration: true,
  annotationMode: "parallel",
  annotationLanguageMode: "auto-source",
  packLanguageMode: "auto-source",
  annotationAgents: [],
  cardSize: "M",
  inspectorWidth: 340,
  inspectorCollapsed: false,
  composerHeight: 80,
};

export const DEFAULT_LEGACY_MIGRATION_STATE: LegacyMigrationState = {
  status: "not-started",
  migratedProjectIds: [],
  migratedPaths: [],
};

export const DEFAULT_PLUGIN_DATA: LegacyNotePackPluginData = {
  projects: [],
  activeProjectId: "",
  settings: { ...DEFAULT_SETTINGS },
};
