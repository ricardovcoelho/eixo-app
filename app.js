// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API = ''; // Vercel API routes — same origin, no URL needed

// ─── AUTH STATE ──────────────────────────────────────────────────────────────
let authToken = localStorage.getItem('eixo_token') || null;
let currentUser = JSON.parse(localStorage.getItem('eixo_user') || 'null');

// ─── API CLIENT ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}/api/${path}`, opts);
  if (res.status === 401 || res.status === 400) {
    let bodyText = '';
    try { bodyText = await res.clone().text(); } catch {}
    const looksLikeAuthError = res.status === 401 || /token|jwt|auth|unauthorized|expired/i.test(bodyText);
    if (looksLikeAuthError && authToken) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        opts.headers.Authorization = `Bearer ${authToken}`;
        const retry = await fetch(`${API}/api/${path}`, opts);
        if (retry.ok) return retry.json();
        if (retry.status === 401) { logout(); return null; }
        try { return await retry.json(); } catch { return null; }
      } else {
        logout();
        return null;
      }
    }
  }
  try { return await res.json(); } catch { return null; }
}
async function tryRefresh() {
  const rt = localStorage.getItem('eixo_refresh_token'); if (!rt) return false;
  try {
    const res = await fetch(`${API}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh', refresh_token: rt }) });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.token) { authToken = data.token; localStorage.setItem('eixo_token', data.token); if(data.refresh_token) localStorage.setItem('eixo_refresh_token', data.refresh_token); return true; }
  } catch {}
  return false;
}
function logout() {
  authToken = null; currentUser = null;
  localStorage.removeItem('eixo_token'); localStorage.removeItem('eixo_refresh_token'); localStorage.removeItem('eixo_user');
  showAuth();
}

// ─── AUTH UI ─────────────────────────────────────────────────────────────────
function showAuth() { document.getElementById('auth-screen').style.display = 'flex'; document.getElementById('app-screen').style.display = 'none'; }
function showApp() {
  document.getElementById('auth-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
  initApp();
  startTokenAutoRefresh();
}
let _tokenRefreshInterval = null;
function startTokenAutoRefresh() {
  if (_tokenRefreshInterval) clearInterval(_tokenRefreshInterval);
  // Renova o token a cada 40 minutos (antes de expirar) enquanto o app estiver aberto
  _tokenRefreshInterval = setInterval(async () => {
    if (authToken) await tryRefresh();
  }, 40 * 60 * 1000);
}
function wireAuth() {
  document.getElementById('goto-signup').addEventListener('click', () => { document.getElementById('auth-login').style.display = 'none'; document.getElementById('auth-signup').style.display = 'block'; });
  document.getElementById('goto-login').addEventListener('click', () => { document.getElementById('auth-signup').style.display = 'none'; document.getElementById('auth-login').style.display = 'block'; });
  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim(), password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error'); errEl.style.display = 'none';
    if (!email || !password) { errEl.textContent = 'Preencha email e senha.'; errEl.style.display = 'block'; return; }
    const btn = document.getElementById('btn-login'); btn.textContent = 'Entrando...'; btn.disabled = true;
    const data = await fetch(`${API}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email, password }) }).then(r => r.json());
    btn.textContent = 'Entrar'; btn.disabled = false;
    if (data.error) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    authToken = data.token; currentUser = data.user;
    localStorage.setItem('eixo_token', data.token); localStorage.setItem('eixo_refresh_token', data.refresh_token); localStorage.setItem('eixo_user', JSON.stringify(data.user));
    showApp();
  });
  document.getElementById('btn-signup').addEventListener('click', async () => {
    const name = document.getElementById('signup-name').value.trim(), email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value, confirm = document.getElementById('signup-confirm').value;
    const errEl = document.getElementById('signup-error'); errEl.style.display = 'none';
    if (!name || !email || !password) { errEl.textContent = 'Preencha todos os campos.'; errEl.style.display = 'block'; return; }
    if (password.length < 6) { errEl.textContent = 'Senha precisa ter ao menos 6 caracteres.'; errEl.style.display = 'block'; return; }
    if (password !== confirm) { errEl.textContent = 'Senhas não conferem.'; errEl.style.display = 'block'; return; }
    const btn = document.getElementById('btn-signup'); btn.textContent = 'Criando conta...'; btn.disabled = true;
    const data = await fetch(`${API}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signup', name, email, password }) }).then(r => r.json());
    btn.textContent = 'Criar conta'; btn.disabled = false;
    if (data.error) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    document.getElementById('login-email').value = email; document.getElementById('login-password').value = password;
    document.getElementById('auth-signup').style.display = 'none'; document.getElementById('auth-login').style.display = 'block';
    document.getElementById('btn-login').click();
  });
  document.getElementById('btn-logout').addEventListener('click', () => { if (confirm('Sair do Eixo?')) logout(); });
}

// ─── STATE ───────────────────────────────────────────────────────────────────
let state = { dreams: [], objectives: [], tasks: [], routines: [], catLabels: {gestao:'GESTÃO',vendas:'VENDAS',pessoal:'PESSOAL',desenv:'DESENVOLVIMENTO'}, customCats: [] };
let editObjId=null, editDreamId=null, editRoutineId=null, editTaskId=null, linkTaskId=null, taskFilter='all', activeDream=null, editCatKey=null;
let objsOpenObj=null, objsOpenKr=null;
let editKrObjId=null, editKrId=null;
let agendaView='day', agendaDate=new Date();
let rescheduleType=null, rescheduleId=null;

// ─── SYNC ────────────────────────────────────────────────────────────────────
function setSyncStatus(s) {
  const dot = document.getElementById('sync-dot'), txt = document.getElementById('sync-status');
  dot.className = 'sync-dot' + (s==='syncing'?' syncing':s==='error'?' error':'');
  txt.textContent = s==='ok'?'Sincronizado':s==='syncing'?'Sincronizando...':'Erro de conexão';
}
async function loadAll() {
  setSyncStatus('syncing');
  try {
    const [dreams, objectives, krs, tasks, routines] = await Promise.all([api('GET','dreams'),api('GET','objectives'),api('GET','krs'),api('GET','tasks'),api('GET','routines')]);
    state.dreams = dreams||[]; state.tasks = tasks||[]; state.routines = routines||[];
    state.objectives = (objectives||[]).map(o => { o.krs = (krs||[]).filter(k => k.objective_id===o.id); return o; });
    try { const cl = localStorage.getItem('eixo_catlabels_'+currentUser?.id); if (cl) { const d = JSON.parse(cl); state.catLabels = d.labels||d; state.customCats = d.custom||[]; } } catch {}
    setSyncStatus('ok');
  } catch(e) { setSyncStatus('error'); console.error('Load error:',e); }
}
function saveCatLabels() { try { localStorage.setItem('eixo_catlabels_'+currentUser?.id, JSON.stringify({labels:state.catLabels,custom:state.customCats||[]})); } catch {} }
async function sbInsert(t,d){setSyncStatus('syncing');const r=await api('POST',t,d);setSyncStatus(r?.error?'error':'ok');return r;}
async function sbUpdate(t,id,d){setSyncStatus('syncing');const r=await api('PATCH',`${t}?id=${id}`,d);setSyncStatus(r?.error?'error':'ok');return r;}
async function sbDelete(t,id){setSyncStatus('syncing');const r=await api('DELETE',`${t}?id=${id}`);setSyncStatus(r?.error?'error':'ok');return r;}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function today(){const t=new Date();t.setHours(0,0,0,0);return t;}
function isOverdue(d){return d&&new Date(d)<today();}
function pct(d,t){return t?Math.round(d/t*100):0;}
function pcBadge(p){return p>=70?'badge-green':p>=35?'badge-amber':'badge-red';}
function pad(n){return n<10?'0'+n:n;}
function fmtDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function chk(){return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';}
function trsh(){return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';}
function edt(){return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';}
function statusBadge(o){if(o.status==='done')return['badge-green','Concluído'];const hasOv=state.tasks.some(t=>t.objective_id===o.id&&!t.done&&isOverdue(t.due_date));if(hasOv||isOverdue(o.due_date))return['badge-red','Atrasado'];return['badge-blue','No prazo'];}
function dPct(did){const objs=state.objectives.filter(o=>o.dream_id===did);if(!objs.length)return 0;let t=0,d=0;objs.forEach(o=>{const ts=state.tasks.filter(x=>x.objective_id===o.id);if(!ts.length)return;t+=ts.length;d+=ts.filter(x=>x.done).length;});return t?pct(d,t):0;}
function oPct(oid){const ts=state.tasks.filter(t=>t.objective_id===oid);return pct(ts.filter(t=>t.done).length,ts.length);}
function dreamBarColor(did){const ids=state.objectives.filter(o=>o.dream_id===did).map(o=>o.id);return state.tasks.some(t=>!t.done&&ids.includes(t.objective_id)&&isOverdue(t.due_date))?'var(--red)':'var(--green)';}
function objBarColor(o){if(o.status==='done')return'var(--green)';return(state.tasks.some(t=>t.objective_id===o.id&&!t.done&&isOverdue(t.due_date))||isOverdue(o.due_date))?'var(--red)':'var(--green)';}

// ─── TOGGLE TASK ─────────────────────────────────────────────────────────────
async function toggleTask(id) {
  const t = state.tasks.find(x=>x.id===id); if(!t)return;
  t.done=!t.done; setSyncStatus('syncing'); await sbUpdate('tasks',id,{done:t.done}); setSyncStatus('ok');
  if(activeDream)renderDreamDetail(activeDream);
  if(document.getElementById('page-tarefas').classList.contains('active'))renderTasks();
  if(document.getElementById('page-dashboard').classList.contains('active'))renderDash();
  if(document.getElementById('page-objetivos').classList.contains('active'))renderObjs();
  if(document.getElementById('page-home').classList.contains('active'))renderHome();
  if(document.getElementById('page-cascata').classList.contains('active'))renderCascata();
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function nav(page,extra,skipHighlight){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  if(!skipHighlight){
    let ni = document.getElementById('nav-'+page) || document.getElementById('nav-sonhos');
    if(ni) ni.classList.add('active');
  }
  const titles={home:['',''],dashboard:['Dashboard','Visão geral'],matriz:['Matriz Foco','Priorize suas tarefas'],sonhos:['Projetos','Seus grandes projetos de vida'],cascata:['Projetos','Seus grandes projetos de vida'],'dream-detail':['Detalhe do Sonho',''],objetivos:['Objetivos & KRs',''],tarefas:['Tarefas',''],rotinas:['Rotinas',''],acoes:['Afazeres','Tarefas do dia a dia'],agenda:['Agenda',''],perfil:['Usuário','Configurações de perfil'],senha:['Senha','Alterar sua senha']};
  const info=titles[page]||['',''];
  document.getElementById('topbar-title').textContent=info[0]; document.getElementById('topbar-sub').textContent=info[1];
  document.querySelector('.topbar').style.display=page==='home'?'none':'flex';
  document.querySelector('.sync-bar').style.display=page==='home'?'none':'flex';
  const act=document.getElementById('topbar-actions'); act.innerHTML='';
  if(page==='sonhos'){act.innerHTML='<button class="btn btn-accent" id="tb1">+ Novo Projeto</button>';document.getElementById('tb1').addEventListener('click',()=>openModal('modal-dream'));}
  if(page==='objetivos'){act.innerHTML='<button class="btn btn-accent" id="tb2">+ Novo Objetivo</button>';document.getElementById('tb2').addEventListener('click',openNewObj);}
  if(page==='tarefas'){act.innerHTML='<button class="btn btn-accent" id="tb3">+ Nova Tarefa</button>';document.getElementById('tb3').addEventListener('click',()=>openNewTask());}
  if(page==='acoes'){act.innerHTML='<button class="btn btn-accent" id="tb4">+ Nova Ação</button>';document.getElementById('tb4').addEventListener('click',openNovoAfazer);}
  if(page==='home')renderHome();
  if(page==='dashboard')renderDash();
  if(page==='matriz')renderMatrizFull(document.getElementById('matriz-full'));
  if(page==='sonhos')renderDreams();
  if(page==='dream-detail'&&extra){activeDream=extra;renderDreamDetail(extra);}
  if(page==='objetivos')renderObjs();
  if(page==='tarefas')renderTasks();
  if(page==='rotinas')renderRoutines();
  if(page==='acoes')renderAcoes();
  if(page==='agenda')renderAgenda();
  if(page==='cascata'){renderCascata();}
  closeSidebar();
}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function openGlass(){document.getElementById('glass-overlay').classList.add('open');}
function closeGlass(){document.getElementById('glass-overlay').classList.remove('open');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('mob-overlay').classList.remove('open');}

// ─── INIT APP ─────────────────────────────────────────────────────────────────
async function initApp(){
  document.getElementById('modals-container').innerHTML=getModalsHTML();
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
  document.getElementById('glass-close').addEventListener('click',closeGlass);
  document.getElementById('glass-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeGlass();});
  document.querySelectorAll('.nav-item[data-page]').forEach(item=>item.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    item.classList.add('active');
    nav(item.dataset.page,null,true);
  }));
  document.getElementById('btn-back').addEventListener('click',()=>nav('sonhos'));
  document.getElementById('burger').addEventListener('click',()=>{document.getElementById('sidebar').classList.toggle('open');document.getElementById('mob-overlay').classList.toggle('open');});
  document.getElementById('mob-overlay').addEventListener('click',closeSidebar);
  document.querySelectorAll('#task-tabs .tab').forEach(tab=>tab.addEventListener('click',()=>{taskFilter=tab.dataset.filter;document.querySelectorAll('#task-tabs .tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');renderTasks();}));
  const theme=localStorage.getItem('eixo_global_theme_'+currentUser?.id)||'light';
  const themeBtn=document.getElementById('global-theme-btn');
  themeBtn.textContent=document.body.classList.contains('dark-theme')?'☀️':'🌙';
  themeBtn.addEventListener('click',()=>{const isDark=document.body.classList.toggle('dark-theme');localStorage.setItem('eixo_global_theme_'+currentUser?.id,isDark?'dark':'light');themeBtn.textContent=isDark?'☀️':'🌙';});
  wireSaveHandlers();
  await loadAll();
  renderHome();
}

// ─── MODALS HTML ─────────────────────────────────────────────────────────────
function getModalsHTML(){return `
<div class="overlay" id="modal-dream-edit"><div class="modal"><button class="modal-close" data-close="modal-dream-edit">×</button><h3>Editar Projeto</h3><div class="fg"><label>Nome</label><input id="de-name"></div><div class="fg"><label>Descrição</label><textarea id="de-desc"></textarea></div><div class="fg"><label>Prazo</label><input id="de-date" type="date"></div><div class="modal-footer"><button class="btn" data-close="modal-dream-edit">Cancelar</button><button class="btn btn-accent" id="btn-save-dream-edit">Salvar</button></div></div></div>
<div class="overlay" id="modal-dream"><div class="modal"><button class="modal-close" data-close="modal-dream">×</button><h3>✦ Novo Projeto</h3><div class="fg"><label>Nome</label><input id="d-name" placeholder="Ex: Liberdade financeira"></div><div class="fg"><label>Descrição</label><textarea id="d-desc"></textarea></div><div class="fg"><label>Prazo</label><input id="d-date" type="date"></div><div class="modal-footer"><button class="btn" data-close="modal-dream">Cancelar</button><button class="btn btn-accent" id="btn-save-dream">Salvar Projeto</button></div></div></div>
<div class="overlay" id="modal-obj"><div class="modal"><button class="modal-close" data-close="modal-obj">×</button><h3 id="obj-modal-title">Novo Objetivo</h3><div class="fg"><label>Objetivo</label><input id="o-name"></div><div class="form-row"><div class="fg"><label>Sonho</label><select id="o-dream"></select></div><div class="fg"><label>Prazo</label><input id="o-date" type="date"></div></div><div class="fg"><label>Status</label><select id="o-status"><option value="on-track">No prazo</option><option value="done">Concluído</option></select></div><hr class="sep"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:10px">KRs</div><div id="kr-inputs"></div><button class="btn btn-sm" id="btn-add-kr">+ Adicionar KR</button><div class="modal-footer"><button class="btn" data-close="modal-obj">Cancelar</button><button class="btn btn-accent" id="btn-save-obj">Salvar</button></div></div></div>
<div class="overlay" id="modal-link"><div class="modal"><button class="modal-close" data-close="modal-link">×</button><h3>Vincular Tarefa</h3><div class="fg"><label>Objetivo</label><select id="lnk-obj"></select></div><div class="fg" id="lnk-kr-group" style="display:none"><label>KR</label><select id="lnk-kr"></select></div><div class="modal-footer"><button class="btn" data-close="modal-link">Cancelar</button><button class="btn btn-accent" id="btn-save-link">Salvar</button></div></div></div>
<div class="overlay" id="modal-task"><div class="modal"><button class="modal-close" data-close="modal-task">×</button><h3 id="task-modal-title">Nova Tarefa</h3><div class="fg"><label>Descrição</label><input id="t-name" placeholder="O que precisa ser feito?"></div><div class="fg"><label>Prazo</label><input id="t-date" type="date"></div><div class="fg"><label>Objetivo (opcional)</label><select id="t-obj"></select></div><div class="fg" id="t-kr-group" style="display:none"><label>KR</label><select id="t-kr"></select></div><div class="modal-footer"><button class="btn" data-close="modal-task">Cancelar</button><button class="btn btn-accent" id="btn-save-task">Salvar</button></div></div></div>
<div class="overlay" id="modal-routine"><div class="modal"><button class="modal-close" data-close="modal-routine">×</button><h3 id="routine-modal-title">Nova Rotina</h3><div class="fg"><label>Nome</label><input id="r-name"></div><div class="form-row"><div class="fg"><label>Categoria</label><select id="r-cat"><option value="gestao">Gestão</option><option value="vendas">Vendas</option><option value="pessoal">Pessoal</option><option value="desenv">Desenvolvimento</option></select></div><div class="fg"><label>Frequência</label><select id="r-freq"><option value="daily">Diária</option><option value="weekdays">Dias úteis (Seg-Sex)</option><option value="weekly">Semanal</option><option value="monthly">Mensal (1º dia)</option><option value="monthly_days">Dia(s) fixo(s) do mês</option><option value="custom_day">Dias específicos da semana</option></select></div></div><div class="fg" id="r-dow-group" style="display:none"><label>Dias da semana</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px"><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="1"> Seg</label><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="2"> Ter</label><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="3"> Qua</label><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="4"> Qui</label><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="5"> Sex</label><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="6"> Sáb</label><label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" class="dow-cb" value="0"> Dom</label></div></div><div class="fg" id="r-mday-group" style="display:none"><label>Dia(s) do mês</label><input id="r-mdays-input" placeholder="Ex: 5, 10, 20" style="margin-bottom:6px"><div style="font-size:11px;color:var(--text3)">Digite os dias separados por vírgula (1 a 31). Ex: 5, 15, 25</div></div><div class="fg" id="r-time-group" style="display:none"><label>Horário (opcional)</label><input id="r-time" type="time"></div><div class="modal-footer"><button class="btn" data-close="modal-routine">Cancelar</button><button class="btn btn-accent" id="btn-save-routine">Salvar</button></div></div></div>
<div class="overlay" id="modal-cat-edit"><div class="modal"><button class="modal-close" data-close="modal-cat-edit">×</button><h3>Renomear Categoria</h3><div class="fg"><label>Nome</label><input id="cat-edit-name"></div><div class="modal-footer"><button class="btn" data-close="modal-cat-edit">Cancelar</button><button class="btn btn-accent" id="btn-save-cat">Salvar</button></div></div></div>
<div class="overlay" id="modal-new-group"><div class="modal"><button class="modal-close" data-close="modal-new-group">×</button><h3>Novo Grupo de Rotinas</h3><div class="fg"><label>Nome do grupo</label><input id="new-group-name" placeholder="Ex: Família, Saúde..."></div><div class="modal-footer"><button class="btn" data-close="modal-new-group">Cancelar</button><button class="btn btn-accent" id="btn-save-new-group">Criar</button></div></div></div>
<div class="overlay" id="modal-kr-edit"><div class="modal" style="max-width:420px"><button class="modal-close" data-close="modal-kr-edit">×</button><h3>Editar KR</h3><div class="fg"><label>Nome</label><input id="kre-name"></div><div class="fg"><label>Prazo</label><input id="kre-date" type="date"></div><div class="modal-footer"><button class="btn" data-close="modal-kr-edit">Cancelar</button><button class="btn btn-accent" id="btn-save-kr-edit">Salvar</button></div></div></div>
<div class="overlay" id="modal-reschedule"><div class="modal" style="max-width:380px"><button class="modal-close" data-close="modal-reschedule">×</button><h3 id="reschedule-title">Reagendar</h3><div style="font-size:13px;color:var(--text2);margin-bottom:16px" id="reschedule-name"></div><div class="fg"><label>Nova data</label><input id="reschedule-date" type="date"></div><div class="modal-footer"><button class="btn" data-close="modal-reschedule">Cancelar</button><button class="btn btn-accent" id="btn-save-reschedule">Reagendar</button></div></div></div>
<div class="glass-overlay" id="glass-overlay"><div class="glass-panel"><button class="glass-panel-close" id="glass-close"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div id="glass-content"></div></div></div>
`;}

// ─── SAVE HANDLERS ───────────────────────────────────────────────────────────
function wireSaveHandlers(){
  document.getElementById('btn-save-dream').addEventListener('click',async()=>{
    const name=document.getElementById('d-name').value.trim();if(!name)return alert('Dê um nome.');
    const row=await sbInsert('dreams',{name,description:document.getElementById('d-desc').value,due_date:document.getElementById('d-date').value||null});
    if(row&&!row.error){state.dreams.push(row);closeModal('modal-dream');renderDreams();renderDash();}else alert(row?.error||'Erro ao salvar.');
  });
  document.getElementById('btn-save-dream-edit').addEventListener('click',async()=>{
    const name=document.getElementById('de-name').value.trim();if(!name)return alert('Dê um nome.');
    const d=state.dreams.find(x=>x.id===editDreamId);if(!d)return;
    d.name=name;d.description=document.getElementById('de-desc').value;d.due_date=document.getElementById('de-date').value||null;
    await sbUpdate('dreams',editDreamId,{name:d.name,description:d.description,due_date:d.due_date});
    closeModal('modal-dream-edit');renderDreams();renderDash();
  });
  document.getElementById('btn-add-kr').addEventListener('click',addKR);
  document.getElementById('btn-save-obj').addEventListener('click',async()=>{
    const name=document.getElementById('o-name').value.trim();if(!name)return alert('Dê um nome.');
    const dreamId=parseInt(document.getElementById('o-dream').value)||null,date=document.getElementById('o-date').value||null,status=document.getElementById('o-status').value;
    const krRows=[];
    document.getElementById('kr-inputs').querySelectorAll('div[data-krid]').forEach((row,i)=>{const n=row.querySelector('.kn'),d=row.querySelector('.kd');if(n&&n.value.trim())krRows.push({name:n.value.trim(),due_date:d&&d.value?d.value:null,existingId:row.dataset.krid?parseInt(row.dataset.krid):null,position:i});});
    if(editObjId){
      const o=state.objectives.find(x=>x.id===editObjId);if(o){o.name=name;o.dream_id=dreamId;o.due_date=date;o.status=status;}
      await sbUpdate('objectives',editObjId,{name,dream_id:dreamId,due_date:date,status});
      for(const kr of krRows){if(kr.existingId)await sbUpdate('krs',kr.existingId,{name:kr.name,due_date:kr.due_date,position:kr.position});else await sbInsert('krs',{objective_id:editObjId,name:kr.name,due_date:kr.due_date,position:kr.position});}
    }else{
      const newObj=await sbInsert('objectives',{name,dream_id:dreamId,due_date:date,status});
      if(newObj&&!newObj.error){newObj.krs=[];for(const kr of krRows){const nk=await sbInsert('krs',{objective_id:newObj.id,name:kr.name,due_date:kr.due_date,position:kr.position});if(nk)newObj.krs.push(nk);}state.objectives.push(newObj);}
    }
    await loadAll();closeModal('modal-obj');editObjId=null;
    if(document.getElementById('page-objetivos').classList.contains('active'))renderObjs();
    if(document.getElementById('page-cascata').classList.contains('active'))renderCascata();
  });
  document.getElementById('btn-save-task').addEventListener('click',async()=>{
    const name=document.getElementById('t-name').value.trim();if(!name)return alert('Descreva a tarefa.');
    const objId=parseInt(document.getElementById('t-obj').value)||null,krId=parseInt(document.getElementById('t-kr').value)||null;
    if(objId&&!krId)return alert('Selecione o KR.');
    if(editTaskId){const t=state.tasks.find(x=>x.id===editTaskId);if(t){t.name=name;t.due_date=document.getElementById('t-date').value||null;t.objective_id=objId;t.kr_id=krId;}await sbUpdate('tasks',editTaskId,{name,due_date:document.getElementById('t-date').value||null,objective_id:objId,kr_id:krId});}
    else{const nt=await sbInsert('tasks',{name,due_date:document.getElementById('t-date').value||null,done:false,objective_id:objId,kr_id:krId,urg:0,imp:0});if(nt&&!nt.error)state.tasks.push(nt);}
    closeModal('modal-task');editTaskId=null;
    if(document.getElementById('page-tarefas').classList.contains('active'))renderTasks();
    if(document.getElementById('page-objetivos').classList.contains('active'))renderObjs();
    if(document.getElementById('page-acoes').classList.contains('active'))renderAcoes();
    if(document.getElementById('page-cascata').classList.contains('active'))renderCascata();
    renderDash();
  });
  document.getElementById('btn-save-link').addEventListener('click',async()=>{
    const t=state.tasks.find(x=>x.id===linkTaskId);if(!t)return;
    const objId=parseInt(document.getElementById('lnk-obj').value)||null,krId=parseInt(document.getElementById('lnk-kr').value)||null;
    if(objId&&!krId)return alert('Selecione o KR.');
    t.objective_id=objId;t.kr_id=krId;await sbUpdate('tasks',t.id,{objective_id:objId,kr_id:krId});closeModal('modal-link');renderTasks();
  });
  document.getElementById('r-freq').addEventListener('change',function(){const v=this.value;document.getElementById('r-dow-group').style.display=v==='custom_day'?'block':'none';document.getElementById('r-mday-group').style.display=v==='monthly_days'?'block':'none';document.getElementById('r-time-group').style.display=(v==='custom_day'||v==='weekdays'||v==='weekly'||v==='monthly_days')?'block':'none';});
  document.getElementById('btn-save-routine').addEventListener('click',async()=>{
    const name=document.getElementById('r-name').value.trim();if(!name)return alert('Dê um nome.');
    const cat=document.getElementById('r-cat').value,freq=document.getElementById('r-freq').value;
    let dow=null;
    if(freq==='custom_day'){const cbs=document.querySelectorAll('.dow-cb:checked');if(!cbs.length)return alert('Selecione pelo menos um dia.');dow=Array.from(cbs).map(cb=>parseInt(cb.value));}
    if(freq==='monthly_days'){
      const raw=document.getElementById('r-mdays-input').value.trim();
      if(!raw)return alert('Digite ao menos um dia do mês (1 a 31).');
      const days=raw.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)&&n>=1&&n<=31);
      if(!days.length)return alert('Digite dias válidos entre 1 e 31, separados por vírgula.');
      dow=days;
    }
    const time=document.getElementById('r-time').value||null,data={name,category:cat,frequency:freq,day_of_week:dow,time};
    if(editRoutineId){const r=state.routines.find(x=>x.id===editRoutineId);if(r)Object.assign(r,data);await sbUpdate('routines',editRoutineId,data);}
    else{const nr=await sbInsert('routines',{...data,checks:{}});if(nr&&!nr.error)state.routines.push(nr);}
    closeModal('modal-routine');editRoutineId=null;
    if(document.getElementById('page-rotinas').classList.contains('active'))renderRoutines();
  });
  document.getElementById('btn-save-cat').addEventListener('click',()=>{
    const cat=document.getElementById('btn-save-cat').dataset.cat,nome=document.getElementById('cat-edit-name').value.trim();if(!nome)return alert('Digite um nome.');
    if(!state.catLabels)state.catLabels={};state.catLabels[cat]=nome.toUpperCase();saveCatLabels();closeModal('modal-cat-edit');renderRoutines();
  });
  document.getElementById('btn-save-kr-edit').addEventListener('click',async()=>{
    const name=document.getElementById('kre-name').value.trim();if(!name)return alert('Dê um nome ao KR.');
    const date=document.getElementById('kre-date').value||null;
    await sbUpdate('krs',editKrId,{name,due_date:date});
    await loadAll();
    closeModal('modal-kr-edit');
    editKrObjId=null;editKrId=null;
    if(document.getElementById('page-objetivos').classList.contains('active'))renderObjs();
    if(document.getElementById('page-cascata').classList.contains('active'))renderCascata();
  });
  document.getElementById('btn-save-new-group').addEventListener('click',()=>{
    const nome=document.getElementById('new-group-name').value.trim();if(!nome)return alert('Digite um nome.');
    const key='custom_'+Date.now();if(!state.customCats)state.customCats=[];state.customCats.push(key);if(!state.catLabels)state.catLabels={};state.catLabels[key]=nome.toUpperCase();
    saveCatLabels();closeModal('modal-new-group');renderRoutines();
  });
  document.getElementById('btn-save-reschedule').addEventListener('click',async()=>{
    const nd=document.getElementById('reschedule-date').value;if(!nd)return alert('Selecione uma data.');
    if(rescheduleType==='task'){const t=state.tasks.find(x=>x.id===rescheduleId);if(t){t.due_date=nd;await sbUpdate('tasks',t.id,{due_date:nd});}}
    closeModal('modal-reschedule');renderAgenda();if(document.getElementById('page-dashboard').classList.contains('active'))renderDash();
  });
  document.getElementById('t-obj').addEventListener('change',function(){const o=state.objectives.find(x=>x.id===parseInt(this.value));const sel=document.getElementById('t-kr'),grp=document.getElementById('t-kr-group');sel.innerHTML='<option value="">— selecione o KR —</option>';if(o&&o.krs.length){o.krs.forEach(kr=>{sel.innerHTML+='<option value="'+kr.id+'">'+kr.name+'</option>';});grp.style.display='block';}else grp.style.display='none';});
  document.getElementById('lnk-obj').addEventListener('change',function(){const o=state.objectives.find(x=>x.id===parseInt(this.value));const sel=document.getElementById('lnk-kr'),grp=document.getElementById('lnk-kr-group');sel.innerHTML='<option value="">— selecione o KR —</option>';if(o&&o.krs.length){o.krs.forEach(kr=>{sel.innerHTML+='<option value="'+kr.id+'">'+kr.name+'</option>';});grp.style.display='block';}else grp.style.display='none';});
}

// ─── OPEN HELPERS ────────────────────────────────────────────────────────────
function openNewObj(){editObjId=null;document.getElementById('obj-modal-title').textContent='Novo Objetivo';document.getElementById('o-name').value='';document.getElementById('o-date').value='';document.getElementById('o-status').value='on-track';document.getElementById('o-dream').innerHTML='<option value="">— nenhum —</option>'+state.dreams.map(d=>'<option value="'+d.id+'">'+d.name+'</option>').join('');document.getElementById('kr-inputs').innerHTML='';addKR();addKR();openModal('modal-obj');}
function openEditObj(id){const o=state.objectives.find(x=>x.id===id);if(!o)return;editObjId=id;document.getElementById('obj-modal-title').textContent='Editar Objetivo';document.getElementById('o-name').value=o.name;document.getElementById('o-date').value=o.due_date||'';document.getElementById('o-status').value=o.status||'on-track';document.getElementById('o-dream').innerHTML='<option value="">— nenhum —</option>'+state.dreams.map(d=>'<option value="'+d.id+'"'+(o.dream_id===d.id?' selected':'')+'>'+d.name+'</option>').join('');document.getElementById('kr-inputs').innerHTML='';o.krs.forEach(kr=>addKR(kr.name,kr.due_date,kr.id));openModal('modal-obj');}
function addKR(name,date,krId){const c=document.getElementById('kr-inputs');const d=document.createElement('div');d.style.cssText='margin-bottom:10px;border:1.5px solid var(--border);border-radius:var(--radius);overflow:hidden';d.dataset.krid=krId||'';const hdr=document.createElement('div');hdr.style.cssText='display:flex;gap:6px;align-items:center;padding:8px 10px;background:var(--bg3)';hdr.innerHTML='<input class="kn" placeholder="Ex: Fechar 5 clientes" value="'+(name||'')+'" style="flex:2;padding:7px 10px;border-radius:6px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-size:13px"><input class="kd" type="date" value="'+(date||'')+'" style="flex:1;padding:7px 8px;border-radius:6px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-size:13px"><button type="button" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:20px;line-height:1;padding:0 4px">×</button>';hdr.querySelector('button').addEventListener('click',()=>d.remove());d.appendChild(hdr);c.appendChild(d);}
function openEditDream(id){const d=state.dreams.find(x=>x.id===id);if(!d)return;editDreamId=id;document.getElementById('de-name').value=d.name;document.getElementById('de-desc').value=d.description||'';document.getElementById('de-date').value=d.due_date||'';openModal('modal-dream-edit');}
function openNewTask(objId,krId){editTaskId=null;document.getElementById('task-modal-title').textContent='Nova Tarefa';document.getElementById('t-name').value='';document.getElementById('t-date').value='';document.getElementById('t-obj').innerHTML='<option value="">— tarefa avulsa —</option>'+state.objectives.map(o=>'<option value="'+o.id+'"'+(o.id===objId?' selected':'')+'>'+o.name+'</option>').join('');const krSel=document.getElementById('t-kr'),krGrp=document.getElementById('t-kr-group');krSel.innerHTML='<option value="">— selecione o KR —</option>';if(objId){const o=state.objectives.find(x=>x.id===objId);if(o)o.krs.forEach(k=>{krSel.innerHTML+='<option value="'+k.id+'"'+(k.id===krId?' selected':'')+'>'+k.name+'</option>';});krGrp.style.display='block';}else krGrp.style.display='none';openModal('modal-task');}
function openEditTask(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;editTaskId=id;document.getElementById('task-modal-title').textContent='Editar Tarefa';document.getElementById('t-name').value=t.name;document.getElementById('t-date').value=t.due_date||'';document.getElementById('t-obj').innerHTML='<option value="">— tarefa avulsa —</option>'+state.objectives.map(o=>'<option value="'+o.id+'"'+(o.id===t.objective_id?' selected':'')+'>'+o.name+'</option>').join('');const krSel=document.getElementById('t-kr'),krGrp=document.getElementById('t-kr-group');krSel.innerHTML='<option value="">— selecione o KR —</option>';if(t.objective_id){const o=state.objectives.find(x=>x.id===t.objective_id);if(o){o.krs.forEach(k=>{krSel.innerHTML+='<option value="'+k.id+'"'+(k.id===t.kr_id?' selected':'')+'>'+k.name+'</option>';});krGrp.style.display='block';}}else krGrp.style.display='none';openModal('modal-task');}
function openNovoAfazer(){editTaskId=null;document.getElementById('task-modal-title').textContent='Novo Afazer';document.getElementById('t-name').value='';document.getElementById('t-date').value='';document.getElementById('t-obj').innerHTML='<option value="">— sem vínculo —</option>';document.getElementById('t-kr-group').style.display='none';openModal('modal-task');}
function openLinkModal(tid){linkTaskId=tid;const t=state.tasks.find(x=>x.id===tid);document.getElementById('lnk-obj').innerHTML='<option value="">— sem objetivo —</option>'+state.objectives.map(o=>'<option value="'+o.id+'"'+(t.objective_id===o.id?' selected':'')+'>'+o.name+'</option>').join('');const sel=document.getElementById('lnk-kr'),grp=document.getElementById('lnk-kr-group');sel.innerHTML='<option value="">— selecione o KR —</option>';if(t.objective_id){const o=state.objectives.find(x=>x.id===t.objective_id);if(o&&o.krs.length){o.krs.forEach(kr=>{sel.innerHTML+='<option value="'+kr.id+'"'+(t.kr_id===kr.id?' selected':'')+'>'+kr.name+'</option>';});grp.style.display='block';}else grp.style.display='none';}else grp.style.display='none';openModal('modal-link');}
function openReschedule(type,id,name,currentDate){rescheduleType=type;rescheduleId=id;document.getElementById('reschedule-title').textContent=type==='task'?'Reagendar Tarefa':'Alterar Data';document.getElementById('reschedule-name').textContent=name;document.getElementById('reschedule-date').value=currentDate||'';openModal('modal-reschedule');}
window.openReschedule=openReschedule;

// ─── GLASS PANEL ─────────────────────────────────────────────────────────────
function openGlassTask(t){
  const obj=state.objectives.find(o=>o.id===t.objective_id),ov=!t.done&&isOverdue(t.due_date);
  let h='<div class="glass-tag glass-tag-task">📋 Tarefa</div><div class="glass-title">'+(t.done?'<span style="text-decoration:line-through;opacity:0.5">':'')+t.name+(t.done?'</span>':'')+(ov?' <span style="color:var(--accent)">⚠</span>':'')+'</div><div class="glass-meta">'+(t.due_date?'<span>'+(ov?'<span style="color:var(--accent);font-weight:700">'+t.due_date+' · Atrasada</span>':t.due_date)+'</span>':'')+(obj?'<span style="color:var(--teal)">'+obj.name+'</span>':'')+'</div>';
  if(t.done)h+='<div style="padding:12px 16px;background:rgba(46,125,82,0.08);border-radius:10px;font-size:13px;color:#2E7D52;font-weight:600">✓ Concluída</div>';
  h+='<div class="glass-divider"></div><div class="glass-section-title">Reagendar</div><input class="glass-date-input" type="date" id="glass-task-date" value="'+(t.due_date?t.due_date.substring(0,10):'')+'">';
  h+='<div class="glass-action-row"><button class="glass-btn '+(t.done?'glass-btn-secondary':'glass-btn-primary')+'" id="glass-toggle-task">'+(t.done?'↩ Reabrir':'✓ Marcar como feita')+'</button><button class="glass-btn glass-btn-secondary" id="glass-reschedule-task">📅 Reagendar</button><button class="glass-btn glass-btn-danger" id="glass-delete-task">🗑 Excluir</button></div>';
  document.getElementById('glass-content').innerHTML=h;
  document.getElementById('glass-toggle-task').addEventListener('click',async()=>{await toggleTask(t.id);closeGlass();renderAgenda();});
  document.getElementById('glass-reschedule-task').addEventListener('click',async()=>{const nd=document.getElementById('glass-task-date').value;if(!nd)return;const tk=state.tasks.find(x=>x.id===t.id);if(tk){tk.due_date=nd;await sbUpdate('tasks',t.id,{due_date:nd});}closeGlass();renderAgenda();renderDash();});
  document.getElementById('glass-delete-task').addEventListener('click',async()=>{if(!confirm('Excluir?'))return;await sbDelete('tasks',t.id);state.tasks=state.tasks.filter(x=>x.id!==t.id);closeGlass();renderAgenda();renderDash();});
  openGlass();
}
function openGlassRoutine(r,dayKey){
  const isDone=r&&r.checks&&r.checks[dayKey]===true;
  const catNames={gestao:'Gestão',vendas:'Vendas',pessoal:'Pessoal',desenv:'Desenvolvimento'},freqNames={daily:'Diária',weekdays:'Seg-Sex',weekly:'Semanal',monthly:'Mensal',custom_day:'Dias específicos'};
  let h='<div class="glass-tag glass-tag-routine">🔄 Rotina</div><div class="glass-title">'+(isDone?'<span style="text-decoration:line-through;opacity:0.5">':'')+r.name+(isDone?'</span>':'')+'</div><div class="glass-meta"><span style="color:var(--teal)">'+(catNames[r.category]||r.category)+'</span><span>'+(freqNames[r.frequency]||r.frequency)+'</span>'+(r.time?'<span>🕐 '+r.time+'</span>':'')+'</div>';
  if(isDone)h+='<div style="padding:12px 16px;background:rgba(53,95,121,0.08);border-radius:10px;font-size:13px;color:var(--teal);font-weight:600">✓ Concluída hoje</div>';
  h+='<div class="glass-action-row"><button class="glass-btn '+(isDone?'glass-btn-secondary':'glass-btn-primary')+'" id="glass-toggle-routine">'+(isDone?'↩ Desmarcar':'✓ Marcar como feita hoje')+'</button></div>';
  document.getElementById('glass-content').innerHTML=h;
  document.getElementById('glass-toggle-routine').addEventListener('click',async()=>{if(!r.checks)r.checks={};r.checks[dayKey]=r.checks[dayKey]===true?null:true;await sbUpdate('routines',r.id,{checks:r.checks});closeGlass();renderAgenda();if(document.getElementById('page-home').classList.contains('active'))renderHome();});
  openGlass();
}
window._toggleRoutine=async function(id,key){const r=state.routines.find(x=>x.id===id);if(!r)return;if(!r.checks)r.checks={};r.checks[key]=r.checks[key]===true?null:true;setSyncStatus('syncing');await sbUpdate('routines',r.id,{checks:r.checks});setSyncStatus('ok');renderAgenda();};
window._toggleDayTask=async function(id){await toggleTask(id);renderAgenda();};
window._openGlassFromDay=function(type,id,dayKey){if(type==='task'){const t=state.tasks.find(x=>x.id===id);if(t)openGlassTask(t);}else if(type==='routine'){const r=state.routines.find(x=>x.id===id);if(r&&dayKey)openGlassRoutine(r,dayKey);}};

// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────
(function(){
  // Aplica o tema IMEDIATAMENTE para evitar flash visual
  const earlyTheme = localStorage.getItem('eixo_global_theme_'+(currentUser?.id||'')) || 'light';
  if (earlyTheme === 'dark') document.body.classList.add('dark-theme');

  const style=document.createElement('style');
  style.textContent=`.auth-wrap{min-height:100vh;background:linear-gradient(145deg,#1B1B3A,#252558,#1a3a4a);display:flex;align-items:center;justify-content:center;padding:24px}.auth-card{background:rgba(255,255,255,0.07);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.15);border-radius:24px;padding:40px;width:min(400px,100%)}.auth-logo{width:52px;height:52px;background:var(--accent);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;margin:0 auto 16px}.auth-title{color:#fff;font-size:26px;font-weight:800;text-align:center;letter-spacing:-0.5px;margin-bottom:4px}.auth-sub{color:rgba(255,255,255,0.4);font-size:13px;text-align:center;margin-bottom:28px}.auth-card .fg{margin-bottom:14px}.auth-card .fg label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.4);margin-bottom:6px}.auth-card .fg input{width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:14px;font-family:inherit;transition:all 0.15s}.auth-card .fg input:focus{outline:none;border-color:var(--accent)}.auth-card .fg input::placeholder{color:rgba(255,255,255,0.3)}.auth-btn{width:100%;padding:13px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px}.auth-btn:disabled{opacity:0.5;cursor:not-allowed}.auth-switch{text-align:center;font-size:13px;color:rgba(255,255,255,0.4);margin-top:16px}.auth-switch span{color:var(--accent);cursor:pointer;font-weight:600}.auth-error{background:rgba(198,93,59,0.15);border:1px solid rgba(198,93,59,0.3);border-radius:8px;padding:10px 14px;font-size:13px;color:#E8856A;margin-bottom:12px}`;
  document.head.appendChild(style);
  if(authToken&&currentUser){tryRefresh().finally(showApp);}else{showAuth();wireAuth();}
})();

// ─── RENDER DASH ─────────────────────────────────────────────────────────────
function renderDash(){
  var done=state.tasks.filter(function(t){return t.done;}).length;
  var avg=state.dreams.length?Math.round(state.dreams.reduce(function(a,d){return a+dPct(d.id);},0)/state.dreams.length):0;
  document.getElementById('dash-metrics').innerHTML='<div class="metric"><div class="metric-val">'+state.dreams.length+'</div><div class="metric-label">Sonhos</div></div><div class="metric"><div class="metric-val">'+state.objectives.length+'</div><div class="metric-label">Objetivos</div></div><div class="metric"><div class="metric-val">'+done+'/'+state.tasks.length+'</div><div class="metric-label">Tarefas feitas</div></div><div class="metric"><div class="metric-val">'+avg+'%</div><div class="metric-label">Progresso geral</div></div>';
  var el=document.getElementById('dash-dreams');
  if(!state.dreams.length){el.innerHTML='<div style="color:var(--text3);padding:24px;text-align:center">Nenhum projeto cadastrado.</div>';}
  else{
    el.innerHTML=state.dreams.map(function(d){
      var p=dPct(d.id),objIds=state.objectives.filter(function(o){return o.dream_id===d.id;}).map(function(o){return o.id;});
      var ovCount=state.tasks.filter(function(t){return !t.done&&objIds.indexOf(t.objective_id)!==-1&&isOverdue(t.due_date);}).length;
      var bc=ovCount>0?'var(--red)':'var(--green)';
      var stxt=ovCount>0?'<span style="font-size:11px;color:var(--red);font-weight:600">⚠ '+ovCount+' tarefa(s) atrasada(s)</span>':'<span style="font-size:11px;color:var(--text3)">'+state.objectives.filter(function(o){return o.dream_id===d.id;}).length+' objetivo(s)</span>';
      return '<div class="dream-card" data-id="'+d.id+'"><div style="display:flex;align-items:flex-start;gap:12px"><div style="flex:1"><div style="font-size:14px;font-weight:700;margin-bottom:4px">'+d.name+'</div>'+stxt+'<div class="progress"><div class="progress-fill" style="width:'+p+'%;background:'+bc+'"></div></div></div><div style="font-size:26px;font-weight:800;color:'+(ovCount>0?'var(--red)':'var(--accent)')+'">'+p+'%</div></div></div>';
    }).join('');
    document.querySelectorAll('#dash-dreams .dream-card').forEach(function(c){c.addEventListener('click',function(){nav('dream-detail',parseInt(this.dataset.id));});});
  }
  renderMatrizFull(document.getElementById('matriz-dash'),false);
}

// ─── RENDER MATRIZ ───────────────────────────────────────────────────────────
function renderMatrizFull(el,showClassify){
  if(!el)return;if(showClassify===undefined)showClassify=true;
  var tod=today(),curM=tod.getMonth(),curY=tod.getFullYear();
  function tStyle(t){if(!t.due_date)return 'color:var(--text3)';var td=new Date(t.due_date);td.setHours(0,0,0,0);var ov=td<tod,cur=td.getMonth()===curM&&td.getFullYear()===curY;return(ov||cur)?'color:var(--text);font-weight:600':'color:var(--text3)';}
  function getQ(t){var u=t.urg||0,i=t.imp||0,isAvulsa=!t.objective_id;if(t.due_date){var td=new Date(t.due_date+'T00:00:00');td.setHours(0,0,0,0);if(td<=tod){if(!u||!i)return isAvulsa?'nui':'ui';}}if(!u||!i)return 'nc';if(u===3&&i===3)return 'ui';if(u<3&&i===3)return 'nui';if(u===3&&i<3)return 'uni';return 'nuni';}
  function postit(t){var obj=state.objectives.find(function(o){return o.id===t.objective_id;});var ov=isOverdue(t.due_date),ts=tStyle(t);return '<div class="postit" data-pid="'+t.id+'"><div class="postit-dot" style="background:'+(ov?'var(--red)':obj?'var(--accent)':'var(--border2)')+'"></div><div><div style="font-size:12px;line-height:1.3;'+ts+'">'+t.name+(ov?' ⚠':'')+'</div>'+(t.due_date?'<div style="font-size:10px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</div>':'')+(obj?'<div style="font-size:10px;color:var(--accent)">'+obj.name.slice(0,24)+'</div>':'')+'</div></div>';}
  var pending=state.tasks.filter(function(t){return !t.done;}),done=state.tasks.filter(function(t){return t.done;});
  var qs={ui:[],nui:[],uni:[],nuni:[],nc:[]};pending.forEach(function(t){qs[getQ(t)].push(t);});
  var todayStr=fmtDate(tod),todayDow=tod.getDay(),yr2=tod.getFullYear(),mo2=tod.getMonth(),todayDayKey='day'+yr2+'-'+mo2+'-w'+todayDow;
  var todayRoutineEvents=getEventsForDate(todayStr).filter(function(e){return e.type==='routine';});
  Object.keys(qs).forEach(function(k){qs[k].sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return new Date(a.due_date)-new Date(b.due_date);});});
  var h='<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text3);text-align:center;margin-bottom:4px">▲ IMPORTANTE</div><div class="matrix-wrap">';
  [{key:'nui',cls:'q-nui',lbl:'🎯 Importante · Planeje',c:'#2D7A3E'},{key:'ui',cls:'q-ui',lbl:'🔥 Urgente & Importante · Foco Total',c:'#C0392B'},{key:'nuni',cls:'q-nuni',lbl:'📌 Pouco Relevante Agora',c:'#888'},{key:'uni',cls:'q-uni',lbl:'⚡ Urgente · Esteja Atento',c:'#B8860B'}].forEach(function(qd){
    h+='<div class="matrix-quadrant '+qd.cls+'"><div class="q-label" style="color:'+qd.c+'">'+qd.lbl+'</div>';
    qs[qd.key].forEach(function(t){h+=postit(t);});
    if(qd.key==='uni'){
      var cc2={gestao:'var(--blue)',vendas:'var(--red)',pessoal:'var(--green)',desenv:'var(--accent)'},fn={daily:'Diária',weekdays:'Seg-Sex',weekly:'Semanal',monthly:'Mensal',custom_day:'Específica'};
      todayRoutineEvents.forEach(function(ev){var r=state.routines.find(function(x){return x.id===ev.id;});var isDone=r&&r.checks&&r.checks[todayDayKey]===true,col=r?cc2[r.category]:'var(--border2)';h+='<div class="postit" style="'+(isDone?'opacity:0.5;':'')+'cursor:default"><div class="postit-dot" style="background:'+col+'"></div><div><div style="font-size:12px;font-weight:600;line-height:1.3;'+(isDone?'text-decoration:line-through;color:var(--text3)':'color:var(--text2)')+'">'+ev.name+'</div><div style="font-size:10px;color:var(--text3)">Rotina'+(r?' · '+(fn[r.frequency]||r.frequency):'')+(r&&r.time?' · '+r.time:'')+'</div></div></div>';});
      if(!qs[qd.key].length&&!todayRoutineEvents.length)h+='<div style="font-size:11px;color:var(--text3);font-style:italic">Nenhuma tarefa</div>';
    }else{if(!qs[qd.key].length)h+='<div style="font-size:11px;color:var(--text3);font-style:italic">Nenhuma tarefa</div>';}
    h+='</div>';
  });
  h+='</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:2px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text3);text-align:center;padding:4px">◄ NÃO URGENTE</div><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text3);text-align:center;padding:4px">URGENTE ►</div></div>';
  if(showClassify&&qs.nc.length){
    h+='<div class="card" style="margin-top:20px"><div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">⚡ Classifique suas tarefas</div>';
    qs.nc.forEach(function(t){
      var ts=tStyle(t);
      h+='<div class="task-classify-row"><div style="flex:1;min-width:100px"><span style="font-size:13px;'+ts+'">'+t.name+'</span>'+(t.due_date?'<span style="font-size:11px;color:'+(isOverdue(t.due_date)?'var(--red)':new Date(t.due_date).getMonth()===curM&&new Date(t.due_date).getFullYear()===curY?'var(--text2)':'var(--text3)')+'"> · '+t.due_date+'</span>':'')+'</div><div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;align-items:center;gap:4px"><span style="font-size:10px;color:var(--text3);width:72px">Urgência:</span>';
      [1,2,3].forEach(function(v){h+='<button class="classify-btn'+(t.urg===v?' sel':'')+'" data-tid="'+t.id+'" data-field="urg" data-val="'+v+'">'+(v===1?'Baixa':v===2?'Média':'Alta')+'</button>';});
      h+='</div><div style="display:flex;align-items:center;gap:4px"><span style="font-size:10px;color:var(--text3);width:72px">Importância:</span>';
      [1,2,3].forEach(function(v){h+='<button class="classify-btn'+(t.imp===v?' sel':'')+'" data-tid="'+t.id+'" data-field="imp" data-val="'+v+'">'+(v===1?'Baixa':v===2?'Média':'Alta')+'</button>';});
      h+='</div></div></div>';
    });
    h+='</div>';
  }
  if(done.length)h+='<div style="margin-top:12px;font-size:11px;color:var(--text3);text-align:center">'+done.length+' tarefa(s) concluída(s) não exibida(s)</div>';
  el.innerHTML=h;
  el.querySelectorAll('.classify-btn').forEach(function(btn){btn.addEventListener('click',async function(){var t=state.tasks.find(function(x){return x.id===parseInt(btn.dataset.tid);});if(!t)return;t[btn.dataset.field]=parseInt(btn.dataset.val);await sbUpdate('tasks',t.id,{urg:t.urg,imp:t.imp});renderDash();if(document.getElementById('page-matriz').classList.contains('active'))renderMatrizFull(document.getElementById('matriz-full'));});});
  el.querySelectorAll('.postit[data-pid]').forEach(function(p){p.addEventListener('click',async function(){var t=state.tasks.find(function(x){return x.id===parseInt(p.dataset.pid);});if(!t)return;if(confirm('Reclassificar "'+t.name+'"?')){t.urg=0;t.imp=0;await sbUpdate('tasks',t.id,{urg:0,imp:0});renderDash();if(document.getElementById('page-matriz').classList.contains('active'))renderMatrizFull(document.getElementById('matriz-full'));}});});
}

// ─── RENDER DREAMS ───────────────────────────────────────────────────────────
function renderDreams(){
  var el=document.getElementById('dreams-list');
  if(!state.dreams.length){el.innerHTML='<div style="color:var(--text3);padding:24px;text-align:center">Nenhum projeto ainda.</div>';return;}
  el.innerHTML=state.dreams.map(function(d){var p=dPct(d.id),bc=dreamBarColor(d.id);return '<div class="dream-card" data-id="'+d.id+'"><div style="display:flex;align-items:flex-start;gap:12px"><div style="flex:1"><div style="font-size:15px;font-weight:700;margin-bottom:4px">'+d.name+'</div><div style="font-size:12px;color:var(--text2);margin-bottom:6px">'+(d.description||'')+'</div><div style="font-size:11px;color:var(--text3)">'+state.objectives.filter(function(o){return o.dream_id===d.id;}).length+' objetivo(s) · '+(d.due_date||'—')+'</div><div class="progress"><div class="progress-fill" style="width:'+p+'%;background:'+bc+'"></div></div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0"><div style="font-size:26px;font-weight:800;color:var(--accent)">'+p+'%</div><div style="display:flex;gap:4px"><button class="btn btn-sm btn-icon edt-dream" data-id="'+d.id+'">'+edt()+'</button><button class="btn btn-sm btn-icon del-dream" data-id="'+d.id+'">'+trsh()+'</button></div></div></div></div>';}).join('');
  document.querySelectorAll('#dreams-list .dream-card').forEach(function(c){c.addEventListener('click',function(e){if(!e.target.closest('.edt-dream,.del-dream'))nav('dream-detail',parseInt(this.dataset.id));});});
  document.querySelectorAll('.edt-dream').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openEditDream(parseInt(this.dataset.id));});});
  document.querySelectorAll('.del-dream').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();if(!confirm('Excluir?'))return;await sbDelete('dreams',parseInt(b.dataset.id));state.dreams=state.dreams.filter(function(d){return d.id!==parseInt(b.dataset.id);});renderDreams();});});
}

