import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyCodexDocument } from '../src/data/codex-document.ts';
import { WorkbenchDocumentStore } from '../src/stores/WorkbenchDocumentStore.ts';

test('document store can add, edit, select, and delete cards', () => {
  const store = new WorkbenchDocumentStore(createEmptyCodexDocument('Store'));

  const card = store.addCard('First card', 'capture', { status: 'ready' });
  assert.equal(store.cards.length, 1);
  assert.equal(store.cards[0].text, 'First card');

  store.updateCard(card.id, { text: 'Edited card' });
  assert.equal(store.getCard(card.id).text, 'Edited card');

  store.selectCard(card.id);
  assert.equal(store.selectedCard.id, card.id);

  store.deleteCard(card.id);
  assert.equal(store.cards.length, 0);
  assert.equal(store.selectedCard, undefined);
});

test('document store persists ghost notes, pack sessions, pity, and local settings', () => {
  const store = new WorkbenchDocumentStore(createEmptyCodexDocument('Store'));

  store.addGhostNote({ id: 'ghost-1', text: 'Bridge', category: 'theme', isGenerating: false });
  store.updateGhostNote('ghost-1', { text: 'Updated bridge' });
  assert.equal(store.ghostNotes[0].text, 'Updated bridge');

  store.addPackSession({
    packId: 'pack-1',
    sourceCardId: 'card-1',
    createdAt: 1,
    seed: 'S-TEST',
    contextMode: 'obsidian',
    exploration: 4,
    risk: 4,
    style: 'explore',
    weights: { common: 0.8, rare: 0.1, epic: 0.08, legendary: 0.02 },
    cards: [],
    keptIds: [],
    discardedIds: [],
  });
  assert.equal(store.getDocument().packHistory[0].exploration, 4);

  store.incrementPity();
  assert.equal(store.pityCounter, 1);
  store.resetPity();
  assert.equal(store.pityCounter, 0);

  store.updateLocalSettings({ useGlobalDifficulty: false, difficultyOverride: 5 });
  assert.equal(store.localSettings.useGlobalDifficulty, false);
  assert.equal(store.localSettings.difficultyOverride, 5);
});

test('document store can sync the document title from the file basename', () => {
  const store = new WorkbenchDocumentStore(createEmptyCodexDocument('Untitled Codex'));

  store.setTitle('Renamed Bench');

  assert.equal(store.title, 'Renamed Bench');
  assert.equal(store.getDocument().title, 'Renamed Bench');
});

test('document store persists annotation mode, agents, and multiple annotation results', () => {
  const store = new WorkbenchDocumentStore(createEmptyCodexDocument('Annotations'));

  store.updateLocalSettings({
    annotationMode: 'sequential',
    annotationLanguageMode: 'fixed',
    fixedAnnotationLanguage: 'en',
    packLanguageMode: 'bilingual',
    annotationAgents: [
      {
        id: 'agent-1',
        label: 'Friendly tutor',
        modelId: 'openai/gpt-5-mini',
        personaPresetId: 'friendly-tutor',
        enabled: true,
        order: 1,
      },
      {
        id: 'agent-2',
        label: 'Skeptical reader',
        modelId: 'gemini/gemini-2.5-pro',
        personaPresetId: 'skeptical-reader',
        enabled: true,
        order: 2,
      },
    ],
  });

  const card = store.addCard('A claim', 'capture', {
    status: 'ready',
    annotations: [
      {
        id: 'anno-1',
        agentId: 'agent-1',
        label: 'Friendly tutor',
        modelId: 'openai/gpt-5-mini',
        personaPresetId: 'friendly-tutor',
        mode: 'sequential',
        sequenceIndex: 0,
        status: 'ready',
        annotation: 'Define the key term first.',
        createdAt: 1,
      },
      {
        id: 'anno-2',
        agentId: 'agent-2',
        label: 'Skeptical reader',
        modelId: 'gemini/gemini-2.5-pro',
        personaPresetId: 'skeptical-reader',
        mode: 'sequential',
        sequenceIndex: 1,
        status: 'ready',
        annotation: 'A counterexample would make this sharper.',
        createdAt: 2,
      },
    ],
  });

  assert.equal(store.localSettings.annotationMode, 'sequential');
  assert.equal(store.localSettings.annotationAgents.length, 2);
  assert.equal(store.getCard(card.id).annotations.length, 2);
  assert.equal(store.getCard(card.id).annotations[1].label, 'Skeptical reader');
});
