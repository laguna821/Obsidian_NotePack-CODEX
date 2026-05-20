import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CodexDocumentParseError,
  UnsupportedCodexSchemaError,
  createCodexDocumentFromProject,
  createEmptyCodexDocument,
  parseCodexDocument,
  serializeCodexDocument,
} from '../src/data/codex-document.ts';
import { migrateGlobalPluginData } from '../src/data/global-data.ts';

test('empty .codex data creates an empty workbench document', () => {
  const document = parseCodexDocument('', 'Workshop');

  assert.equal(document.schemaVersion, 2);
  assert.equal(document.type, 'notepack-codex-workbench');
  assert.equal(document.title, 'Workshop');
  assert.deepEqual(document.cards, []);
  assert.equal(document.localSettings.useGlobalDifficulty, true);
});

test('valid .codex JSON round-trips through the serializer', () => {
  const document = createEmptyCodexDocument('Round Trip');
  document.cards.push({
    id: 'card-1',
    kind: 'capture',
    status: 'ready',
    text: 'A note',
    createdAt: 1,
    updatedAt: 1,
  });

  const parsed = parseCodexDocument(serializeCodexDocument(document));

  assert.equal(parsed.title, 'Round Trip');
  assert.equal(parsed.cards.length, 1);
  assert.equal(parsed.cards[0].text, 'A note');
});

test('invalid JSON throws without producing a document', () => {
  assert.throws(() => parseCodexDocument('{bad json'), CodexDocumentParseError);
});

test('future schema versions are rejected as unsupported', () => {
  assert.throws(
    () => parseCodexDocument(JSON.stringify({ schemaVersion: 99, type: 'notepack-codex-workbench' })),
    UnsupportedCodexSchemaError,
  );
});

test('legacy project shape becomes a .codex document', () => {
  const document = createCodexDocumentFromProject({
    id: 'project-1',
    name: 'Legacy',
    cards: [
      {
        id: 'card-1',
        kind: 'capture',
        status: 'ready',
        text: 'Legacy note',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    ghostNotes: [],
    packHistory: [],
    pityCounter: 2,
  });

  assert.equal(document.title, 'Legacy');
  assert.equal(document.cards[0].text, 'Legacy note');
  assert.equal(document.pityCounter, 2);
});

test('interrupted enriching cards reopen as ready with status text', () => {
  const document = parseCodexDocument(JSON.stringify({
    schemaVersion: 2,
    type: 'notepack-codex-workbench',
    title: 'Interrupted',
    cards: [
      {
        id: 'card-1',
        kind: 'capture',
        status: 'enriching',
        text: 'Still running',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  }));

  assert.equal(document.cards[0].status, 'ready');
  assert.match(document.cards[0].statusText, /interrupted/i);
});

test('serializer rejects secret fields in .codex documents', () => {
  const document = createEmptyCodexDocument('Secret Test');
  document.metadata = { source: 'new' };
  document.cards.push({
    id: 'card-1',
    kind: 'capture',
    status: 'ready',
    text: 'safe',
    createdAt: 1,
    updatedAt: 1,
    apiKey: 'sk-test',
  });

  assert.throws(() => serializeCodexDocument(document), /secret field/i);
});

test('global migration preserves AI settings and keeps a legacy backup', () => {
  const result = migrateGlobalPluginData({
    projects: [{ id: 'p1', name: 'Legacy', cards: [], ghostNotes: [] }],
    activeProjectId: 'p1',
    settings: {
      provider: 'openai',
      apiKey: 'sk-test',
      modelId: 'gpt-4o',
      packRisk: 4,
      uiLanguage: 'en',
    },
  });

  assert.equal(result.data.schemaVersion, 2);
  assert.equal(result.data.settings.packExploration, 4);
  assert.equal(result.data.settings.globalDifficulty, 3);
  assert.equal(result.data.legacyDataBackup.projects.length, 1);
  assert.equal(result.legacyData.projects[0].id, 'p1');
});
