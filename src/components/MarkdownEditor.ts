// ── MarkdownEditor: textarea + formatting toolbar + bubble menu ──────────
//
// Markdown-only editor control. Wraps a <textarea>, adds a top toolbar
// shown on focus, a bubble menu on selection, and keyboard shortcuts that
// insert/toggle Markdown tokens. All edits are pure-text transformations
// over the textarea value, so saved content round-trips as plain Markdown
// (the one exception: underline uses inline <u></u>, which Obsidian
// renders but is not CommonMark).

import { Component, MarkdownRenderer, type App } from "obsidian";

export interface MarkdownEditorOptions {
  placeholder?: string;
  minRows?: number;
  initialValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  // When true, Shift+Enter inserts newline and Enter submits. Default: false
  // (Enter inserts newline, Ctrl/Cmd+Enter submits).
  enterToSubmit?: boolean;
  autoResizeMaxPx?: number;
  hideBubble?: boolean;
  hideToolbar?: boolean;
  ariaLabel?: string;
  // ── Live preview pane below the textarea ────────────────────────────────
  // Requires `app` to be set; when both are provided, a small rendered
  // markdown preview attaches directly below the textarea.
  app?: App;
  livePreview?: boolean;
  // ── Drag-to-resize the editor height ────────────────────────────────────
  resizable?: boolean;
  initialHeight?: number;
  onHeightChange?: (height: number) => void;
  // Extra toolbar button: open an expanded composer modal
  onExpand?: () => void;
  // Toolbar mode: "compact" (existing) or "extended" (adds H1/H2/H3, lists, code-block, link)
  toolbarMode?: "compact" | "extended";
}

interface ToolButtonSpec {
  key: string;
  label: string;
  title: string;
  apply: (textarea: HTMLTextAreaElement) => void;
}

export class MarkdownEditor {
  readonly containerEl: HTMLElement;
  private readonly textareaEl: HTMLTextAreaElement;
  private readonly toolbarEl: HTMLElement | null;
  private readonly bubbleEl: HTMLElement | null;
  private readonly previewEl: HTMLElement | null = null;
  private readonly resizeHandleEl: HTMLElement | null = null;
  private readonly opts: MarkdownEditorOptions;
  private readonly onTextareaInput: () => void;
  private readonly onTextareaKeyDown: (e: KeyboardEvent) => void;
  private readonly onSelectionChange: () => void;
  private readonly onWindowMouseDown: (e: MouseEvent) => void;
  private previewComponent: Component | null = null;
  private previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private manualHeight: number | null = null;
  private destroyed = false;

  constructor(parentEl: HTMLElement, opts: MarkdownEditorOptions = {}) {
    this.opts = opts;
    this.containerEl = parentEl.createDiv({ cls: "np-md-editor" });
    if (opts.resizable) this.containerEl.addClass("np-md-editor--resizable");
    if (opts.livePreview && opts.app) this.containerEl.addClass("np-md-editor--with-preview");

    this.toolbarEl = opts.hideToolbar ? null : this.renderToolbar();
    this.textareaEl = this.containerEl.createEl("textarea", {
      cls: "np-md-editor-input",
      attr: {
        placeholder: opts.placeholder ?? "",
        rows: String(opts.minRows ?? 2),
      },
    });
    if (opts.ariaLabel) this.textareaEl.setAttribute("aria-label", opts.ariaLabel);
    if (opts.initialValue) this.textareaEl.value = opts.initialValue;

    if (opts.livePreview && opts.app) {
      this.previewEl = this.containerEl.createDiv({ cls: "np-md-editor-preview" });
      this.previewComponent = new Component();
      this.previewComponent.load();
    }

    if (opts.resizable) {
      this.resizeHandleEl = this.containerEl.createDiv({ cls: "np-md-editor-resize" });
      this.attachResizeHandler();
    }

    if (typeof opts.initialHeight === "number" && opts.initialHeight > 0) {
      this.manualHeight = opts.initialHeight;
      this.textareaEl.style.height = `${opts.initialHeight}px`;
    }

    this.bubbleEl = opts.hideBubble ? null : this.renderBubble();

    this.onTextareaInput = () => {
      this.autoResize();
      this.opts.onChange?.(this.textareaEl.value);
      this.updateBubble();
      this.schedulePreviewUpdate();
    };
    this.onTextareaKeyDown = (e) => this.handleKeyDown(e);
    this.onSelectionChange = () => this.updateBubble();
    this.onWindowMouseDown = (e) => {
      if (!this.bubbleEl) return;
      if (e.target === this.textareaEl) return;
      if (this.bubbleEl.contains(e.target as Node)) return;
      this.hideBubble();
    };

    this.textareaEl.addEventListener("input", this.onTextareaInput);
    this.textareaEl.addEventListener("keydown", this.onTextareaKeyDown);
    this.textareaEl.addEventListener("keyup", this.onSelectionChange);
    this.textareaEl.addEventListener("mouseup", this.onSelectionChange);
    this.textareaEl.addEventListener("blur", () => {
      // Delay so a bubble click can still resolve
      setTimeout(() => this.hideBubble(), 100);
    });
    document.addEventListener("selectionchange", this.onSelectionChange);
    window.addEventListener("mousedown", this.onWindowMouseDown);

    this.autoResize();
    this.schedulePreviewUpdate(true);
  }