// ─── RENDER DREAM DETAIL ─────────────────────────────────────────────────────
function renderDreamDetail(did){
  var d=state.dreams.find(function(x){return x.id===did;});if(!d)return;
  var p=dPct(d.id),bc=dreamBarColor(d.id),objs=state.objectives.filter(function(o){return o.dream_id===d.id;});
  document.getElementById('topbar-title').textContent=d.name;
  var h='<div class="detail-dream"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px"><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);font-weight:700;margin-bottom:6px">✦ Projeto</div><div style="font-size:20px;font-weight:800">'+d.name+'</div><div style="font-size:13px;color:var(--text2);margin-top:6px">'+(d.description||'')+'</div></div><div style="text-align:right;flex-shrink:0"><div style="font-size:38px;font-weight:800;color:var(--accent);line-height:1">'+p+'%</div><div style="font-size:11px;color:var(--text3)">realizado</div></div></div><div class="progress" style="height:6px"><div class="progress-fill" style="width:'+p+'%;background:'+bc+'"></div></div><div style="font-size:12px;color:var(--text3);margin-top:8px">Prazo: '+(d.due_date||'—')+' · '+objs.length+' objetivo(s)</div></div>';
  objs.forEach(function(o){
    var op=oPct(o.id),ts=state.tasks.filter(function(t){return t.objective_id===o.id;}),sb=statusBadge(o),obc=objBarColor(o);
    h+='<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px;box-shadow:var(--shadow)"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><div style="flex:1;font-size:14px;font-weight:700">'+o.name+'</div><span class="badge '+sb[0]+'">'+sb[1]+'</span><span class="badge '+pcBadge(op)+'">'+op+'%</span>';
    h+=o.status==='done'?'<button class="btn btn-sm toggle-done-d" data-id="'+o.id+'" style="background:var(--green-bg);color:var(--green);border-color:var(--green);font-size:11px;font-weight:700">✓ Concluído</button>':'<button class="btn btn-sm toggle-done-d" data-id="'+o.id+'" style="font-size:11px">Marcar concluído</button>';
    h+='</div><div class="progress"><div class="progress-fill" style="width:'+op+'%;background:'+obc+'"></div></div><div style="font-size:11px;color:var(--text3);margin-bottom:12px">Prazo: '+(o.due_date||'—')+'</div>';
    o.krs.forEach(function(kr){
      var krt=ts.filter(function(t){return t.kr_id===kr.id;});krt.sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date.localeCompare(b.due_date);});
      var krd=krt.filter(function(t){return t.done;}).length,kp=pct(krd,krt.length),krOv=!kr.status&&isOverdue(kr.due_date),hasOvT=krt.some(function(t){return !t.done&&isOverdue(t.due_date);});
      var col=kr.status==='done'?'var(--green)':krd===krt.length&&krt.length?'var(--green)':hasOvT||krOv?'var(--red)':krd>0?'var(--accent)':'var(--border2)';
      var krUid='kr-tasks-'+o.id+'-'+kr.id;
      h+='<div style="margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden"><div class="kr-expand-hdr" data-target="'+krUid+'" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);cursor:pointer;user-select:none"><div class="kr-dot" style="background:'+col+'"></div><span style="flex:1;font-weight:600;'+(krOv||hasOvT?'color:var(--red)':'')+'">'+kr.name+(krOv||hasOvT?' ⚠':'')+'</span>'+(kr.due_date?'<span style="font-size:11px;color:'+(krOv?'var(--red)':'var(--text3)')+'">'+kr.due_date+'</span>':'')+(krt.length?'<span class="badge '+pcBadge(kp)+'">'+kp+'%</span>':'')+'<span class="kr-chevron" style="font-size:12px;color:var(--text3);transition:transform 0.2s">▼</span></div>';
      h+='<div id="'+krUid+'" style="display:none">';
      if(krt.length){h+='<div style="padding:6px 12px 6px 28px;background:var(--bg2)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);font-weight:700;margin-bottom:4px">Plano de Ação</div>';krt.forEach(function(t){var ov=!t.done&&isOverdue(t.due_date);h+='<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)"><div class="check-box'+(t.done?' done':'')+'" data-task="'+t.id+'">'+chk()+'</div><span style="flex:1;font-size:13px;'+(t.done?'text-decoration:line-through;color:var(--text3)':ov?'color:var(--red);font-weight:600':'')+'">'+t.name+(ov?' ⚠':'')+'</span>'+(t.due_date?'<span style="font-size:11px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</span>':'')+'</div>';});h+='</div>';}
      else{h+='<div style="padding:10px 12px 10px 28px;font-size:12px;color:var(--text3)">Nenhuma tarefa vinculada.</div>';}
      h+='</div></div>';
    });
    h+='</div>';
  });
  if(!objs.length)h+='<div style="color:var(--text3);padding:24px;text-align:center">Nenhum objetivo vinculado.</div>';
  var el=document.getElementById('dream-detail-content');el.innerHTML=h;
  el.querySelectorAll('.check-box').forEach(function(b){b.addEventListener('click',function(){toggleTask(parseInt(this.dataset.task));});});
  el.querySelectorAll('.toggle-done-d').forEach(function(b){b.addEventListener('click',async function(){var o=state.objectives.find(function(x){return x.id===parseInt(b.dataset.id);});if(!o)return;o.status=o.status==='done'?'on-track':'done';await sbUpdate('objectives',o.id,{status:o.status});renderDreamDetail(activeDream);});});
  el.querySelectorAll('.kr-expand-hdr').forEach(function(hdr){hdr.addEventListener('click',function(){var target=document.getElementById(this.dataset.target),chevron=this.querySelector('.kr-chevron');if(!target)return;var isOpen=target.style.display!=='none';target.style.display=isOpen?'none':'block';chevron.style.transform=isOpen?'':'rotate(180deg)';});});
}

