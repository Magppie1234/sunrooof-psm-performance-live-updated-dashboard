const {test}=require('node:test');const assert=require('node:assert/strict');
const {mergeDateReports}=require('../date-reports');
test('multiple dates sum durations, weight ring averages and preserve dated detail records',()=>{
 const day=(date,row)=>({date,rows:[{agentId:'a',agentName:'Agent',modes:[{mode:'Manual',idle:10}],breakEntries:[{reason:'Lunch',seconds:10}],...row}],warnings:[],breakSource:'Ozonetel',fetchedAt:date+'T10:00:00Z'});
 const data=mergeDateReports([day('2026-09-28',{talk:30,pause:60,idle:null,wrapup:5,ringTotal:100,ringCallCount:10}),day('2026-09-29',{talk:50,pause:70,idle:100,wrapup:6,ringTotal:50,ringCallCount:1})]);
 const row=data.rows[0];assert.equal(row.productivity,241);assert.equal(row.talk,80);assert.equal(row.pause,130);assert.equal(row.wrapup,11);assert.equal(row.ring,150/11);assert.equal(row.idle,100);assert.equal(row.partialMetrics.idle,true);assert.deepEqual(row.days,['2026-09-28','2026-09-29']);assert.equal(row.breakEntries[0].date,'2026-09-28');assert.equal(row.modes[1].date,'2026-09-29');
});

test('productivity stays unknown when a required duration is missing',()=>{const d=mergeDateReports([{date:'2026-09-29',rows:[{agentId:'a',agentName:'A',talk:null,wrapup:10,ringTotal:20,ringCallCount:1,modes:[]}],warnings:[],fetchedAt:'2026-09-29T10:00:00Z'}]);assert.equal(d.rows[0].productivity,null);assert.equal(d.rows[0].partialMetrics.productivity,true);});
