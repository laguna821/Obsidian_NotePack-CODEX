import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
const SCANNED_EXTENSIONS = new Set(['.ts', '.mjs', '.js', '.json', '.md', '.css', '.codex']);
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /sk-or-v1-[A-Za-z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /xox[baprs]-[0-9A-Za-z-]{20,}/g,
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...await walk(path.join(dir, entry.name)));
      continue;
    }
    if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const findings = [];
for (const file of await walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (rel === 'main.js' || rel === 'package-lock.json') continue;
  const content = await readFile(file, 'utf8');
  SECRET_PATTERNS.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) findings.push(`${rel}: ${matches.length} possible secret(s)`);
  });
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exit(1);
}

console.log('No obvious secrets found.');