// ─── RENDER OBJS ─────────────────────────────────────────────────────────────
function renderObjs(){
  var el=document.getElementById('obj-list');
  if(!state.objectives.length){el.innerHTML='<div style="color:var(--text3);padding:24px;text-align:center">Nenhum objetivo cadastrado.</div>';return;}
  var h='';
  state.objectives.forEach(function(o){
    var dream=state.dreams.find(function(d){return d.id===o.dream_id;}),op=oPct(o.id),sb=statusBadge(o),obc=objBarColor(o);
    var isObjOpen = objsOpenObj===o.id;
    h+='<div class="card" style="padding:0;overflow:hidden">';
    // Header — clicável para expandir
    h+='<div class="objs-obj-hdr" data-id="'+o.id+'" style="padding:14px 18px;cursor:pointer;transition:background 0.15s">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">';
    h+='<div style="display:flex;align-items:flex-start;gap:10px;flex:1">';
    h+='<svg class="objs-chev" style="margin-top:3px;transition:transform 0.2s;flex-shrink:0;'+(isObjOpen?'transform:rotate(90deg)':'')+'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
    h+='<div><div style="font-size:14px;font-weight:600">'+o.name+'</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'+(dream?'<span class="badge badge-amber">'+dream.name+'</span>':'')+'<span class="badge '+sb[0]+'">'+sb[1]+'</span><span style="font-size:11px;color:var(--text3)">· '+(o.due_date||'sem prazo')+'</span></div></div>';
    h+='</div>';
    h+='<div style="display:flex;align-items:center;gap:6px;flex-shrink:0" onclick="event.stopPropagation()"><span class="badge '+pcBadge(op)+'" style="font-size:13px;padding:4px 10px">'+op+'%</span>';
    h+=o.status==='done'?'<button class="btn btn-sm toggle-done" data-id="'+o.id+'" style="background:var(--green-bg);color:var(--green);border-color:var(--green);font-size:11px;font-weight:700">✓ Concluído</button>':'<button class="btn btn-sm toggle-done" data-id="'+o.id+'" style="font-size:11px">Marcar concluído</button>';
    h+='<button class="btn btn-sm btn-icon edt-obj" data-id="'+o.id+'">'+edt()+'</button><button class="btn btn-sm btn-icon del-obj" data-id="'+o.id+'">'+trsh()+'</button></div>';
    h+='</div>';
    h+='<div class="progress" style="margin-top:10px"><div class="progress-fill" style="width:'+op+'%;background:'+obc+'"></div></div>';
    h+='</div>';

    // Corpo — KRs (visível só se expandido)
    h+='<div class="objs-obj-body" style="display:'+(isObjOpen?'block':'none')+'">';
    o.krs.forEach(function(kr){
      var krtasks=state.tasks.filter(function(t){return t.objective_id===o.id&&t.kr_id===kr.id;});krtasks.sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date.localeCompare(b.due_date);});
      var krd=krtasks.filter(function(t){return t.done;}).length,kp=pct(krd,krtasks.length),krDone=kr.status==='done',krOv=!krDone&&isOverdue(kr.due_date),hasOvT=krtasks.some(function(t){return !t.done&&isOverdue(t.due_date);});
      var col=krDone||krd===krtasks.length&&krtasks.length?'var(--green)':hasOvT||krOv?'var(--red)':krd>0?'var(--accent)':'var(--border2)';
      var isKrOpen = objsOpenKr===kr.id;
      h+='<div style="border-top:1px solid var(--border)">';
      h+='<div class="objs-kr-hdr" data-id="'+kr.id+'" style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);flex-wrap:wrap;cursor:pointer">';
      h+='<svg class="objs-chev" style="transition:transform 0.2s;flex-shrink:0;'+(isKrOpen?'transform:rotate(90deg)':'')+'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
      h+='<div class="kr-dot" style="background:'+col+'"></div><div style="flex:1;min-width:120px"><div style="font-size:13px;font-weight:700;'+(krDone?'text-decoration:line-through;color:var(--text3)':krOv||hasOvT?'color:var(--red)':'color:var(--text)')+'">'+kr.name+(krOv||hasOvT?' ⚠':'')+'</div>'+(kr.due_date?'<div style="font-size:11px;color:'+(krOv?'var(--red)':'var(--text3)')+';margin-top:1px">Prazo: '+kr.due_date+'</div>':'')+'</div>';
      h+=(krtasks.length?'<span class="badge '+pcBadge(kp)+'">'+kp+'%</span>':'');
      h+='<div onclick="event.stopPropagation()" style="display:flex;gap:6px">';
      h+=krDone?'<button class="btn btn-sm toggle-kr-done" data-objid="'+o.id+'" data-krid="'+kr.id+'" style="font-size:11px;background:var(--green-bg);color:var(--green);border-color:var(--green);font-weight:700">✓ Concluído</button>':'<button class="btn btn-sm toggle-kr-done" data-objid="'+o.id+'" data-krid="'+kr.id+'" style="font-size:11px">Marcar concluído</button>';
      h+='<button class="btn btn-sm btn-accent add-task-kr" data-objid="'+o.id+'" data-krid="'+kr.id+'" style="font-size:11px;padding:4px 10px">+ Tarefa</button>';
      h+='<button class="btn btn-sm btn-icon edt-kr" data-objid="'+o.id+'" data-krid="'+kr.id+'" style="padding:5px">'+edt()+'</button>';
      h+='<button class="btn btn-sm btn-icon del-kr" data-objid="'+o.id+'" data-krid="'+kr.id+'" style="padding:5px">'+trsh()+'</button></div></div>';
      h+='<div class="objs-kr-body" style="display:'+(isKrOpen?'block':'none')+'">';
      if(krtasks.length){h+='<div style="padding:4px 14px 8px 36px;background:var(--bg2)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);font-weight:700;padding:6px 0 4px">Plano de Ação</div>';krtasks.forEach(function(t){var ov=!t.done&&isOverdue(t.due_date);h+='<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)"><div class="check-box'+(t.done?' done':'')+'" data-task="'+t.id+'">'+chk()+'</div><span style="flex:1;font-size:13px;'+(t.done?'text-decoration:line-through;color:var(--text3)':ov?'color:var(--red);font-weight:600':'')+'">'+t.name+(ov?' ⚠':'')+'</span>'+(t.due_date?'<span style="font-size:11px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</span>':'')+'<button class="btn btn-sm btn-icon edt-task" data-id="'+t.id+'">'+edt()+'</button><button class="btn btn-sm btn-icon del-task-obj" data-id="'+t.id+'">'+trsh()+'</button></div>';});h+='</div>';}
      else{h+='<div style="padding:10px 14px 10px 36px;font-size:12px;color:var(--text3)">Nenhuma tarefa. Clique em "+ Tarefa".</div>';}
      h+='</div></div>';
    });
    h+='</div></div>';
  });
  el.innerHTML=h;

  // Toggle objetivo expand
  el.querySelectorAll('.objs-obj-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){
      var id=parseInt(this.dataset.id);
      objsOpenObj = objsOpenObj===id ? null : id;
      objsOpenKr = null;
      renderObjs();
    });
  });
  // Toggle KR expand
  el.querySelectorAll('.objs-kr-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){
      var id=parseInt(this.dataset.id);
      objsOpenKr = objsOpenKr===id ? null : id;
      renderObjs();
    });
  });

  el.querySelectorAll('.check-box').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();toggleTask(parseInt(this.dataset.task));});});
  el.querySelectorAll('.toggle-done').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();var o=state.objectives.find(function(x){return x.id===parseInt(b.dataset.id);});if(!o)return;o.status=o.status==='done'?'on-track':'done';await sbUpdate('objectives',o.id,{status:o.status});renderObjs();});});
  el.querySelectorAll('.toggle-kr-done').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();var o=state.objectives.find(function(x){return x.id===parseInt(b.dataset.objid);});if(!o)return;var kr=o.krs.find(function(x){return x.id===parseInt(b.dataset.krid);});if(!kr)return;kr.status=kr.status==='done'?'open':'done';await sbUpdate('krs',kr.id,{status:kr.status});renderObjs();});});
  el.querySelectorAll('.edt-obj').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openEditObj(parseInt(this.dataset.id));});});
  el.querySelectorAll('.del-obj').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();if(!confirm('Excluir?'))return;await sbDelete('objectives',parseInt(b.dataset.id));await loadAll();renderObjs();});});
  el.querySelectorAll('.add-task-kr').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openNewTask(parseInt(b.dataset.objid),parseInt(b.dataset.krid));});});
  el.querySelectorAll('.edt-kr').forEach(function(b){b.addEventListener('click',function(e){
    e.stopPropagation();
    var o=state.objectives.find(function(x){return x.id===parseInt(b.dataset.objid);});if(!o)return;
    var kr=o.krs.find(function(x){return x.id===parseInt(b.dataset.krid);});if(!kr)return;
    editKrObjId=o.id; editKrId=kr.id;
    document.getElementById('kre-name').value=kr.name;
    document.getElementById('kre-date').value=kr.due_date||'';
    openModal('modal-kr-edit');
  });});
  el.querySelectorAll('.del-kr').forEach(function(b){b.addEventListener('click',async function(e){
    e.stopPropagation();
    if(!confirm('Excluir este KR e todas as suas tarefas vinculadas?'))return;
    await sbDelete('krs',parseInt(b.dataset.krid));
    state.tasks=state.tasks.filter(function(t){return t.kr_id!==parseInt(b.dataset.krid);});
    await loadAll();
    renderObjs();
  });});
  el.querySelectorAll('.edt-task').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openEditTask(parseInt(this.dataset.id));});});
  el.querySelectorAll('.del-task-obj').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();if(!confirm('Excluir tarefa?'))return;await sbDelete('tasks',parseInt(b.dataset.id));state.tasks=state.tasks.filter(function(t){return t.id!==parseInt(b.dataset.id);});renderObjs();});});
}

