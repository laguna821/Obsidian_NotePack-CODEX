import type {
  AISettings,
  LegacyMigrationState,
  LegacyNotePackPluginData,
  NotePackGlobalPluginData,
} from "../types.ts";
import { createDefaultAISettings, migrateLegacyAISettings, normalizeAISettings } from "../ai/settings-registry.ts";

export const GLOBAL_PLUGIN_SCHEMA_VERSION = 4;
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
    migratedProjectIds: Array.isArray(candidate?.migratedProjectIds) ? candidate.migratedProjectIds : [],
    migratedPaths: Array.isArray(candidate?.migratedPaths) ? candidate.migratedPaths : [],
  };
}

function normalizeRecentPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20);
}

function normalizeGlobalSettings(raw: unknown): AISettings {
  return normalizeAISettings(raw || {});
}

const NATIVE_RUNTIME_PROVIDER_TYPES = new Set(["anthropic-plan", "gemini-plan"]);
const REMOVED_PROVIDER_SETTINGS = ["geminiByoClientId", "geminiByoClientSecret"];

/**
 * Claude Plan and Gemini Plan run official CLIs since 4.0, so tokens stored by
 * earlier versions are deleted. Runs on every load, not only on a schema bump:
 * a synced 3.x client can write them (and schemaVersion 3) back.
 */
function removeNativeRuntimeCredentials(settings: AISettings | undefined): boolean {
  if (!settings || !Array.isArray(settings.providers)) return false;
  let removed = false;
  for (const provider of settings.providers) {
    if (!NATIVE_RUNTIME_PROVIDER_TYPES.has(provider.type)) continue;
    if (provider.oauth) {
      provider.oauth = undefined;
      removed = true;
    }
    if (provider.additionalSettings) {
      for (const key of REMOVED_PROVIDER_SETTINGS) {
        if (key in provider.additionalSettings) {
          delete provider.additionalSettings[key];
          removed = true;
        }
      }
    }
  }
  return removed;
}

export function migrateGlobalPluginData(savedData: unknown): GlobalDataMigrationResult {
  const defaults = createDefaultGlobalPluginData();
  const migrationsApplied: string[] = [];

  if (isLegacyPluginData(savedData)) {
    const settings = migrateLegacyAISettings(savedData.settings);
    const removedFromBackup = removeNativeRuntimeCredentials(savedData.settings);
    if (removeNativeRuntimeCredentials(settings) || removedFromBackup) {
      migrationsApplied.push("plan-oauth-tokens-removed");
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
  const settings = normalizeGlobalSettings(candidate.settings);
  const removedFromBackup = removeNativeRuntimeCredentials(candidate.legacyDataBackup?.settings);
  if (removeNativeRuntimeCredentials(settings) || removedFromBackup) {
    migrationsApplied.push("plan-oauth-tokens-removed");
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
