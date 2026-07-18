let cases = [];
let pending = [];
const $ = (selector) => document.querySelector(selector);

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir esta operação.');
  return body;
}

function caseRow(item) {
  const pct = item.docs[1] ? Math.round(item.docs[0] / item.docs[1] * 100) : 0;
  return `<tr><td><div class="person"><span class="avatar table-avatar" style="background:${item.color || '#a7c3b1'}">${item.initials}</span>${item.client}</div></td><td>${item.title}</td><td><span class="status ${item.type}">${item.status}</span></td><td><div class="progress"><div class="progress-bar"><i style="width:${pct}%"></i></div>${item.docs[0]}/${item.docs[1]}</div></td><td>${item.due}</td><td><button class="row-menu" aria-label="Mais opções">•••</button></td></tr>`;
}

function renderCases() {
  $('#cases-table').innerHTML = cases.slice(0, 4).map(caseRow).join('');
  $('#all-cases-table').innerHTML = cases.map(caseRow).join('');
  $('#active-cases').textContent = cases.filter((item) => item.type !== 'done').length;
}

function renderDocuments() {
  $('#pending-list').innerHTML = pending.slice(0, 3).map((document) => `<div class="pending-item"><span class="doc-icon">▱</span><div><strong>${document.name}</strong><p>${document.case}</p></div><span class="client-chip ${document.late ? 'overdue' : ''}">${document.late ? 'Atrasado' : document.client}</span></div>`).join('');
  $('#documents-list').innerHTML = pending.map((document) => `<article class="document-row"><span class="doc-icon">▱</span><div><h3>${document.name}</h3><p>${document.client} · ${document.case}</p></div><span class="client-chip ${document.late ? 'overdue' : ''}">${document.late ? 'Atrasado' : 'Aguardando envio'}</span><button class="secondary-button remind" data-document-id="${document.id}">Enviar lembrete</button></article>`).join('');
  $('#pending-documents').textContent = pending.length;
}

async function loadData() {
  try {
    [cases, pending] = await Promise.all([api('/api/cases'), api('/api/documents/pending')]);
    renderCases();
    renderDocuments();
  } catch (error) {
    showToast('Não foi possível carregar os dados. Verifique o servidor e o banco.');
    console.error(error);
  }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function showView(view) {
  document.querySelectorAll('.view').forEach((section) => section.classList.remove('active-view'));
  $(`#${view}-view`).classList.add('active-view');
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  $('#page-title').textContent = { dashboard: 'Visão geral', cases: 'Casos', clients: 'Clientes', documents: 'Documentos', updates: 'Atualizações', settings: 'Configurações' }[view];
  $('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeModal() { $('#modal-backdrop').hidden = true; }

document.querySelectorAll('[data-view], [data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view || button.dataset.viewTarget)));
$('#new-case').addEventListener('click', () => { $('#modal-backdrop').hidden = false; });
$('#new-case-secondary').addEventListener('click', () => { $('#modal-backdrop').hidden = false; });
$('.close-modal').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#modal-backdrop').hidden) closeModal(); });

$('#case-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  submit.disabled = true;
  submit.textContent = 'Criando...';
  try {
    const createdCase = await api('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: data.get('client'), title: data.get('title'), dueDate: data.get('due') }) });
    cases.unshift(createdCase);
    renderCases();
    form.reset();
    closeModal();
    showView('cases');
    showToast('Caso criado e salvo no banco de dados.');
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Criar caso →';
  }
});

$('#case-search').addEventListener('input', (event) => {
  const term = event.target.value.toLowerCase();
  $('#all-cases-table').innerHTML = cases.filter((item) => `${item.client}${item.title}`.toLowerCase().includes(term)).map(caseRow).join('');
});

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  const text = button.childNodes[0].textContent.trim();
  $('#all-cases-table').innerHTML = (text === 'Todos' ? cases : cases.filter((item) => item.status === text)).map(caseRow).join('');
}));

$('#share-portal').addEventListener('click', () => { navigator.clipboard?.writeText(location.href); showToast('Link do portal copiado para compartilhar com seus clientes.'); });
$('#request-document').addEventListener('click', () => showToast('Solicitação de documento será adicionada na próxima etapa.'));
$('#create-update').addEventListener('click', () => showToast('Em breve: editor de atualizações para clientes.'));

document.addEventListener('click', async (event) => {
  if (!event.target.classList.contains('remind')) return;
  const button = event.target;
  button.disabled = true;
  try {
    await api(`/api/documents/${button.dataset.documentId}/remind`, { method: 'POST' });
    button.textContent = 'Lembrete enviado ✓';
    showToast('Lembrete registrado para o cliente.');
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
});

$('.mobile-menu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
loadData();
