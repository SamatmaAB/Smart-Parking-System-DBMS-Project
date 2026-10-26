const $ = s => document.querySelector(s);
const state = { data: null };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = amount => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(amount || 0);
const fmt = value => value ? new Date(value).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) : '—';
function toast(message, error=false) { const el=$('#toast'); el.textContent=message; el.classList.toggle('error',error); el.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.hidden=true,3200); }
async function request(url, options={}) { const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}); const data=await response.json(); if(!response.ok) throw new Error(data.error||'Request failed'); return data; }
function empty(msg) { return `<div class="empty">${escapeHtml(msg)}</div>`; }
async function refresh() {
  try {
    const [summary,data]=await Promise.all([request('/api/summary'),request('/api/data')]); state.data=data;
    $('#m-capacity').textContent=summary.capacity; $('#m-available').textContent=summary.slots; $('#m-active').textContent=summary.active; $('#m-occupied').textContent=`${summary.occupied} slots occupied`; $('#m-revenue').textContent=money(summary.revenue);
    renderLots(); renderSpaces(); renderPeople(); renderReservations(); renderSessions();
  } catch (error) { toast(error.message,true); }
}
function renderLots() {
  const lots=state.data.lots;
  $('#lot-grid').innerHTML=lots.length ? lots.map(l=>{
    const slots=state.data.slots.filter(s=>s.lot_id===l.lot_id), occupied=slots.filter(s=>s.status==='occupied').length, pct=slots.length?Math.round(occupied/slots.length*100):0;
    return `<article class="lot-card"><div class="lot-card-head"><div><h3>${escapeHtml(l.name)}</h3><div class="lot-location">⌖ &nbsp;${escapeHtml(l.location)}</div></div><span class="lot-symbol">⌂</span></div><div class="lot-numbers"><div><strong>${slots.length}</strong><small>Total spaces</small></div><div><strong>${slots.filter(s=>s.status==='available').length}</strong><small>Available now</small></div><div><strong>${occupied}</strong><small>Occupied</small></div></div><div class="progress"><span style="width:${pct}%"></span></div><div class="lot-foot"><span>Utilization</span><b>${pct}%</b></div></article>`;
  }).join('') : empty('No parking lots yet. Add your first lot to get started.');
}
function renderSpaces() {
  const groups=new Map();
  for(const s of state.data.slots){const key=`${s.lot_name} · ${s.level}`; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
  $('#space-list').innerHTML=groups.size?[...groups].map(([key,slots])=>`<div class="space-group"><div class="space-title"><b>${escapeHtml(key)}</b><small>${slots.length} spaces</small></div><div class="space-pills">${slots.map(s=>`<div class="space-pill ${escapeHtml(s.status)}"><b>#${s.slot_id}</b>${escapeHtml(s.status)}</div>`).join('')}</div></div>`).join(''):empty('Create a lot, then add a zone and spaces.');
  const active=state.data.sessions.filter(s=>!s.exit_time);
  $('#active-sessions').innerHTML=active.length?active.map(s=>`<div class="table-row"><div><b>${escapeHtml(s.plate_no)}</b><small>Session #${s.session_id}</small></div><div><b>Space #${s.slot_id}</b><small>${escapeHtml(s.lot_name)}</small></div><button class="button button-primary" data-action="checkout" data-id="${s.session_id}">Check out</button></div>`).join(''):empty('No vehicles are parked right now.');
}
function renderPeople() {
  const users=state.data.users;
  $('#people-list').innerHTML=users.length?users.map(u=>{const vehicles=state.data.vehicles.filter(v=>v.user_id===u.user_id);return `<div class="person-row"><span class="avatar">${escapeHtml(u.name.slice(0,1).toUpperCase())}</span><div><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)}</small></div><div><b>${vehicles.length?vehicles.map(v=>escapeHtml(v.plate_no)).join(', '):'No vehicle'}</b><small>${vehicles.length?vehicles.map(v=>escapeHtml(v.type)).join(', '):'Add a vehicle'}</small></div><div><small>${escapeHtml(u.phone||'Phone not added')}</small></div></div>`}).join(''):empty('No customers have been added.');
}
function renderReservations() {
  const rows=state.data.reservations;
  $('#reservation-list').innerHTML=rows.length?rows.map(r=>`<div class="table-row"><div><b>${escapeHtml(r.user_name)}</b><small>${escapeHtml(r.plate_no)}</small></div><div><b>${escapeHtml(r.lot_name)} · #${r.slot_id}</b><small>${fmt(r.start_time)} – ${fmt(r.end_time)}</small></div><div><span class="tag ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></div><div><small>Reservation #${r.res_id}</small></div></div>`).join(''):empty('No reservations yet.');
}
function renderSessions() {
  const latest=state.data.sessions.slice(0,5);
  $('#recent-sessions').innerHTML=latest.length?latest.map(s=>`<div class="table-row"><div><b>${escapeHtml(s.plate_no)}</b><small>${escapeHtml(s.lot_name)} · space #${s.slot_id}</small></div><div><b>${s.exit_time?'Completed':'Active'}</b><small>${fmt(s.entry_time)}</small></div></div>`).join(''):empty('No parking sessions yet.');
}
const fields={
 lot:{title:'Add parking lot',url:'/api/lots',fields:[['name','Lot name','text'],['location','Location','text']]},
 zone:{title:'Add a zone',url:'/api/zones',fields:[['lot_id','Parking lot','select','lots'],['level','Level','text'],['zone_type','Zone type','text']]},
 slot:{title:'Add a parking space',url:'/api/slots',fields:[['zone_id','Zone','select','zones'],['slot_type','Space type','select',['Standard','EV','Accessible','Compact']]]},
 user:{title:'Add a customer',url:'/api/users',fields:[['name','Full name','text'],['email','Email address','email'],['phone','Phone','tel']]},
 vehicle:{title:'Add a vehicle',url:'/api/vehicles',fields:[['user_id','Vehicle owner','select','users'],['plate_no','License plate','text'],['type','Vehicle type','select',['Car','Motorcycle','SUV','Van','Other']]]},
 reservation:{title:'New reservation',url:'/api/reservations',fields:[['user_id','Customer','select','users'],['vehicle_id','Vehicle','select','vehicles'],['slot_id','Available space','select','availableSlots'],['start_time','Start time','datetime-local'],['end_time','End time','datetime-local']]},
 checkin:{title:'Check in vehicle',url:'/api/check-in',fields:[['vehicle_id','Vehicle','select','vehicles'],['slot_id','Available space','select','checkinSlots'],['res_id','Reservation ID (optional)','number']]},
 checkout:{title:'Check out vehicle',url:'/api/check-out',fields:[['session_id','Session ID','hidden'],['amount','Payment amount (₹)','number'],['method','Payment method','select',['UPI','Card','Cash','Wallet']]]}
};
function optionsFor(source) {
  const d=state.data;
  const lists={lots:d.lots.map(x=>[x.lot_id,`${x.name} — ${x.location}`]),zones:d.zones.map(x=>[x.zone_id,`${x.lot_name} · ${x.level} (${x.zone_type})`]),users:d.users.map(x=>[x.user_id,`${x.name} · ${x.email}`]),vehicles:d.vehicles.map(x=>[x.vehicle_id,`${x.plate_no} · ${x.owner}`]),availableSlots:d.slots.filter(x=>x.status==='available').map(x=>[x.slot_id,`Space #${x.slot_id} · ${x.lot_name} · ${x.level}`]),checkinSlots:d.slots.filter(x=>['available','reserved'].includes(x.status)).map(x=>[x.slot_id,`Space #${x.slot_id} · ${x.lot_name} · ${x.level} (${x.status})`])};
  return lists[source]||source.map(x=>[x,x]);
}
function openForm(action,id) {
  const cfg=fields[action]; if(!cfg)return;
  $('#modal-title').textContent=cfg.title; $('#modal-eyebrow').textContent=action==='checkout'?'SESSION PAYMENT':'NEW RECORD';
  $('#form-fields').innerHTML=cfg.fields.map(([name,label,type,source])=>{
    if(type==='hidden')return `<input type="hidden" name="${name}" value="${id||''}">`;
    let control;
    if(type==='select'){const opts=optionsFor(source);control=`<select name="${name}" required><option value="">Select…</option>${opts.map(([value,text])=>`<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`).join('')}</select>`;}
    else control=`<input name="${name}" type="${type}" ${type==='number'?'min="0" step="0.01"':''} ${type==='datetime-local'?'required':''} ${type!=='number'&&type!=='datetime-local'?'required':''}>`;
    return `<div class="field ${type==='datetime-local'?'':' '} "><label>${escapeHtml(label)}</label>${control}</div>`;
  }).join('');
  $('#modal').dataset.url=cfg.url; $('#modal-form').dataset.action=action;
  $('#modal').showModal();
}
document.addEventListener('click',event=>{
  const viewButton=event.target.closest('[data-view]'); if(viewButton){const name=viewButton.dataset.view;document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==name);document.querySelectorAll('.nav').forEach(v=>v.classList.toggle('active',v.dataset.view===name));$('#page-title').textContent=({overview:'Overview',parking:'Parking',people:'People & vehicles',reservations:'Reservations'})[name];return;}
  const actionButton=event.target.closest('[data-action]'); if(actionButton){openForm(actionButton.dataset.action,actionButton.dataset.id);return;}
  if(event.target.id==='refresh')refresh();
});
$('#modal-form').addEventListener('submit',async event=>{
  event.preventDefault();const action=event.currentTarget.dataset.action;const form=new FormData(event.currentTarget);const data=Object.fromEntries(form.entries());
  for(const key of ['lot_id','zone_id','user_id','vehicle_id','slot_id','res_id','session_id','amount'])if(data[key])data[key]=Number(data[key]);
  if(action==='reservation'){data.start_time=new Date(data.start_time).toISOString();data.end_time=new Date(data.end_time).toISOString();}
  try{await request($('#modal').dataset.url,{method:'POST',body:JSON.stringify(data)});$('#modal').close();toast(action==='checkout'?'Vehicle checked out and payment recorded.':'Saved successfully.');await refresh();}
  catch(error){toast(error.message,true);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal').open)$('#modal').close();});
$('#today').textContent=new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());
refresh();
