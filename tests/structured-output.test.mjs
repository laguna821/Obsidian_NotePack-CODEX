import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitOutputSchema, parseUniqueJson } from '../src/ai/structured-output.ts';
import { buildOpenAIPlanCodexRequestBody, parseOpenAIPlanCodexSse } from '../src/ai/openai-plan.ts';
import { runClaudeOnce } from '../src/ai/native/claude.ts';

const schema={type:'object',properties:{answer:{type:'integer'}},required:['answer'],additionalProperties:false};
const format={type:'json_schema',json_schema:{name:'smoke',strict:true,schema}};
const init={type:'system',subtype:'init',apiKeySource:'none',tools:[],mcp_servers:[]};
const success={type:'result',subtype:'success',is_error:false,structured_output:{answer:42}};
const partial={type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'unvalidated explanation'}}};
async function claude(events, overrides={}, result={exitCode:0,stdout:'',stderr:''}) {
 const calls=[],deltas=[];
 const runner=async opt=>{calls.push(opt);for(const e of events){if(opt.signal.aborted)break;opt.onStdoutLine(typeof e==='string'?e:JSON.stringify(e));}if(opt.signal.aborted)throw new DOMException('Request aborted','AbortError');return result;};
 const response=await runClaudeOnce(runner,{executablePath:'claude',env:{},cwd:'/tmp/test',model:'sonnet',effort:'low',systemPrompt:'S',prompt:'P',guard:{organization:false},timeoutMs:1000,jsonSchema:schema,onTextDelta:d=>deltas.push(d),...overrides});
 return {response,calls,deltas};
}
test('explicit schemas are validated while legacy JSON mode remains unchanged',()=>{
 assert.deepEqual(explicitOutputSchema(format),{name:'smoke',schema,strict:true});
 for(const broken of [{},{name:'has space',schema},{name:'x',schema:[]},{name:'x',schema,strict:false}]) assert.throws(()=>explicitOutputSchema({type:'json_schema',json_schema:broken}));
 for(const response_format of [undefined,{type:'json_object'}]) assert.equal(buildOpenAIPlanCodexRequestBody({model:'sol',messages:[],response_format}).text,undefined);
 assert.deepEqual(parseUniqueJson('{"x":{"a":1},"a":2}'),{x:{a:1},a:2});
 assert.throws(()=>parseUniqueJson('{"x":1,"\\u0078":2}'),/Duplicate/);
});
const sse=events=>events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
const complete=content=>({type:'response.completed',response:{status:'completed',output_text:content}});
test('schema mode rejects partial, incomplete, error, non-object or duplicate OpenAI output',()=>{
 assert.equal(parseOpenAIPlanCodexSse(sse([complete('{"answer":42}')]),true).content,'{"answer":42}');
 assert.equal(parseOpenAIPlanCodexSse(sse([{type:'response.output_text.delta',delta:'{"answer":42}'},{type:'response.completed',response:{status:'completed',output:[]}}]),true).content,'{"answer":42}');
 for(const events of [
  [{type:'response.output_text.delta',delta:'{"answer":42}'}],
  [{type:'response.incomplete',response:{output_text:'{"answer":42}'}}],
  [complete('{"answer":42}'),{type:'error',message:'overloaded'}],
  [complete('[42]')],[complete('{"answer":42,"answer":41}')],
  [{type:'response.incomplete',response:{output_text:'{"answer":42}'}},{type:'response.completed'}],
  [{type:'response.completed',response:{output_text:'{"answer":42}'}}],
  [{type:'response.output_text.delta',delta:'{"answer":'},{type:'response.completed',response:{status:'completed',output:[]}}],
  [complete('{"answer":42}'),{type:'response.refusal.done',refusal:'not allowed'}],
  [{type:'response.output_text.delta',delta:'{}'},{type:'error',message:''},{type:'response.completed',response:{status:'completed',output:[]}}],
  [{type:'response.output_text.delta',delta:'{}'},{type:'response.output_item.done',item:{content:[{type:'refusal',refusal:''}]}},{type:'response.completed',response:{status:'completed',output:[]}}],
  [{type:'response.output_text.delta',delta:'{}'},{type:'response.content_part.done',part:{type:'refusal',refusal:''}},{type:'response.completed',response:{status:'completed',output:[]}}],
  [{type:'response.output_text.delta',delta:'{}'},{type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'not allowed'}]}]}}],
 ]) assert.throws(()=>parseOpenAIPlanCodexSse(sse(events),true));
 assert.throws(()=>parseOpenAIPlanCodexSse('data: {"type":"response.completed","response":{"status":"completed","output_text":"{}","output_text":"{}"}}\n\n',true),/Duplicate/);
 assert.throws(()=>parseOpenAIPlanCodexSse('data: {broken}\n\n'+sse([complete('{}')]),true));
});
test('Claude schema argv and final object win over explanation without unvalidated preview',async()=>{
 const {response,calls,deltas}=await claude([init,partial,{type:'assistant',message:{content:[{type:'text',text:'explanation'}]}},{...success,result:'not the answer'}]);
 assert.equal(response.content,'{"answer":42}');assert.deepEqual(deltas,[]);
 const args=calls[0].args;assert.deepEqual(JSON.parse(args[args.indexOf('--json-schema')+1]),schema);
 for(const flag of ['--safe-mode','--strict-mcp-config','--tools=','--no-session-persistence'])assert.ok(args.includes(flag));
 assert.equal((await claude([init,success])).response.content,'{"answer":42}');
});
test('Claude schema mode never substitutes partial or plain result for structured terminal success',async()=>{
 for(const events of [
  [init,partial],[init,{type:'result',subtype:'success',result:'{"answer":42}'}],
  [init,{...success,structured_output:null}],[init,{...success,structured_output:[]}],
  [init,{...success,subtype:'error_max_turns',result:'failed'}],
  [init,'{"type":"result","subtype":"success","structured_output":{"answer":1,"answer":2}}'],
 ]) await assert.rejects(claude(events));
 await assert.rejects(claude([init,success],{},{exitCode:1,stdout:'',stderr:'failed exit'}),/failed exit/);
});
test('schema mode retains authentication guards, cancellation and timeout errors',async()=>{
 await assert.rejects(claude([{...init,apiKeySource:'API_KEY'},success]),/blocked/);
 await assert.rejects(claude([success],{guard:{organization:true}}),/session settings/);
 await assert.rejects(claude([{...init,mcp_servers:[{name:'x'}]},success],{guard:{organization:true}}),/MCP/);
 const controller=new AbortController();controller.abort();await assert.rejects(claude([init,success],{signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(runClaudeOnce(async()=>{throw new Error('timed out');},{executablePath:'claude',env:{},cwd:'/tmp',model:'sonnet',systemPrompt:'',prompt:'',guard:{organization:false},timeoutMs:1,jsonSchema:schema}),/timed out/);
});