  private attachResizeHandler(): void {
    const handle = this.resizeHandleEl;
    const ta = this.textareaEl;
    if (!handle) return;
    handle.addEventListener("pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      const startHeight = ta.getBoundingClientRect().height;
      handle.addClass("np-md-editor-resize--active");
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const next = Math.max(48, Math.min(480, startHeight + delta));
        ta.style.height = `${next}px`;
        this.manualHeight = next;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        handle.removeClass("np-md-editor-resize--active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (this.manualHeight != null) {
          this.opts.onHeightChange?.(this.manualHeight);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  private schedulePreviewUpdate(immediate = false): void {
    if (!this.previewEl || !this.opts.app || !this.previewComponent) return;
    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = null;
    }
    const run = () => {
      this.previewDebounceTimer = null;
      this.renderPreview();
    };
    if (immediate) run();
    else this.previewDebounceTimer = setTimeout(run, 150);
  }

  private renderPreview(): void {
    const preview = this.previewEl;
    const app = this.opts.app;
    if (!preview || !app) return;
    const text = this.textareaEl.value;
    if (!text.trim()) {
      preview.empty();
      preview.addClass("np-md-editor-preview--empty");
      return;
    }
    preview.removeClass("np-md-editor-preview--empty");
    // Reset Component so embedded children (link previews, etc.) clean up on
    // each re-render; otherwise children stack up across keystrokes.
    this.previewComponent?.unload();
    this.previewComponent = new Component();
    this.previewComponent.load();
    preview.empty();
    const sourcePath = app.workspace.getActiveFile()?.path ?? "";
    void MarkdownRenderer.render(app, text, preview, sourcePath, this.previewComponent);
  }

  getValue(): string {
    return this.textareaEl.value;
  }

  setValue(value: string): void {
    this.textareaEl.value = value;
    this.autoResize();
    this.schedulePreviewUpdate(true);
  }

  focus(): void {
    this.textareaEl.focus();
  }

  setPlaceholder(text: string): void {
    this.textareaEl.setAttribute("placeholder", text);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener("selectionchange", this.onSelectionChange);
    window.removeEventListener("mousedown", this.onWindowMouseDown);
    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = null;
    }
    this.previewComponent?.unload();
    this.previewComponent = null;
    this.containerEl.remove();
    this.bubbleEl?.remove();
  }

  // ── Toolbar / Bubble rendering ──────────────────────────────────────────

  private getToolButtons(): ToolButtonSpec[] {
    const base: ToolButtonSpec[] = [
      { key: "bold", label: "B", title: "Bold (Ctrl+B)", apply: (t) => wrapInline(t, "**", "**") },
      { key: "italic", label: "I", title: "Italic (Ctrl+I)", apply: (t) => wrapInline(t, "*", "*") },
      { key: "underline", label: "U", title: "Underline (Ctrl+U)", apply: (t) => wrapInline(t, "<u>", "</u>") },
      { key: "strike", label: "S", title: "Strikethrough (Ctrl+Shift+S)", apply: (t) => wrapInline(t, "~~", "~~") },
      { key: "bullet", label: "•", title: "Bullet list (Ctrl+Shift+8)", apply: (t) => toggleLinePrefix(t, "- ") },
      { key: "todo", label: "☐", title: "Todo (Ctrl+Shift+T)", apply: (t) => toggleLinePrefix(t, "- [ ] ") },
      { key: "quote", label: "❝", title: "Quote (Ctrl+Shift+>)", apply: (t) => toggleLinePrefix(t, "> ") },
      { key: "code", label: "<>", title: "Inline code (Ctrl+`)", apply: (t) => wrapInline(t, "`", "`") },
    ];
    if (this.opts.toolbarMode !== "extended") return base;
    const extended: ToolButtonSpec[] = [
      { key: "h1", label: "H1", title: "Heading 1", apply: (t) => toggleLinePrefix(t, "# ") },
      { key: "h2", label: "H2", title: "Heading 2", apply: (t) => toggleLinePrefix(t, "## ") },
      { key: "h3", label: "H3", title: "Heading 3", apply: (t) => toggleLinePrefix(t, "### ") },
      { key: "ol", label: "1.", title: "Numbered list", apply: (t) => toggleLinePrefix(t, "1. ") },
      { key: "codeblock", label: "```", title: "Code block", apply: (t) => wrapInline(t, "\n```\n", "\n```\n") },
      { key: "link", label: "🔗", title: "Link", apply: (t) => wrapInline(t, "[", "](url)") },
    ];
    return [...base, ...extended];
  }

  private renderToolbar(): HTMLElement {
    const toolbar = this.containerEl.createDiv({ cls: "np-md-toolbar" });
    this.getToolButtons().forEach((spec) => {
      const button = toolbar.createEl("button", {
        cls: "np-md-btn",
        text: spec.label,
        attr: { type: "button", title: spec.title, "aria-label": spec.title },
      });
      button.addEventListener("mousedown", (e) => {
        // mousedown so the textarea doesn't lose focus first
        e.preventDefault();
        spec.apply(this.textareaEl);
        this.opts.onChange?.(this.textareaEl.value);
        this.autoResize();
        this.updateBubble();
        this.schedulePreviewUpdate();
      });
    });
    if (this.opts.onExpand) {
      const expandBtn = toolbar.createEl("button", {
        cls: "np-md-btn np-md-btn--expand",
        text: "⛶",
        attr: { type: "button", title: "Expand", "aria-label": "Expand" },
      });
      expandBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.opts.onExpand?.();
      });
    }
    return toolbar;
  }

  private renderBubble(): HTMLElement {
    const bubble = document.body.createDiv({ cls: "np-md-bubble" });
    bubble.style.display = "none";
    this.getToolButtons().slice(0, 6).forEach((spec) => {
      const button = bubble.createEl("button", {
        cls: "np-md-btn np-md-btn--bubble",
        text: spec.label,
        attr: { type: "button", title: spec.title, "aria-label": spec.title },
      });
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        spec.apply(this.textareaEl);
        this.opts.onChange?.(this.textareaEl.value);
        this.autoResize();
        this.updateBubble();
      });
    });
    return bubble;
  }

  private updateBubble(): void {
    if (!this.bubbleEl) return;
    const { selectionStart, selectionEnd } = this.textareaEl;
    if (selectionStart === selectionEnd) {
      this.hideBubble();
      return;
    }
    const rect = this.textareaEl.getBoundingClientRect();
    const cursorOffset = selectionStart;
    // Approximate caret coordinates: place the bubble centered above the textarea.
    // (Exact caret positioning in textarea requires a hidden mirror element; we
    // keep this simple — toolbar-only is the canonical UI, bubble is a hint.)
    const px = Math.round(rect.left + rect.width / 2 - 80);
    const py = Math.round(rect.top - 36 + window.scrollY);
    this.bubbleEl.style.left = `${Math.max(8, px)}px`;
    this.bubbleEl.style.top = `${Math.max(8, py)}px`;
    this.bubbleEl.style.display = "flex";
    void cursorOffset; // referenced for clarity; positioning is best-effort
  }

  private hideBubble(): void {
    if (this.bubbleEl) this.bubbleEl.style.display = "none";
  }

  // ── Keyboard shortcuts + Enter handling ─────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    const ta = this.textareaEl;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.shiftKey && !e.altKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        wrapInline(ta, "**", "**");
        this.opts.onChange?.(ta.value);
        return;
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        wrapInline(ta, "*", "*");
        this.opts.onChange?.(ta.value);
        return;
      }
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        wrapInline(ta, "<u>", "</u>");
        this.opts.onChange?.(ta.value);
        return;
      }
      if (e.key === "`") {
        e.preventDefault();
        wrapInline(ta, "`", "`");
        this.opts.onChange?.(ta.value);
        return;
      }
    }

    if (mod && e.shiftKey && !e.altKey) {
      if (e.key === "S" || e.key === "s") {
        e.preventDefault();
        wrapInline(ta, "~~", "~~");
        this.opts.onChange?.(ta.value);
        return;
      }
      if (e.key === "8" || e.code === "Digit8") {
        e.preventDefault();
        toggleLinePrefix(ta, "- ");
        this.opts.onChange?.(ta.value);
        return;
      }
      if (e.key === "T" || e.key === "t") {
        e.preventDefault();
        toggleLinePrefix(ta, "- [ ] ");
        this.opts.onChange?.(ta.value);
        return;
      }
      if (e.key === ">" || e.key === "." || e.code === "Period") {
        // Different keyboards: Ctrl+Shift+. yields '>' on US layouts.
        e.preventDefault();
        toggleLinePrefix(ta, "> ");
        this.opts.onChange?.(ta.value);
        return;
      }
    }

    if (e.key === "Enter") {
      const enterSubmits = Boolean(this.opts.enterToSubmit) && !e.shiftKey;
      const ctrlEnterSubmits = !this.opts.enterToSubmit && mod;
      if (enterSubmits || ctrlEnterSubmits) {
        e.preventDefault();
        const value = ta.value.trim();
        if (!value) return;
        this.opts.onSubmit?.(ta.value);
        return;
      }
      if (!e.shiftKey) {
        const continued = continueListMarker(ta);
        if (continued) {
          e.preventDefault();
          this.opts.onChange?.(ta.value);
          this.autoResize();
          return;
        }
      }
    }
  }

  private autoResize(): void {
    // When the user has manually resized the editor, honor that height as a
    // floor: the textarea can still grow with content but never shrinks below
    // the user's chosen height.
    if (this.manualHeight != null) {
      const max = Math.max(this.manualHeight, this.opts.autoResizeMaxPx ?? 480);
      this.textareaEl.style.height = "auto";
      const next = Math.max(this.manualHeight, Math.min(this.textareaEl.scrollHeight, max));
      this.textareaEl.style.height = `${next}px`;
      return;
    }
    const max = this.opts.autoResizeMaxPx ?? 240;
    this.textareaEl.style.height = "auto";
    this.textareaEl.style.height = `${Math.min(this.textareaEl.scrollHeight, max)}px`;
  }
}

