const C = window.APP_CONFIG;
let session = { idToken: null, user: null, selectedVehicleId: '' };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const views = ['home','request','availability','myRequests','requestDetail','approvals','inspection','fleet'];

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function show(view){views.forEach(v=>$('#'+v).classList.toggle('hidden',v!==view));$('#loading').classList.add('hidden');$('#bottomNav').classList.remove('hidden');$$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==='myRequests')loadMyRequests();if(view==='approvals')loadApprovals();if(view==='fleet')loadFleet();}
function fmt(v){if(!v)return '-';const d=new Date(v);return d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}
function statusText(s){return ({WAIT_L1:'รอหัวหน้าแผนก',WAIT_L2:'รอผู้ควบคุมรถ',ALLOCATED:'จัดรถแล้ว',PRECHECK_PENDING:'รอตรวจรถก่อนใช้',READY:'พร้อมใช้งาน',IN_USE:'กำลังใช้งาน',RETURN_PENDING:'รอคืนรถ',COMPLETED:'เสร็จสิ้น',REJECTED_L1:'ไม่อนุมัติโดยหัวหน้า',REJECTED_L2:'ไม่อนุมัติโดยผู้ควบคุม',CANCELLED:'ยกเลิก'})[s]||s}
function badgeClass(s){return s==='COMPLETED'?'success':s?.startsWith('REJECTED')?'danger':['WAIT_L1','WAIT_L2','PRECHECK_PENDING','RETURN_PENDING'].includes(s)?'warn':'info'}

async function api(action,payload={}){
  const r=await fetch(C.API_BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,idToken:session.idToken,payload})});
  const data=await r.json(); if(!r.ok||data.ok===false) throw new Error(data.error||'เกิดข้อผิดพลาด'); return data;
}