// ─── RENDER TASKS ────────────────────────────────────────────────────────────
function renderTasks(){
  var el=document.getElementById('task-list');
  var tasks=state.tasks.filter(function(t){if(taskFilter==='pending')return !t.done;if(taskFilter==='done')return t.done;return true;});
  tasks.sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date.localeCompare(b.due_date);});
  if(!tasks.length){el.innerHTML='<div style="color:var(--text3);padding:24px;text-align:center">Nenhuma tarefa.</div>';return;}
  var h='<div class="card">';
  tasks.forEach(function(t){
    var obj=state.objectives.find(function(o){return o.id===t.objective_id;}),kr=obj?obj.krs.find(function(k){return k.id===t.kr_id;}):null,ov=!t.done&&isOverdue(t.due_date);
    h+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap"><div class="check-box'+(t.done?' done':'')+'" data-task="'+t.id+'">'+chk()+'</div><span style="flex:1;min-width:100px;'+(t.done?'text-decoration:line-through;color:var(--text3)':ov?'color:var(--red);font-weight:600':'')+'">'+t.name+(ov?' ⚠':'')+'</span><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
    h+=obj?'<span class="badge badge-amber link-obj" data-tid="'+t.id+'" style="cursor:pointer">'+(obj.name.length>20?obj.name.slice(0,20)+'…':obj.name)+'</span>':'<span class="badge badge-gray link-obj" data-tid="'+t.id+'" style="cursor:pointer;opacity:0.6">+ Objetivo</span>';
    if(kr){h+='<span style="font-size:11px;color:var(--text3)">›</span><span class="badge badge-green link-kr" data-tid="'+t.id+'" style="cursor:pointer">'+(kr.name.length>20?kr.name.slice(0,20)+'…':kr.name)+'</span>';}
    else if(obj){h+='<span style="font-size:11px;color:var(--text3)">›</span><span class="badge badge-gray link-kr" data-tid="'+t.id+'" style="cursor:pointer;opacity:0.6">+ KR</span>';}
    h+='</div>'+(t.due_date?'<span style="font-size:11px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</span>':'')+'<button class="btn btn-sm btn-icon edt-task" data-id="'+t.id+'">'+edt()+'</button><button class="btn btn-sm btn-icon del-task" data-id="'+t.id+'">'+trsh()+'</button></div>';
  });
  h+='</div>';el.innerHTML=h;
  el.querySelectorAll('.check-box').forEach(function(b){b.addEventListener('click',function(){toggleTask(parseInt(this.dataset.task));});});
  el.querySelectorAll('.link-obj,.link-kr').forEach(function(b){b.addEventListener('click',function(){openLinkModal(parseInt(this.dataset.tid));});});
  el.querySelectorAll('.edt-task').forEach(function(b){b.addEventListener('click',function(){openEditTask(parseInt(this.dataset.id));});});
  el.querySelectorAll('.del-task').forEach(function(b){b.addEventListener('click',async function(){await sbDelete('tasks',parseInt(b.dataset.id));state.tasks=state.tasks.filter(function(t){return t.id!==parseInt(b.dataset.id);});renderTasks();});});
}

