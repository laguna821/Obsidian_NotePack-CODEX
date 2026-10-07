import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { nativeInstallGuide } from '../src/ai/native/onboarding.ts';
const bundle = await build({entryPoints:['src/settings.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian'],loader:{'.md':'text'}});
const mod={exports:{}}; const require=createRequire(import.meta.url);
const stub=new Proxy({Platform:{isDesktop:true},requireApiVersion:()=>true},{get:(o,k)=>o[k]??class {}});
new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,id=>id==='obsidian'?stub:require(id));

test('login controls are on the initial settings page, before model selection and subpages',()=>{
  const tab=new mod.exports.NotePackSettingTab({},{});
  const defs=tab.getSettingDefinitions();
  assert.equal(defs[0].type,'group');
  assert(defs[0].items[0].aliases.includes('login'));
  assert.equal(defs.filter(d=>d.type==='page').flatMap(d=>d.items).some(g=>g.items?.some(i=>i.aliases?.includes('login'))),false);
  tab.activeTab='persona';let opened;
  tab.renderTabs=()=>{opened=tab.activeTab;};tab.display();
  assert.equal(opened,'setup');
});

test('native onboarding uses the same official installers as CMDS on each platform',()=>{
  assert.equal(nativeInstallGuide('claude','win32').command,'irm https://claude.ai/install.ps1 | iex');
  assert.equal(nativeInstallGuide('gemini','win32').command,'irm https://antigravity.google/cli/install.ps1 | iex');
  for(const platform of ['darwin','linux']){
    assert.match(nativeInstallGuide('claude',platform).command,/^curl -fsSL https:\/\/claude.ai\/install.sh \| bash$/);
    assert.match(nativeInstallGuide('gemini',platform).command,/^curl -fsSL https:\/\/antigravity.google\/cli\/install.sh \| bash$/);
  }
});
