import { TextFileView, type TFile, type WorkspaceLeaf } from "obsidian";
import type NotePackPlugin from "../../main";
import {
  CodexDocumentParseError,
  parseCodexDocument,
  serializeCodexDocument,
  UnsupportedCodexSchemaError,
} from "../data/codex-document";
import { WorkbenchDocumentStore } from "../stores/WorkbenchDocumentStore";
import { NotePackShell } from "./NotePackShell";

export const CODEX_FILE_VIEW_TYPE = "notepack-codex-file-view";

export class CodexFileView extends TextFileView {
  private readonly plugin: NotePackPlugin;
  private rawData = "";
  private store: WorkbenchDocumentStore | null = null;
  private shell: NotePackShell | null = null;
  private invalid = false;
  private readOnly = false;

  constructor(leaf: WorkspaceLeaf, plugin: NotePackPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CODEX_FILE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename || this.store?.title || "NotePack CODEX";
  }

  getIcon(): string {
    return "layers";
  }

  getViewData(): string {
    if (this.invalid || this.readOnly || !this.store) return this.rawData;
    return serializeCodexDocument(this.store.getDocument());
  }

  setViewData(data: string, clear: boolean): void {
    this.rawData = data;
    if (clear) this.clear();

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    try {
      const document = parseCodexDocument(data, this.file?.basename || "Untitled Codex");
      this.invalid = false;
      this.readOnly = false;
      this.store = new WorkbenchDocumentStore(document);
      this.store.setSaveCallback(() => {
        this.requestSave();
      });

      if (this.file) this.plugin.settingsStore.rememberWorkbenchPath(this.file.path);
      this.syncTitleFromFile();

      this.shell = new NotePackShell({
        app: this.app,
        plugin: this.plugin,
        container,
        store: this.store,
        filePath: this.file?.path,
      });
      this.shell.mount();
      this.syncTitleFromFile();
    } catch (error) {
      this.store = null;
      this.shell = null;
      this.invalid = true;
      this.readOnly = error instanceof UnsupportedCodexSchemaError;
      this.renderInvalidFile(container, error);
    }
  }

  clear(): void {
    this.shell?.destroy();
    this.shell = null;
    this.store = null;
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    container?.empty();
  }

  async onRename(file: TFile): Promise<void> {
    await super.onRename(file);
    this.syncTitleFromFile(file);
  }

  private syncTitleFromFile(file: TFile | null = this.file): void {
    if (!file || !this.store) return;
    if (this.store.title !== file.basename) {
      this.store.setTitle(file.basename);
    }
    this.shell?.updateFileIdentity(file.path, file.basename);
  }

  private renderInvalidFile(container: HTMLElement, error: unknown): void {
    container.addClass("np-container");
    const panel = container.createDiv({ cls: "np-invalid-file" });
    panel.createEl("h2", { text: this.readOnly ? "Unsupported NotePack CODEX file" : "Invalid NotePack CODEX file" });

    const message =
      error instanceof UnsupportedCodexSchemaError || error instanceof CodexDocumentParseError || error instanceof Error
        ? error.message
        : "This file could not be parsed as a NotePack CODEX workbench.";
    panel.createEl("p", { text: message });
    panel.createEl("p", {
      text: "The original file content has been preserved and will not be overwritten by this view.",
    });
  }
}