// ─── RENDER ROUTINES ─────────────────────────────────────────────────────────
function renderRoutines(){
  var el=document.getElementById('routine-list');
  var yr=new Date().getFullYear(),mo=new Date().getMonth();
  var prevMoKey='mo'+yr+'-'+(mo===0?11:mo-1),curMoKey='mo'+yr+'-'+mo;
  function wk(w){return 'wk'+yr+'-'+mo+'-'+w;}
  var DAYS=['D','S','T','Q','Q','S','S'];
  var defaultCats=[{key:'gestao',label:'GESTÃO'},{key:'vendas',label:'VENDAS'},{key:'pessoal',label:'PESSOAL'},{key:'desenv',label:'DESENVOLVIMENTO'}];
  var customCatList=(state.customCats||[]).map(function(k){return {key:k,label:state.catLabels&&state.catLabels[k]?state.catLabels[k]:k.toUpperCase()};});
  var cats=defaultCats.concat(customCatList);
  var hdr='<div class="r-hdr"><div style="font-size:10px;font-weight:700;color:var(--text3)">Rotina</div><div class="r-lbl">Ant</div><div class="r-lbl">Atual</div><div></div><div class="r-lbl">S1</div><div class="r-lbl">S2</div><div class="r-lbl">S3</div><div class="r-lbl">S4</div><div class="r-lbl">S5</div><div></div><div class="r-lbl">D</div><div class="r-lbl">S</div><div class="r-lbl">T</div><div class="r-lbl">Q</div><div class="r-lbl">Q</div><div class="r-lbl">S</div><div class="r-lbl">S</div><div></div></div>';
  var h='';
  cats.forEach(function(cat){
    var rs=state.routines.filter(function(r){return r.category===cat.key;}),catLabel=state.catLabels&&state.catLabels[cat.key]?state.catLabels[cat.key]:cat.label,isCustom=(state.customCats||[]).indexOf(cat.key)!==-1;
    h+='<div class="r-section"><div class="r-section-hdr"><div style="display:flex;align-items:center;gap:6px"><span class="r-cat-pill">'+catLabel+'</span><button class="btn btn-sm btn-icon edt-cat" data-cat="'+cat.key+'" style="padding:4px">'+edt()+'</button>'+(isCustom?'<button class="btn btn-sm btn-icon del-cat" data-cat="'+cat.key+'" style="padding:4px;color:var(--red)">'+trsh()+'</button>':'')+'</div><button class="btn btn-sm btn-accent add-r" data-cat="'+cat.key+'">+ Rotina</button></div>';
    h+='<div class="r-table">'+hdr;
    if(!rs.length){h+='<div style="padding:14px 12px;font-size:13px;color:var(--text3)">Nenhuma rotina.</div>';}
    else{
      rs.forEach(function(r){
        var checks=r.checks||{},pv=checks[prevMoKey],cv=checks[curMoKey];
        h+='<div class="r-row"><div style="font-size:13px;font-weight:500">'+r.name+'</div>';
        h+='<div class="rcell"><div class="rdot'+(pv===true?' ok':pv===false?' nok':'')+'" data-rid="'+r.id+'" data-key="'+prevMoKey+'"></div></div>';
        h+='<div class="rcell"><div class="rdot'+(cv===true?' ok':cv===false?' nok':'')+'" data-rid="'+r.id+'" data-key="'+curMoKey+'"></div></div><div></div>';
        var freq2=r.frequency,rdow2=r.day_of_week!==null&&r.day_of_week!==undefined?parseInt(r.day_of_week):-1;
        function wkActive(w){return freq2==='daily'||freq2==='weekdays'||freq2==='weekly'||freq2==='custom_day'||((freq2==='monthly'||freq2==='monthly_days')&&w===4);}
        function dayActive(dow){
          if(freq2==='daily')return true;
          if(freq2==='weekdays')return dow>=1&&dow<=5;
          if(freq2==='weekly')return dow===1;
          if(freq2==='custom_day'){
            var days=Array.isArray(r.day_of_week)?r.day_of_week:[r.day_of_week];
            return days.indexOf(dow)!==-1;
          }
          return false;
        }
        for(var w=1;w<=5;w++){var wkey=wk(w),wv=checks[wkey],wa=wkActive(w);if(wa){h+='<div class="rcell"><div class="rsq'+(wv===true?' ok':wv===false?' nok':'')+'" data-rid="'+r.id+'" data-key="'+wkey+'">S'+w+'</div></div>';}else{h+='<div class="rcell"><div style="width:22px;height:22px;border-radius:4px;border:1.5px solid var(--border);background:var(--bg2)"></div></div>';}}
        h+='<div></div>';
        for(var d2=0;d2<7;d2++){var dkey='day'+yr+'-'+mo+'-w'+d2,dv=checks[dkey],da=dayActive(d2);if(da){h+='<div class="rcell"><div class="rsq'+(dv===true?' ok':dv===false?' nok':'')+'" data-rid="'+r.id+'" data-key="'+dkey+'">'+DAYS[d2]+'</div></div>';}else{h+='<div class="rcell"><div style="width:22px;height:22px;border-radius:4px;border:1.5px solid var(--border);background:var(--bg2)"></div></div>';}}
        h+='<div class="rcell" style="display:flex;gap:3px"><button class="btn btn-sm btn-icon edt-r" data-id="'+r.id+'">'+edt()+'</button><button class="btn btn-sm btn-icon del-r" data-id="'+r.id+'">'+trsh()+'</button></div></div>';
      });
    }
    h+='</div></div>';
  });
  h+='<div style="margin-top:8px"><button class="btn btn-sm" id="btn-new-group" style="width:100%;justify-content:center;color:var(--accent);border-color:var(--accent-border)">+ Novo Grupo de Rotinas</button></div>';
  el.innerHTML=h;
  el.querySelectorAll('.rdot[data-rid],.rsq[data-rid]').forEach(function(c){c.addEventListener('click',async function(){var r=state.routines.find(function(x){return x.id===parseInt(c.dataset.rid);});if(!r)return;if(!r.checks)r.checks={};var cur=r.checks[c.dataset.key];r.checks[c.dataset.key]=cur===null||cur===undefined?true:cur===true?false:null;await sbUpdate('routines',r.id,{checks:r.checks});renderRoutines();});});
  el.querySelectorAll('.add-r').forEach(function(b){b.addEventListener('click',function(){document.getElementById('r-cat').value=b.dataset.cat;document.getElementById('routine-modal-title').textContent='Nova Rotina';editRoutineId=null;document.getElementById('r-name').value='';document.getElementById('r-freq').value='daily';openModal('modal-routine');});});
  el.querySelectorAll('.edt-r').forEach(function(b){b.addEventListener('click',function(){var r=state.routines.find(function(x){return x.id===parseInt(b.dataset.id);});if(!r)return;editRoutineId=r.id;document.getElementById('routine-modal-title').textContent='Editar Rotina';document.getElementById('r-name').value=r.name;document.getElementById('r-cat').value=r.category;document.getElementById('r-freq').value=r.frequency;document.getElementById('r-time').value=r.time||'';document.querySelectorAll('.dow-cb').forEach(function(cb){cb.checked=false;});document.getElementById('r-mdays-input').value='';if(r.frequency==='custom_day'&&r.day_of_week!=null){var days=Array.isArray(r.day_of_week)?r.day_of_week:[r.day_of_week];days.forEach(function(d){var cb=document.querySelector('.dow-cb[value="'+d+'"]');if(cb)cb.checked=true;});}if(r.frequency==='monthly_days'&&r.day_of_week!=null){var mdays=Array.isArray(r.day_of_week)?r.day_of_week:[r.day_of_week];document.getElementById('r-mdays-input').value=mdays.join(', ');}document.getElementById('r-dow-group').style.display=r.frequency==='custom_day'?'block':'none';document.getElementById('r-mday-group').style.display=r.frequency==='monthly_days'?'block':'none';document.getElementById('r-time-group').style.display=(r.frequency==='custom_day'||r.frequency==='weekdays'||r.frequency==='weekly'||r.frequency==='monthly_days')?'block':'none';openModal('modal-routine');});});
  el.querySelectorAll('.del-r').forEach(function(b){b.addEventListener('click',async function(){if(!confirm('Excluir rotina?'))return;await sbDelete('routines',parseInt(b.dataset.id));state.routines=state.routines.filter(function(r){return r.id!==parseInt(b.dataset.id);});renderRoutines();});});
  el.querySelectorAll('.edt-cat').forEach(function(b){b.addEventListener('click',function(){editCatKey=b.dataset.cat;var cur=state.catLabels&&state.catLabels[editCatKey]?state.catLabels[editCatKey]:editCatKey.toUpperCase();document.getElementById('cat-edit-name').value=cur;document.getElementById('btn-save-cat').dataset.cat=editCatKey;openModal('modal-cat-edit');});});
  el.querySelectorAll('.del-cat').forEach(function(b){b.addEventListener('click',function(){if(!confirm('Excluir grupo?'))return;var cat=b.dataset.cat;state.routines=state.routines.filter(function(r){return r.category!==cat;});state.customCats=(state.customCats||[]).filter(function(k){return k!==cat;});saveCatLabels();renderRoutines();});});
  var btnNG=document.getElementById('btn-new-group');if(btnNG)btnNG.addEventListener('click',function(){document.getElementById('new-group-name').value='';openModal('modal-new-group');});
}

// ─── RENDER ACOES ────────────────────────────────────────────────────────────
function renderAcoes(){
  var el=document.getElementById('acoes-content');
  var acoes=state.tasks.filter(function(t){return !t.objective_id;}),pending=acoes.filter(function(t){return !t.done;}),done=acoes.filter(function(t){return t.done;});
  pending.sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date.localeCompare(b.due_date);});
  var h='<div class="grid-4" style="margin-bottom:20px"><div class="metric"><div class="metric-val">'+pending.length+'</div><div class="metric-label">Pendentes</div></div><div class="metric"><div class="metric-val">'+done.length+'</div><div class="metric-label">Concluídas</div></div><div class="metric"><div class="metric-val">'+acoes.filter(function(t){return !t.done&&isOverdue(t.due_date);}).length+'</div><div class="metric-label">Atrasadas</div></div><div class="metric"><div class="metric-val">'+acoes.filter(function(t){return !t.due_date&&!t.done;}).length+'</div><div class="metric-label">Sem prazo</div></div></div>';
  if(pending.length){
    h+='<div class="card" style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:12px">⚡ Pendentes</div>';
    pending.forEach(function(t){var ov=isOverdue(t.due_date);h+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div class="check-box'+(t.done?' done':'')+'" data-task="'+t.id+'" style="flex-shrink:0">'+chk()+'</div><span style="flex:1;font-size:13px;'+(ov?'color:var(--red);font-weight:600':'')+'">'+t.name+(ov?' ⚠':'')+'</span>'+(t.due_date?'<span style="font-size:11px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</span>':'<span style="font-size:11px;color:var(--text3)">sem prazo</span>')+'<button class="btn btn-sm btn-icon edt-acao" data-id="'+t.id+'">'+edt()+'</button><button class="btn btn-sm btn-icon del-acao" data-id="'+t.id+'">'+trsh()+'</button></div>';});
    h+='</div>';
  }else{h+='<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px">Nenhuma ação pendente. Aproveite! 🎉</div>';}
  if(done.length){
    h+='<div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:12px">✓ Concluídas</div>';
    done.slice(0,10).forEach(function(t){h+='<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div class="check-box done" data-task="'+t.id+'" style="flex-shrink:0">'+chk()+'</div><span style="flex:1;font-size:13px;text-decoration:line-through;color:var(--text3)">'+t.name+'</span>'+(t.due_date?'<span style="font-size:11px;color:var(--text3)">'+t.due_date+'</span>':'')+'<button class="btn btn-sm btn-icon del-acao" data-id="'+t.id+'">'+trsh()+'</button></div>';});
    if(done.length>10)h+='<div style="font-size:12px;color:var(--text3);padding:8px 0;text-align:center">+ '+(done.length-10)+' concluída(s) não exibida(s)</div>';
    h+='</div>';
  }
  el.innerHTML=h;
  el.querySelectorAll('.check-box[data-task]').forEach(function(b){b.addEventListener('click',async function(){await toggleTask(parseInt(this.dataset.task));renderAcoes();});});
  el.querySelectorAll('.edt-acao').forEach(function(b){b.addEventListener('click',function(){openEditTask(parseInt(this.dataset.id));});});
  el.querySelectorAll('.del-acao').forEach(function(b){b.addEventListener('click',async function(){if(!confirm('Excluir?'))return;await sbDelete('tasks',parseInt(b.dataset.id));state.tasks=state.tasks.filter(function(t){return t.id!==parseInt(b.dataset.id);});renderAcoes();});});
}

// ─── AGENDA ──────────────────────────────────────────────────────────────────
var WEEKDAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
var WEEKDAYS_SHORT=['D','S','T','Q','Q','S','S'];
var MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function weekStart(d){var day=d.getDay(),diff=d.getDate()-day,ws=new Date(d);ws.setDate(diff);return ws;}

function getEventsForDate(dateStr){
  var dt=new Date(dateStr+'T00:00:00'),dow=dt.getDay(),dom=dt.getDate(),events=[];
  state.tasks.forEach(function(t){var tDate=t.due_date?t.due_date.substring(0,10):null;if(tDate===dateStr){var overdue=!t.done&&isOverdue(tDate);events.push({type:'task',id:t.id,name:t.name,done:t.done,overdue:overdue,cls:'cal-event-task'+(t.done?' done':overdue?' overdue':'')});}});
  state.routines.forEach(function(r){
    var show=false,freq=r.frequency;
    var dowList = Array.isArray(r.day_of_week) ? r.day_of_week : (r.day_of_week!==null&&r.day_of_week!==undefined?[parseInt(r.day_of_week)]:[]);
    if(freq==='daily')show=true;
    else if(freq==='weekdays')show=dow>=1&&dow<=5;
    else if(freq==='weekly')show=dow===1;
    else if(freq==='custom_day')show=dowList.indexOf(dow)!==-1;
    else if(freq==='monthly')show=dom===1;
    else if(freq==='monthly_days')show=dowList.indexOf(dom)!==-1;
    if(show){var label=r.name+(r.time?' ('+r.time+')':''),dayKey='day'+dt.getFullYear()+'-'+dt.getMonth()+'-w'+dow,routineDone=r.checks&&r.checks[dayKey]===true;events.push({type:'routine',id:r.id,name:label,cat:r.category,cls:'cal-event-routine'+(routineDone?' done':''),done:routineDone,dayKey:dayKey,time:r.time||null});}
  });
  events.sort(function(a,b){if(a.type==='task'&&b.type==='routine')return -1;if(a.type==='routine'&&b.type==='task')return 1;if(a.time&&b.time)return a.time.localeCompare(b.time);if(a.time&&!b.time)return -1;if(!a.time&&b.time)return 1;return 0;});
  return events;
}

function renderAgenda(){
  var el=document.getElementById('agenda-content'),d=agendaDate,title='';
  if(agendaView==='month')title=MONTHS[d.getMonth()]+' '+d.getFullYear();
  else if(agendaView==='week'){var ws=weekStart(d),we=new Date(ws);we.setDate(we.getDate()+6);title=ws.getDate()+'/'+pad(ws.getMonth()+1)+' – '+we.getDate()+'/'+pad(we.getMonth()+1)+'/'+we.getFullYear();}
  else title=WEEKDAYS[d.getDay()]+', '+d.getDate()+' de '+MONTHS[d.getMonth()]+' de '+d.getFullYear();
  var h='<div class="agenda-nav"><div style="display:flex;align-items:center;gap:8px"><button class="btn btn-sm" id="ag-prev">‹</button><div class="agenda-title">'+title+'</div><button class="btn btn-sm" id="ag-next">›</button><button class="btn btn-sm" id="ag-today" style="font-size:11px">Hoje</button></div><div class="agenda-views"><button class="agenda-view-btn'+(agendaView==='day'?' active':'')+'" data-view="day">Dia</button><button class="agenda-view-btn'+(agendaView==='week'?' active':'')+'" data-view="week">Semana</button><button class="agenda-view-btn'+(agendaView==='month'?' active':'')+'" data-view="month">Mês</button></div></div>';
  if(agendaView==='month')h+=renderMonth();else if(agendaView==='week')h+=renderWeek();else h+=renderDay(agendaDate);
  el.innerHTML=h;
  document.getElementById('ag-prev').addEventListener('click',function(){moveAgenda(-1);});
  document.getElementById('ag-next').addEventListener('click',function(){moveAgenda(1);});
  document.getElementById('ag-today').addEventListener('click',function(){agendaDate=new Date();renderAgenda();});
  document.querySelectorAll('.agenda-view-btn').forEach(function(b){b.addEventListener('click',function(){agendaView=this.dataset.view;renderAgenda();});});
  document.querySelectorAll('.cal-day[data-date]').forEach(function(cell){cell.addEventListener('click',function(){agendaView='day';var parts=this.dataset.date.split('-');agendaDate=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));renderAgenda();});});
  document.querySelectorAll('.cal-event[data-type]').forEach(function(ev){
    ev.addEventListener('click',async function(e){e.stopPropagation();var type=this.dataset.type,id=parseInt(this.dataset.id),dayKey=this.dataset.daykey;if(type==='task'){await toggleTask(id);renderAgenda();}else if(type==='routine'){var r=state.routines.find(function(x){return x.id===id;});if(!r||!dayKey)return;if(!r.checks)r.checks={};r.checks[dayKey]=r.checks[dayKey]===true?null:true;await sbUpdate('routines',r.id,{checks:r.checks});renderAgenda();}});
    ev.addEventListener('dblclick',function(e){e.stopPropagation();openReschedule(this.dataset.type,parseInt(this.dataset.id),this.dataset.name,this.dataset.date);});
  });
  document.querySelectorAll('.reschedule-btn').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();openReschedule(this.dataset.type,parseInt(this.dataset.id),this.dataset.name,this.dataset.date);});});
}

function moveAgenda(dir){if(agendaView==='month'){agendaDate.setMonth(agendaDate.getMonth()+dir);}else if(agendaView==='week'){agendaDate.setDate(agendaDate.getDate()+dir*7);}else{agendaDate.setDate(agendaDate.getDate()+dir);}renderAgenda();}

