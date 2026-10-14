// Reuse the existing authenticated Ozonetel gateways without copying API secrets
// or generating competing Ozonetel tokens. Call details are fetched on demand.
const SOURCE = process.env.OZONETEL_REPORT_URL || 'https://agent-productivity-dashboard.vercel.app/api/report';
const STATES = process.env.OZONETEL_STATES_URL || 'https://agent-break-dashboard-live.vercel.app/api/report';
const BREAKS = process.env.OZONETEL_BREAKS_URL || 'https://agent-break-dashboard-live.vercel.app/api/today-breaks';
const SAVED_BREAKS = process.env.OZONETEL_SAVED_BREAKS_URL || 'https://agent-break-dashboard-live.vercel.app/api/breaks';
const cache = new Map(), pending = new Map();
const todayIST = () => new Date(Date.now() + 19800000).toISOString().slice(0,10);
async function read(base, params) {
  const r = await fetch(base + '?' + new URLSearchParams(params), {signal: AbortSignal.timeout(18000)});
  if (!r.ok) throw new Error('Ozonetel report connection temporarily unavailable');
  const j = await r.json();
  if (!j.ok || j.demo || j.date && j.date !== params.date) throw new Error('Verified Ozonetel data is unavailable for this date');
  return j;
}
function combine(summary, calls, states) {
  const agents = new Map();
  function agent(r) {
    if (!agents.has(r.agentId)) agents.set(r.agentId, {agentId:r.agentId,agentName:r.agentName || r.agentId,talk:null,wrapup:null,whatsapp:null,pause:null,ring:null,idle:null,modes:[],state:'—'});
    return agents.get(r.agentId);
  }
  for (const s of states || []) agent(s).state = s.state;
  for (const r of summary || []) {
    const a=agent(r);
    for (const k of ['talk','wrapup','pause','idle']) if (Number.isFinite(r[k])) a[k]=(a[k] ?? 0)+r[k];
    a.modes.push({mode:r.mode,talk:r.talk,wrapup:r.wrapup,pause:r.pause,idle:r.idle});
  }
  // Current call records override call durations, without adding them twice.
  const callTotals = new Map();
  for (const r of calls || []) {
    agent(r);
    const t=callTotals.get(r.agentId) || {talk:0,wrapup:0};
    t.talk += r.talk || 0; t.wrapup += r.wrapup || 0; callTotals.set(r.agentId,t);
  }
  for (const [id,t] of callTotals) Object.assign(agents.get(id),t);
  return [...agents.values()].sort((a,b)=>a.agentName.localeCompare(b.agentName));
}
async function readBreaks(date) {
  if (date >= '2026-09-26') {
    const data = await read(BREAKS, {date});
    if (!Array.isArray(data.agents)) throw new Error('Break history is incomplete');
    return data;
  }
  const response = await fetch(SAVED_BREAKS, {signal: AbortSignal.timeout(18000)});
  if (!response.ok) throw new Error('Saved break history unavailable');
  const data = await response.json();
  if (!Array.isArray(data.records)) throw new Error('Saved break history is incomplete');
  const records = data.records.filter(r => r.date === date);
  if (!records.length) throw new Error('No saved break history for this date');
  const agents = new Map();
  for (const r of records) {
    if (!agents.has(r.agentId)) agents.set(r.agentId, {agentId:r.agentId, agentName:r.agentName, breaks:[]});
    agents.get(r.agentId).breaks.push(r);
  }
  return {ok:true,date,agents:[...agents.values()],baselineAt:data.capturedAt};
}
function breakSeconds(entry, date, now) {
  if (typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration >= 0) return entry.duration;
  if (typeof entry.duration === 'string' && /^\d+:[0-5]\d:[0-5]\d$/.test(entry.duration)) {
    const [h,m,s]=entry.duration.split(':').map(Number); return h*3600+m*60+s;
  }
  const today=new Date(now+19800000).toISOString().slice(0,10);
  if (!entry.end && date !== today) return null;
  const stamp = value => Date.parse(/^\d{2}:\d{2}:\d{2}$/.test(value || '') ? `${date}T${value}+05:30` : value);
  const start=stamp(entry.start), end=entry.end ? stamp(entry.end) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end<start) return null;
  return Math.floor((end-start)/1000);
}
function ringAverage(calls) {
  if (!calls.length) return {ring:null,ringTotal:0,ringCallCount:0};
  if(calls.some(c=>!Number.isFinite(c.ring)||c.ring<0)) return {ring:null,ringTotal:null,ringCallCount:0};
  const ringTotal=calls.reduce((n,c)=>n+c.ring,0);
  return {ring:ringTotal/calls.length,ringTotal,ringCallCount:calls.length};
}
function applyBreaks(rows, data, date, now=Date.now()) {
  const agents=new Map(rows.map(r=>[r.agentId,r]));
  // Replace summary pause values, rather than adding a second copy of breaks.
  for (const row of rows) {row.pause=data?0:null;row.breakEntries=[];row.breakIncomplete=false;}
  if (!data) return rows;
  for (const a of data.agents) {
    if (!agents.has(a.agentId)) {
      const row=combine([],[],[{...a,state:'—'}])[0];
      Object.assign(row,{pause:0,breakEntries:[],breakIncomplete:false});
      rows.push(row);agents.set(a.agentId,row);
    }
    const row=agents.get(a.agentId);
    for (const b of a.breaks || []) {
      const excluded=/sip disconnect|changemode/i.test(b.reason || '');
      const seconds=breakSeconds(b,date,now);
      row.breakEntries.push({reason:b.reason || 'Reason unavailable',start:b.start,end:b.end,seconds,excluded,ongoing:!b.end && date===new Date(now+19800000).toISOString().slice(0,10)});
      if(excluded) continue;
      if (seconds===null) row.breakIncomplete=true;
      else row.pause+=seconds;
    }
    if(row.breakIncomplete && !row.breakEntries.some(b=>!b.excluded && b.seconds!==null)) row.pause=null;
  }
  return rows.sort((a,b)=>a.agentName.localeCompare(b.agentName));
}
async function load(date) {
  const current=date===todayIST();
  const results=await Promise.allSettled([
    read(SOURCE,{date}),
    current ? read(SOURCE,{date,view:'live'}) : Promise.resolve(null),
    current ? read(STATES,{date,view:'live'}) : Promise.resolve(null),
    readBreaks(date)
  ]);
  const [summary,calls,states,breaks]=results.map(r=>r.status==='fulfilled'?r.value:null);
  if (!summary && !calls && !breaks) throw new Error('Ozonetel is temporarily unavailable. Please try refreshing shortly.');
  const warnings=[];
  if (!breaks) warnings.push('Detailed break history is unavailable. Break time is not assumed to be zero.');
  if (current && !calls) warnings.push('Current call durations could not be refreshed.');
  if (results.some(r=>r.status==='fulfilled' && r.value?.stale)) warnings.push('Ozonetel is serving delayed data.');
  const breakCalculatedAt=new Date().toISOString();
  const rows=applyBreaks(combine(summary?.rows,calls?.rows,states?.status),breaks,date,Date.parse(breakCalculatedAt));
  if(rows.some(r=>r.breakIncomplete)) warnings.push('Some break entries have no valid end time or duration and are excluded from totals.');
  // Sequential reads reuse the source gateway CDR cache and avoid bursts.
  const ids = new Set([...(summary?.rows || []),...(calls?.rows || [])].map(r=>r.agentId));
  let missingRing=false;
  for (const row of rows) {
    if (!ids.has(row.agentId)) continue;
    try {
      const detail=await read(SOURCE,{date,view:'calls',agent:row.agentId});
      if (!Array.isArray(detail.calls)) throw new Error('Missing records');
      Object.assign(row,ringAverage(detail.calls));
    } catch {missingRing=true;}
  }
  if (missingRing) warnings.push('Some ringing durations are unavailable from Ozonetel call records.');
  const times=[summary?.fetchedAt,calls?.fetchedAt,states?.fetchedAt].filter(Boolean);
  return {ok:true,date,source:'Ozonetel',current,rows,warnings,fetchedAt:times.sort()[0] || new Date().toISOString(),refreshedAt:new Date().toISOString(),whatsappPending:true,
    breakSource:breaks?'Ozonetel detailed break history':null,breakCalculatedAt:breaks?breakCalculatedAt:null,breakTrackingSince:breaks?.trackingSince || null};
}
async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({ok:false,error:'GET required'});
  const date=new URL(req.url,'http://localhost').searchParams.get('date') || todayIST();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date>todayIST()) return res.status(400).json({ok:false,error:'Choose a valid date up to today.'});
  const params=new URL(req.url,'http://localhost').searchParams;
  if(params.get('view')==='calls') {
    const agent=params.get('agent');
    if(!agent || !/^[a-zA-Z0-9_-]{1,80}$/.test(agent)) return res.status(400).json({ok:false,error:'A valid agent ID is required.'});
    try {
      const data=await read(SOURCE,{date,view:'calls',agent});
      if(!Array.isArray(data.calls)) throw new Error('Call records are unavailable.');
      const fields=['start','end','mode','number','campaign','skill','status','ring','talk','wrapup','hold','hangupBy','disposition'];
      return res.status(200).json({ok:true,date,agent,fetchedAt:data.fetchedAt,calls:data.calls.map(c=>Object.fromEntries(fields.map(k=>[k,c[k]??null])))});
    }catch(e){return res.status(502).json({ok:false,error:e.message});}
  }
  const hit=cache.get(date);
  if(hit && Date.now()-hit.at<60000) return res.status(200).json(hit.data);
  try {
    if(!pending.has(date)) pending.set(date,load(date).finally(()=>pending.delete(date)));
    const data=await pending.get(date);
    if(cache.size>20) cache.delete(cache.keys().next().value);
    cache.set(date,{at:Date.now(),data});
    return res.status(200).json(data);
  } catch(e) {
    if(hit) return res.status(200).json({...hit.data,stale:true,warnings:[...hit.data.warnings,'Refresh failed. Showing the last successful data.']});
    return res.status(502).json({ok:false,error:e.message});
  }
}
module.exports=handler;
module.exports.combine=combine;
module.exports.applyBreaks=applyBreaks;
module.exports.breakSeconds=breakSeconds;
module.exports.ringAverage=ringAverage;
