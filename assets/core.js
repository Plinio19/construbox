// ── Construbox — Core JS ──

const CHAVE_CFG   = 'construbox_config_v1';
const DEFAULTS_CFG = { owner: 'Plinio19', repo: 'construbox', branch: 'main' };

// ── CONFIG ──
function getConfig() {
  try { return { ...DEFAULTS_CFG, ...JSON.parse(localStorage.getItem(CHAVE_CFG)) }; }
  catch { return { ...DEFAULTS_CFG }; }
}
function setConfig(cfg) { localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg)); }
function configurado()   { const c = getConfig(); return !!(c.owner && c.repo && c.token); }

// ── GITHUB API ──
function ghHeaders() {
  const c = getConfig();
  return { 'Authorization': `token ${c.token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' };
}
function ghUrl(path) {
  const c = getConfig();
  return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`;
}
function toB64(str)  { return btoa(unescape(encodeURIComponent(str))); }
function fromB64(str){ return decodeURIComponent(escape(atob(str))); }

async function ghGet(path) {
  const res = await fetch(ghUrl(path), { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path}: HTTP ${res.status}`);
  return res.json();
}
async function ghPut(path, content, sha, mensagem) {
  const c = getConfig();
  const body = { message: mensagem || `Atualização — ${new Date().toLocaleString('pt-BR')}`, content: toB64(content), branch: c.branch };
  if (sha) body.sha = sha;
  const res = await fetch(ghUrl(path), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

// ── DATA HELPERS ──
async function carregarDados(path) {
  const data = await ghGet(path);
  if (!data) return { lista: [], sha: null };
  return { lista: JSON.parse(fromB64(data.content.replace(/\n/g, ''))), sha: data.sha };
}
async function salvarDados(path, lista, sha, mensagem) {
  const res = await ghPut(path, JSON.stringify(lista, null, 2), sha, mensagem);
  return res.content.sha;
}

// ── LOCAL STORAGE ──
function salvarLocal(chave, dados)   { localStorage.setItem(chave, JSON.stringify(dados)); }
function carregarLocal(chave)        { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } }

// ── UTILS ──
function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function hl(texto, busca) {
  if (!busca || !texto) return esc(texto);
  return esc(texto).replace(new RegExp(`(${busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="pesquisa-destaque">$1</mark>');
}
function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function hoje() { return new Date().toISOString().slice(0, 10); }
function formatarMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function parseMoeda(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
}

// ── CATEGORIAS ──
const CATEGORIAS = {
  receita: [
    { value: 'medicao',      label: 'Medição' },
    { value: 'adiantamento', label: 'Adiantamento' },
    { value: 'parcela',      label: 'Parcela do Contrato' },
    { value: 'reembolso-in', label: 'Reembolso (entrada)' },
    { value: 'outros-rec',   label: 'Outros' },
  ],
  despesa: [
    { value: 'mao-de-obra',  label: 'Mão de Obra' },
    { value: 'material',     label: 'Material' },
    { value: 'ferramenta',   label: 'Ferramenta' },
    { value: 'combustivel',  label: 'Combustível / Gasolina' },
    { value: 'comissao',     label: 'Comissão' },
    { value: 'hospedagem',   label: 'Hospedagem' },
    { value: 'reembolso',    label: 'Reembolso Funcionário' },
    { value: 'imposto',      label: 'Imposto / Taxa' },
    { value: 'outros',       label: 'Outros' },
  ],
};

function labelCategoria(tipo, value) {
  const lista = CATEGORIAS[tipo] || [];
  return lista.find(c => c.value === value)?.label || value || '—';
}

function opcoesCategoria(tipo) {
  const lista = CATEGORIAS[tipo] || [];
  return lista.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
}

// ── STATUS / BADGES ──
function badgeStatus(s) {
  const m = { pago:'verde', pendente:'amarelo', agendado:'azul', cancelado:'cinza' };
  const l = { pago:'Pago', pendente:'Pendente', agendado:'Agendado', cancelado:'Cancelado' };
  return `<span class="badge ${m[s]||'cinza'}">${l[s]||s}</span>`;
}

// ── TOAST ──
function toast(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  let c = document.getElementById('toasts');
  if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.className = 'toast-container'; document.body.appendChild(c); }
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .35s'; setTimeout(() => el.remove(), 350); }, 3200);
}

// ── SYNC STATUS ──
function setSyncStatus(cor, texto) {
  const dot  = document.getElementById('sync-dot');
  const span = document.getElementById('sync-texto');
  if (dot)  dot.className  = `sync-dot${cor !== 'verde' ? ' ' + cor : ''}`;
  if (span) span.textContent = texto;
}

// ── BASE PATH (GitHub Pages) ──
function _basePath() {
  const baseEl = document.querySelector('base');
  if (baseEl) return baseEl.href.replace(/\/$/, '');
  if (window.location.hostname.endsWith('.github.io')) {
    return '/' + window.location.pathname.split('/').filter(Boolean)[0];
  }
  return '';
}

// ── SIDEBAR ──
const MODULOS = [
  { id: 'dashboard',        label: 'Dashboard',          icone: '📊', href: '/index.html' },
  { grupo: 'Obras' },
  { id: 'obras',            label: 'Obras',              icone: '🏗️', href: '/obras/' },
  { grupo: 'Financeiro' },
  { id: 'lancamentos',      label: 'Lançamentos',        icone: '📝', href: '/lancamentos/' },
  { id: 'contas-pagar',     label: 'Contas a Pagar',     icone: '💸', href: '/contas-pagar/' },
  { id: 'contas-receber',   label: 'Contas a Receber',   icone: '💰', href: '/contas-receber/' },
  { grupo: 'Análise' },
  { id: 'conciliacao',      label: 'Conciliação Banc.',  icone: '🏦', href: '/conciliacao/' },
  { id: 'relatorios',       label: 'Relatório por Obra', icone: '📈', href: '/relatorios/' },
];

function buildSidebar(moduloAtivo) {
  const root = _basePath();
  const navItems = MODULOS.map(m => {
    if (m.grupo) return `<div class="nav-grupo">${m.grupo}</div>`;
    return `<a class="nav-item ${m.id === moduloAtivo ? 'ativo' : ''}" href="${root}${m.href}">
      <span class="icone">${m.icone}</span><span>${m.label}</span></a>`;
  }).join('');
  return `<div class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="nome">Constru<span>box</span></div>
      <div class="versao">Gestão de Obras</div>
    </div>
    <nav class="sidebar-nav">${navItems}</nav>
    <div class="sidebar-footer">
      Construbox © 2026<br>
      <a href="#" onclick="abrirConfig()">⚙️ Configurações</a>
    </div>
  </div>`;
}

// ── CONFIG MODAL ──
function abrirConfig() {
  let m = document.getElementById('modal-cfg');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-cfg';
    m.className = 'overlay';
    m.innerHTML = `<div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h2>⚙️ Configurações GitHub</h2>
        <button class="btn-fechar" onclick="document.getElementById('modal-cfg').classList.remove('aberto')">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;padding:0 20px 4px;">
        <div class="form-campo"><label>Usuário GitHub</label><input id="cfg-owner" type="text"/></div>
        <div class="form-campo"><label>Repositório</label><input id="cfg-repo" type="text"/></div>
        <div class="form-campo"><label>Branch</label><input id="cfg-branch" type="text"/></div>
        <div class="form-campo">
          <label>Token de Acesso (ghp_...)</label>
          <input id="cfg-token" type="password" placeholder="ghp_..."/>
          <span class="hint">github.com/settings/tokens → marque <strong>repo</strong></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span id="cfg-badge" style="font-size:0.78rem;color:var(--texto-leve);">—</span>
          <button class="btn btn-outline btn-sm" onclick="testarConfig()">Testar conexão</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-cfg').classList.remove('aberto')">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarConfig()">✓ Salvar</button>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
  const c = getConfig();
  document.getElementById('cfg-owner').value  = c.owner  || '';
  document.getElementById('cfg-repo').value   = c.repo   || '';
  document.getElementById('cfg-branch').value = c.branch || 'main';
  document.getElementById('cfg-token').value  = c.token  || '';
  m.classList.add('aberto');
  m.onclick = e => { if (e.target === m) m.classList.remove('aberto'); };
}

async function testarConfig() {
  const owner = document.getElementById('cfg-owner').value.trim();
  const repo  = document.getElementById('cfg-repo').value.trim();
  const token = document.getElementById('cfg-token').value.trim();
  const badge = document.getElementById('cfg-badge');
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Authorization: `token ${token}` } });
    if (res.ok) { badge.textContent = '✓ Conectado'; badge.style.color = 'var(--verde)'; toast('Conectado!', 'sucesso'); }
    else        { badge.textContent = '✗ Não encontrado'; badge.style.color = 'var(--vermelho)'; toast('Repositório não encontrado.', 'erro'); }
  } catch { toast('Erro de rede.', 'erro'); }
}

function salvarConfig() {
  const c = {
    owner:  document.getElementById('cfg-owner').value.trim(),
    repo:   document.getElementById('cfg-repo').value.trim(),
    branch: document.getElementById('cfg-branch').value.trim() || 'main',
    token:  document.getElementById('cfg-token').value.trim(),
  };
  if (!c.owner || !c.repo || !c.token) { toast('Preencha todos os campos.', 'erro'); return; }
  setConfig(c);
  document.getElementById('modal-cfg').classList.remove('aberto');
  toast('Salvo! Recarregando...', 'sucesso');
  setTimeout(() => location.reload(), 1200);
}