function renderMonth(){
  var d=agendaDate,firstDay=new Date(d.getFullYear(),d.getMonth(),1),lastDay=new Date(d.getFullYear(),d.getMonth()+1,0),tod=fmtDate(new Date());
  var h='<div class="cal-grid-month">';WEEKDAYS.forEach(function(wd){h+='<div class="cal-dow">'+wd+'</div>';});
  for(var i=0;i<firstDay.getDay();i++)h+='<div class="cal-day other-month"></div>';
  for(var day=1;day<=lastDay.getDate();day++){var dt=new Date(d.getFullYear(),d.getMonth(),day),ds=fmtDate(dt),isToday=ds===tod,events=getEventsForDate(ds),maxShow=3;h+='<div class="cal-day'+(isToday?' today':'')+'" data-date="'+ds+'"><div class="cal-day-num">'+day+'</div>';for(var e=0;e<Math.min(events.length,maxShow);e++){var ev=events[e],evDate=ev.type==='task'?(state.tasks.find(function(x){return x.id===ev.id;})||{}).due_date||ds:ds;h+='<div class="cal-event '+ev.cls+'" data-type="'+ev.type+'" data-id="'+ev.id+'" data-name="'+ev.name.replace(/"/g,'')+'" data-date="'+evDate+'" data-daykey="'+(ev.dayKey||'')+'">'+ev.name+'</div>';}if(events.length>maxShow)h+='<div class="cal-more">+'+(events.length-maxShow)+' mais</div>';h+='</div>';}
  var remaining=(7-((firstDay.getDay()+lastDay.getDate())%7))%7;for(var i=0;i<remaining;i++)h+='<div class="cal-day other-month"></div>';h+='</div>';return h;
}

function renderWeek(){
  var ws=weekStart(new Date(agendaDate)),tod=fmtDate(new Date()),h='<div class="cal-week">';
  h+='<div class="cal-week-hdr" style="background:var(--bg3);border-right:1px solid var(--border)"></div>';
  for(var i=0;i<7;i++){var dt=new Date(ws);dt.setDate(ws.getDate()+i);var ds=fmtDate(dt),isToday=ds===tod;h+='<div class="cal-week-hdr'+(isToday?' today-col':'')+'" style="border-right:1px solid var(--border)">'+WEEKDAYS_SHORT[dt.getDay()]+'<br><span style="font-size:16px;font-weight:800">'+dt.getDate()+'</span></div>';}
  h+='<div class="cal-week-time" style="font-size:10px;padding:6px 4px;text-align:center">Rotinas</div>';
  for(var i=0;i<7;i++){var dt=new Date(ws);dt.setDate(ws.getDate()+i);var events=getEventsForDate(fmtDate(dt)).filter(function(e){return e.type==='routine';});h+='<div class="cal-week-cell">';events.forEach(function(e){h+='<div class="cal-event '+e.cls+'" style="margin-bottom:2px">'+e.name+'</div>';});h+='</div>';}
  h+='<div class="cal-week-time" style="font-size:10px;padding:6px 4px;text-align:center">Tarefas</div>';
  for(var i=0;i<7;i++){var dt=new Date(ws);dt.setDate(ws.getDate()+i);var events=getEventsForDate(fmtDate(dt)).filter(function(e){return e.type==='task';});h+='<div class="cal-week-cell">';events.forEach(function(e){h+='<div class="cal-event '+e.cls+'" style="margin-bottom:2px">'+e.name+'</div>';});h+='</div>';}
  h+='</div>';return h;
}

function renderDay(d){
  var ds=fmtDate(d),events=getEventsForDate(ds),allTasks=events.filter(function(e){return e.type==='task';}),routines=events.filter(function(e){return e.type==='routine';});
  var okrTasks=allTasks.filter(function(e){var t=state.tasks.find(function(x){return x.id===e.id;});return t&&t.objective_id;}),freeTasks=allTasks.filter(function(e){var t=state.tasks.find(function(x){return x.id===e.id;});return t&&!t.objective_id;});
  var catColors={gestao:'var(--teal)',vendas:'var(--accent)',pessoal:'#2E7D52',desenv:'var(--navy)'},catNames={gestao:'Gestão',vendas:'Vendas',pessoal:'Pessoal',desenv:'Desenvolvimento'},cats=['gestao','vendas','pessoal','desenv'];
  var freqLabel={daily:'Diária',weekdays:'Seg-Sex',weekly:'Semanal',monthly:'Mensal',custom_day:'Dias específicos'},dowNames={0:'Dom',1:'Seg',2:'Ter',3:'Qua',4:'Qui',5:'Sex',6:'Sáb'};
  function taskRow(ev){var t=state.tasks.find(function(x){return x.id===ev.id;}),obj=t?state.objectives.find(function(o){return o.id===t.objective_id;}):null,tDate=t&&t.due_date?t.due_date.substring(0,10):ds;return '<div class="cal-item"><div class="check-box'+(ev.done?' done':'')+'" data-glass-task="'+ev.id+'" style="cursor:pointer">'+chk()+'</div><div style="flex:1"><div style="font-size:13px;font-weight:500;'+(ev.done?'text-decoration:line-through;color:var(--text3);':ev.overdue?'color:var(--red);':'')+'">'+ ev.name+(ev.overdue?' ⚠':'')+'</div>'+(obj?'<div style="font-size:11px;color:var(--teal)">'+obj.name+'</div>':'')+'</div><button class="btn btn-sm btn-icon reschedule-btn" data-type="task" data-id="'+ev.id+'" data-name="'+ev.name.replace(/"/g,'')+'" data-date="'+tDate+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div>';}
  var h='<div class="cal-day-view"><div class="cal-day-section"><div class="cal-day-section-title">🎯 Tarefas OKR</div>';
  if(!okrTasks.length)h+='<div style="font-size:13px;color:var(--text3);padding:4px 0">Nenhuma tarefa de objetivo para hoje.</div>';else okrTasks.forEach(function(ev){h+=taskRow(ev);});
  h+='</div>';if(freeTasks.length){h+='<div class="cal-day-section"><div class="cal-day-section-title">⚡ Ações do Dia</div>';freeTasks.forEach(function(ev){h+=taskRow(ev);});h+='</div>';}
  var routineRows='';cats.forEach(function(cat){var cr=routines.filter(function(e){return e.cat===cat;});if(!cr.length)return;routineRows+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin:8px 0 4px">'+catNames[cat]+'</div>';cr.forEach(function(ev){var r=state.routines.find(function(x){return x.id===ev.id;}),dayKey='day'+d.getFullYear()+'-'+d.getMonth()+'-w'+d.getDay(),checked=r&&r.checks&&r.checks[dayKey]===true,fl=r?(freqLabel[r.frequency]||r.frequency):'';if(r&&r.frequency==='custom_day'&&r.day_of_week!=null){var dn=Array.isArray(r.day_of_week)?r.day_of_week:[r.day_of_week];fl+=': '+dn.map(function(x){return dowNames[x];}).join(', ');}if(r&&r.time)fl+=' '+r.time;routineRows+='<div class="cal-item"><div class="check-box'+(checked?' done':'')+'" data-glass-routine="'+ev.id+'" data-glass-key="'+dayKey+'" style="cursor:pointer">'+chk()+'</div><div class="cal-item-dot" style="background:'+catColors[cat]+'"></div><span style="font-size:13px;font-weight:500;'+(checked?'text-decoration:line-through;color:var(--text3)':'')+'">'+r.name+'</span><span class="badge badge-gray" style="font-size:10px">'+fl+'</span></div>';});});
  h+='<div class="cal-day-section"><div class="cal-day-section-title">🔄 Rotinas do Dia</div>';h+=routines.length?routineRows:'<div style="font-size:13px;color:var(--text3)">Nenhuma rotina.</div>';h+='</div></div>';return h;
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
var QUOTES=[["Não busques que as coisas aconteçam como queres. Deseja que aconteçam como são, e serás feliz.","Epiteto"],["Temos dois ouvidos e uma boca para ouvir o dobro do que falamos.","Epiteto"],["Nunca te distraia com o que não está em teu poder.","Marco Aurélio"],["Perde o tempo quem busca o que não tem, ignorando o que possui.","Sêneca"],["O homem sofre mais na imaginação do que na realidade.","Sêneca"],["A felicidade da tua vida depende da qualidade dos teus pensamentos.","Marco Aurélio"],["Age. O resto é conversa.","Epiteto"],["Se não está em teu poder, não te preocupes. Se está, age.","Marco Aurélio"],["O obstáculo no caminho se torna o caminho.","Marco Aurélio"],["A maior riqueza é a pobreza dos desejos.","Sêneca"],["Recebe sem orgulho. Abandona sem luta.","Marco Aurélio"],["A virtude não é dada — é conquistada todos os dias.","Marco Aurélio"],["Não há vento favorável para quem não sabe onde quer chegar.","Sêneca"],["O sábio não lamenta o que perdeu — agradece o que teve.","Epiteto"],["Faz o que tens de fazer. E isso basta.","Marco Aurélio"]];
function getGreeting(){var h=new Date().getHours();if(h<12)return 'Bom dia';if(h<18)return 'Boa tarde';return 'Boa noite';}
function getTodayQuote(){var d=new Date();return QUOTES[(d.getDate()+d.getMonth()*31)%QUOTES.length];}

function renderHome(){
  var el=document.getElementById('home-content');if(!el)return;
  var tod=today(),ds=fmtDate(tod),todDow=tod.getDay(),yr=tod.getFullYear(),mo=tod.getMonth(),dayKey='day'+yr+'-'+mo+'-w'+todDow;
  var homeTheme=localStorage.getItem('eixo_home_theme')||'dark',q=getTodayQuote(),now=new Date();
  var dateStr=now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});dateStr=dateStr.charAt(0).toUpperCase()+dateStr.slice(1);
  var todayTasks=state.tasks.filter(function(t){return !t.done&&t.due_date&&t.due_date.substring(0,10)===ds&&t.objective_id;});
  var doneTasks=state.tasks.filter(function(t){return t.done&&t.due_date&&t.due_date.substring(0,10)===ds&&t.objective_id;});
  var todayAcoes=state.tasks.filter(function(t){return !t.done&&t.due_date&&t.due_date.substring(0,10)===ds&&!t.objective_id;});
  var doneAcoes=state.tasks.filter(function(t){return t.done&&t.due_date&&t.due_date.substring(0,10)===ds&&!t.objective_id;});
  var todayRoutines=getEventsForDate(ds).filter(function(e){return e.type==='routine;';})||[];
  todayRoutines=getEventsForDate(ds).filter(function(e){return e.type==='routine';});
  var doneRoutines=todayRoutines.filter(function(e){var r=state.routines.find(function(x){return x.id===e.id;});return r&&r.checks&&r.checks[dayKey]===true;});
  var h='<div class="home-wrap'+(homeTheme==='light'?' light':'')+'" id="home-wrap"><button class="home-theme-btn" id="home-theme-toggle">'+(homeTheme==='light'?'🌙 Escuro':'☀️ Claro')+'</button>';
  h+='<div><div class="home-greeting">'+getGreeting()+'</div><div class="home-name">Ricardo 👋</div><div class="home-date">'+dateStr+'</div></div>';
  h+='<div class="home-quote-card"><div class="home-quote-text">'+q[0]+'</div><div class="home-quote-author">— '+q[1]+'</div></div>';
  h+='<div class="home-cards-grid">';
  var tTotal=todayTasks.length+doneTasks.length;
  h+='<div class="home-glass-card"><div class="home-card-header"><div class="home-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>Tarefas</div><span class="home-card-count'+(todayTasks.length===0?' ok':'')+'">'+doneTasks.length+'/'+tTotal+'</span></div>';
  if(!tTotal){h+='<div class="home-empty">Nenhuma tarefa hoje 🎉</div>';}else{todayTasks.forEach(function(t){h+='<div class="home-item'+(isOverdue(t.due_date)?' home-item-overdue':'')+'"><div class="home-check" data-home-task="'+t.id+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+'</div></div>';});doneTasks.forEach(function(t){h+='<div class="home-item home-item-done"><div class="home-check done"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+'</div></div>';});}
  h+='<div class="home-progress-mini"><div class="home-progress-mini-fill" style="width:'+(tTotal?Math.round(doneTasks.length/tTotal*100):100)+'%"></div></div></div>';
  var catDots={gestao:'#7DB5D0',vendas:'#E8856A',pessoal:'#6BBF8E',desenv:'rgba(255,255,255,0.4)'};
  h+='<div class="home-glass-card"><div class="home-card-header"><div class="home-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2.1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>Rotinas</div><span class="home-card-count'+(doneRoutines.length===todayRoutines.length&&todayRoutines.length?' ok':'')+'">'+doneRoutines.length+'/'+todayRoutines.length+'</span></div>';
  if(!todayRoutines.length){h+='<div class="home-empty">Nenhuma rotina hoje</div>';}else{todayRoutines.forEach(function(ev){var r=state.routines.find(function(x){return x.id===ev.id;}),done=r&&r.checks&&r.checks[dayKey]===true;h+='<div class="home-item'+(done?' home-item-done':'')+'"><div class="home-check'+(done?' done':'')+'" data-home-routine="'+ev.id+'" data-home-key="'+dayKey+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-dot" style="background:'+(r?catDots[r.category]||'rgba(255,255,255,0.4)':'rgba(255,255,255,0.4)')+'"></div><div class="home-item-name">'+r.name+'</div></div>';});}
  h+='<div class="home-progress-mini"><div class="home-progress-mini-fill" style="width:'+(todayRoutines.length?Math.round(doneRoutines.length/todayRoutines.length*100):100)+'%;background:linear-gradient(90deg,#355F79,#7DB5D0)"></div></div></div>';
  var aTotal=todayAcoes.length+doneAcoes.length;
  h+='<div class="home-glass-card"><div class="home-card-header"><div class="home-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Ações</div><span class="home-card-count'+(todayAcoes.length===0?' ok':'')+'">'+doneAcoes.length+'/'+aTotal+'</span></div>';
  if(!aTotal){h+='<div class="home-empty">Nenhuma ação hoje</div>';}else{todayAcoes.forEach(function(t){h+='<div class="home-item'+(isOverdue(t.due_date)?' home-item-overdue':'')+'"><div class="home-check" data-home-task="'+t.id+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+'</div></div>';});doneAcoes.forEach(function(t){h+='<div class="home-item home-item-done"><div class="home-check done"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+'</div></div>';});}
  h+='<div class="home-progress-mini"><div class="home-progress-mini-fill" style="width:'+(aTotal?Math.round(doneAcoes.length/aTotal*100):100)+'%;background:linear-gradient(90deg,#C65D3B,#E8856A)"></div></div></div>';
  h+='</div></div>';el.innerHTML=h;
  document.getElementById('home-theme-toggle').addEventListener('click',function(){var wrap=document.getElementById('home-wrap'),isLight=wrap.classList.contains('light');wrap.classList.toggle('light',!isLight);localStorage.setItem('eixo_home_theme',isLight?'dark':'light');this.textContent=isLight?'☀️ Claro':'🌙 Escuro';});
  el.querySelectorAll('.home-check[data-home-task]').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();await toggleTask(parseInt(this.getAttribute('data-home-task')));renderHome();});});
  el.querySelectorAll('.home-check[data-home-routine]').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();var id=parseInt(this.getAttribute('data-home-routine')),key=this.getAttribute('data-home-key'),r=state.routines.find(function(x){return x.id===id;});if(!r)return;if(!r.checks)r.checks={};r.checks[key]=r.checks[key]===true?null:true;await sbUpdate('routines',r.id,{checks:r.checks});renderHome();});});
}

// PATCH: sobrescreve renderHome com a lógica correta (hoje + atrasados, 3 quadros)
function renderHome(){
  var el=document.getElementById('home-content');if(!el)return;
  var tod=today(),ds=fmtDate(tod),todDow=tod.getDay(),yr=tod.getFullYear(),mo=tod.getMonth(),dayKey='day'+yr+'-'+mo+'-w'+todDow;
  var homeTheme=localStorage.getItem('eixo_home_theme')||'dark',q=getTodayQuote(),now=new Date();
  var dateStr=now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});dateStr=dateStr.charAt(0).toUpperCase()+dateStr.slice(1);

  // Projetos: tarefas com objetivo, atrasadas OU com data hoje
  var projTasks=state.tasks.filter(function(t){
    if(t.done||!t.objective_id)return false;
    if(!t.due_date)return false;
    var d=t.due_date.substring(0,10);
    return d===ds||d<ds;
  });
  var projDone=state.tasks.filter(function(t){
    if(!t.done||!t.objective_id)return false;
    if(!t.due_date)return false;
    var d=t.due_date.substring(0,10);
    return d===ds||d<ds;
  });

  // Rotinas: só as de hoje
  var todayRoutines=getEventsForDate(ds).filter(function(e){return e.type==='routine';});
  var doneRoutines=todayRoutines.filter(function(e){var r=state.routines.find(function(x){return x.id===e.id;});return r&&r.checks&&r.checks[dayKey]===true;});

  // Afazeres: tarefas sem objetivo, atrasadas OU com data hoje
  var afazTasks=state.tasks.filter(function(t){
    if(t.done||t.objective_id)return false;
    if(!t.due_date)return false;
    var d=t.due_date.substring(0,10);
    return d===ds||d<ds;
  });
  var afazDone=state.tasks.filter(function(t){
    if(!t.done||t.objective_id)return false;
    if(!t.due_date)return false;
    var d=t.due_date.substring(0,10);
    return d===ds||d<ds;
  });

  var h='<div class="home-wrap'+(homeTheme==='light'?' light':'')+'" id="home-wrap">';
  h+='<button class="home-theme-btn" id="home-theme-toggle">'+(homeTheme==='light'?'🌙 Escuro':'☀️ Claro')+'</button>';
  h+='<div><div class="home-greeting">'+getGreeting()+'</div><div class="home-name">Ricardo 👋</div><div class="home-date">'+dateStr+'</div></div>';
  h+='<div class="home-quote-card"><div class="home-quote-text">'+q[0]+'</div><div class="home-quote-author">— '+q[1]+'</div></div>';
  h+='<div class="home-cards-grid">';

  // Quadro 1: Projetos
  var pTotal=projTasks.length+projDone.length;
  h+='<div class="home-glass-card"><div class="home-card-header"><div class="home-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Projetos</div><span class="home-card-count'+(projTasks.length===0?' ok':'')+'">'+projDone.length+'/'+pTotal+'</span></div>';
  if(!pTotal){h+='<div class="home-empty">Nenhuma tarefa de projeto hoje 🎉</div>';}
  else{
    projTasks.forEach(function(t){var ov=t.due_date.substring(0,10)<ds;h+='<div class="home-item'+(ov?' home-item-overdue':'')+'"><div class="home-check" data-home-task="'+t.id+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+(ov?' ⚠':'')+'</div></div>';});
    projDone.forEach(function(t){h+='<div class="home-item home-item-done"><div class="home-check done"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+'</div></div>';});
  }
  h+='<div class="home-progress-mini"><div class="home-progress-mini-fill" style="width:'+(pTotal?Math.round(projDone.length/pTotal*100):100)+'%"></div></div></div>';

  // Quadro 2: Rotinas
  var catDots={gestao:'#7DB5D0',vendas:'#E8856A',pessoal:'#6BBF8E',desenv:'rgba(255,255,255,0.4)'};
  h+='<div class="home-glass-card"><div class="home-card-header"><div class="home-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2.1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>Rotinas</div><span class="home-card-count'+(doneRoutines.length===todayRoutines.length&&todayRoutines.length?' ok':'')+'">'+doneRoutines.length+'/'+todayRoutines.length+'</span></div>';
  if(!todayRoutines.length){h+='<div class="home-empty">Nenhuma rotina hoje</div>';}
  else{todayRoutines.forEach(function(ev){var r=state.routines.find(function(x){return x.id===ev.id;}),done=r&&r.checks&&r.checks[dayKey]===true;h+='<div class="home-item'+(done?' home-item-done':'')+'"><div class="home-check'+(done?' done':'')+'" data-home-routine="'+ev.id+'" data-home-key="'+dayKey+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-dot" style="background:'+(r?catDots[r.category]||'rgba(255,255,255,0.4)':'rgba(255,255,255,0.4)')+'"></div><div class="home-item-name">'+r.name+'</div></div>';});}
  h+='<div class="home-progress-mini"><div class="home-progress-mini-fill" style="width:'+(todayRoutines.length?Math.round(doneRoutines.length/todayRoutines.length*100):100)+'%;background:linear-gradient(90deg,#355F79,#7DB5D0)"></div></div></div>';

  // Quadro 3: Afazeres
  var aTotal=afazTasks.length+afazDone.length;
  h+='<div class="home-glass-card"><div class="home-card-header"><div class="home-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Afazeres</div><span class="home-card-count'+(afazTasks.length===0?' ok':'')+'">'+afazDone.length+'/'+aTotal+'</span></div>';
  if(!aTotal){h+='<div class="home-empty">Nenhum afazer para hoje 🎉</div>';}
  else{
    afazTasks.forEach(function(t){var ov=t.due_date.substring(0,10)<ds;h+='<div class="home-item'+(ov?' home-item-overdue':'')+'"><div class="home-check" data-home-task="'+t.id+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+(ov?' ⚠':'')+'</div></div>';});
    afazDone.forEach(function(t){h+='<div class="home-item home-item-done"><div class="home-check done"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="home-item-name">'+t.name+'</div></div>';});
  }
  h+='<div class="home-progress-mini"><div class="home-progress-mini-fill" style="width:'+(aTotal?Math.round(afazDone.length/aTotal*100):100)+'%;background:linear-gradient(90deg,#C65D3B,#E8856A)"></div></div></div>';

  h+='</div></div>';
  el.innerHTML=h;

  document.getElementById('home-theme-toggle').addEventListener('click',function(){var wrap=document.getElementById('home-wrap'),isLight=wrap.classList.contains('light');wrap.classList.toggle('light',!isLight);localStorage.setItem('eixo_home_theme',isLight?'dark':'light');this.textContent=isLight?'☀️ Claro':'🌙 Escuro';});
  el.querySelectorAll('.home-check[data-home-task]').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();await toggleTask(parseInt(this.getAttribute('data-home-task')));renderHome();});});
  el.querySelectorAll('.home-check[data-home-routine]').forEach(function(b){b.addEventListener('click',async function(e){e.stopPropagation();var id=parseInt(this.getAttribute('data-home-routine')),key=this.getAttribute('data-home-key'),r=state.routines.find(function(x){return x.id===id;});if(!r)return;if(!r.checks)r.checks={};r.checks[key]=r.checks[key]===true?null:true;await sbUpdate('routines',r.id,{checks:r.checks});renderHome();});});
}

// ══════════════════════════════════════════
// NOVA AGENDA — 4 modos: hoje, 3dias, semana, 7dias
// ══════════════════════════════════════════
function renderAgenda(){
  var el=document.getElementById('agenda-content');
  var tod=new Date();tod.setHours(0,0,0,0);
  var todStr=fmtDate(tod);

  // Calcular range de datas conforme o modo
  var dates=[];
  if(agendaView==='day'){
    dates=[new Date(agendaDate)];
  } else if(agendaView==='3days'){
    for(var i=0;i<3;i++){var d=new Date(agendaDate);d.setDate(d.getDate()+i);dates.push(d);}
  } else if(agendaView==='week'){
    var ws=weekStart(new Date(agendaDate));
    for(var i=0;i<7;i++){var d=new Date(ws);d.setDate(ws.getDate()+i);dates.push(d);}
  } else if(agendaView==='7days'){
    for(var i=0;i<7;i++){var d=new Date(agendaDate);d.setDate(d.getDate()+i);dates.push(d);}
  }

  // Título do range
  var title='';
  if(dates.length===1){
    title=WEEKDAYS[dates[0].getDay()]+', '+dates[0].getDate()+' de '+MONTHS[dates[0].getMonth()]+' de '+dates[0].getFullYear();
  } else {
    var first=dates[0],last=dates[dates.length-1];
    title=first.getDate()+'/'+pad(first.getMonth()+1)+' – '+last.getDate()+'/'+pad(last.getMonth()+1)+'/'+last.getFullYear();
  }

  var h='<div class="agenda-nav">';
  h+='<div class="agenda-nav-left">';
  h+='<button class="agenda-nav-arrow" id="ag-prev">‹</button>';
  h+='<span class="agenda-date-range">'+title+'</span>';
  h+='<button class="agenda-nav-arrow" id="ag-next">›</button>';
  h+='<button class="agenda-today-btn" id="ag-today">Hoje</button>';
  h+='</div>';
  h+='<div class="agenda-views">';
  h+='<button class="agenda-view-btn'+(agendaView==='day'?' active':'')+'" data-view="day">Dia</button>';
  h+='<button class="agenda-view-btn'+(agendaView==='3days'?' active':'')+'" data-view="3days">3 dias</button>';
  h+='<button class="agenda-view-btn'+(agendaView==='week'?' active':'')+'" data-view="week">Semana</button>';
  h+='<button class="agenda-view-btn'+(agendaView==='7days'?' active':'')+'" data-view="7days">7 dias</button>';
  h+='</div></div>';

  if(dates.length===1){
    // Visão de UM DIA
    h+=renderAgendaSingleDay(dates[0]);
  } else {
    // Visão multi-colunas
    var cols=dates.length;
    h+='<div class="agenda-cols" style="grid-template-columns:repeat('+cols+',1fr)">';
    dates.forEach(function(d){h+=renderAgendaDayCol(d,todStr);});
    h+='</div>';
  }

  el.innerHTML=h;

  // Wire nav
  document.getElementById('ag-prev').addEventListener('click',function(){moveAgendaNew(-1);});
  document.getElementById('ag-next').addEventListener('click',function(){moveAgendaNew(1);});
  document.getElementById('ag-today').addEventListener('click',function(){agendaDate=new Date();renderAgenda();});
  document.querySelectorAll('.agenda-view-btn').forEach(function(b){b.addEventListener('click',function(){agendaView=this.dataset.view;agendaDate=new Date();renderAgenda();});});

  // Wire event clicks
  document.querySelectorAll('.agenda-event[data-type]').forEach(function(ev){
    ev.addEventListener('click',async function(e){
      e.stopPropagation();
      var type=this.dataset.type,id=parseInt(this.dataset.id),dayKey=this.dataset.daykey;
      if(type==='task'){await toggleTask(id);renderAgenda();}
      else if(type==='routine'){var r=state.routines.find(function(x){return x.id===id;});if(!r||!dayKey)return;if(!r.checks)r.checks={};r.checks[dayKey]=r.checks[dayKey]===true?null:true;await sbUpdate('routines',r.id,{checks:r.checks});renderAgenda();}
    });
  });

  // Wire day checkboxes (single day view)
  document.querySelectorAll('.cal-item .check-box[data-task]').forEach(function(b){b.addEventListener('click',async function(){await toggleTask(parseInt(this.dataset.task));renderAgenda();});});
  document.querySelectorAll('.cal-item .check-box[data-routine]').forEach(function(b){b.addEventListener('click',async function(){
    var id=parseInt(this.dataset.routine),key=this.dataset.key;
    var r=state.routines.find(function(x){return x.id===id;});if(!r)return;if(!r.checks)r.checks={};
    r.checks[key]=r.checks[key]===true?null:true;await sbUpdate('routines',r.id,{checks:r.checks});renderAgenda();
  });});

  // Wire reschedule
  document.querySelectorAll('.reschedule-btn').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();openReschedule(this.dataset.type,parseInt(this.dataset.id),this.dataset.name,this.dataset.date);});});
}

function moveAgendaNew(dir){
  if(agendaView==='day'){agendaDate.setDate(agendaDate.getDate()+dir);}
  else if(agendaView==='3days'){agendaDate.setDate(agendaDate.getDate()+dir*3);}
  else if(agendaView==='week'){agendaDate.setDate(agendaDate.getDate()+dir*7);}
  else if(agendaView==='7days'){agendaDate.setDate(agendaDate.getDate()+dir*7);}
  renderAgenda();
}

function renderAgendaDayCol(d,todStr){
  var ds=fmtDate(d),isToday=ds===todStr,events=getEventsForDate(ds);
  var dow=d.getDay(),yr=d.getFullYear(),mo=d.getMonth(),dayKey='day'+yr+'-'+mo+'-w'+dow;
  var h='<div class="agenda-day-col'+(isToday?' today-col':'')+'">';
  h+='<div class="agenda-day-hdr"><div class="agenda-day-name">'+WEEKDAYS[dow]+'</div><div class="agenda-day-num">'+d.getDate()+'</div></div>';
  h+='<div class="agenda-day-body">';
  if(!events.length){h+='<div class="agenda-empty">Sem eventos</div>';}
  else{
    events.forEach(function(ev){
      var isDone=ev.done;
      var cls='agenda-event ';
      if(ev.type==='task')cls+=('agenda-event-task'+(isDone?' done':ev.overdue?' overdue':''));
      else cls+=('agenda-event-routine'+(isDone?' done':''));
      var evDate=ev.type==='task'?(state.tasks.find(function(x){return x.id===ev.id;})||{}).due_date||ds:ds;
      h+='<div class="'+cls+'" data-type="'+ev.type+'" data-id="'+ev.id+'" data-daykey="'+(ev.dayKey||dayKey)+'" data-name="'+ev.name.replace(/"/g,'')+'" data-date="'+evDate+'">';
      h+='<div class="agenda-event-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">'+(isDone?'<polyline points="20 6 9 17 4 12"/>':'')+'</svg></div>';
      h+='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+ev.name+'</span>';
      h+='</div>';
    });
  }
  h+='</div></div>';
  return h;
}

function renderAgendaSingleDay(d){
  var ds=fmtDate(d),events=getEventsForDate(ds);
  var dow=d.getDay(),yr=d.getFullYear(),mo=d.getMonth(),dayKey='day'+yr+'-'+mo+'-w'+dow;
  var allTasks=events.filter(function(e){return e.type==='task';});
  var routines=events.filter(function(e){return e.type==='routine';});
  var okrTasks=allTasks.filter(function(e){var t=state.tasks.find(function(x){return x.id===e.id;});return t&&t.objective_id;});
  var freeTasks=allTasks.filter(function(e){var t=state.tasks.find(function(x){return x.id===e.id;});return t&&!t.objective_id;});
  var catColors={gestao:'var(--teal)',vendas:'var(--accent)',pessoal:'#2E7D52',desenv:'var(--navy)'};
  var catNames={gestao:'Gestão',vendas:'Vendas',pessoal:'Pessoal',desenv:'Desenvolvimento'};
  var freqLabel={daily:'Diária',weekdays:'Seg–Sex',weekly:'Semanal',monthly:'Mensal',custom_day:'Personalizada'};
  function taskRow(ev){
    var t=state.tasks.find(function(x){return x.id===ev.id;});
    var obj=t?state.objectives.find(function(o){return o.id===t.objective_id;}):null;
    var tDate=t&&t.due_date?t.due_date.substring(0,10):ds;
    return '<div class="cal-item"><div class="check-box'+(ev.done?' done':'')+'" data-task="'+ev.id+'">'+chk()+'</div><div style="flex:1"><div style="font-size:13px;font-weight:500;'+(ev.done?'text-decoration:line-through;color:var(--text3);':ev.overdue?'color:var(--red);':'')+'">'
      +ev.name+(ev.overdue?' ⚠':'')+'</div>'+(obj?'<div style="font-size:11px;color:var(--teal)">'+obj.name+'</div>':'')+'</div>'
      +'<button class="btn btn-sm btn-icon reschedule-btn" data-type="task" data-id="'+ev.id+'" data-name="'+ev.name.replace(/"/g,'')+'" data-date="'+tDate+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div>';
  }
  var h='<div class="agenda-single-day">';
  h+='<div class="agenda-section"><div class="agenda-section-title">🎯 Tarefas de Projetos</div>';
  if(!okrTasks.length)h+='<div style="font-size:13px;color:var(--text3)">Nenhuma tarefa de projeto para hoje.</div>';
  else okrTasks.forEach(function(ev){h+=taskRow(ev);});
  h+='</div>';
  if(freeTasks.length){
    h+='<div class="agenda-section"><div class="agenda-section-title">⚡ Afazeres do Dia</div>';
    freeTasks.forEach(function(ev){h+=taskRow(ev);});
    h+='</div>';
  }
  var routineRows='';
  ['gestao','vendas','pessoal','desenv'].forEach(function(cat){
    var cr=routines.filter(function(e){return e.cat===cat;});if(!cr.length)return;
    routineRows+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin:10px 0 6px">'+catNames[cat]+'</div>';
    cr.forEach(function(ev){
      var r=state.routines.find(function(x){return x.id===ev.id;}),checked=r&&r.checks&&r.checks[dayKey]===true;
      var fl=r?(freqLabel[r.frequency]||r.frequency):'';if(r&&r.time)fl+=' · '+r.time;
      routineRows+='<div class="cal-item"><div class="check-box'+(checked?' done':'')+'" data-routine="'+ev.id+'" data-key="'+dayKey+'">'+chk()+'</div><div class="cal-item-dot" style="background:'+catColors[cat]+'"></div><span style="font-size:13px;font-weight:500;flex:1;'+(checked?'text-decoration:line-through;color:var(--text3)':'')+'">'+r.name+'</span><span class="badge badge-gray" style="font-size:10px">'+fl+'</span></div>';
    });
  });
  h+='<div class="agenda-section"><div class="agenda-section-title">🔄 Rotinas</div>';
  h+=routines.length?routineRows:'<div style="font-size:13px;color:var(--text3)">Nenhuma rotina.</div>';
  h+='</div></div>';
  return h;
}

// ══ PATCH: sidebar wiring para nova estrutura ══
(function patchSidebar(){
  // Override closeSidebar
  window.closeSidebar = function(){
    var s=document.getElementById('sidebar');
    var o=document.getElementById('mob-overlay');
    if(s)s.classList.remove('open');
    if(o)o.classList.remove('open');
  };
})();

// ══ NOVA AGENDA — dias úteis ══
function getWorkdaysFrom(startDate, count){
  var days=[], d=new Date(startDate); d.setHours(0,0,0,0);
  while(days.length<count){
    var dow=d.getDay();
    if(dow!==0&&dow!==6) days.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  return days;
}
function getWorkweek(date){
  // Segunda a sexta da semana atual
  var d=new Date(date); d.setHours(0,0,0,0);
  var day=d.getDay();
  var mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1));
  var days=[];
  for(var i=0;i<5;i++){var x=new Date(mon);x.setDate(mon.getDate()+i);days.push(x);}
  return days;
}

function renderAgenda(){
  var el=document.getElementById('agenda-content');
  if(!el)return;
  var tod=new Date(); tod.setHours(0,0,0,0);
  var todStr=fmtDate(tod);

  var dates=[];
  if(agendaView==='day'){
    dates=[new Date(agendaDate)];
  } else if(agendaView==='3days'){
    dates=getWorkdaysFrom(agendaDate,3);
  } else if(agendaView==='week'){
    dates=getWorkweek(agendaDate);
  } else if(agendaView==='7days'){
    dates=getWorkdaysFrom(agendaDate,7);
  }

  // Título
  var title='';
  if(dates.length===1){
    title=WEEKDAYS[dates[0].getDay()]+', '+dates[0].getDate()+' de '+MONTHS[dates[0].getMonth()]+' de '+dates[0].getFullYear();
  } else {
    var f=dates[0],l=dates[dates.length-1];
    title=f.getDate()+'/'+pad(f.getMonth()+1)+' – '+l.getDate()+'/'+pad(l.getMonth()+1)+'/'+l.getFullYear();
  }

  var h='<div class="agenda-nav">';
  h+='<div class="agenda-nav-left">';
  h+='<button class="agenda-nav-arrow" id="ag-prev">‹</button>';
  h+='<span class="agenda-date-range">'+title+'</span>';
  h+='<button class="agenda-nav-arrow" id="ag-next">›</button>';
  var isToday=fmtDate(agendaDate)===todStr;
  h+='<button class="agenda-today-btn'+(isToday?' active-today':'')+'" id="ag-today">Hoje</button>';
  h+='</div>';
  h+='<div class="agenda-views">';
  ['day','3days','week','7days'].forEach(function(v){
    var label={day:'Dia','3days':'3 dias',week:'Semana','7days':'7 dias'}[v];
    h+='<button class="agenda-view-btn'+(agendaView===v?' active':'')+'" data-view="'+v+'">'+label+'</button>';
  });
  h+='</div></div>';

  if(dates.length===1){
    h+=renderAgendaSingleDay(dates[0]);
  } else {
    h+='<div class="agenda-cols" style="grid-template-columns:repeat('+dates.length+',1fr)">';
    dates.forEach(function(d){h+=renderAgendaDayCol(d,todStr);});
    h+='</div>';
  }

  el.innerHTML=h;

  document.getElementById('ag-prev').addEventListener('click',function(){moveAgendaNew(-1);});
  document.getElementById('ag-next').addEventListener('click',function(){moveAgendaNew(1);});
  document.getElementById('ag-today').addEventListener('click',function(){agendaDate=new Date();renderAgenda();});
  document.querySelectorAll('.agenda-view-btn').forEach(function(b){
    b.addEventListener('click',function(){agendaView=this.dataset.view;agendaDate=new Date();renderAgenda();});
  });
  document.querySelectorAll('.agenda-event[data-type]').forEach(function(ev){
    ev.addEventListener('click',async function(e){
      e.stopPropagation();
      var type=this.dataset.type,id=parseInt(this.dataset.id),dayKey=this.dataset.daykey;
      if(type==='task'){await toggleTask(id);renderAgenda();}
      else if(type==='routine'){
        var r=state.routines.find(function(x){return x.id===id;});
        if(!r||!dayKey)return;
        if(!r.checks)r.checks={};
        r.checks[dayKey]=r.checks[dayKey]===true?null:true;
        await sbUpdate('routines',r.id,{checks:r.checks});
        renderAgenda();
      }
    });
  });
  document.querySelectorAll('.cal-item .check-box[data-task]').forEach(function(b){
    b.addEventListener('click',async function(){await toggleTask(parseInt(this.dataset.task));renderAgenda();});
  });
  document.querySelectorAll('.cal-item .check-box[data-routine]').forEach(function(b){
    b.addEventListener('click',async function(){
      var id=parseInt(this.dataset.routine),key=this.dataset.key;
      var r=state.routines.find(function(x){return x.id===id;});
      if(!r)return;if(!r.checks)r.checks={};
      r.checks[key]=r.checks[key]===true?null:true;
      await sbUpdate('routines',r.id,{checks:r.checks});
      renderAgenda();
    });
  });
  document.querySelectorAll('.reschedule-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      openReschedule(this.dataset.type,parseInt(this.dataset.id),this.dataset.name,this.dataset.date);
    });
  });
}

