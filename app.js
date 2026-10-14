const $=id=>document.getElementById(id);
const metrics=[['productivity','Total productivity time','#367c91'],['talk','Talk time','#41896c'],['wrapup','Wrap time','#6386bb'],['whatsapp','WhatsApp time','#82a18b'],['pause','Break time','#d39b5d'],['ring','Average ring time before agent cuts','#9b84bd'],['idle','Idle time','#c9877e']];
const tableMetrics=[...metrics.slice(0,5),['ringTotal','Total ring time','#9b84bd'],...metrics.slice(5)];
const today=()=>new Date(Date.now()+19800000).toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>s==null?'—':[Math.floor(s/3600),Math.floor(s%3600/60),Math.floor(s%60)].map(n=>String(n).padStart(2,'0')).join(':');
const ringBand=s=>!Number.isFinite(s)?'':s<15?'red':s<=25?'yellow':'green';
function ringBadge(s,partial=false){if(!Number.isFinite(s))return '<span class="missing">—</span>';const band=ringBand(s);const range=band==='red'?'Below 15 seconds':band==='yellow'?'15 to 25 seconds':'Above 25 seconds';return '<span class="ring-badge ring-'+band+'" title="'+s.toFixed(2)+' seconds · '+range+'" aria-label="'+s.toFixed(2)+' seconds, '+range+'">'+fmt(Math.round(s))+(partial?'*':'')+'</span>'}
const selectedAgents=new Set();
let report=null,busy=false,expanded=new Set(),controller=null,generation=0;
const datePicker=DatePicker($('date'),{max:today,today,limit:31,onApply:changeDate});datePicker.set([today()]);
function filtered(){return (report?.rows||[]).filter(r=>!selectedAgents.size||selectedAgents.has(r.agentId))}
function buildAgentChoices(){
 $('agentChoices').innerHTML=(report?.rows||[]).map(r=>'<label class="agent-choice"><input type="checkbox" value="'+esc(r.agentId)+'" '+(selectedAgents.has(r.agentId)?'checked':'')+'><span>'+esc(r.agentName)+' <small>'+esc(r.agentId)+'</small></span></label>').join('');updateAgentSummary();
}
function updateAgentSummary(){const names=(report?.rows||[]).filter(r=>selectedAgents.has(r.agentId)).map(r=>r.agentName);$('agentSummary').textContent=!names.length?'All agents':names.length===1?names[0]:names.length+' agents selected';$('agentSummary').title=names.join(', ')}
$('agentChoices').addEventListener('change',e=>{if(e.target.type!=='checkbox')return;e.target.checked?selectedAgents.add(e.target.value):selectedAgents.delete(e.target.value);updateAgentSummary();render();reloadOpenCalls()});
$('allAgents').onclick=()=>{selectedAgents.clear();buildAgentChoices();render();reloadOpenCalls()};
document.addEventListener('click',e=>{if(!$('agentPicker').contains(e.target))$('agentPicker').open=false});
$('agentPicker').addEventListener('keydown',e=>{if(e.key==='Escape'){$('agentPicker').open=false;$('agentSummary').focus()}});
function totals(rows,k){if(k==='ringTotal'){const known=rows.filter(r=>Number.isFinite(r.ringTotal)&&(r.ringCallCount>0||!r.partialMetrics?.ring));return {value:known.length?known.reduce((n,r)=>n+r.ringTotal,0):null,partial:rows.some(r=>r.partialMetrics?.ring)}}if(k==='ring'){const known=rows.filter(r=>Number.isFinite(r.ringTotal)&&r.ringCallCount>0);const n=known.reduce((sum,r)=>sum+r.ringCallCount,0);return {value:n?known.reduce((sum,r)=>sum+r.ringTotal,0)/n:null,partial:rows.some(r=>r.ringCallCount==null||r.partialMetrics?.ring)}}const values=rows.map(r=>r[k]).filter(Number.isFinite);return {value:values.length?values.reduce((a,b)=>a+b,0):null,partial:(values.length>0&&values.length<rows.length)||rows.some(r=>r.partialMetrics?.[k])||(k==='pause'&&rows.some(r=>r.breakIncomplete))}}
function render(){
 const rows=filtered();
 $('dateLabel').textContent=(datePicker.get().length===1?new Date(datePicker.get()[0]+'T00:00:00+05:30').toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'long'}):DatePicker.label(datePicker.get())).toUpperCase();
 $('count').textContent=rows.length+' agent'+(rows.length===1?'':'s');
 $('cards').innerHTML=metrics.map(([k,label,color])=>{const t=totals(rows,k);const values=rows.map(r=>r[k]).filter(Number.isFinite);const ringRows=rows.filter(r=>Number.isFinite(r.ringTotal)&&(r.ringCallCount>0||!r.partialMetrics?.ring));const total=k==='ring'?(ringRows.length?ringRows.reduce((n,r)=>n+r.ringTotal,0):null):t.value;const average=k==='ring'?t.value:values.length?total/values.length:null;const title=k==='ring'?'Total ring time':label;return `<article class="card ${k==='whatsapp'?'pending':''}" style="--accent:${color}"><div class="card-label"><i></i>${title}</div><strong>${fmt(total)}${total!=null&&t.partial?'*':''}</strong><small>${total==null?'Awaiting source data':t.partial?'':''}</small><div class="card-average"><span>${k==='ring'?'Average ring time':'Average '+label.toLowerCase()}</span><b>${k==='ring'?ringBadge(average,t.partial):fmt(average==null?null:Math.round(average))+(average!=null&&t.partial?'*':'')}</b><small>${k==='ring'?'Per recorded call':''}</small></div></article>`}).join('');
 $('rows').innerHTML=rows.length?rows.map(renderAgent).join(''):`<tr><td colspan="10" class="empty">${report?'No Ozonetel records for this selection.':'Loading your team’s productivity report…'}</td></tr>`;
 $('totals').innerHTML=rows.length?`<tr><td>GRAND TOTAL</td><td>—</td>${tableMetrics.map(([k])=>{const t=totals(rows,k);return `<td><button class="metric-button" data-metric="${k}" data-id="*">${metricValue(k,t.value,t.partial)}</button></td>`}).join('')}</tr>`:'';
 $('export').disabled=!rows.length;renderSummaryDetails();
}
async function refresh(){
 if(busy)return;busy=true;const sequence=++generation;controller=new AbortController();$('refresh').disabled=true;$('sync').textContent='Refreshing Ozonetel data…';
 try{const days=datePicker.get();const daily=[];for(const date of days){$('sync').textContent='Loading '+date+' ('+(daily.length+1)+'/'+days.length+')…';const response=await fetch('/api/report?date='+date,{signal:controller.signal});const value=await response.json();if(!response.ok||!value.ok)throw Error(date+': '+(value.error||'Unable to load report'));daily.push(value);}const data=mergeDateReports(daily);if(sequence!==generation)return;report=data;for(const row of report.rows)row.whatsapp=sampleWhatsApp(row.agentId).reduce((n,x)=>n+x.seconds,0)*row.days.length;const live=data.current&&!data.stale;$('liveBadge').classList.toggle('off',!live);$('liveText').textContent=data.stale?'DELAYED':data.current?'LIVE':'HISTORICAL';
 for(const id of selectedAgents)if(!data.rows.some(r=>r.agentId===id))selectedAgents.delete(id);buildAgentChoices();
 $('sync').textContent=(data.stale?'Delayed data':'Ozonetel '+(data.current?'live report':'historical report'))+' · Source updated '+new Date(data.fetchedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})+' IST';
 $('warning').hidden=!data.warnings.length;$('warning').textContent=data.warnings.join(' ');render();reloadOpenCalls();
 }catch(e){if(e.name==='AbortError')return;$('liveBadge').classList.add('off');$('liveText').textContent='UNAVAILABLE';$('sync').textContent='Refresh unavailable';$('warning').hidden=false;$('warning').textContent=e.message+(report?' Showing the last successful report.':'');if(!report)$('rows').innerHTML='<tr><td colspan="8" class="empty">Data is unavailable. Try Refresh to reconnect.</td></tr>';
 }finally{if(sequence===generation){busy=false;$('refresh').disabled=false;}}
}
function changeDate(){controller?.abort();generation++;busy=false;report=null;$('liveText').textContent='CONNECTING';$('liveBadge').classList.add('off');$('warning').hidden=true;expanded.clear();detailSelections.clear();summaryMetric=null;callDetails.clear();selectedAgents.clear();buildAgentChoices();render();refresh()}
$('refresh').addEventListener('click',refresh);
$('today').onclick=()=>{datePicker.set([today()]);changeDate()};$('yesterday').onclick=()=>{datePicker.set([new Date(Date.parse(today())-86400000).toISOString().slice(0,10)]);changeDate()};$('clear').onclick=()=>{$('date').value=today();changeDate()};
$('rows').onclick=detailClick;$('totals').onclick=detailClick;$('summaryDetails').onclick=detailClick;
$('export').onclick=()=>{const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';const safe=s=>/^[=+@\-\t\r]/.test(s)?"'"+s:s;const lines=[['Date','Agent','Agent ID',...metrics.map(x=>x[1])],...filtered().map(r=>[report.date,safe(r.agentName),safe(r.agentId),...metrics.map(([k])=>k==='whatsapp'?fmt(r[k])+' (Sample)':fmt(k==='ring'&&r[k]!=null?Math.round(r[k]):r[k]))])];const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='agent-productivity-'+report.date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
render();refresh();setInterval(()=>{if(!document.hidden)refresh()},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