async function init(){
  try{
    if(!C?.LIFF_ID||C.LIFF_ID==='YOUR_LIFF_ID') throw new Error('กรุณาตั้งค่า LIFF_ID ใน config.js');
    await liff.init({liffId:C.LIFF_ID});
    if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return}
    session.idToken=liff.getIDToken();
    const me=await api('auth.me'); session.user=me.user;
    $('#profileBtn').textContent=(me.user.displayName||'U').slice(0,1);
    $('#hello').textContent=`สวัสดี ${me.user.displayName||''}`;
    $('#roleText').textContent=`${me.user.departmentName||'ยังไม่ระบุแผนก'} • ${me.user.role||'USER'}`;
    $('#approvalMenu').classList.toggle('hidden',!['HEAD','FLEET','ADMIN'].includes(me.user.role));
    renderStats(me.stats||{}); show('home');
  }catch(e){$('#loading').innerHTML=`<h3>ไม่สามารถเปิดระบบได้</h3><p class="muted">${e.message}</p>`}
}
function renderStats(s){$('#todayStats').innerHTML=[['ทั้งหมด',s.total||0],['พร้อม',s.available||0],['ใช้งาน',s.inUse||0],['ซ่อม',s.maintenance||0]].map(([k,v])=>`<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}

async function searchAvailability(startAt,endAt,target='#availabilityResults',selectable=false){
  if(!startAt||!endAt)return toast('กรุณาระบุวันเวลา');
  const d=await api('vehicles.availability',{startAt,endAt});
  const html=d.vehicles.map(v=>`<div class="${selectable?'vehicle-choice':'card item-card'} ${session.selectedVehicleId===v.vehicleId?'selected':''}" data-vehicle="${v.vehicleId}"><div><strong>${v.name}</strong><div class="meta">${v.plate} • ${v.seats||'-'} ที่นั่ง</div></div><span class="badge ${v.available?'success':'danger'}">${v.available?'ว่าง':'ไม่ว่าง'}</span></div>`).join('')||'<div class="card item-card">ไม่พบรถ</div>';
  $(target).innerHTML=html;
  if(selectable){$(target).insertAdjacentHTML('beforeend','<div class="vehicle-choice" data-vehicle=""><div><strong>ให้ผู้ควบคุมจัดรถให้</strong><div class="meta">ไม่ระบุรถล่วงหน้า</div></div><span>›</span></div>');$$(target+' [data-vehicle]').forEach(el=>el.onclick=()=>{if(el.querySelector('.danger'))return toast('รถคันนี้ไม่ว่าง');session.selectedVehicleId=el.dataset.vehicle; $$(target+' [data-vehicle]').forEach(x=>x.classList.toggle('selected',x===el));});}
}

async function loadMyRequests(){
  try{const d=await api('requests.my');$('#requestList').innerHTML=d.requests.map(r=>`<button class="card item-card" style="text-align:left;width:100%" data-id="${r.requestId}"><div class="item-top"><div><h3>${r.requestId}</h3><div class="meta">${r.destination}<br>${fmt(r.startAt)} – ${fmt(r.endAt)}</div></div><span class="badge ${badgeClass(r.status)}">${statusText(r.status)}</span></div></button>`).join('')||'<div class="card item-card">ยังไม่มีคำขอ</div>';$$('#requestList [data-id]').forEach(x=>x.onclick=()=>loadDetail(x.dataset.id));}catch(e){toast(e.message)}}
async function loadDetail(id){
  try{
    const d=await api('requests.detail',{requestId:id}),r=d.request;
    const steps=['WAIT_L1','WAIT_L2','PRECHECK_PENDING','READY','IN_USE','COMPLETED'];
    const current=Math.max(0,steps.indexOf(r.status));
    let actions='';
    if(['ALLOCATED','PRECHECK_PENDING'].includes(r.status)){
      actions=`<button class="btn primary" onclick="openInspection('${id}','BEFORE')">ตรวจสภาพก่อนใช้งาน</button>`;
    }
    if(r.status==='READY'){
      actions=`<button class="btn primary" onclick="startTrip('${id}')">🚙 เริ่มใช้งานรถ</button>`;
    }
    if(r.status==='IN_USE'){
      actions=`<button class="btn secondary" onclick="openInspection('${id}','AFTER')">คืนรถ / บันทึกหลังใช้งาน</button>`;
    }
    $('#detailContent').innerHTML=`<div class="card item-card"><div class="item-top"><div><h3>${r.requestId}</h3><div class="meta">${r.destination}</div></div><span class="badge ${badgeClass(r.status)}">${statusText(r.status)}</span></div><div class="divider"></div><div class="kv"><span>ช่วงเวลา</span><b>${fmt(r.startAt)}<br>${fmt(r.endAt)}</b></div><div class="kv"><span>วัตถุประสงค์</span><b>${r.purpose}</b></div><div class="kv"><span>รถ</span><b>${r.assignedVehicleName||r.requestedVehicleName||'รอจัดรถ'}</b></div><div class="timeline">${steps.map((s,i)=>`<div class="timeline-row"><span class="dot ${i<current?'done':i===current?'current':''}"></span><div>${statusText(s)}</div></div>`).join('')}</div>${actions}</div>`;
    show('requestDetail');
  }catch(e){toast(e.message)}
}
window.startTrip=async(id)=>{
  if(!confirm('ยืนยันเริ่มใช้งานรถหรือไม่?')) return;
  try{
    await api('trip.start',{requestId:id});
    toast('เริ่มใช้งานรถแล้ว');
    await loadDetail(id);
  }catch(e){toast(e.message)}
};

window.openInspection=(id,type)=>{const f=$('#inspectionForm');f.requestId.value=id;f.inspectionType.value=type;$('#inspectionTitle').textContent=type==='BEFORE'?'ตรวจสภาพก่อนใช้งาน':'บันทึกคืนรถ';show('inspection')}

async function loadApprovals(){
  try{const d=await api('approvals.pending');$('#approvalList').innerHTML=d.requests.map(r=>`<div class="card item-card"><div class="item-top"><div><h3>${r.requestId}</h3><div class="meta">${r.requesterName} • ${r.departmentName}<br>${r.destination}<br>${fmt(r.startAt)} – ${fmt(r.endAt)}</div></div><span class="badge ${r.priority==='EMERGENCY'?'danger':r.priority==='URGENT'?'warn':'info'}">${r.priority}</span></div><div class="action-row"><button class="btn primary approve" data-id="${r.requestId}">อนุมัติ</button><button class="btn danger reject" data-id="${r.requestId}">ไม่อนุมัติ</button></div></div>`).join('')||'<div class="card item-card">ไม่มีรายการรออนุมัติ</div>';$$('.approve').forEach(b=>b.onclick=()=>decision(b.dataset.id,'APPROVE'));$$('.reject').forEach(b=>b.onclick=()=>decision(b.dataset.id,'REJECT'));}catch(e){toast(e.message)}}
async function decision(id,decision){try{if(decision==='REJECT'&&!confirm('ยืนยันไม่อนุมัติคำขอนี้?'))return;await api('approvals.decide',{requestId:id,decision});toast('บันทึกแล้ว');loadApprovals()}catch(e){toast(e.message)}}
async function loadFleet(){try{const d=await api('vehicles.list');$('#fleetList').innerHTML=d.vehicles.map(v=>`<div class="card item-card"><div class="item-top"><div><h3>${v.name}</h3><div class="meta">${v.plate} • ${v.seats||'-'} ที่นั่ง</div></div><span class="badge ${v.status==='ACTIVE'?'success':'warn'}">${v.status}</span></div></div>`).join('')}catch(e){toast(e.message)}}

$$('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$$('.back').forEach(b=>b.addEventListener('click',()=>show(b.dataset.back||'home')));
$('#checkAvailBtn').onclick=()=>{const f=new FormData($('#requestForm'));searchAvailability(f.get('startAt'),f.get('endAt'),'#vehicleChoices',true)};
$('#availSearch').onclick=()=>searchAvailability($('#availStart').value,$('#availEnd').value);
$('#requestForm').onsubmit=async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));f.requestedVehicleId=session.selectedVehicleId;const d=await api('requests.create',f);toast(`ส่งคำขอ ${d.requestId} แล้ว`);e.target.reset();session.selectedVehicleId='';show('myRequests')}catch(err){toast(err.message)}};

async function fileToDataUrl(file){return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
$('#inspectionForm').onsubmit=async e=>{
  e.preventDefault();
  const form=e.target;
  const btn=form.querySelector('button[type="submit"]');
  const oldText=btn?btn.textContent:'';
  try{
    if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก...';}
    const fd=new FormData(form);
    const p={requestId:fd.get('requestId'),inspectionType:fd.get('inspectionType'),odometer:Number(fd.get('odometer')),fuelLevel:fd.get('fuelLevel'),hasIncident:!!fd.get('hasIncident'),note:fd.get('note')||'',files:{}};
    for(const k of ['odometerPhoto','vehiclePhoto','incidentPhoto']){
      const file=fd.get(k);
      if(file&&file.size)p.files[k]={name:file.name,type:file.type,dataUrl:await fileToDataUrl(file)};
    }
    const d=await api('trip.inspection',p);
    alert(d.status==='READY'?'✅ บันทึกตรวจสภาพก่อนใช้งานเรียบร้อย รถพร้อมใช้งาน':'✅ บันทึกการคืนรถเรียบร้อย');
    form.reset();
    show('myRequests');
  }catch(err){
    alert('บันทึกไม่สำเร็จ: '+err.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent=oldText;}
  }
};
init();
