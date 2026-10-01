// Fails when manifest.json, package.json, and package-lock.json disagree on the
// version, or when a release tag (argument or GITHUB_REF_NAME) does not match.
import { access, readFile } from 'node:fs/promises';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const manifest = await readJson('manifest.json');
const pkg = await readJson('package.json');
const lock = await readJson('package-lock.json');

const versions = {
  'manifest.json': manifest.version,
  'package.json': pkg.version,
  'package-lock.json': lock.version,
  'package-lock.json packages[""]': lock.packages?.['']?.version,
};

const tag = process.argv[2] ?? (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
if (tag) versions['release tag'] = tag;

const expected = manifest.version;
const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
if (mismatches.length > 0) {
  console.error(`Version mismatch (manifest.json is ${expected}):`);
  for (const [source, version] of mismatches) console.error(`  ${source}: ${version}`);
  process.exit(1);
}

const notes = `RELEASE_NOTES_${expected}.md`;
try {
  await access(notes);
} catch {
  console.error(`Missing ${notes}.`);
  process.exit(1);
}

console.log(`Version ${expected} is consistent${tag ? ' with the release tag' : ''}.`);
