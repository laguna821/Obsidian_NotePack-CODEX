import type {
  AISettings,
  LegacyMigrationState,
  LegacyNotePackPluginData,
  NotePackGlobalPluginData,
} from "../types.ts";
import { createDefaultAISettings, migrateLegacyAISettings, normalizeAISettings } from "../ai/settings-registry.ts";

export const GLOBAL_PLUGIN_SCHEMA_VERSION = 3;
export const DEFAULT_WORKBENCH_FOLDER = "NotePack CODEX";

const DEFAULT_LEGACY_MIGRATION_STATE: LegacyMigrationState = {
  status: "not-started",
  migratedProjectIds: [],
  migratedPaths: [],
};

export interface GlobalDataMigrationResult {
  data: NotePackGlobalPluginData;
  legacyData?: LegacyNotePackPluginData;
  migrationsApplied: string[];
}

export function createDefaultGlobalPluginData(): NotePackGlobalPluginData {
  return {
    schemaVersion: GLOBAL_PLUGIN_SCHEMA_VERSION,
    settings: createDefaultAISettings(),
    recentWorkbenchPaths: [],
    defaultWorkbenchFolder: DEFAULT_WORKBENCH_FOLDER,
    legacyMigration: { ...DEFAULT_LEGACY_MIGRATION_STATE },
  };
}

function isLegacyPluginData(value: unknown): value is LegacyNotePackPluginData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyNotePackPluginData>;
  return Array.isArray(candidate.projects) && typeof candidate.activeProjectId === "string";
}

function normalizeLegacyMigrationState(raw: unknown): LegacyMigrationState {
  const candidate = raw as Partial<LegacyMigrationState> | undefined;
  return {
    ...DEFAULT_LEGACY_MIGRATION_STATE,
    ...candidate,
    migratedProjectIds: Array.isArray(candidate?.migratedProjectIds) ? candidate!.migratedProjectIds : [],
    migratedPaths: Array.isArray(candidate?.migratedPaths) ? candidate!.migratedPaths : [],
  };
}

function normalizeRecentPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20);
}

function normalizeGlobalSettings(raw: unknown): AISettings {
  return normalizeAISettings((raw || {}) as Partial<AISettings>);
}

function clearStaleGeminiPlanTokens(settings: AISettings): boolean {
  let cleared = false;
  for (const provider of settings.providers) {
    if (provider.type === "gemini-plan" && provider.oauth) {
      provider.oauth = undefined;
      cleared = true;
    }
  }
  return cleared;
}

export function migrateGlobalPluginData(savedData: unknown): GlobalDataMigrationResult {
  const defaults = createDefaultGlobalPluginData();
  const migrationsApplied: string[] = [];

  if (isLegacyPluginData(savedData)) {
    const settings = migrateLegacyAISettings(savedData.settings as unknown as Partial<AISettings>);
    if (clearStaleGeminiPlanTokens(settings)) {
      migrationsApplied.push("gemini-plan-tokens-cleared");
    }
    return {
      data: {
        ...defaults,
        settings,
        legacyDataBackup: savedData,
      },
      legacyData: savedData,
      migrationsApplied,
    };
  }

  if (!savedData || typeof savedData !== "object") {
    return { data: defaults, migrationsApplied };
  }

  const candidate = savedData as Partial<NotePackGlobalPluginData>;
  const previousSchema = typeof candidate.schemaVersion === "number" ? candidate.schemaVersion : 0;
  const settings = normalizeGlobalSettings(candidate.settings);

  if (previousSchema < 3) {
    if (clearStaleGeminiPlanTokens(settings)) {
      migrationsApplied.push("gemini-plan-tokens-cleared");
    }
  }

  return {
    data: {
      ...defaults,
      ...candidate,
      schemaVersion: GLOBAL_PLUGIN_SCHEMA_VERSION,
      settings,
      recentWorkbenchPaths: normalizeRecentPaths(candidate.recentWorkbenchPaths),
      defaultWorkbenchFolder:
        typeof candidate.defaultWorkbenchFolder === "string" && candidate.defaultWorkbenchFolder.trim()
          ? candidate.defaultWorkbenchFolder.trim()
          : DEFAULT_WORKBENCH_FOLDER,
      legacyMigration: normalizeLegacyMigrationState(candidate.legacyMigration),
    },
    migrationsApplied,
  };
}
