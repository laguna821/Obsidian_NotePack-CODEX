// Opt-in live validation through the actual card/persona/provider/runtime stack.
// Only synthetic text is sent; does not read or write any vault or credentials.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
globalThis.window ??= globalThis;
const result = await build({ stdin: { contents: `export { generatePack } from './src/ai/notepack-engine';
export { enrichCardWithAgent } from './src/ai/enrich';
export { normalizeAISettings } from './src/ai/settings-registry';
export { buildEffectiveWorkbenchSettings } from './src/data/runtime-settings';`, resolveDir: process.cwd(), loader:'ts' },
  bundle:true, write:false, platform:'node', format:'cjs', loader:{'.md':'text'}, plugins:[{
    name:'obsidian-shell', setup(b) {
      b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));
      b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`export const Platform={isDesktop:true}; export class Notice {};
export const requestUrl=()=>{throw new Error('Unexpected HTTP/API request in native Plan probe');};`}));
    }
  }] });
const mod={exports:{}};
new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {generatePack,enrichCardWithAgent,normalizeAISettings,buildEffectiveWorkbenchSettings}=mod.exports;
const model=process.argv[2]??'sonnet';
const id=`anthropic-plan/claude-${model}-latest-plan`;
const agent={id:'probe',label:'Reader',modelId:id,order:0,prompt:'Offer one concise counterpoint.'};
const settings=normalizeAISettings({activeChatModelId:id,annotationAgents:[agent],annotationMode:'single',packPreferences:{rarity:'common',questionFirst:true}});
const runtime=buildEffectiveWorkbenchSettings(settings);
const source={id:'probe-note',title:'Study space',text:'카페에서 공부하면 집에서보다 집중이 잘 되는 것 같다.',status:'ready'};
for (const kind of ['annotation','pack']) {
  const started=Date.now();
  try {
    const output=kind==='pack' ? await generatePack(runtime,[source],[],0) : await enrichCardWithAgent(runtime,agent,source.text,[]);
    const count=kind==='pack' ? output.cards.length : output.annotation.length;
    if (!count || (kind==='pack' && count!==5)) throw new Error('Empty or incomplete result');
    console.log(JSON.stringify({model,kind,status:'passed',elapsedMs:Date.now()-started,count}));
  } catch(error) { console.log(JSON.stringify({model,kind,status:'failed',elapsedMs:Date.now()-started,error:error.message}));process.exitCode=1; }
}
