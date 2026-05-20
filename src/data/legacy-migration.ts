import { normalizePath, Notice, type App } from "obsidian";
import type { LegacyMigrationState, LegacyNotePackPluginData, Project } from "../types";
import { createCodexDocumentFromProject, serializeCodexDocument } from "./codex-document";

export interface LegacyMigrationResult {
  migratedCount: number;
  skippedCount: number;
  paths: string[];
}

function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 80);
  return sanitized || "Untitled Codex";
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder);
  if (!normalized) return;

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

function buildCandidatePath(folder: string, project: Project): string {
  return normalizePath(`${folder}/${sanitizeFileName(project.name || "Untitled Codex")}.codex`);
}

async function uniquePath(app: App, basePath: string): Promise<string> {
  if (!app.vault.getAbstractFileByPath(basePath)) return basePath;
  const dotIndex = basePath.toLowerCase().lastIndexOf(".codex");
  const stem = dotIndex >= 0 ? basePath.slice(0, dotIndex) : basePath;
  for (let counter = 1; counter < 1000; counter += 1) {
    const candidate = `${stem} (${counter}).codex`;
    if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
  }
  throw new Error(`Could not find an available filename for ${basePath}`);
}

export async function migrateLegacyProjectsToCodexFiles(
  app: App,
  legacyData: LegacyNotePackPluginData | undefined,
  folder: string,
  migrationState: LegacyMigrationState,
  pluginVersion?: string,
): Promise<LegacyMigrationResult> {
  if (!legacyData?.projects?.length) {
    new Notice("No legacy NotePack projects were found.");
    return { migratedCount: 0, skippedCount: 0, paths: [] };
  }

  const normalizedFolder = normalizePath(folder || "NotePack CODEX");
  await ensureFolder(app, normalizedFolder);

  const paths: string[] = [];
  let migratedCount = 0;
  let skippedCount = 0;

  for (const project of legacyData.projects) {
    const existingPath = migrationState.migratedProjectIds.includes(project.id)
      ? migrationState.migratedPaths.find((path) => path.includes(sanitizeFileName(project.name || "")))
      : undefined;
    if (existingPath && app.vault.getAbstractFileByPath(existingPath)) {
      skippedCount += 1;
      paths.push(existingPath);
      continue;
    }

    const basePath = buildCandidatePath(normalizedFolder, project);
    const path = await uniquePath(app, basePath);
    const document = createCodexDocumentFromProject(project, {
      source: "legacy-migration",
      migratedFromProjectId: project.id,
      migratedAt: Date.now(),
      createdWithPluginVersion: pluginVersion,
      updatedWithPluginVersion: pluginVersion,
    });

    await app.vault.create(path, serializeCodexDocument(document));
    migratedCount += 1;
    paths.push(path);
  }

  return { migratedCount, skippedCount, paths };
}
