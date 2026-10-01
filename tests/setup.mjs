// The plugin calls window.setTimeout and friends, as Obsidian recommends for
// popout windows. Node has no window, so the tests alias it to the global.
globalThis.window ??= globalThis;
