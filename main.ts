import {
  type Menu,
  Modal,
  Notice,
  Plugin,
  type TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
  setIcon,
  type WorkspaceLeaf,
} from "obsidian";
import { NotePackSettingTab } from "./src/settings";
import { setLanguage, t } from "./src/i18n";

import { CodexFileView, CODEX_FILE_VIEW_TYPE } from "./src/views/CodexFileView";
import { NotePackView, NOTEPACK_VIEW_TYPE } from "./src/views/NotePackView";
import { CardPopoutView, CARD_POPOUT_VIEW_TYPE } from "./src/views/CardPopoutView";
import { createEmptyCodexDocument, serializeCodexDocument } from "./src/data/codex-document";
import { migrateLegacyProjectsToCodexFiles } from "./src/data/legacy-migration";
import { GlobalSettingsStore } from "./src/stores/GlobalSettingsStore";

class WorkbenchChooserModal extends Modal {
  constructor(private readonly plugin: NotePackPlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("np-workbench-chooser");
    contentEl.createEl("h2", { text: "NotePack CODEX" });
    contentEl.createEl("p", { text: "Create or reopen a .codex workbench file." });

    const createButton = contentEl.createEl("button", { text: "Create new workbench" });
    createButton.addClass("mod-cta");
    createButton.addEventListener("click", async () => {
      this.close();
      await this.plugin.createNewWorkbench();
    });

    const lastPath = this.plugin.settingsStore.lastOpenedWorkbenchPath;
    if (lastPath) {
      contentEl.createEl("button", { text: `Open last: ${lastPath}` }).addEventListener("click", async () => {
        this.close();
        await this.plugin.openLastWorkbench();
      });
    }

    const recent = this.plugin.settingsStore.recentWorkbenchPaths.filter((path) => path !== lastPath);
    if (recent.length > 0) {
      contentEl.createEl("h3", { text: "Recent workbenches" });
      recent.slice(0, 8).forEach((path) => {
        contentEl.createEl("button", { text: path }).addEventListener("click", async () => {
          this.close();
          await this.plugin.openWorkbenchPath(path);
        });
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export default class NotePackPlugin extends Plugin {
  settingsStore!: GlobalSettingsStore;

  async onload(): Promise<void> {
    const savedData = await this.loadData();
    this.settingsStore = new GlobalSettingsStore(savedData);
    this.settingsStore.setSaveCallback(async (data) => {
      await this.saveData(data);
    });

    if (this.settingsStore.migrationsApplied.includes("gemini-plan-tokens-cleared")) {
      new Notice(
        "보안 업데이트: 평문 시크릿이 제거되어 Gemini Plan 연결이 해제되었습니다. 본인 GCP OAuth 클라이언트로 다시 연결하거나 Gemini API Key 모드를 사용하세요.",
        12000,
      );
      await this.settingsStore.flushSave();
    }

    setLanguage(this.settingsStore.settings.uiLanguage);

    this.registerView(CODEX_FILE_VIEW_TYPE, (leaf) => new CodexFileView(leaf, this));
    this.registerExtensions(["codex"], CODEX_FILE_VIEW_TYPE);
    this.registerView(NOTEPACK_VIEW_TYPE, (leaf) => new NotePackView(leaf, this));
    this.registerView(CARD_POPOUT_VIEW_TYPE, (leaf) => new CardPopoutView(leaf, this));

    this.addRibbonIcon("layers", "NotePack CODEX", () => {
      this.openLastWorkbenchOrChooser();
    });

    this.addCommand({
      id: "create-notepack-codex-workbench",
      name: "Create new NotePack CODEX workbench",
      callback: () => this.createNewWorkbench(),
    });

    this.addCommand({
      id: "open-last-notepack-codex-workbench",
      name: "Open last NotePack CODEX workbench",
      callback: () => this.openLastWorkbenchOrChooser(),
    });

    this.addCommand({
      id: "open-notepack-codex-home",
      name: "Open NotePack CODEX home",
      callback: () => this.openHomeView(),
    });

    this.addCommand({
      id: "migrate-notepack-codex-legacy-projects",
      name: "Migrate legacy NotePack CODEX projects to .codex files",
      callback: () => this.migrateLegacyProjects(),
    });

    this.installFolderContextMenuHook();
    this.installFileExplorerToolbarButton();

    this.addSettingTab(new NotePackSettingTab(this.app, this));
    console.log(`NotePack CODEX loaded. v${this.manifest.version}`);
  }

  async onunload(): Promise<void> {
    await this.settingsStore?.flushSave();
    console.log("NotePack CODEX unloaded.");
  }

  async openLastWorkbenchOrChooser(): Promise<void> {
    if (await this.openLastWorkbench()) return;
    new WorkbenchChooserModal(this).open();
  }

  async openLastWorkbench(): Promise<boolean> {
    const lastPath = this.settingsStore.lastOpenedWorkbenchPath;
    if (!lastPath) return false;
    return this.openWorkbenchPath(lastPath);
  }

  async openWorkbenchPath(path: string): Promise<boolean> {
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (!file) {
      new Notice(`Workbench not found: ${path}`);
      return false;
    }
    await this.openWorkbenchFile(file);
    return true;
  }

  // Folder right-click → "새 노트팩 코덱스" / "New Notepack CODEX".
  //
  // Two-layer approach + post-processing:
  //   1. Standard file-menu workspace event (works for built-in file-explorer
  //      and any plugin that emits this event).
  //   2. DOM-level fallback: capture contextmenu + MutationObserver on the
  //      body to inject our item into menus that bypass the standard event
  //      (Notebook Navigator builds its own menu without firing file-menu).
  //   3. Position post-processing: after either path adds the item, move
  //      it to sit immediately after the "새 드로잉 / New drawing" item so
  //      the visual placement is consistent across file-trees.
  //
  // Empty-area right-click inside any file-tree pane is treated as a
  // vault-root context so the item still appears (target uses default
  // workbench folder).
  private installFolderContextMenuHook(): void {
    const handledMenus = new WeakSet<Menu>();
    const ourTitle = () => t("newWorkbenchMenuItem");

    const findOurItem = (menuEl: HTMLElement): HTMLElement | null => {
      const titles = menuEl.querySelectorAll<HTMLElement>(".menu-item-title");
      const target = ourTitle();
      for (const titleNode of Array.from(titles)) {
        if (titleNode.textContent === target) {
          return titleNode.closest(".menu-item") as HTMLElement | null;
        }
      }
      return null;
    };

    const findDrawingItem = (menuEl: HTMLElement): HTMLElement | null => {
      // Match the localized "새 드로잉" / "New drawing" item across UI langs
      // and across third-party "New drawing" items if any.
      const titles = menuEl.querySelectorAll<HTMLElement>(".menu-item-title");
      for (const titleNode of Array.from(titles)) {
        const text = titleNode.textContent?.trim() ?? "";
        if (text === "새 드로잉" || text === "New drawing") {
          return titleNode.closest(".menu-item") as HTMLElement | null;
        }
      }
      return null;
    };

    const repositionAfterDrawing = (menuEl: HTMLElement) => {
      const ourItem = findOurItem(menuEl);
      if (!ourItem) return;
      const drawingItem = findDrawingItem(menuEl);
      if (!drawingItem) return; // leave as-is when no drawing anchor exists
      const parent = drawingItem.parentElement;
      if (!parent) return;
      // Already placed right after drawing — nothing to do.
      if (drawingItem.nextElementSibling === ourItem) return;
      parent.insertBefore(ourItem, drawingItem.nextElementSibling);
    };

    const addViaApi = (menu: Menu, file: TAbstractFile) => {
      if (handledMenus.has(menu)) return;
      const isFolder =
        file instanceof TFolder ||
        (file !== null && typeof file === "object" && "children" in (file as object));
      if (!isFolder) return;
      handledMenus.add(menu);
      const folderPath = (file as TFolder).path ?? "";
      menu.addItem((item) => {
        item
          .setTitle(ourTitle())
          .setIcon("layers")
          .onClick(async () => {
            await this.createNewWorkbenchAt(folderPath);
          });
      });
      // Mark the menu's DOM element so the DOM-injection MutationObserver
      // path knows the API path has already added our item — even if the
      // DOM render of the API-added item is delayed past observer fire time.
      const menuEl = (menu as unknown as { dom?: HTMLElement }).dom;
      if (menuEl instanceof HTMLElement) {
        menuEl.dataset.notepackHandled = "1";
      }
    };

    this.registerEvent(this.app.workspace.on("file-menu", addViaApi));
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.workspace.on("file-menu", addViaApi));
    });

    // -------- DOM fallback for plugins that bypass file-menu API --------

    // CSS selectors that mark a "this is inside a file-tree pane" container.
    // Empty-area right-click inside any of these → treated as vault root.
    const FILE_TREE_CONTAINER_SELECTORS = [
      ".nav-files-container", // Obsidian built-in file explorer
      ".workspace-leaf-content[data-type='file-explorer']",
      "[class*='nn-']", // Notebook Navigator (nn-list-pane-content etc.)
      "[class*='file-tree']",
    ];

    const isInsideFileTree = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      for (const sel of FILE_TREE_CONTAINER_SELECTORS) {
        if (target.closest(sel)) return true;
      }
      return false;
    };

    // Per-menu cleanup callbacks for document-level mousedown listeners that
    // we register when injecting our item. Keyed by the menu element so we can
    // tear listeners down when the menu is removed (closed via Esc, blur, etc.).
    const menuCleanups = new WeakMap<HTMLElement, () => void>();

    let pendingFolderPath: string | null = null;
    const onContextMenu = (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      const el = target?.closest("[data-path]") as HTMLElement | null;
      if (el) {
        const path = el.getAttribute("data-path") ?? "";
        const abstractFile = this.app.vault.getAbstractFileByPath(path);
        pendingFolderPath = abstractFile instanceof TFolder ? path : null;
        return;
      }
      // Empty area — only handle when we're inside a file-tree pane so we
      // don't pollute unrelated context menus elsewhere in Obsidian.
      pendingFolderPath = isInsideFileTree(target) ? "" : null;
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    this.register(() => document.removeEventListener("contextmenu", onContextMenu, true));

    const injectIntoDomMenu = (menuEl: HTMLElement, folderPath: string) => {
      // If the API path already attached our item to this menu (marker set
      // in addViaApi), skip DOM injection entirely to avoid duplicate items
      // and the resulting double-fire on click.
      if (menuEl.dataset.notepackHandled === "1") return;
      if (findOurItem(menuEl)) return;

      const item = document.createElement("div");
      item.className = "menu-item";
      item.setAttribute("tabindex", "0");

      const iconEl = document.createElement("div");
      iconEl.className = "menu-item-icon";
      setIcon(iconEl, "layers");
      item.appendChild(iconEl);

      const titleEl = document.createElement("div");
      titleEl.className = "menu-item-title";
      titleEl.textContent = ourTitle();
      item.appendChild(titleEl);

      // Obsidian's built-in Menu (used by the default file-explorer's empty-area
      // context menu) closes itself on `mousedown` via a listener on document.
      // A naive `addEventListener("click", ...)` on our DOM-injected item never
      // fires because the menu element is detached before mouseup, and even an
      // item-level `pointerdown`/`mousedown` listener can be beaten by
      // Obsidian's own document-level handler depending on registration order
      // and dispatch path.
      //
      // Strategy: register a document-level CAPTURE-phase mousedown listener
      // when we inject the item. Capture-phase listeners on `document` are the
      // earliest point we can observe the event, before it reaches any
      // descendant (including .menu). We stopImmediatePropagation so Obsidian's
      // own close handler can't fire its callback ahead of our create. A
      // single-shot `handled` guard prevents double-fire if the item-level
      // fallback also runs.
      let handled = false;
      const fire = () => {
        if (handled) return;
        handled = true;
        cleanup();
        void this.createNewWorkbenchAt(folderPath);
        menuEl.detach?.();
        if (menuEl.parentElement) menuEl.remove();
      };
      const docHandler = (evt: MouseEvent | PointerEvent) => {
        if ((evt as MouseEvent).button !== 0) return;
        const target = evt.target as Node | null;
        if (!target || !item.contains(target)) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        fire();
      };
      const cleanup = () => {
        document.removeEventListener("pointerdown", docHandler, true);
        document.removeEventListener("mousedown", docHandler, true);
        menuCleanups.delete(menuEl);
      };
      // Cover both pointerdown (fires earlier) and mousedown (some browsers /
      // some Obsidian versions only stop one of them).
      document.addEventListener("pointerdown", docHandler, true);
      document.addEventListener("mousedown", docHandler, true);
      menuCleanups.set(menuEl, cleanup);

      // Belt-and-braces: item-level listeners for the case where document
      // capture is bypassed entirely. `handled` guards idempotency.
      item.addEventListener("pointerdown", (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        fire();
      });
      item.addEventListener("mousedown", (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        fire();
      });
      item.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        fire();
      });

      // Mimic Obsidian's keyboard-nav highlight on hover so our DOM-injected
      // item visually reacts the same way as sibling items. Without this,
      // CSS :hover alone doesn't always trigger because Obsidian toggles a
      // `.selected` class for keyboard nav and styles that, not :hover.
      item.addEventListener("mouseenter", () => {
        menuEl
          .querySelectorAll<HTMLElement>(".menu-item.selected")
          .forEach((el) => el.classList.remove("selected"));
        item.classList.add("selected");
      });
      item.addEventListener("mouseleave", () => {
        item.classList.remove("selected");
      });

      // Append first; reposition step below moves it next to drawing.
      menuEl.appendChild(item);
    };

    const observer = new MutationObserver((mutations) => {
      const folderPath = pendingFolderPath;
      for (const m of mutations) {
        // Tear down per-menu listeners when the menu element is removed from
        // the body (covers Esc, blur, click-elsewhere — anything that closes
        // the menu without triggering our injected item's path).
        for (const node of Array.from(m.removedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const cleanup = menuCleanups.get(node);
          cleanup?.();
        }
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (!node.classList.contains("menu")) continue;
          // DOM-injection path: only if right-click captured a folder path.
          if (folderPath !== null) {
            injectIntoDomMenu(node, folderPath);
          }
          // Reposition our item next to "새 드로잉" regardless of which
          // path added it (file-menu API or DOM injection).
          repositionAfterDrawing(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    this.register(() => observer.disconnect());
  }

  // File-explorer header toolbar button — adds a "새 메모 작업실" icon between
  // Obsidian's "새 노트" and "새 폴더" buttons so that brand-new Obsidian users
  // can discover the feature without right-clicking. Runs on every file
  // explorer leaf currently open and re-installs on layout changes (covers
  // newly opened explorers and re-renders that wipe the toolbar).
  private installFileExplorerToolbarButton(): void {
    const TOOLBAR_FLAG = "data-notepack-toolbar-button";
    const NEW_NOTE_LABELS = new Set(["새 노트", "New note"]);
    const ourLabel = () => t("newWorkbenchMenuItem");

    const installInLeaf = (leaf: WorkspaceLeaf) => {
      const view = leaf?.view;
      if (!view || view.getViewType() !== "file-explorer") return;
      const container = view.containerEl;
      if (!container) return;
      const navButtons = container.querySelector<HTMLElement>(".nav-buttons-container");
      if (!navButtons) return;
      if (navButtons.querySelector(`[${TOOLBAR_FLAG}]`)) return;

      const button = document.createElement("div");
      button.className = "clickable-icon nav-action-button";
      button.setAttribute("aria-label", ourLabel());
      button.setAttribute(TOOLBAR_FLAG, "1");
      setIcon(button, "layers");
      button.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void this.createNewWorkbench();
      });

      // Slot the button right after "새 노트"/"New note"; fall back to index 1
      // (after the first button) if labels don't match, or append at end.
      const allButtons = Array.from(
        navButtons.querySelectorAll<HTMLElement>(".clickable-icon"),
      );
      const newNoteBtn = allButtons.find((b) => {
        const label = b.getAttribute("aria-label") ?? "";
        return NEW_NOTE_LABELS.has(label);
      }) ?? allButtons[0] ?? null;
      if (newNoteBtn?.nextSibling) {
        navButtons.insertBefore(button, newNoteBtn.nextSibling);
      } else if (newNoteBtn) {
        navButtons.appendChild(button);
      } else {
        navButtons.appendChild(button);
      }
    };

    const scanAll = () => {
      this.app.workspace.iterateAllLeaves((leaf) => installInLeaf(leaf));
    };

    this.app.workspace.onLayoutReady(() => scanAll());
    // Re-scan on workspace layout changes: covers newly opened explorers,
    // sidebar toggles, and theme/plugin reloads that rebuild the header.
    this.registerEvent(this.app.workspace.on("layout-change", () => scanAll()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => scanAll()));
  }

  async createNewWorkbench(): Promise<void> {
    const folder = this.settingsStore.defaultWorkbenchFolder || "NotePack CODEX";
    await this.createNewWorkbenchAt(folder);
  }

  async createNewWorkbenchAt(folderPath: string): Promise<void> {
    const folder = normalizePath(folderPath || this.settingsStore.defaultWorkbenchFolder || "NotePack CODEX");
    await this.ensureFolder(folder);

    const path = await this.getAvailableWorkbenchPath(folder, "Untitled Codex");
    const document = createEmptyCodexDocument("Untitled Codex", {
      source: "new",
      createdWithPluginVersion: this.manifest.version,
      updatedWithPluginVersion: this.manifest.version,
    });
    const file = await this.app.vault.create(path, serializeCodexDocument(document));
    await this.openWorkbenchFile(file);
  }

  async openWorkbenchFile(file: TFile): Promise<void> {
    const existingLeaf = this.findOpenWorkbenchLeaf(file.path);
    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      this.settingsStore.rememberWorkbenchPath(file.path);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    this.app.workspace.revealLeaf(leaf);
    this.settingsStore.rememberWorkbenchPath(file.path);
  }

  private findOpenWorkbenchLeaf(path: string): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(CODEX_FILE_VIEW_TYPE);
    return leaves.find((leaf) => {
      const view = leaf.view;
      return view instanceof CodexFileView && view.file?.path === path;
    }) ?? null;
  }

  private async openHomeView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: NOTEPACK_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    const parts = folder.split("/");
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.app.vault.createFolder(current);
      } catch (err) {
        // Race / cache miss: another concurrent call (or Obsidian's own
        // metadata cache) may have just made the folder visible. If the
        // path now resolves, treat the error as benign and continue.
        if (!this.app.vault.getAbstractFileByPath(current)) {
          throw err;
        }
      }
    }
  }

  private async getAvailableWorkbenchPath(folder: string, baseName: string): Promise<string> {
    const cleanBaseName = baseName.replace(/[\\/:*?"<>|#^[\]]/g, "").trim() || "Untitled Codex";
    let path = normalizePath(`${folder}/${cleanBaseName}.codex`);
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${cleanBaseName} (${counter}).codex`);
      counter += 1;
    }
    return path;
  }

  async migrateLegacyProjects(): Promise<void> {
    const legacyData = this.settingsStore.getLegacyData();
    if (!legacyData?.projects?.length) {
      new Notice("No legacy NotePack CODEX projects were found.");
      return;
    }

    try {
      const result = await migrateLegacyProjectsToCodexFiles(
        this.app,
        legacyData,
        this.settingsStore.defaultWorkbenchFolder,
        this.settingsStore.getData().legacyMigration,
        this.manifest.version,
      );

      const migratedProjectIds = Array.from(new Set([
        ...this.settingsStore.getData().legacyMigration.migratedProjectIds,
        ...legacyData.projects.map((project) => project.id),
      ]));
      const migratedPaths = Array.from(new Set([
        ...this.settingsStore.getData().legacyMigration.migratedPaths,
        ...result.paths,
      ]));

      this.settingsStore.updateLegacyMigration({
        status: "completed",
        lastRunAt: Date.now(),
        migratedProjectIds,
        migratedPaths,
        errorMessage: undefined,
      });

      if (result.paths[0]) await this.openWorkbenchPath(result.paths[0]);
      new Notice(`Migrated ${result.migratedCount} project(s), skipped ${result.skippedCount}.`);
    } catch (error) {
      this.settingsStore.updateLegacyMigration({
        status: "failed",
        lastRunAt: Date.now(),
        errorMessage: error instanceof Error ? error.message : "Unknown migration error",
      });
      new Notice(`Legacy migration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