// ── Pure-text Markdown transformations ────────────────────────────────────

export function wrapInline(textarea: HTMLTextAreaElement, prefix: string, suffix: string): void {
  const value = textarea.value;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  // Toggle: if selection is already wrapped, unwrap.
  if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length >= prefix.length + suffix.length
  ) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length);
    textarea.value = before + inner + after;
    textarea.selectionStart = start;
    textarea.selectionEnd = start + inner.length;
    return;
  }

  // Toggle: if surrounding chars match prefix/suffix, unwrap externally.
  if (
    value.slice(start - prefix.length, start) === prefix &&
    value.slice(end, end + suffix.length) === suffix
  ) {
    const newBefore = value.slice(0, start - prefix.length);
    const newAfter = value.slice(end + suffix.length);
    textarea.value = newBefore + selected + newAfter;
    textarea.selectionStart = newBefore.length;
    textarea.selectionEnd = newBefore.length + selected.length;
    return;
  }

  textarea.value = before + prefix + selected + suffix + after;
  if (selected.length === 0) {
    const cursor = before.length + prefix.length;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;
  } else {
    textarea.selectionStart = before.length + prefix.length;
    textarea.selectionEnd = before.length + prefix.length + selected.length;
  }
}

export function toggleLinePrefix(textarea: HTMLTextAreaElement, prefix: string): void {
  const value = textarea.value;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = value.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;

  const region = value.slice(lineStart, lineEnd);
  const lines = region.split("\n");
  const allHave = lines.every((line) => line.startsWith(prefix));
  const transformed = lines
    .map((line) => (allHave ? line.slice(prefix.length) : prefix + line))
    .join("\n");

  textarea.value = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
  const delta = transformed.length - region.length;
  textarea.selectionStart = start + (allHave ? -prefix.length : prefix.length);
  textarea.selectionEnd = end + delta;
}

