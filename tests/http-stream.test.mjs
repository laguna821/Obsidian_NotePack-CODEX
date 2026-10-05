import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const built=await build({entryPoints:['src/ai/native/http-stream.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
function fakeRequest({chunks=[],status=200,controller,interrupt=false}){
 const req=new EventEmitter(),res=new EventEmitter();res.statusCode=status;
 req.setTimeout=()=>{};req.destroy=error=>{req.emit('error',error);req.emit('close')};
 const https={request:(_url,_options,onResponse)=>{req.end=()=>queueMicrotask(()=>{onResponse(res);for(const chunk of chunks){res.emit('data',chunk);if(controller){controller.abort();return;}}if(interrupt)res.emit('aborted');else res.emit('end');req.emit('close')});return req;}};
 const module={exports:{}};new Function('module','exports','require',built.outputFiles[0].text)(module,module.exports,id=>id==='https'?https:require(id));return module.exports.requestPublicTextStream;
}
test('desktop stream decodes split UTF8 and emits public deltas without private reasoning',async()=>{
 const wire='data:'+JSON.stringify({type:'response.reasoning_text.delta',delta:'private'})+'\r\n\r\ndata: '+JSON.stringify({type:'response.output_text.delta',delta:'카페 공부'})+'\n\n';
 const raw=Buffer.from(wire),chunks=Array.from(raw,b=>Buffer.from([b])),deltas=[];
 const result=await fakeRequest({chunks})({url:'https://fake',headers:{},body:'{}',onTextDelta:d=>deltas.push(d)});
 assert.equal(result.text,wire);assert.deepEqual(deltas,['카페 공부']);
});
test('error responses never expose partial answer text as a successful stream',async()=>{
 const deltas=[];const result=await fakeRequest({status:401,chunks:[Buffer.from('data: {"type":"response.output_text.delta","delta":"bad"}\n')]})({url:'https://fake',headers:{},body:'{}',onTextDelta:d=>deltas.push(d)});
 assert.equal(result.status,401);assert.deepEqual(deltas,[]);
});
test('abort and interrupted streams reject rather than returning a partial success',async()=>{
 const controller=new AbortController();await assert.rejects(fakeRequest({controller,chunks:[Buffer.from('data: {}\n')]})({url:'https://fake',headers:{},body:'{}',signal:controller.signal,onTextDelta:()=>{}}),{name:'AbortError'});
 await assert.rejects(fakeRequest({interrupt:true})({url:'https://fake',headers:{},body:'{}',onTextDelta:()=>{}}),/interrupted/);
});