function moveAgendaNew(dir){
  if(agendaView==='day'){agendaDate.setDate(agendaDate.getDate()+dir);}
  else if(agendaView==='3days'){agendaDate.setDate(agendaDate.getDate()+dir*3);}
  else if(agendaView==='week'){agendaDate.setDate(agendaDate.getDate()+dir*7);}
  else if(agendaView==='7days'){agendaDate.setDate(agendaDate.getDate()+dir*7);}
  renderAgenda();
}

function renderAgendaDayCol(d,todStr){
  var ds=fmtDate(d),isToday=ds===todStr,dow=d.getDay();
  var yr=d.getFullYear(),mo=d.getMonth(),dayKey='day'+yr+'-'+mo+'-w'+dow;
  var events=getEventsForDate(ds);
  var dayNames=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
  var h='<div class="agenda-day-col'+(isToday?' today-col':'')+'">';
  h+='<div class="agenda-day-hdr"><div class="agenda-day-name">'+dayNames[dow]+'</div><div class="agenda-day-num">'+d.getDate()+'</div></div>';
  h+='<div class="agenda-day-body">';
  if(!events.length){
    h+='<div class="agenda-empty">Sem eventos</div>';
  } else {
    events.forEach(function(ev){
      var isDone=ev.done,isOverdue=ev.overdue;
      var cls='agenda-event ';
      if(ev.type==='task') cls+='agenda-event-task'+(isDone?' done':isOverdue?' overdue':'');
      else cls+='agenda-event-routine'+(isDone?' done':'');
      var evDate=ev.type==='task'?(state.tasks.find(function(x){return x.id===ev.id;})||{}).due_date||ds:ds;
      h+='<div class="'+cls+'" data-type="'+ev.type+'" data-id="'+ev.id+'" data-daykey="'+(ev.dayKey||dayKey)+'" data-name="'+ev.name.replace(/"/g,'&quot;')+'" data-date="'+evDate+'">';
      h+='<div class="agenda-event-check"><svg viewBox="0 0 24 24">'+(isDone?'<polyline points="20 6 9 17 4 12"/>':'')+'</svg></div>';
      h+='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">'+ev.name+'</span>';
      h+='</div>';
    });
  }
  h+='</div></div>';
  return h;
}

function renderAgendaSingleDay(d){
  var ds=fmtDate(d),dow=d.getDay(),yr=d.getFullYear(),mo=d.getMonth(),dayKey='day'+yr+'-'+mo+'-w'+dow;
  var events=getEventsForDate(ds);
  var allTasks=events.filter(function(e){return e.type==='task';});
  var routines=events.filter(function(e){return e.type==='routine';});
  var okrTasks=allTasks.filter(function(e){var t=state.tasks.find(function(x){return x.id===e.id;});return t&&t.objective_id;});
  var freeTasks=allTasks.filter(function(e){var t=state.tasks.find(function(x){return x.id===e.id;});return t&&!t.objective_id;});
  var catColors={gestao:'var(--teal)',vendas:'var(--accent)',pessoal:'#2E7D52',desenv:'var(--navy)'};
  var catNames={gestao:'Gestão',vendas:'Vendas',pessoal:'Pessoal',desenv:'Desenvolvimento'};
  var freqLabel={daily:'Diária',weekdays:'Seg–Sex',weekly:'Semanal',monthly:'Mensal',custom_day:'Personalizada'};
  function taskRow(ev){
    var t=state.tasks.find(function(x){return x.id===ev.id;});
    var obj=t?state.objectives.find(function(o){return o.id===t.objective_id;}):null;
    var tDate=t&&t.due_date?t.due_date.substring(0,10):ds;
    return '<div class="cal-item"><div class="check-box'+(ev.done?' done':'')+'" data-task="'+ev.id+'">'+chk()+'</div><div style="flex:1"><div style="font-size:13px;font-weight:500;'+(ev.done?'text-decoration:line-through;color:var(--text3);':ev.overdue?'color:var(--red);':'')+'">'
      +ev.name+(ev.overdue?' ⚠':'')+'</div>'+(obj?'<div style="font-size:11px;color:var(--teal);margin-top:2px">'+obj.name+'</div>':'')+'</div>'
      +'<button class="btn btn-sm btn-icon reschedule-btn" data-type="task" data-id="'+ev.id+'" data-name="'+ev.name.replace(/"/g,'&quot;')+'" data-date="'+tDate+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div>';
  }
  var h='<div class="agenda-single-day">';
  h+='<div class="agenda-section"><div class="agenda-section-title">🎯 Tarefas de Projetos</div>';
  if(!okrTasks.length) h+='<p style="font-size:13px;color:var(--text3)">Nenhuma tarefa de projeto para hoje.</p>';
  else okrTasks.forEach(function(ev){h+=taskRow(ev);});
  h+='</div>';
  if(freeTasks.length){
    h+='<div class="agenda-section"><div class="agenda-section-title">⚡ Afazeres do Dia</div>';
    freeTasks.forEach(function(ev){h+=taskRow(ev);});
    h+='</div>';
  }
  var routineRows='';
  ['gestao','vendas','pessoal','desenv'].forEach(function(cat){
    var cr=routines.filter(function(e){return e.cat===cat;});if(!cr.length)return;
    routineRows+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin:10px 0 6px;letter-spacing:1px">'+catNames[cat]+'</div>';
    cr.forEach(function(ev){
      var r=state.routines.find(function(x){return x.id===ev.id;}),checked=r&&r.checks&&r.checks[dayKey]===true;
      var fl=r?(freqLabel[r.frequency]||r.frequency):'';if(r&&r.time)fl+=' · '+r.time;
      routineRows+='<div class="cal-item"><div class="check-box'+(checked?' done':'')+'" data-routine="'+ev.id+'" data-key="'+dayKey+'">'+chk()+'</div><div class="cal-item-dot" style="background:'+catColors[cat]+'"></div><span style="font-size:13px;font-weight:500;flex:1;'+(checked?'text-decoration:line-through;color:var(--text3)':'')+'">'+r.name+'</span><span class="badge badge-gray" style="font-size:10px">'+fl+'</span></div>';
    });
  });
  h+='<div class="agenda-section"><div class="agenda-section-title">🔄 Rotinas</div>';
  h+=routines.length?routineRows:'<p style="font-size:13px;color:var(--text3)">Nenhuma rotina para hoje.</p>';
  h+='</div></div>';
  return h;
}

// ══ PATCH NAV — novas páginas ══
(function(){
  var origNav = nav;
  nav = function(page, extra){
    // Mapear nav-projetos-dados para sonhos
    if(page==='projetos-dados') page='sonhos';
    origNav(page, extra);

    // Renderizar páginas novas
    if(page==='perfil') renderPerfil();
    if(page==='senha') renderSenha();
  };
})();

// ══ CASCATA DE PROJETOS — ACORDEÃO ÚNICO ══
var cascataOpenDream = null;   // id do projeto expandido
var cascataOpenObj = null;     // id do objetivo expandido
var cascataOpenKr = null;      // id do kr expandido

function renderCascata(){
  var el = document.getElementById('cascata-content');
  if(!el) return;

  var h = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">';
  h += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Seus Projetos</div>';
  h += '<button class="btn btn-accent" id="btn-novo-projeto-cascata">+ Novo Projeto</button>';
  h += '</div>';

  if(!state.dreams.length){
    h += '<div style="color:var(--text3);padding:48px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-xl);font-size:14px">Nenhum projeto ainda.<br><br>Clique em <strong>+ Novo Projeto</strong> para começar.</div>';
    el.innerHTML = h;
    wireCascataTop(el);
    return;
  }

  h += '<div style="display:flex;flex-direction:column;gap:10px">';
  state.dreams.forEach(function(d){
    h += renderCascataDream(d);
  });
  h += '</div>';

  el.innerHTML = h;
  wireCascataAll(el);
}

function renderCascataDream(d){
  var isOpen = cascataOpenDream===d.id;
  var p=dPct(d.id), bc2=dreamBarColor(d.id);
  var objs = state.objectives.filter(function(o){return o.dream_id===d.id;});
  var ovCount=state.tasks.filter(function(t){var ids=objs.map(function(o){return o.id;});return !t.done&&ids.indexOf(t.objective_id)!==-1&&isOverdue(t.due_date);}).length;

  var h = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;border-left:3px solid '+(ovCount>0?'var(--red)':'var(--teal)')+'">';

  // Header do projeto — clicável
  h += '<div class="cascata-dream-hdr" data-id="'+d.id+'" style="display:flex;align-items:center;gap:14px;padding:18px 20px;cursor:pointer;transition:background 0.15s">';
  h += '<svg class="cascata-chev" style="transition:transform 0.2s;flex-shrink:0;'+(isOpen?'transform:rotate(90deg)':'')+'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
  h += '<div style="flex:1">';
  h += '<div style="font-size:16px;font-weight:700;color:var(--navy)">'+d.name+'</div>';
  h += '<div style="font-size:12px;color:var(--text3);margin-top:2px">'+objs.length+' objetivo(s) · Prazo: '+(d.due_date||'—')+(ovCount>0?' · <span style="color:var(--red);font-weight:600">'+ovCount+' atrasada(s)</span>':'')+'</div>';
  h += '<div class="progress" style="margin-top:8px;height:4px"><div class="progress-fill" style="width:'+p+'%;background:'+bc2+'"></div></div>';
  h += '</div>';
  h += '<div style="font-size:24px;font-weight:800;color:'+(p>0?'var(--accent)':'var(--text3)')+';flex-shrink:0">'+p+'%</div>';
  h += '<button class="btn btn-sm del-dream-cascata" data-id="'+d.id+'" onclick="event.stopPropagation()" style="color:var(--red);border-color:rgba(192,57,43,0.2);background:var(--red-bg);flex-shrink:0">🗑</button>';
  h += '</div>';

  // Conteúdo expandido — Objetivos
  h += '<div class="cascata-dream-body" style="display:'+(isOpen?'block':'none')+';border-top:1px solid var(--border);background:var(--bg3);padding:16px 20px 16px 48px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  h += '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Objetivos</div>';
  h += '<button class="btn btn-sm btn-accent btn-novo-obj-this" data-dreamid="'+d.id+'">+ Novo Objetivo</button>';
  h += '</div>';

  if(!objs.length){
    h += '<div style="color:var(--text3);padding:16px;text-align:center;background:var(--bg2);border:1px dashed var(--border2);border-radius:var(--radius);font-size:13px">Nenhum objetivo ainda.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:8px">';
    objs.forEach(function(o){ h += renderCascataObj(o); });
    h += '</div>';
  }
  h += '</div></div>';

  return h;
}

function renderCascataObj(o){
  var isOpen = cascataOpenObj===o.id;
  var op=oPct(o.id), sb=statusBadge(o), obc=objBarColor(o);
  var taskCount=state.tasks.filter(function(t){return t.objective_id===o.id;}).length;

  var h = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">';

  h += '<div class="cascata-obj-hdr" data-id="'+o.id+'" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:background 0.15s">';
  h += '<svg class="cascata-chev" style="transition:transform 0.2s;flex-shrink:0;'+(isOpen?'transform:rotate(90deg)':'')+'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
  h += '<div style="flex:1">';
  h += '<div style="font-size:14px;font-weight:700;color:var(--navy)">'+o.name+'</div>';
  h += '<div style="font-size:11px;color:var(--text3)">'+taskCount+' tarefa(s) · Prazo: '+(o.due_date||'—')+'</div>';
  h += '<div class="progress" style="margin-top:6px;height:4px"><div class="progress-fill" style="width:'+op+'%;background:'+obc+'"></div></div>';
  h += '</div>';
  h += '<span class="badge '+sb[0]+'">'+sb[1]+'</span>';
  h += '<span class="badge '+pcBadge(op)+'">'+op+'%</span>';
  h += '<button class="btn btn-sm del-obj-cascata" data-id="'+o.id+'" onclick="event.stopPropagation()" style="color:var(--red);border-color:rgba(192,57,43,0.2);background:var(--red-bg)">🗑</button>';
  h += '</div>';

  // KRs expandidos
  h += '<div class="cascata-obj-body" style="display:'+(isOpen?'block':'none')+';border-top:1px solid var(--border);background:var(--bg);padding:12px 16px 12px 38px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
  h += '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px">KRs</div>';
  h += '<div style="display:flex;gap:6px">';
  h += '<button class="btn btn-sm btn-novo-kr-this" data-objid="'+o.id+'">+ Novo KR</button>';
  h += '<button class="btn btn-sm btn-accent btn-nova-tarefa-this" data-objid="'+o.id+'">+ Tarefa</button>';
  h += '</div></div>';

  if(!o.krs || !o.krs.length){
    h += '<div style="color:var(--text3);padding:14px;text-align:center;background:var(--bg2);border:1px dashed var(--border2);border-radius:var(--radius);font-size:12px">Nenhum KR ainda.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:6px">';
    o.krs.forEach(function(kr){ h += renderCascataKr(kr, o.id); });
    h += '</div>';
  }

  // Tarefas sem KR
  var semKR=state.tasks.filter(function(t){return t.objective_id===o.id && !t.kr_id;});
  if(semKR.length){
    h += '<div style="margin-top:8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px">';
    h += '<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">Sem KR vinculado</div>';
    semKR.forEach(function(t){
      var ov=!t.done&&isOverdue(t.due_date);
      h += '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">';
      h += '<div class="check-box'+(t.done?' done':'')+' cascata-task-check" data-id="'+t.id+'">'+chk()+'</div>';
      h += '<span style="flex:1;font-size:12px;'+(t.done?'text-decoration:line-through;color:var(--text3)':ov?'color:var(--red)':'')+'">'+t.name+'</span>';
      h += (t.due_date?'<span style="font-size:11px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</span>':'');
      h += '</div>';
    });
    h += '</div>';
  }

  h += '</div></div>';
  return h;
}

function renderCascataKr(kr, objId){
  var isOpen = cascataOpenKr===kr.id;
  var krTasks=state.tasks.filter(function(t){return t.kr_id===kr.id;});
  krTasks.sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date.localeCompare(b.due_date);});
  var krd=krTasks.filter(function(t){return t.done;}).length;
  var kp=pct(krd,krTasks.length);
  var col=kp===100?'var(--green)':kp>0?'var(--accent)':'var(--border2)';

  var h = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">';

  h += '<div class="cascata-kr-hdr" data-id="'+kr.id+'" style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;transition:background 0.15s">';
  h += '<svg class="cascata-chev" style="transition:transform 0.2s;flex-shrink:0;'+(isOpen?'transform:rotate(90deg)':'')+'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
  h += '<div class="kr-dot" style="background:'+col+'"></div>';
  h += '<div style="flex:1;font-size:13px;font-weight:700;color:var(--navy)">'+kr.name+'</div>';
  if(kp>0||krTasks.length) h += '<span class="badge '+pcBadge(kp)+'">'+kp+'%</span>';
  h += '<button class="btn btn-sm add-task-this-kr" data-krid="'+kr.id+'" data-objid="'+objId+'" onclick="event.stopPropagation()" style="font-size:11px">+ Tarefa</button>';
  h += '<button class="btn btn-sm edt-kr-cascata" data-krid="'+kr.id+'" data-objid="'+objId+'" onclick="event.stopPropagation()" style="padding:5px">'+edt()+'</button>';
  h += '<button class="btn btn-sm del-kr-cascata" data-krid="'+kr.id+'" data-objid="'+objId+'" onclick="event.stopPropagation()" style="padding:5px">'+trsh()+'</button>';
  h += '</div>';

  // Tarefas
  h += '<div class="cascata-kr-body" style="display:'+(isOpen?'block':'none')+';border-top:1px solid var(--border)">';
  if(!krTasks.length){
    h += '<div style="padding:12px 16px;font-size:12px;color:var(--text3)">Nenhuma tarefa. Clique em "+ Tarefa".</div>';
  } else {
    krTasks.forEach(function(t){
      var ov=!t.done&&isOverdue(t.due_date);
      h += '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">';
      h += '<div class="check-box'+(t.done?' done':'')+' cascata-task-check" data-id="'+t.id+'">'+chk()+'</div>';
      h += '<span style="flex:1;font-size:13px;'+(t.done?'text-decoration:line-through;color:var(--text3)':ov?'color:var(--red);font-weight:600':'color:var(--text)')+'">'+t.name+(ov?' ⚠':'')+'</span>';
      h += (t.due_date?'<span style="font-size:11px;color:'+(ov?'var(--red)':'var(--text3)')+'">'+t.due_date+'</span>':'');
      h += '</div>';
    });
  }
  h += '</div></div>';
  return h;
}

