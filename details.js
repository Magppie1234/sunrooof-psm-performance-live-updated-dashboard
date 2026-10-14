const detailSelections=new Map(),callDetails=new Map();
let summaryMetric=null;
const callMetrics=new Set(['productivity','talk','wrapup','ring','ringTotal']);
function sampleWhatsApp(id){
 const n=[...id].reduce((a,c)=>a+c.charCodeAt(0),0);
 return [{reason:'Customer follow-up',seconds:(8+n%12)*60},{reason:'Sharing product information',seconds:(5+n%8)*60}];
}
function metricValue(k,value,partial=false){
 if(k==='ring')return ringBadge(value,partial);
 return fmt(value)+(partial?'*':'');
}
function metricCell(r,k){return `<button class="metric-button" data-id="${esc(r.agentId)}" data-metric="${k}" aria-expanded="${detailSelections.get(r.agentId)===k}" aria-label="View ${esc(tableMetrics.find(m=>m[0]===k)[1])} details for ${esc(r.agentName)}">${metricValue(k,k==='ringTotal'&&r.ringCallCount===0&&r.partialMetrics?.ring?null:r[k],!!r.partialMetrics?.[k==='ringTotal'?'ring':k]||(k==='pause'&&r.breakIncomplete))}</button>`}
function renderAgent(r){
 const active=detailSelections.get(r.agentId);
 return `<tr><td><button class="agent-button" data-id="${esc(r.agentId)}" data-metric="idle" aria-expanded="${active==='idle'}"><span class="arrow">${active?'▼':'▶'}</span><span class="avatar">${esc(r.agentName.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase())}</span>${esc(r.agentName)}</button></td><td>${esc(r.agentId)}</td>${tableMetrics.map(([k])=>`<td>${metricCell(r,k)}</td>`).join('')}</tr>${active?`<tr class="detail"><td colspan="10"><div class="detail-head"><b>${esc(r.agentName)} · ${esc(tableMetrics.find(m=>m[0]===active)[1])}</b><button class="quiet" data-close="${esc(r.agentId)}">Close ×</button></div>${detailContent(r,active)}</td></tr>`:''}`;
}
function timeLabel(value){
 if(!value)return '—';
 if(/^\d{2}:\d{2}:\d{2}$/.test(value))return esc(value);
 const date=new Date(value);return Number.isFinite(date.getTime())?esc(date.toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})):esc(value);
}
function detailTable(headers,rows){return `<div class="drill-scroll"><table class="drill-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
function detailContent(r,k){
 if(callMetrics.has(k)){
  const d=callDetails.get(report.date+'|'+r.agentId);
  if(!d || d.loading)return '<p class="detail-message" role="status">Loading call records…</p>';
  if(d.error)return `<p class="detail-message">${esc(d.error)} <button class="quiet" data-retry="${esc(r.agentId)}">Retry</button></p>`;
  if(!d.calls.length)return '<p class="detail-message">No call records are available for this agent on the selected date.</p>';
  const rows=d.calls.map(c=>{
   const hangup=/^agenthangup$/i.test(c.hangupBy)?'Agent hangup':/^userhangup$/i.test(c.hangupBy)?'Customer hangup':c.hangupBy || 'Unknown';
   const connected=/^(answered|connected)$/i.test(c.status);
   return `<tr><td>${esc(c.date)} ${timeLabel(c.start)}</td><td><span class="mode-tag">${esc(c.mode||'—')}</span></td><td>${esc(c.number||'—')}</td><td>${esc([c.campaign,c.skill].filter(Boolean).join(' · ')||'—')}</td><td class="${connected?'call-connected':'call-unanswered'}">${esc(c.status||'Unknown')}</td><td>${fmt(c.ring)}</td><td>${fmt(c.talk)}</td><td>${fmt(c.wrapup)}</td><td>${fmt(c.hold)}</td><td>${esc(hangup)}</td><td>${esc(c.disposition||'—')}</td></tr>`;
  });
  return `<p class="detail-message">${d.calls.length} calls · ${esc(report.date)} · Latest first · Ring average includes all recorded calls.</p>`+detailTable(['Start (IST)','Mode','Number','Campaign / Skill','Status','Ring','Talk','Wrap-up','Hold','Hung up by','Disposition'],rows);
 }
 if(k==='pause'){
  if(!report.breakSource)return '<p class="detail-message">Break history is unavailable.</p>';
  if(!r.breakEntries?.length)return '<p class="detail-message">No breaks recorded for this agent on the selected date.</p>';
  return '<p class="detail-message">SIP disconnections and mode changes are shown for context and excluded from the break total.</p>'+detailTable(['Break type','Start (IST)','End (IST)','Duration'],[...r.breakEntries].sort((a,b)=>String(b.start).localeCompare(String(a.start))).map(b=>`<tr><td>${esc(b.reason)}${b.excluded?' <small class="system-label">System state · excluded</small>':''}</td><td>${esc(b.date)} ${timeLabel(b.start)}</td><td>${b.ongoing?'Ongoing':b.end?timeLabel(b.end):'End unavailable'}</td><td>${fmt(b.seconds)}</td></tr>`));
 }
 if(k==='whatsapp')return '<p class="detail-message">Layout preview: these are placeholder durations until actual WhatsApp data is supplied.</p>'+detailTable(['Activity','Duration'],sampleWhatsApp(r.agentId).map(x=>`<tr><td>${esc(x.reason)}</td><td>${fmt(x.seconds*(r.days?.length||1))}</td></tr>`));
 if(!r.modes.length)return '<p class="detail-message">Ozonetel has not supplied an idle summary for this agent on this date.</p>';
 return '<p class="detail-message">Reported idle time by call mode. Individual idle-event timestamps are not available from this summary.</p>'+detailTable(['Mode','Idle time'],r.modes.map(m=>`<tr><td>${esc(m.date)} · ${esc(m.mode)}</td><td>${fmt(m.idle)}</td></tr>`));
}
function renderSummaryDetails(){
 const box=$('summaryDetails');box.hidden=!summaryMetric;
 if(!summaryMetric){box.innerHTML='';return;}
 box.innerHTML=`<div class="detail-head"><b>${esc(tableMetrics.find(m=>m[0]===summaryMetric)[1])} · Selected agents</b><button class="quiet" data-close="*">Close ×</button></div>`+filtered().map(r=>`<div class="summary-agent"><h3>${esc(r.agentName)} (${esc(r.agentId)})</h3>${detailContent(r,summaryMetric)}</div>`).join('');
}
async function loadCalls(id,force=false){
 const date=report?.date;if(!date)return;
 const key=date+'|'+id,existing=callDetails.get(key);
 if(existing?.loading || !force&&existing&&!existing.error&&Date.now()-existing.at<60000)return;
 callDetails.set(key,{loading:true});
 try{
  const calls=[];for(const day of date.split(',')){const response=await fetch('/api/report?'+new URLSearchParams({date:day,agent:id,view:'calls'}));const data=await response.json();if(!response.ok||!data.ok)throw Error(day+': '+(data.error||'Call records unavailable'));calls.push(...data.calls.map(c=>({...c,date:day})));}calls.sort((a,b)=>(b.date+' '+b.start).localeCompare(a.date+' '+a.start));
  callDetails.set(key,{calls,at:Date.now()});
 }catch(e){callDetails.set(key,{error:e.message,at:Date.now()});}
 if(report?.date===date)render();
}
function reloadOpenCalls(){
 const ids=new Set([...detailSelections].filter(([,k])=>callMetrics.has(k)).map(([id])=>id));
 if(callMetrics.has(summaryMetric))for(const r of filtered())ids.add(r.agentId);
 for(const id of ids)loadCalls(id);
}
function detailClick(e){
 const close=e.target.closest('[data-close]');
 if(close){if(close.dataset.close==='*')summaryMetric=null;else detailSelections.delete(close.dataset.close);render();return;}
 const retry=e.target.closest('[data-retry]');if(retry){loadCalls(retry.dataset.retry,true);render();return;}
 const b=e.target.closest('[data-metric]');if(!b||!report)return;
 const {id,metric}=b.dataset;
 if(id==='*'){summaryMetric=summaryMetric===metric?null:metric;render();if(summaryMetric)$('summaryDetails').scrollIntoView({behavior:'smooth',block:'start'});}
 else{detailSelections.get(id)===metric?detailSelections.delete(id):detailSelections.set(id,metric);render();}
 reloadOpenCalls();
}
