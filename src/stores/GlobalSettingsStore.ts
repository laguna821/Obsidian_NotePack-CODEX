import type { AISettings, LegacyMigrationState, LegacyNotePackPluginData, NotePackGlobalPluginData } from "../types";
import { migrateGlobalPluginData } from "../data/global-data";
import { normalizeAISettings } from "../ai/settings-registry";

type Listener = () => void;

export class GlobalSettingsStore {
  private data: NotePackGlobalPluginData;
  private readonly legacyData?: LegacyNotePackPluginData;
  readonly migrationsApplied: string[];
  private saveCallback: ((data: NotePackGlobalPluginData) => Promise<void>) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<Listener> = new Set();

  constructor(savedData: unknown) {
    const migrated = migrateGlobalPluginData(savedData);
    this.data = migrated.data;
    this.legacyData = migrated.legacyData;
    this.migrationsApplied = migrated.migrationsApplied;
  }

  setSaveCallback(cb: (data: NotePackGlobalPluginData) => Promise<void>): void {
    this.saveCallback = cb;
  }

  onChange(listener: Listener): void {
    this.listeners.add(listener);
  }

  offChange(listener: Listener): void {
    this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveCallback?.(this.data);
    }, 300);
  }

  async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveCallback?.(this.data);
  }

  getData(): NotePackGlobalPluginData {
    return this.data;
  }

  getLegacyData(): LegacyNotePackPluginData | undefined {
    return this.legacyData ?? this.data.legacyDataBackup;
  }

  get settings(): AISettings {
    return this.data.settings;
  }

  updateSettings(settings: AISettings): void {
    this.data.settings = normalizeAISettings(settings);
    this.emit();
    this.scheduleSave();
  }

  get defaultWorkbenchFolder(): string {
    return this.data.defaultWorkbenchFolder;
  }

  setDefaultWorkbenchFolder(folder: string): void {
    this.data.defaultWorkbenchFolder = folder.trim() || "NotePack CODEX";
    this.emit();
    this.scheduleSave();
  }

  get recentWorkbenchPaths(): string[] {
    return this.data.recentWorkbenchPaths;
  }

  get lastOpenedWorkbenchPath(): string | undefined {
    return this.data.lastOpenedWorkbenchPath;
  }

  rememberWorkbenchPath(path: string): void {
    const normalized = path.trim();
    if (!normalized) return;
    this.data.recentWorkbenchPaths = [
      normalized,
      ...this.data.recentWorkbenchPaths.filter((item) => item !== normalized),
    ].slice(0, 20);
    this.data.lastOpenedWorkbenchPath = normalized;
    this.scheduleSave();
  }

  updateLegacyMigration(patch: Partial<LegacyMigrationState>): void {
    this.data.legacyMigration = {
      ...this.data.legacyMigration,
      ...patch,
      migratedProjectIds: patch.migratedProjectIds ?? this.data.legacyMigration.migratedProjectIds,
      migratedPaths: patch.migratedPaths ?? this.data.legacyMigration.migratedPaths,
    };
    this.emit();
    this.scheduleSave();
  }
}