function wireCascataTop(el){
  var btnNP=document.getElementById('btn-novo-projeto-cascata');
  if(btnNP) btnNP.addEventListener('click',function(){openModal('modal-dream');});
}

function wireCascataAll(el){
  wireCascataTop(el);

  // Toggle projeto
  el.querySelectorAll('.cascata-dream-hdr').forEach(function(h){
    h.addEventListener('click', function(){
      var id=parseInt(this.dataset.id);
      cascataOpenDream = cascataOpenDream===id ? null : id;
      cascataOpenObj = null;
      cascataOpenKr = null;
      renderCascata();
    });
  });

  // Toggle objetivo
  el.querySelectorAll('.cascata-obj-hdr').forEach(function(h){
    h.addEventListener('click', function(){
      var id=parseInt(this.dataset.id);
      cascataOpenObj = cascataOpenObj===id ? null : id;
      cascataOpenKr = null;
      renderCascata();
    });
  });

  // Toggle KR
  el.querySelectorAll('.cascata-kr-hdr').forEach(function(h){
    h.addEventListener('click', function(){
      var id=parseInt(this.dataset.id);
      cascataOpenKr = cascataOpenKr===id ? null : id;
      renderCascata();
    });
  });

  // Deletar projeto
  el.querySelectorAll('.del-dream-cascata').forEach(function(b){
    b.addEventListener('click', async function(e){
      e.stopPropagation();
      if(!confirm('Excluir este projeto e todos os objetivos vinculados?')) return;
      await sbDelete('dreams', parseInt(this.dataset.id));
      await loadAll();
      renderCascata();
    });
  });

  // Deletar objetivo
  el.querySelectorAll('.del-obj-cascata').forEach(function(b){
    b.addEventListener('click', async function(e){
      e.stopPropagation();
      if(!confirm('Excluir este objetivo e todas as suas tarefas?')) return;
      await sbDelete('objectives', parseInt(this.dataset.id));
      await loadAll();
      renderCascata();
    });
  });

  // Checkbox de tarefa
  el.querySelectorAll('.cascata-task-check').forEach(function(b){
    b.addEventListener('click', async function(e){
      e.stopPropagation();
      await toggleTask(parseInt(this.dataset.id));
      renderCascata();
    });
  });

  // + Novo Objetivo (dentro do projeto)
  el.querySelectorAll('.btn-novo-obj-this').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var dreamId=parseInt(this.dataset.dreamid);
      editObjId=null;
      document.getElementById('obj-modal-title').textContent='Novo Objetivo';
      document.getElementById('o-name').value='';
      document.getElementById('o-date').value='';
      document.getElementById('o-status').value='on-track';
      document.getElementById('o-dream').innerHTML='<option value="">— nenhum —</option>'+state.dreams.map(function(d){return '<option value="'+d.id+'"'+(d.id===dreamId?' selected':'')+'>'+d.name+'</option>';}).join('');
      document.getElementById('kr-inputs').innerHTML='';
      addKR();addKR();
      openModal('modal-obj');
    });
  });

  // + Novo KR (dentro do objetivo)
  el.querySelectorAll('.btn-novo-kr-this').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      openEditObj(parseInt(this.dataset.objid));
    });
  });

  // + Tarefa (dentro do objetivo, sem KR específico)
  el.querySelectorAll('.btn-nova-tarefa-this').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      openNewTask(parseInt(this.dataset.objid), null);
    });
  });

  // + Tarefa (dentro do KR específico)
  el.querySelectorAll('.add-task-this-kr').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      openNewTask(parseInt(this.dataset.objid), parseInt(this.dataset.krid));
    });
  });

  el.querySelectorAll('.edt-kr-cascata').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var objId=parseInt(this.dataset.objid), krId=parseInt(this.dataset.krid);
      var o=state.objectives.find(function(x){return x.id===objId;});if(!o)return;
      var kr=o.krs.find(function(x){return x.id===krId;});if(!kr)return;
      editKrObjId=objId; editKrId=krId;
      document.getElementById('kre-name').value=kr.name;
      document.getElementById('kre-date').value=kr.due_date||'';
      openModal('modal-kr-edit');
    });
  });

  el.querySelectorAll('.del-kr-cascata').forEach(function(b){
    b.addEventListener('click', async function(e){
      e.stopPropagation();
      if(!confirm('Excluir este KR e todas as suas tarefas vinculadas?')) return;
      await sbDelete('krs', parseInt(this.dataset.krid));
      state.tasks=state.tasks.filter(function(t){return t.kr_id!==parseInt(b.dataset.krid);});
      await loadAll();
      renderCascata();
    });
  });
}

// ══ PERFIL ══
function renderPerfil(){
  var el=document.getElementById('perfil-content');
  if(!el)return;
  var name=currentUser?.name||'', email=currentUser?.email||'';
  el.innerHTML=`
    <div class="card" style="max-width:480px">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Perfil do Usuário</h2>
      <p style="font-size:13px;color:var(--text3);margin-bottom:24px">Atualize seu nome e email.</p>
      <div class="fg"><label>Nome</label><input id="perfil-name" value="${name}" placeholder="Seu nome"></div>
      <div class="fg"><label>Email</label><input id="perfil-email" type="email" value="${email}" placeholder="seu@email.com"></div>
      <div id="perfil-msg" style="display:none;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px"></div>
      <button class="btn btn-accent" id="btn-save-perfil">Salvar alterações</button>
    </div>`;

  document.getElementById('btn-save-perfil').addEventListener('click', async function(){
    var name=document.getElementById('perfil-name').value.trim();
    var email=document.getElementById('perfil-email').value.trim();
    var msg=document.getElementById('perfil-msg');
    if(!name||!email){msg.style.display='block';msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent='Preencha todos os campos.';return;}
    this.textContent='Salvando...';this.disabled=true;
    try{
      var res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify({action:'update_profile',name,email})});
      var data=await res.json();
      if(data.error){msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent=data.error;}
      else{
        currentUser={...currentUser,name,email};
        localStorage.setItem('eixo_user',JSON.stringify(currentUser));
        msg.style.background='var(--green-bg)';msg.style.color='var(--green)';msg.textContent='✓ Salvo com sucesso!';
      }
    }catch(e){msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent='Erro ao salvar.';}
    msg.style.display='block';
    this.textContent='Salvar alterações';this.disabled=false;
  });
}

// ══ SENHA ══
function renderSenha(){
  var el=document.getElementById('senha-content');
  if(!el)return;
  el.innerHTML=`
    <div class="card" style="max-width:480px">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Alterar Senha</h2>
      <p style="font-size:13px;color:var(--text3);margin-bottom:24px">Digite sua nova senha abaixo.</p>
      <div class="fg"><label>Nova senha</label><input id="senha-nova" type="password" placeholder="Mínimo 6 caracteres"></div>
      <div class="fg"><label>Confirmar nova senha</label><input id="senha-confirm" type="password" placeholder="Repita a nova senha"></div>
      <div id="senha-msg" style="display:none;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px"></div>
      <button class="btn btn-accent" id="btn-save-senha">Alterar senha</button>
    </div>`;

  document.getElementById('btn-save-senha').addEventListener('click', async function(){
    var nova=document.getElementById('senha-nova').value;
    var confirm=document.getElementById('senha-confirm').value;
    var msg=document.getElementById('senha-msg');
    if(nova.length<6){msg.style.display='block';msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent='Senha precisa ter ao menos 6 caracteres.';return;}
    if(nova!==confirm){msg.style.display='block';msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent='As senhas não conferem.';return;}
    this.textContent='Alterando...';this.disabled=true;
    try{
      var res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify({action:'update_password',password:nova})});
      var data=await res.json();
      if(data.error){msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent=data.error;}
      else{msg.style.background='var(--green-bg)';msg.style.color='var(--green)';msg.textContent='✓ Senha alterada com sucesso!';document.getElementById('senha-nova').value='';document.getElementById('senha-confirm').value='';}
    }catch(e){msg.style.background='var(--red-bg)';msg.style.color='var(--red)';msg.textContent='Erro ao alterar senha.';}
    msg.style.display='block';
    this.textContent='Alterar senha';this.disabled=false;
  });
}

// Wire cascata no nav
document.addEventListener('DOMContentLoaded', function(){
  var navSonhos=document.getElementById('nav-sonhos');
  if(navSonhos){
    navSonhos.addEventListener('click',function(){
      cascataStack=[];
      nav('cascata');
      renderCascata();
    });
  }
});
