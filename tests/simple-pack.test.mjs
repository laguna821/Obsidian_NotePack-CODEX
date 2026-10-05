import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { normalizeAISettings } from '../src/ai/settings-registry.ts';
import { normalizePackPreferences, preferenceShares, applyPackPreset } from '../src/ai/pack-preferences.ts';
import { createEmptyCodexDocument, serializeCodexDocument, parseCodexDocument } from '../src/data/codex-document.ts';
import { WorkbenchDocumentStore } from '../src/stores/WorkbenchDocumentStore.ts';

const bundle = await build({ entryPoints:['src/ai/notepack-engine.ts'], bundle:true, write:false, platform:'node', format:'cjs', loader:{'.md':'text'}, plugins:[{name:'no-network', setup(b){
  b.onResolve({filter:/^\.\/providers$/},()=>({path:'providers',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const buildAIConfig=()=>({modelId:"test"}); export const chatCompletion=(config,options)=>globalThis.__simplePackReply(options);'}));
}}] });
const mod={exports:{}}; new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {generatePack,parsePackResponse,buildObsidianTemplate}=mod.exports;
const raw=()=>Array.from({length:5},(_,i)=>({id:i+1,card_name:'카드 '+(i+1),main_question:'질문 '+(i+1)+'?',bridge_steps:[],write_now:['시작해보기'],followups:[],suggested_tags:['#생각'],suggested_links:['[[NEW: 생각]]']}));
const runtime=()=>({ai:normalizeAISettings({packPreferences:normalizePackPreferences({rarity:'legendary',difficulty:5,domain:'philosophy'})}),packExploration:2,packLanguageMode:'auto-source',customPackDifficultyPrompt:''});
const source=[{id:'s1',title:'카페 공부',text:'카페에서 공부하는 걸 좋아한다.',status:'ready'}];

test('saved custom prompts and compatible old settings survive idempotent migration',()=>{
  const legacy={customPackDifficultyPrompt:'나의 지시',cardBuilder:{difficulty:5,domain:'politics',axisMix:{inference:10,evaluation:0},rarityMode:'epic'},cardTheoryStates:{untouched:true}};
  const next=normalizeAISettings(legacy);
  assert.equal(next.packPreferences.promptMode,'custom'); assert.equal(next.packPreferences.difficulty,5);
  assert.equal(next.packPreferences.rarity,'epic'); assert.equal(next.packPreferences.domain,'politics');
  assert.deepEqual(next.cardTheoryStates,legacy.cardTheoryStates); assert.deepEqual(next.cardBuilder,legacy.cardBuilder);
  assert.deepEqual(normalizeAISettings(next),next);
  assert.equal(normalizeAISettings({...legacy,cardBuilderMode:'guided'}).packPreferences.promptMode,'guided');
});
test('weights remain finite and presets preserve selected domain and rarity',()=>{
  const p=normalizePackPreferences({weights:{recall:NaN,creation:Infinity,inference:-5},difficulty:Infinity});
  assert(Object.values(preferenceShares(p)).every(Number.isFinite));
  assert(Math.abs(Object.values(preferenceShares(p)).reduce((a,b)=>a+b,0)-1)<1e-10);
  const preset=applyPackPreset({...p,domain:'science',rarity:'rare'},'creative');
  assert.equal(preset.domain,'science'); assert.equal(preset.rarity,'rare'); assert(preset.weights.creation>preset.weights.evaluation);
});
test('one whole-pack request; settings steer the prompt without per-card task contracts',async()=>{
  const calls=[]; globalThis.__simplePackReply=async o=>{calls.push(o);return {content:JSON.stringify({cards:raw().reverse()})};};
  const session=await generatePack(runtime(),source,[],0);
  assert.equal(calls.length,1); assert.equal(session.cards.length,5);
  assert(session.cards.every(c=>c.rarity==='legendary'));
  assert.deepEqual(session.cards.map(c=>c.id),[1,2,3,4,5]);
  assert.match(calls[0].messages[0].content,/철학/);
  assert.match(calls[0].messages[1].content,/LEGENDARY Engine/);
  assert.equal(calls[0].messages[1].content.split(source[0].text).length-1,1);
  assert(!calls[0].messages[0].content.includes('plannedDemands'));
  assert.equal(session.generationSettings.difficulty,5);
});
test('missing cards, duplicate IDs, empty questions and malformed guides fail without a model repair',async()=>{
  for(const mutate of [c=>c.pop(),c=>c[1].id=1,c=>c[2].main_question=' ',c=>c[3].write_now='bad']){
    const cards=raw(); mutate(cards); let calls=0;
    globalThis.__simplePackReply=async()=>{calls++;return {content:JSON.stringify({cards})};};
    await assert.rejects(generatePack(runtime(),source,[],0)); assert.equal(calls,1);
  }
});
test('abort before or after a provider reply never returns a pack',async()=>{
  let calls=0; const before=new AbortController();before.abort();
  globalThis.__simplePackReply=async()=>{calls++;return {content:JSON.stringify({cards:raw()})};};
  await assert.rejects(generatePack(runtime(),source,[],0,before.signal)); assert.equal(calls,0);
  const after=new AbortController();globalThis.__simplePackReply=async()=>{after.abort();return {content:JSON.stringify({cards:raw()})};};
  await assert.rejects(generatePack(runtime(),source,[],0,after.signal));
});
test('kept card guidance survives document serialization and edited question export',()=>{
  const card=parsePackResponse(JSON.stringify({cards:raw()}),Array(5).fill('common'),'seed')[0];
  const store=new WorkbenchDocumentStore(createEmptyCodexDocument('Keep'));
  const kept=store.addCard(card.main_question,'growth',{packCard:card,status:'ready'});
  store.updateCard(kept.id,{text:'수정한 질문?'});
  const doc=parseCodexDocument(serializeCodexDocument(store.document));
  assert.deepEqual(doc.cards[0].packCard.write_now,['시작해보기']);
  const template=buildObsidianTemplate({...doc.cards[0].packCard,main_question:doc.cards[0].text},'common','seed');
  assert.match(template,/수정한 질문/); assert.match(template,/시작해보기/); assert.match(template,/"#생각"/);
});