const CONTINUABLE_PREFIXES = ["- [ ] ", "- [x] ", "- ", "* ", "> "];
const ORDERED_RE = /^(\d+)\.\s+/;

export function continueListMarker(textarea: HTMLTextAreaElement): boolean {
  const value = textarea.value;
  const start = textarea.selectionStart ?? 0;
  if (start !== textarea.selectionEnd) return false;

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const currentLine = value.slice(lineStart, start);

  for (const prefix of CONTINUABLE_PREFIXES) {
    if (currentLine.startsWith(prefix)) {
      const restOfLine = currentLine.slice(prefix.length);
      if (restOfLine.length === 0) {
        // Empty marker line — strip the marker and don't add a new one.
        textarea.value = value.slice(0, lineStart) + value.slice(start);
        textarea.selectionStart = lineStart;
        textarea.selectionEnd = lineStart;
        return true;
      }
      // Insert newline + same marker (todo carries [ ] regardless of [x]).
      const carryPrefix = prefix === "- [x] " ? "- [ ] " : prefix;
      const insert = "\n" + carryPrefix;
      textarea.value = value.slice(0, start) + insert + value.slice(start);
      const cursor = start + insert.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
      return true;
    }
  }

  const ordered = currentLine.match(ORDERED_RE);
  if (ordered) {
    const restOfLine = currentLine.slice(ordered[0].length);
    if (restOfLine.length === 0) {
      textarea.value = value.slice(0, lineStart) + value.slice(start);
      textarea.selectionStart = lineStart;
      textarea.selectionEnd = lineStart;
      return true;
    }
    const next = Number(ordered[1]) + 1;
    const insert = `\n${next}. `;
    textarea.value = value.slice(0, start) + insert + value.slice(start);
    const cursor = start + insert.length;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;
    return true;
  }

  return false;
}
