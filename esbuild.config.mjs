import esbuild from "esbuild";
import process from "process";
import { readFile } from "node:fs/promises";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  loader: { ".md": "text" },
  plugins: [{
    name: "normalize-prompt-newlines",
    setup(build) {
      build.onLoad({ filter: /\.md$/ }, async ({ path }) => ({
        contents: (await readFile(path, "utf8")).replace(/\r\n?/g, "\n"),
        loader: "text",
      }));
    },
  }],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
