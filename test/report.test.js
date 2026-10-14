const {test}=require('node:test');const assert=require('node:assert/strict');const {combine}=require('../api/report');
test('aggregate modes, override call durations without double counting, and preserve unknown durations',()=>{
const rows=combine([{agentId:'a',agentName:'Agent',mode:'Manual',talk:10,wrapup:4,pause:8,idle:9},{agentId:'a',agentName:'Agent',mode:'Inbound',talk:20,wrapup:6,pause:2,idle:11}],[{agentId:'a',talk:60,wrapup:15}],[{agentId:'b',agentName:'Other',state:'READY'}]);
const a=rows.find(r=>r.agentId==='a'),b=rows.find(r=>r.agentId==='b');assert.equal(a.talk,60);assert.equal(a.wrapup,15);assert.equal(a.pause,10);assert.equal(a.idle,20);assert.equal(a.modes.length,2);assert.equal(a.whatsapp,null);assert.equal(a.ring,null);assert.equal(b.pause,null);assert.equal(b.talk,null);
});
test('empty report does not manufacture agents or zero totals',()=>assert.deepEqual(combine([],[],[]),[]));
const {applyBreaks,breakSeconds}=require('../api/report');
const now=Date.parse('2026-09-30T06:00:00Z');
test('live breaks replace summary pause, include ongoing time, exclude system states, and add break-only agents',()=>{
 const rows=combine([{agentId:'a',agentName:'Agent',pause:9999}],[],[{agentId:'b',agentName:'Other'}]);
 applyBreaks(rows,{agents:[{agentId:'a',breaks:[
  {reason:'Lunch',start:'2026-09-30T05:00:00Z',end:'2026-09-30T05:10:00Z'},
  {reason:'Meeting',start:'2026-09-30T05:55:00Z',end:null},
  {reason:'SIP disconnected',duration:'01:00:00'},
  {reason:'changeMode',duration:'00:05:00'}
 ]},{agentId:'c',agentName:'New',breaks:[{reason:'Tea',duration:'00:02:00'}]}]},'2026-09-30',now);
 const a=rows.find(r=>r.agentId==='a');assert.equal(a.pause,900);assert.equal(a.breakEntries.length,4);assert.equal(a.breakEntries.filter(b=>b.excluded).length,2);assert.equal(a.breakEntries[1].ongoing,true);
 assert.equal(rows.find(r=>r.agentId==='b').pause,0);assert.equal(rows.find(r=>r.agentId==='c').pause,120);
});
test('historical open breaks never grow into the next day; saved durations take precedence',()=>{
 assert.equal(breakSeconds({start:'2026-09-29T05:00:00Z'},'2026-09-29',now),null);
 assert.equal(breakSeconds({duration:'00:07:30',start:'2026-09-29T05:00:00Z'},'2026-09-29',now),450);
 assert.equal(breakSeconds({start:'10:00:00',end:'10:15:00'},'2026-09-29',now),900);
 assert.equal(breakSeconds({start:'bad',end:'bad'},'2026-09-29',now),null);
 const rows=combine([{agentId:'a',pause:55}],[],[]);
 applyBreaks(rows,{agents:[{agentId:'a',breaks:[{reason:'Meeting',start:'2026-09-29T05:00:00Z'}]}]},'2026-09-29',now);
 assert.equal(rows[0].pause,null);assert.equal(rows[0].breakIncomplete,true);
});
test('failed break history stays unknown rather than falling back to incompatible summary pause',()=>{
 const rows=combine([{agentId:'a',pause:100}],[],[]);applyBreaks(rows,null,'2026-09-30',now);assert.equal(rows[0].pause,null);
});
test('average ringing includes zero-duration calls and keeps no-call agents unknown',()=>{
 const {ringAverage}=require('../api/report');
 assert.deepEqual(ringAverage([{ring:30},{ring:0},{ring:15}]),{ring:15,ringTotal:45,ringCallCount:3});
 assert.equal(ringAverage([]).ring,null);
 assert.equal(ringAverage([{ring:null}]).ring,null);
});
test('call drill-down requires an agent and projects only requested call fields',async()=>{
 const handler=require('../api/report');let status,body;
 const res={setHeader(){},status(s){status=s;return this},json(j){body=j;return j}};
 await handler({method:'GET',url:'/api/report?date=2026-09-29&view=calls'},res);assert.equal(status,400);
 const original=global.fetch;
 try{
  global.fetch=async url=>{assert.equal(new URL(url).searchParams.get('agent'),'SRF980');return {ok:true,json:async()=>({ok:true,date:'2026-09-29',calls:[{talk:30,ring:15,hangupBy:'AgentHangup',recording:'private-recording',agentPhone:'private-agent-number'}]})}};
  await handler({method:'GET',url:'/api/report?date=2026-09-29&view=calls&agent=SRF980'},res);
  assert.equal(status,200);assert.equal(body.calls[0].hangupBy,'AgentHangup');assert.equal(body.calls[0].talk,30);assert.equal('recording' in body.calls[0],false);assert.equal('agentPhone' in body.calls[0],false);
 }finally{global.fetch=original;}
});
