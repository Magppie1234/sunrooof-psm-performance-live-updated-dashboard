function mergeDateReports(reports){
 const agents=new Map(),dates=reports.map(r=>r.date).sort();
 for(const report of reports) for(const row of report.rows){
  let a=agents.get(row.agentId);
  if(!a){a={...row,days:[],modes:[],breakEntries:[],partialMetrics:{},talk:null,wrapup:null,pause:null,idle:null,ring:null,ringTotal:0,ringCallCount:0,breakIncomplete:false};agents.set(row.agentId,a);}
  a.days.push(report.date);
  for(const k of ['talk','wrapup','pause','idle']){if(Number.isFinite(row[k]))a[k]=(a[k]??0)+row[k];else a.partialMetrics[k]=true;}
  if(Number.isFinite(row.ringTotal)&&row.ringCallCount>0){a.ringTotal+=row.ringTotal;a.ringCallCount+=row.ringCallCount;}else if(row.ringCallCount!==0)a.partialMetrics.ring=true;
  a.breakIncomplete ||= !!row.breakIncomplete;
  a.modes.push(...row.modes.map(m=>({...m,date:report.date})));
  a.breakEntries.push(...(row.breakEntries||[]).map(b=>({...b,date:report.date})));
  if(report.current)a.state=row.state;
 }
 const rows=[...agents.values()].sort((a,b)=>a.agentName.localeCompare(b.agentName));
 for(const a of rows){
  a.ring=a.ringCallCount?a.ringTotal/a.ringCallCount:null;
  const ringKnown=a.ringCallCount>0||!a.partialMetrics.ring;
  a.productivity=Number.isFinite(a.talk)&&Number.isFinite(a.wrapup)&&ringKnown?a.talk+a.wrapup+a.ringTotal:null;
  a.partialMetrics.productivity=!!(a.partialMetrics.talk||a.partialMetrics.wrapup||a.partialMetrics.ring);
 }
 return {ok:true,date:dates.join(','),dates,rows,current:reports.some(r=>r.current),stale:reports.some(r=>r.stale),breakSource:reports.every(r=>r.breakSource)?'Ozonetel detailed break history':null,fetchedAt:reports.map(r=>r.fetchedAt).sort()[0],warnings:[...new Set(reports.flatMap(r=>r.warnings.map(w=>`${r.date}: ${w}`)))],whatsappPending:true};
}
if(typeof module!=='undefined')module.exports={mergeDateReports};
