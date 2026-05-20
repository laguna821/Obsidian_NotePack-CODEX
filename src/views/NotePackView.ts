import { ItemView, type WorkspaceLeaf } from "obsidian";
import type NotePackPlugin from "../../main";

export const NOTEPACK_VIEW_TYPE = "notepack-codex-home-view";

export class NotePackView extends ItemView {
  private readonly plugin: NotePackPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NotePackPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return NOTEPACK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "NotePack CODEX";
  }

  getIcon(): string {
    return "layers";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("np-container");

    const panel = container.createDiv({ cls: "np-home" });
    panel.createEl("h2", { text: "NotePack CODEX" });
    panel.createEl("p", {
      text: "Create or open a .codex file to start a file-backed workbench.",
    });

    const actions = panel.createDiv({ cls: "np-home-actions" });
    actions.createEl("button", { text: "Create new workbench" }).addEventListener("click", () => {
      this.plugin.createNewWorkbench();
    });
    actions.createEl("button", { text: "Open last workbench" }).addEventListener("click", () => {
      this.plugin.openLastWorkbench();
    });
  }
}
