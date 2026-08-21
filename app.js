let cases = [];
let documents = [];
let clients = [];
let teamUsers = [];
let assignableUsers = [];
let documentTemplates = [];
let caseUpdates = [];
let activityFeed = [];
let currentUser = null;
let selectedCaseFilter = 'all';
let editingTeamUserId = null;
let editingClientId = null;
let activeCaseDetail = null;
let pendingDocumentAction = null;

const caseFilters = {
  search: '',
  responsibleUserId: '',
  dueWindow: '',
  archived: 'false'
};

const documentFilters = {
  search: '',
  caseId: '',
  status: ''
};

const $ = (selector) => document.querySelector(selector);

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || 'Nao foi possivel concluir esta operacao.');
    error.data = body.error || null;
    error.meta = body.meta || null;
    throw error;
  }
  return body.data;
}

function initials(name) {
  return (name || 'JP').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function safeCssColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#a7c3b1';
}

function safeId(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || '')) ? value : '';
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function setVisibility(element, visible) {
  if (!element) return;
  element.hidden = !visible;
}

function setDisabledState(element, disabled) {
  if (!element) return;
  element.disabled = disabled;
  element.classList.toggle('is-disabled', disabled);
}

function formatDate(value) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(`${value}T12:00:00`)).replace('.', '');
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatFileSize(value) {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function documentStatusLabel(status) {
  return {
    pending: 'Pendente',
    received: 'Recebido',
    rejected: 'Recusado'
  }[status] || status;
}

function caseRow(item) {
  const typeClass = ['analysis', 'active', 'waiting', 'closed'].includes(item.type) ? item.type : 'waiting';
  return `
    <tr>
      <td>
        <div class="person">
          <span class="avatar table-avatar" style="background:${safeCssColor(item.color)}">${escapeHtml(item.initials)}</span>
          ${escapeHtml(item.client)}
        </div>
      </td>
      <td>
        <div class="case-cell">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.nextTask ? `Proximo passo: ${escapeHtml(item.nextTask)}` : 'Sem proximo passo registrado'}</small>
        </div>
      </td>
      <td>
        <span class="status ${typeClass}">${escapeHtml(item.status)}</span>
        ${item.archived ? '<span class="client-chip archived-chip">Arquivado</span>' : ''}
      </td>
      <td>${escapeHtml(item.responsibleName || 'Sem responsavel')}</td>
      <td>${escapeHtml(item.due)}</td>
      <td><button class="secondary-button compact-button open-case-detail" data-case-id="${escapeAttribute(safeId(item.id))}">Abrir</button></td>
    </tr>
  `;
}

function updateCaseFilters() {
  const totals = {
    all: cases.filter((item) => !item.archived).length,
    analysis: cases.filter((item) => item.type === 'analysis' && !item.archived).length,
    active: cases.filter((item) => item.type === 'active' && !item.archived).length,
    waiting: cases.filter((item) => item.type === 'waiting' && !item.archived).length,
    closed: cases.filter((item) => item.type === 'closed' && !item.archived).length
  };

  document.querySelectorAll('.filter').forEach((button) => {
    const label = button.dataset.filter;
    const count = button.querySelector('span');
    if (count && totals[label] !== undefined) count.textContent = totals[label];
  });
}

function getVisibleCases() {
  if (selectedCaseFilter === 'all') return cases;
  return cases.filter((item) => item.type === selectedCaseFilter);
}

function renderCases(list = getVisibleCases()) {
  const activeCases = cases.filter((item) => !item.archived);
  const previewCases = activeCases.slice(0, 4);

  $('#cases-table').innerHTML = previewCases.map(caseRow).join('') || '<tr><td colspan="6">Nenhum caso encontrado.</td></tr>';
  $('#all-cases-table').innerHTML = list.map(caseRow).join('') || '<tr><td colspan="6">Nenhum caso encontrado.</td></tr>';
  $('#active-cases').textContent = activeCases.filter((item) => item.type !== 'closed').length;

  const datedCases = activeCases.filter((item) => item.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  $('#next-deadline').textContent = datedCases[0]?.due || 'Sem prazo';
  $('#next-deadline-note').textContent = datedCases.length ? 'Considere revisar a prioridade deste prazo.' : 'Crie ou acompanhe casos';

  const completedDocs = activeCases.reduce((acc, item) => acc + item.docs[0], 0);
  const totalDocs = activeCases.reduce((acc, item) => acc + item.docs[1], 0);
  const rate = totalDocs ? Math.round((completedDocs / totalDocs) * 100) : 0;
  $('#completion-rate').textContent = `${rate}%`;

  updateCaseFilters();
  populateCaseSelects();
}

function getOpenDocuments() {
  return documents.filter((item) => item.status !== 'received');
}

function getUploadedDocuments() {
  return documents.filter((item) => item.status === 'received');
}

function renderPendingList() {
  const list = getOpenDocuments();
  $('#pending-list').innerHTML = list.length
    ? list.slice(0, 3).map((document) => `
      <div class="pending-item">
        <span class="doc-icon">${document.status === 'rejected' ? '!' : '='}</span>
        <div>
          <strong>${escapeHtml(document.name)}</strong>
          <p>${escapeHtml(document.case)}</p>
        </div>
        <span class="client-chip ${document.status === 'rejected' ? 'overdue' : document.late ? 'overdue' : ''}">
          ${currentUser?.role === 'client'
            ? (document.status === 'rejected' ? 'Reenviar arquivo' : 'Enviar agora')
            : document.status === 'rejected' ? 'Recusado' : document.late ? 'Atrasado' : escapeHtml(document.client)
          }
        </span>
      </div>
    `).join('')
    : '<div class="pending-item"><div><strong>Nenhum documento pendente</strong><p>Tudo em dia por aqui.</p></div></div>';
}

function documentActions(document) {
  const documentId = safeId(document.id);

  if (currentUser?.role === 'client') {
    return document.status !== 'received'
      ? `<button class="new-case compact-button upload-document" data-document-id="${escapeAttribute(documentId)}">Enviar arquivo</button>`
      : `<a class="secondary-button compact-button" href="/api/documents/${encodeURIComponent(documentId)}/download">Baixar arquivo</a>`;
  }

  return `
    <div class="document-actions-stack">
      ${document.status !== 'received' ? `<button class="secondary-button compact-button mark-document-status" data-document-id="${escapeAttribute(documentId)}" data-status="received">Marcar recebido</button>` : ''}
      ${document.status !== 'pending' ? `<button class="secondary-button compact-button mark-document-status" data-document-id="${escapeAttribute(documentId)}" data-status="pending">Voltar pendente</button>` : ''}
      ${document.status !== 'rejected' ? `<button class="secondary-button compact-button mark-document-status" data-document-id="${escapeAttribute(documentId)}" data-status="rejected">Recusar</button>` : ''}
      ${document.status === 'pending' ? `<button class="secondary-button compact-button remind" data-document-id="${escapeAttribute(documentId)}">Lembrete</button>` : ''}
      ${(document.status === 'received' || document.status === 'rejected') ? `<button class="secondary-button compact-button request-resend" data-document-id="${escapeAttribute(documentId)}">Pedir reenvio</button>` : ''}
      ${document.fileName ? `<a class="secondary-button compact-button" href="/api/documents/${encodeURIComponent(documentId)}/download">Baixar</a>` : ''}
    </div>
  `;
}

function documentNotificationMessage(notification, fallback) {
  if (!notification) return fallback;
  if (notification.delivered) return `E-mail enviado para ${notification.recipient}.`;
  if (notification.reason === 'CLIENT_WITHOUT_EMAIL') return 'Documento criado, mas o cliente nao possui e-mail cadastrado.';
  return 'Documento criado, mas nao foi possivel enviar o e-mail agora.';
}

function documentRow(document) {
  const statusClass = document.status === 'received'
    ? 'success-chip'
    : document.status === 'rejected'
      ? 'status-chip-rejected'
      : document.late
        ? 'overdue'
        : '';
  const rowClass = document.status === 'received'
    ? 'document-row-received'
    : document.status === 'rejected'
      ? 'document-row-rejected'
      : '';
  const noteLines = [
    document.templateName ? `Modelo: ${document.templateName}` : '',
    document.statusNote ? `Observacao: ${document.statusNote}` : '',
    document.resendNote ? `Reenvio solicitado: ${document.resendNote}` : ''
  ].filter(Boolean);

  return `
    <article class="document-row ${rowClass}">
      <span class="doc-icon">${document.status === 'received' ? 'OK' : document.status === 'rejected' ? '!' : '='}</span>
      <div class="document-copy">
        <h3>${escapeHtml(document.name)}</h3>
        <p>${escapeHtml(document.client)} · ${escapeHtml(document.case)}</p>
        <small class="document-meta">
          ${document.status === 'received'
            ? `Recebido em ${escapeHtml(formatDateTime(document.uploadedAt))}${document.fileName ? ` · ${escapeHtml(document.fileName)}` : ''}${document.fileSize ? ` · ${escapeHtml(formatFileSize(document.fileSize))}` : ''}`
            : `Solicitado em ${escapeHtml(formatDateTime(document.requestedAt))}${document.remindedAt ? ` · Ultimo lembrete em ${escapeHtml(formatDateTime(document.remindedAt))}` : ''}`
          }
        </small>
        ${noteLines.map((line) => `<small class="document-note">${escapeHtml(line)}</small>`).join('')}
      </div>
      <div class="document-actions">
        <span class="client-chip ${statusClass}">${escapeHtml(documentStatusLabel(document.status))}</span>
        ${documentActions(document)}
      </div>
    </article>
  `;
}

function renderDocuments() {
  const openDocuments = getOpenDocuments();
  const uploadedDocuments = getUploadedDocuments();
  const grouped = new Map();

  for (const document of documents) {
    const key = document.caseId || document.case;
    if (!grouped.has(key)) {
      grouped.set(key, {
        caseId: document.caseId,
        caseTitle: document.case,
        client: document.client,
        items: []
      });
    }
    grouped.get(key).items.push(document);
  }

  const sections = Array.from(grouped.values()).map((group) => {
    const receivedCount = group.items.filter((item) => item.status === 'received').length;
    const rejectedCount = group.items.filter((item) => item.status === 'rejected').length;
    const pendingCount = group.items.filter((item) => item.status === 'pending').length;

    return `
      <section class="document-case-group">
        <div class="document-case-header">
          <div>
            <h3>${escapeHtml(group.caseTitle)}</h3>
            <p>${escapeHtml(group.client)} · ${group.items.length} item${group.items.length === 1 ? '' : 's'} no checklist</p>
          </div>
          <div class="document-case-counts">
            <span class="client-chip">${receivedCount} recebido${receivedCount === 1 ? '' : 's'}</span>
            <span class="client-chip">${pendingCount} pendente${pendingCount === 1 ? '' : 's'}</span>
            ${rejectedCount ? `<span class="client-chip status-chip-rejected">${rejectedCount} recusado${rejectedCount === 1 ? '' : 's'}</span>` : ''}
          </div>
        </div>
        <div>${group.items.map(documentRow).join('')}</div>
      </section>
    `;
  });

  $('#documents-list').innerHTML = sections.join('') || '<article class="document-row"><div><h3>Nenhum documento por aqui</h3><p>Quando houver novos checklists, solicitacoes ou uploads, eles aparecerao aqui.</p></div></article>';

  $('#pending-documents').textContent = openDocuments.length;
  $('#nav-document-count').textContent = openDocuments.length;
  $('#documents-title').textContent = currentUser?.role === 'client' ? 'Seus documentos' : 'Checklist dos casos';
  $('#documents-subcopy').textContent = currentUser?.role === 'client'
    ? 'Envie arquivos pendentes e acompanhe o que ja foi recebido ou devolvido para reenvio.'
    : 'Gerencie checklist por caso, receba arquivos e reutilize modelos por tipo de atendimento.';

  renderPendingList();
  renderClientPortal();
}

function renderTemplates() {
  const list = $('#document-templates-list');
  if (!list) return;

  if (!currentUser?.permissions?.sendDocumentReminders || currentUser.role === 'client') {
    list.innerHTML = '<div class="empty-state-card">Seu perfil nao pode gerenciar modelos de checklist.</div>';
    return;
  }

  if (!documentTemplates.length) {
    list.innerHTML = '<div class="empty-state-card">Nenhum modelo criado ainda. Monte um checklist reutilizavel para acelerar o proximo atendimento.</div>';
    return;
  }

  list.innerHTML = documentTemplates.map((template) => `
    <article class="template-card">
      <h3>${escapeHtml(template.name)}</h3>
      <p>${escapeHtml(template.serviceType || 'Tipo livre')}${template.description ? ` · ${escapeHtml(template.description)}` : ''}</p>
      <div class="template-items">
        ${template.items.map((item) => `<span>${escapeHtml(item.name)}</span>`).join('')}
      </div>
      <div class="template-actions">
        <button class="new-case compact-button apply-template" data-template-id="${escapeAttribute(safeId(template.id))}">Aplicar ao caso</button>
        <button class="secondary-button compact-button edit-template" data-template-id="${escapeAttribute(safeId(template.id))}">Editar</button>
      </div>
    </article>
  `).join('');
}

function renderUpdates() {
  const list = $('#updates-list');
  if (!list) return;

  if (!currentUser?.permissions?.createCases || currentUser.role === 'client') {
    list.innerHTML = '<div class="empty-state-card">Seu perfil nao pode publicar atualizacoes para clientes.</div>';
    return;
  }

  if (!caseUpdates.length) {
    list.innerHTML = '<div class="empty-state-card">Nenhuma atualizacao publicada ainda. As mensagens enviadas para os clientes aparecerao aqui.</div>';
    return;
  }

  list.innerHTML = caseUpdates.map((item) => `
    <article class="update-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.message)}</p>
      <small>${escapeHtml(item.case)} · ${escapeHtml(item.client)} · ${escapeHtml(formatDateTime(item.createdAt))}</small>
    </article>
  `).join('');
}

function renderActivityFeed() {
  const list = $('#client-history-list');
  if (!list) return;

  if (!currentUser || currentUser.role !== 'client') {
    list.innerHTML = '';
    return;
  }

  setVisibility($('#client-history-panel'), true);

  if (!activityFeed.length) {
    list.innerHTML = '<div><span class="timeline-dot amber-dot">i</span><p><strong>Ainda sem historico recente</strong><span>Quando houver novas mensagens ou movimentacoes de documento, elas aparecerao aqui.</span></p></div>';
    return;
  }

  list.innerHTML = activityFeed.slice(0, 6).map((item, index) => `
    <div>
      <span class="timeline-dot ${item.type === 'update' ? 'navy-dot' : index % 2 === 0 ? 'green-dot' : 'amber-dot'}">${item.type === 'update' ? '+' : '='}</span>
      <p>
        <strong class="history-item-title">${escapeHtml(item.title)}</strong>
        <span class="history-item-copy">${escapeHtml(item.message)}</span>
        <span>${escapeHtml(item.case)} · ${escapeHtml(formatDateTime(item.createdAt))}</span>
      </p>
    </div>
  `).join('');
}

function renderRoleSummary() {
  if (!currentUser) return;

  const permissionLines = [
    currentUser.permissions.createCases ? 'Pode criar e editar casos.' : 'Nao pode criar ou editar casos.',
    currentUser.permissions.sendDocumentReminders ? 'Pode solicitar documentos, gerir checklist e registrar lembretes.' : 'Nao pode solicitar documentos.',
    currentUser.permissions.manageOfficeUsers ? 'Pode gerenciar membros e acessos.' : 'Nao pode gerenciar acessos.',
    currentUser.role === 'client' ? 'Enxerga apenas os proprios casos e documentos.' : 'Enxerga os dados permitidos do escritorio.'
  ];

  $('#role-summary').innerHTML = permissionLines.map((line, index) => `
    <div>
      <span class="timeline-dot ${index % 2 === 0 ? 'amber-dot' : 'navy-dot'}">${index + 1}</span>
      <p><strong>${escapeHtml(currentUser.roleLabel)}</strong><span>${escapeHtml(line)}</span></p>
    </div>
  `).join('');
}

function renderClientPortal() {
  const isClient = currentUser?.role === 'client';
  setVisibility($('#client-portal-panel'), isClient);
  setVisibility($('#client-history-panel'), isClient);
  if (!isClient) return;

  const nextPending = getOpenDocuments()[0];
  const uploadedCount = getUploadedDocuments().length;
  const latestUpdate = caseUpdates[0] || null;

  $('#client-next-action').textContent = nextPending ? nextPending.name : 'Tudo certo por enquanto.';
  $('#client-next-action-copy').textContent = nextPending
    ? `O proximo passo e ${nextPending.status === 'rejected' ? 'reenviar' : 'enviar'} o arquivo para o caso "${nextPending.case}".`
    : 'Nao ha pendencias abertas no momento. Quando algo novo for solicitado, voce vera aqui.';
  $('#client-uploaded-count').textContent = `${uploadedCount} documento${uploadedCount === 1 ? '' : 's'}`;
  $('#client-latest-update-title').textContent = latestUpdate ? latestUpdate.title : 'Sem atualizacoes recentes';
  $('#client-latest-update-copy').textContent = latestUpdate
    ? `${latestUpdate.message} (${formatDateTime(latestUpdate.createdAt)})`
    : 'Quando a equipe enviar uma nova mensagem simples sobre o caso, ela aparecera aqui.';
  renderActivityFeed();
}

function resetTeamForm() {
  editingTeamUserId = null;
  const form = $('#team-form');
  form.reset();
  form.elements.userId.value = '';
  $('#team-password-field').hidden = false;
  $('#team-password-field input').required = true;
  $('#team-submit').textContent = 'Criar acesso ->';
  $('#team-cancel').hidden = true;
  $('#team-role').dispatchEvent(new Event('change'));
}

function startEditingUser(userId) {
  const user = teamUsers.find((item) => item.id === userId);
  if (!user) return;

  editingTeamUserId = userId;
  const form = $('#team-form');
  form.elements.userId.value = user.id;
  form.elements.name.value = user.name;
  form.elements.email.value = user.email;
  form.elements.role.value = user.role;
  form.elements.clientName.value = user.clientName || '';
  $('#team-password-field').hidden = true;
  $('#team-password-field input').required = false;
  $('#team-submit').textContent = 'Salvar alteracoes ->';
  $('#team-cancel').hidden = false;
  $('#team-role').dispatchEvent(new Event('change'));
  $('#settings-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTeam() {
  const teamList = $('#team-list');
  if (!teamList) return;

  if (!currentUser?.permissions?.manageOfficeUsers) {
    teamList.innerHTML = '<div class="pending-item"><div><strong>Acesso restrito</strong><p>Somente administradores podem visualizar e editar usuarios.</p></div></div>';
    return;
  }

  if (!teamUsers.length) {
    teamList.innerHTML = '<div class="pending-item"><div><strong>Nenhum membro adicional ainda</strong><p>Cadastre advogados, assistentes ou clientes pelo formulario ao lado.</p></div></div>';
    return;
  }

  teamList.innerHTML = teamUsers.map((user) => `
    <article class="document-row team-user-row">
      <span class="doc-icon">${escapeHtml(initials(user.name))}</span>
      <div class="document-copy">
        <h3>${escapeHtml(user.name)}</h3>
        <p>${escapeHtml(user.email)}${user.clientName ? ` · Cliente: ${escapeHtml(user.clientName)}` : ''}</p>
        <small class="document-meta">Criado em ${escapeHtml(formatDateTime(user.createdAt))}</small>
      </div>
      <div class="document-actions team-actions">
        <span class="client-chip ${user.verified ? 'success-chip' : 'overdue'}">${escapeHtml(user.roleLabel)}${user.verified ? '' : ' · pendente'}</span>
        <button class="secondary-button compact-button edit-team-user" data-user-id="${escapeAttribute(safeId(user.id))}">Editar</button>
        <button class="secondary-button compact-button danger-button delete-team-user" data-user-id="${escapeAttribute(safeId(user.id))}">Excluir</button>
      </div>
    </article>
  `).join('');
}

function resetClientForm() {
  editingClientId = null;
  const form = $('#client-form');
  form.reset();
  form.elements.clientId.value = '';
  $('#client-submit').textContent = 'Salvar cliente ->';
  $('#client-cancel').hidden = true;
}

function startEditingClient(clientId) {
  const client = clients.find((item) => item.id === clientId);
  if (!client) return;

  editingClientId = clientId;
  const form = $('#client-form');
  form.elements.clientId.value = client.id;
  form.elements.name.value = client.name || '';
  form.elements.email.value = client.email || '';
  form.elements.phone.value = client.phone || '';
  form.elements.documentId.value = client.documentId || '';
  form.elements.notes.value = client.notes || '';
  $('#client-submit').textContent = 'Salvar alteracoes ->';
  $('#client-cancel').hidden = false;
  $('#clients-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderClients() {
  const list = $('#clients-list');
  if (!list) return;

  if (!currentUser?.permissions?.createCases) {
    list.innerHTML = '<div class="empty-state-card">Seu perfil nao pode editar a base de clientes.</div>';
    return;
  }

  if (!clients.length) {
    list.innerHTML = '<div class="empty-state-card">Nenhum cliente cadastrado ainda.</div>';
    return;
  }

  list.innerHTML = clients.map((client) => `
    <article class="document-row team-user-row">
      <span class="doc-icon">${escapeHtml(initials(client.name))}</span>
      <div class="document-copy">
        <h3>${escapeHtml(client.name)}</h3>
        <p>${escapeHtml(client.email || 'Sem e-mail')} · ${escapeHtml(client.phone || 'Sem telefone')}</p>
        <div class="client-card-meta">
          <span class="client-chip">${client.caseCount} caso${client.caseCount === 1 ? '' : 's'}</span>
          <span class="client-chip">${client.activeCaseCount} ativo${client.activeCaseCount === 1 ? '' : 's'}</span>
          ${client.documentId ? `<span class="client-chip">${escapeHtml(client.documentId)}</span>` : ''}
        </div>
        ${client.notes ? `<small class="document-meta">${escapeHtml(client.notes)}</small>` : ''}
      </div>
      <div class="document-actions team-actions">
        <button class="secondary-button compact-button use-client-in-case" data-client-name="${escapeAttribute(client.name)}">Novo caso</button>
        <button class="secondary-button compact-button edit-client" data-client-id="${escapeAttribute(safeId(client.id))}">Editar</button>
        <button class="secondary-button compact-button danger-button delete-client" data-client-id="${escapeAttribute(safeId(client.id))}">Excluir</button>
      </div>
    </article>
  `).join('');
}

function applyPermissions() {
  if (!currentUser) return;

  const isClient = currentUser.role === 'client';
  document.body.classList.toggle('client-mode', isClient);

  $('#office-name').textContent = currentUser.office || 'Rota do Caso';
  $('#office-avatar').textContent = initials(currentUser.office);
  $('#office-subtitle').textContent = isClient && currentUser.clientName
    ? `Portal do cliente ${currentUser.clientName}`
    : 'Escritorio de advocacia';

  $('#user-name').textContent = currentUser.name;
  $('#user-role').textContent = currentUser.roleLabel;
  $('#user-avatar').textContent = initials(currentUser.name);

  $('#dashboard-eyebrow').textContent = isClient ? 'PORTAL DO CLIENTE' : 'PAINEL ROTA DO CASO';
  $('#dashboard-greeting').innerHTML = isClient ? `Ola, ${escapeHtml(currentUser.name.split(' ')[0])} <span>*</span>` : `Bom dia, ${escapeHtml(currentUser.name.split(' ')[0])} <span>*</span>`;
  $('#dashboard-subcopy').textContent = isClient
    ? 'Acompanhe seus documentos, veja o andamento e envie arquivos com mais tranquilidade.'
    : 'Acompanhe seus casos, documentos e proximos passos.';
  $('#pending-panel-title').textContent = isClient ? 'O que ainda falta resolver' : 'Checklist em aberto';
  $('#pending-panel-copy').textContent = isClient
    ? 'Arquivos que ainda dependem da sua acao.'
    : 'Itens pendentes, devolvidos ou aguardando reenvio.';

  setDisabledState($('#new-case'), !currentUser.permissions.createCases);
  setDisabledState($('#new-case-secondary'), !currentUser.permissions.createCases);
  setDisabledState($('#request-document'), !currentUser.permissions.sendDocumentReminders);
  setDisabledState($('#manage-templates'), !currentUser.permissions.sendDocumentReminders);
  setDisabledState($('#new-template'), !currentUser.permissions.sendDocumentReminders);
  setDisabledState($('#create-update'), !currentUser.permissions.createCases);
  setVisibility($('#settings-nav'), currentUser.permissions.accessSettings || currentUser.permissions.manageOfficeUsers);

  document.querySelector('[data-view="clients"]').hidden = isClient;
  document.querySelector('[data-view="updates"]').hidden = isClient;

  if (!currentUser.permissions.accessSettings && !currentUser.permissions.manageOfficeUsers && $('#settings-view').classList.contains('active-view')) {
    showView('dashboard');
  }

  const teamForm = $('#team-form');
  if (teamForm) {
    Array.from(teamForm.elements).forEach((field) => {
      if (field.tagName === 'BUTTON') return;
      field.disabled = !currentUser.permissions.manageOfficeUsers;
    });
    setDisabledState($('#team-submit'), !currentUser.permissions.manageOfficeUsers);
  }

  const clientForm = $('#client-form');
  if (clientForm) {
    Array.from(clientForm.elements).forEach((field) => {
      if (field.tagName === 'BUTTON') return;
      field.disabled = !currentUser.permissions.createCases;
    });
    setDisabledState($('#client-submit'), !currentUser.permissions.createCases);
  }

  const updateForm = $('#update-form');
  if (updateForm) {
    Array.from(updateForm.elements).forEach((field) => {
      if (field.tagName === 'BUTTON') return;
      field.disabled = !currentUser.permissions.createCases || isClient;
    });
    setDisabledState($('#update-submit'), !currentUser.permissions.createCases || isClient);
  }

  renderRoleSummary();
}

function showView(view) {
  if (view === 'settings' && !currentUser?.permissions?.manageOfficeUsers && !currentUser?.permissions?.accessSettings) {
    showToast('Seu perfil nao tem acesso a configuracoes.');
    return;
  }

  document.querySelectorAll('.view').forEach((section) => section.classList.remove('active-view'));
  $(`#${view}-view`).classList.add('active-view');
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  $('#page-title').textContent = {
    dashboard: 'Visao geral',
    cases: 'Casos',
    clients: 'Clientes',
    documents: 'Documentos',
    updates: 'Atualizacoes',
    settings: 'Configuracoes'
  }[view];
  $('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeCaseModal() {
  $('#modal-backdrop').hidden = true;
}

function closeDocumentModal() {
  $('#document-modal-backdrop').hidden = true;
}

function closeCaseDetailModal() {
  $('#case-detail-modal-backdrop').hidden = true;
  activeCaseDetail = null;
  $('#case-tasks-list').innerHTML = '';
  $('#case-detail-form').reset();
  $('#case-task-form').reset();
}

function closeTemplateModal() {
  $('#template-modal-backdrop').hidden = true;
  $('#template-form').reset();
  $('#template-form').elements.templateId.value = '';
  $('#template-modal-title').textContent = 'Novo modelo';
  $('#template-submit').textContent = 'Salvar modelo ->';
}

function closeTemplateApplyModal() {
  $('#template-apply-modal-backdrop').hidden = true;
  $('#template-apply-form').reset();
}

function closeDocumentNoteModal() {
  $('#document-note-modal-backdrop').hidden = true;
  $('#document-note-form').reset();
  pendingDocumentAction = null;
}

function openDocumentNoteModal(config) {
  pendingDocumentAction = config;
  $('#document-note-eyebrow').textContent = config.eyebrow;
  $('#document-note-title').textContent = config.title;
  $('#document-note-description').textContent = config.description;
  $('#document-note-label').childNodes[0].textContent = config.label;
  $('#document-note-form').elements.documentId.value = config.documentId;
  $('#document-note-form').elements.action.value = config.action;
  $('#document-note-form').elements.note.value = config.defaultNote || '';
  $('#document-note-form').elements.note.placeholder = config.placeholder || 'Escreva uma observacao clara para este documento.';
  $('#document-note-form').elements.note.required = Boolean(config.required);
  $('#document-note-submit').textContent = config.submitLabel;
  $('#document-note-modal-backdrop').hidden = false;
  $('#document-note-form').elements.note.focus();
}

function populateCaseSelects() {
  const availableCases = cases.filter((item) => !item.archived);
  const options = availableCases.length
    ? availableCases.map((item) => `<option value="${escapeAttribute(safeId(item.id))}">${escapeHtml(item.client)} · ${escapeHtml(item.title)}</option>`).join('')
    : '<option value="">Nenhum caso disponivel</option>';

  $('#document-case-select').innerHTML = options;
  $('#document-case-filter').innerHTML = `<option value="">Todos</option>${options === '<option value="">Nenhum caso disponivel</option>' ? '' : options}`;
  $('#template-apply-case-select').innerHTML = options;
  $('#update-case-select').innerHTML = options;
  $('#document-case-filter').value = documentFilters.caseId;
}

function updateNewCaseClientFields() {
  const form = $('#case-form');
  const isNewClient = form.elements.clientId.value === '__new__';
  $('#new-case-client-fields').hidden = !isNewClient;
  form.elements.clientName.required = isNewClient;
  form.elements.clientEmail.required = isNewClient;
  $('#case-client-helper').textContent = isNewClient
    ? 'Informe um e-mail válido: é para ele que serão enviados os links seguros de documentos.'
    : 'Selecione um cliente com e-mail para que ele possa receber documentos.';
}

function populateCaseClientSelect() {
  const select = $('#case-client-select');
  const withEmail = clients.filter((client) => client.email);
  select.innerHTML = `<option value="">Selecione um cliente</option>${withEmail.map((client) => `<option value="${escapeAttribute(safeId(client.id))}">${escapeHtml(client.name)} · ${escapeHtml(client.email)}</option>`).join('')}<option value="__new__">+ Cadastrar novo cliente</option>`;
  updateNewCaseClientFields();
}

function populateResponsibleOptions() {
  const options = assignableUsers.map((user) => `<option value="${escapeAttribute(safeId(user.id))}">${escapeHtml(user.name)}</option>`).join('');

  $('#case-create-responsible').innerHTML = `<option value="">Definir depois</option>${options}`;
  $('#case-edit-responsible').innerHTML = `<option value="">Sem responsavel</option>${options}`;
  $('#case-responsible-filter').innerHTML = `<option value="">Todos</option>${options}`;
  $('#case-responsible-filter').value = caseFilters.responsibleUserId;
}

async function loadSession() {
  const { user } = await api('/api/auth/me');
  currentUser = user;
  applyPermissions();
}

async function loadCases() {
  const params = new URLSearchParams();
  if (caseFilters.search) params.set('search', caseFilters.search);
  if (selectedCaseFilter !== 'all') params.set('type', selectedCaseFilter);
  if (caseFilters.responsibleUserId) params.set('responsibleUserId', caseFilters.responsibleUserId);
  if (caseFilters.dueWindow) params.set('dueWindow', caseFilters.dueWindow);
  if (caseFilters.archived) params.set('archived', caseFilters.archived);
  cases = await api(`/api/cases${params.toString() ? `?${params.toString()}` : ''}`);
  renderCases();
}

async function loadDocuments() {
  const params = new URLSearchParams();
  if (documentFilters.search) params.set('search', documentFilters.search);
  if (documentFilters.caseId) params.set('caseId', documentFilters.caseId);
  if (documentFilters.status) params.set('status', documentFilters.status);
  documents = await api(`/api/documents/pending${params.toString() ? `?${params.toString()}` : ''}`);
  renderDocuments();
}

async function loadClients() {
  if (!currentUser?.permissions?.createCases || currentUser.role === 'client') {
    clients = [];
    renderClients();
    return;
  }

  const params = new URLSearchParams();
  const search = ($('#client-search')?.value || '').trim();
  if (search) params.set('search', search);
  clients = await api(`/api/clients${params.toString() ? `?${params.toString()}` : ''}`);
  renderClients();
}

async function loadAssignableUsers() {
  if (!currentUser?.permissions?.createCases || currentUser.role === 'client') {
    assignableUsers = [];
    populateResponsibleOptions();
    return;
  }

  assignableUsers = await api('/api/team/assignable');
  populateResponsibleOptions();
}

async function loadTeam() {
  if (!currentUser?.permissions?.manageOfficeUsers) {
    renderTeam();
    return;
  }

  teamUsers = await api('/api/team/users');
  renderTeam();
}

async function loadDocumentTemplates() {
  if (!currentUser?.permissions?.sendDocumentReminders || currentUser.role === 'client') {
    documentTemplates = [];
    renderTemplates();
    return;
  }

  documentTemplates = await api('/api/document-templates');
  renderTemplates();
}

async function loadCaseUpdates() {
  const params = new URLSearchParams();
  params.set('limit', currentUser?.role === 'client' ? '12' : '50');
  caseUpdates = await api(`/api/updates?${params.toString()}`);
  renderUpdates();
  renderClientPortal();
}

async function loadActivityFeed() {
  const params = new URLSearchParams();
  params.set('limit', '20');
  activityFeed = await api(`/api/activity-feed?${params.toString()}`);
  renderActivityFeed();
}

async function loadData() {
  try {
    await Promise.all([
      loadCases(),
      loadDocuments(),
      loadClients(),
      loadAssignableUsers(),
      loadTeam(),
      loadDocumentTemplates(),
      loadCaseUpdates(),
      loadActivityFeed()
    ]);
  } catch (error) {
    if (error.message.includes('sessao') || error.message.includes('cliente ainda nao foi vinculado')) {
      showToast(error.message);
      window.location.assign('/?login=1');
      return;
    }
    showToast('Nao foi possivel carregar os dados. Verifique o servidor e o banco.');
    console.error(error);
  }
}

function renderCaseTasks() {
  const list = $('#case-tasks-list');
  const tasks = activeCaseDetail?.tasks || [];
  list.innerHTML = tasks.length
    ? tasks.map((task) => `
      <article class="task-row ${task.done ? 'done' : ''}">
        <input class="task-checkbox toggle-task" type="checkbox" data-task-id="${escapeAttribute(safeId(task.id))}" ${task.done ? 'checked' : ''} />
        <div class="task-copy">
          <strong>${escapeHtml(task.title)}</strong>
          <p>${task.dueDate ? `Prazo: ${escapeHtml(formatDate(task.dueDate))}` : 'Sem prazo definido'}${task.completedAt ? ` · Concluida em ${escapeHtml(formatDateTime(task.completedAt))}` : ''}</p>
        </div>
        <div class="task-actions">
          <button class="secondary-button compact-button edit-task" data-task-id="${escapeAttribute(safeId(task.id))}">Editar</button>
          <button class="secondary-button compact-button danger-button delete-task" data-task-id="${escapeAttribute(safeId(task.id))}">Excluir</button>
        </div>
      </article>
    `).join('')
    : '<div class="empty-state-card">Nenhum proximo passo registrado para este caso.</div>';
}

function fillCaseDetailForm(caseDetail) {
  const form = $('#case-detail-form');
  form.elements.caseId.value = caseDetail.id;
  form.elements.title.value = caseDetail.title || '';
  form.elements.legalArea.value = caseDetail.legalArea || '';
  form.elements.description.value = caseDetail.description || '';
  form.elements.opposingParty.value = caseDetail.opposingParty || '';
  form.elements.processNumber.value = caseDetail.processNumber || '';
  form.elements.statusKey.value = caseDetail.type || 'analysis';
  form.elements.responsibleUserId.value = caseDetail.responsibleUserId || '';
  form.elements.dueDate.value = caseDetail.dueDate || '';
  form.elements.internalNotes.value = caseDetail.internalNotes || '';
  form.elements.closedAt.value = caseDetail.closedAt || '';
  form.elements.closureResult.value = caseDetail.closureResult || '';
  form.elements.closureReason.value = caseDetail.closureReason || '';
  form.elements.closureFinancialStatus.value = caseDetail.closureFinancialStatus || 'unknown';
  form.elements.closureNotes.value = caseDetail.closureNotes || '';
  $('#case-task-form').elements.caseId.value = caseDetail.id;
  $('#case-detail-client-chip').textContent = caseDetail.client;
  $('#case-detail-docs-chip').textContent = `${caseDetail.docs[0]}/${caseDetail.docs[1]} docs`;
  $('#case-detail-archive-chip').textContent = caseDetail.type === 'closed' ? 'Encerrado' : 'Ativo';
  updateClosureFields();
  renderCaseTasks();
}

function updateClosureFields() {
  const form = $('#case-detail-form');
  const isClosed = form.elements.statusKey.value === 'closed';
  $('#case-closure-fields').hidden = !isClosed;
  form.elements.closedAt.required = isClosed;
  form.elements.closureResult.required = isClosed;
  form.elements.closureReason.required = isClosed;
  if (!isClosed) return;

  const pendingTasks = (activeCaseDetail?.tasks || []).filter((task) => !task.done).length;
  const pendingDocuments = Math.max(0, (activeCaseDetail?.docs?.[1] || 0) - (activeCaseDetail?.docs?.[0] || 0));
  const pendingItems = [
    pendingTasks && `${pendingTasks} tarefa${pendingTasks === 1 ? '' : 's'} pendente${pendingTasks === 1 ? '' : 's'}`,
    pendingDocuments && `${pendingDocuments} documento${pendingDocuments === 1 ? '' : 's'} pendente${pendingDocuments === 1 ? '' : 's'}`
  ].filter(Boolean);
  $('#case-closure-warning').textContent = pendingItems.length
    ? `Atenção: há ${pendingItems.join(' e ')}. Você pode encerrar o caso mesmo assim.`
    : 'Nenhuma tarefa ou documento pendente identificado neste caso.';
}

async function openCaseDetail(caseId) {
  try {
    const detail = await api(`/api/cases/${encodeURIComponent(caseId)}`);
    activeCaseDetail = detail;
    populateResponsibleOptions();
    fillCaseDetailForm(detail);
    $('#case-detail-modal-backdrop').hidden = false;
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshCaseDetail() {
  if (!activeCaseDetail?.id) return;
  const detail = await api(`/api/cases/${encodeURIComponent(activeCaseDetail.id)}`);
  activeCaseDetail = detail;
  fillCaseDetailForm(detail);
}

function openTemplateModal(templateId = '') {
  const template = documentTemplates.find((item) => item.id === templateId);
  const form = $('#template-form');
  form.reset();
  form.elements.templateId.value = template?.id || '';
  form.elements.name.value = template?.name || '';
  form.elements.serviceType.value = template?.serviceType || '';
  form.elements.description.value = template?.description || '';
  form.elements.items.value = template ? template.items.map((item) => item.name).join('\n') : '';
  $('#template-modal-title').textContent = template ? 'Editar modelo' : 'Novo modelo';
  $('#template-submit').textContent = template ? 'Salvar alteracoes ->' : 'Salvar modelo ->';
  $('#template-modal-backdrop').hidden = false;
}

function openTemplateApplyModal(templateId) {
  $('#template-apply-form').elements.templateId.value = templateId;
  populateCaseSelects();
  $('#template-apply-modal-backdrop').hidden = false;
}

function parseTemplateItemsInput(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, required: true }));
}

document.querySelectorAll('[data-view], [data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view || button.dataset.viewTarget)));

$('#new-case').addEventListener('click', () => {
  if (!currentUser?.permissions?.createCases) return showToast('Seu perfil nao pode criar casos.');
  populateResponsibleOptions();
  populateCaseClientSelect();
  $('#modal-backdrop').hidden = false;
});

$('#new-case-secondary').addEventListener('click', () => {
  if (!currentUser?.permissions?.createCases) return showToast('Seu perfil nao pode criar casos.');
  populateResponsibleOptions();
  populateCaseClientSelect();
  $('#modal-backdrop').hidden = false;
});

$('.close-modal').addEventListener('click', closeCaseModal);
$('#modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeCaseModal(); });
$('#document-modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeDocumentModal(); });
$('#close-document-modal').addEventListener('click', closeDocumentModal);
$('#case-detail-modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeCaseDetailModal(); });
$('#close-case-detail-modal').addEventListener('click', closeCaseDetailModal);
$('#template-modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeTemplateModal(); });
$('#close-template-modal').addEventListener('click', closeTemplateModal);
$('#template-apply-modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeTemplateApplyModal(); });
$('#close-template-apply-modal').addEventListener('click', closeTemplateApplyModal);
$('#document-note-modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeDocumentNoteModal(); });
$('#close-document-note-modal').addEventListener('click', closeDocumentNoteModal);
$('#document-note-cancel').addEventListener('click', closeDocumentNoteModal);
$('#case-client-select').addEventListener('change', updateNewCaseClientFields);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#modal-backdrop').hidden) closeCaseModal();
  if (event.key === 'Escape' && !$('#document-modal-backdrop').hidden) closeDocumentModal();
  if (event.key === 'Escape' && !$('#case-detail-modal-backdrop').hidden) closeCaseDetailModal();
  if (event.key === 'Escape' && !$('#template-modal-backdrop').hidden) closeTemplateModal();
  if (event.key === 'Escape' && !$('#template-apply-modal-backdrop').hidden) closeTemplateApplyModal();
  if (event.key === 'Escape' && !$('#document-note-modal-backdrop').hidden) closeDocumentNoteModal();
});

$('#case-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  submit.disabled = true;
  submit.textContent = 'Criando...';

  try {
    const createdCase = await api('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: data.get('clientId') === '__new__' ? '' : data.get('clientId'),
        clientName: data.get('clientName'),
        clientEmail: data.get('clientEmail'),
        title: data.get('title'),
        dueDate: data.get('due'),
        responsibleUserId: data.get('responsibleUserId'),
        internalNotes: data.get('internalNotes'),
        legalArea: data.get('legalArea'),
        description: data.get('description'),
        opposingParty: data.get('opposingParty'),
        processNumber: data.get('processNumber')
      })
    });
    form.reset();
    closeCaseModal();
    await Promise.all([loadCases(), loadClients()]);
    populateCaseClientSelect();
    populateCaseSelects();
    showView('cases');
    showToast(`Caso "${createdCase.title}" criado com sucesso.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Criar caso ->';
  }
});

$('#case-search').addEventListener('input', async (event) => {
  caseFilters.search = event.target.value.trim();
  await loadCases();
});

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', async () => {
  document.querySelectorAll('.filter').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  selectedCaseFilter = button.dataset.filter;
  await loadCases();
}));

$('#case-responsible-filter').addEventListener('change', async (event) => {
  caseFilters.responsibleUserId = event.target.value;
  await loadCases();
});

$('#case-due-filter').addEventListener('change', async (event) => {
  caseFilters.dueWindow = event.target.value;
  await loadCases();
});

$('#case-archived-filter').addEventListener('change', async (event) => {
  caseFilters.archived = event.target.value;
  await loadCases();
});

$('#share-portal').addEventListener('click', async () => {
  await navigator.clipboard?.writeText(location.href);
  showToast('Link do portal copiado para compartilhar.');
});

$('#request-document').addEventListener('click', () => {
  if (!currentUser?.permissions?.sendDocumentReminders) return showToast('Seu perfil nao pode solicitar documentos.');
  populateCaseSelects();
  $('#document-modal-backdrop').hidden = false;
});

$('#manage-templates').addEventListener('click', () => {
  document.querySelector('.document-templates-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#new-template').addEventListener('click', () => {
  if (!currentUser?.permissions?.sendDocumentReminders) return showToast('Seu perfil nao pode criar modelos.');
  openTemplateModal();
});

$('#create-update').addEventListener('click', () => {
  if (!currentUser?.permissions?.createCases) return showToast('Seu perfil nao pode publicar atualizacoes.');
  showView('updates');
  $('#update-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#document-search').addEventListener('input', async (event) => {
  documentFilters.search = event.target.value.trim();
  await loadDocuments();
});

$('#document-case-filter').addEventListener('change', async (event) => {
  documentFilters.caseId = event.target.value;
  await loadDocuments();
});

$('#document-status-filter').addEventListener('change', async (event) => {
  documentFilters.status = event.target.value;
  await loadDocuments();
});

$('#document-request-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#document-submit');
  submit.disabled = true;
  submit.textContent = 'Solicitando...';

  try {
    const payload = Object.fromEntries(new FormData(form));
    const createdDocument = await api('/api/documents/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    form.reset();
    closeDocumentModal();
    await loadDocuments();
    showView('documents');
    showToast(documentNotificationMessage(createdDocument.notification, 'Documento adicionado ao checklist do caso.'));
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Solicitar documento ->';
  }
});

$('#template-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#template-submit');
  const payload = Object.fromEntries(new FormData(form));
  const templateId = safeId(payload.templateId);
  submit.disabled = true;
  submit.textContent = 'Salvando...';

  try {
    const result = await api(templateId ? `/api/document-templates/${encodeURIComponent(templateId)}` : '/api/document-templates', {
      method: templateId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name,
        serviceType: payload.serviceType,
        description: payload.description,
        items: parseTemplateItemsInput(payload.items)
      })
    });

    if (templateId) {
      documentTemplates = documentTemplates.map((item) => item.id === result.id ? result : item);
      showToast('Modelo atualizado com sucesso.');
    } else {
      documentTemplates.unshift(result);
      showToast('Modelo criado com sucesso.');
    }

    renderTemplates();
    closeTemplateModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = templateId ? 'Salvar alteracoes ->' : 'Salvar modelo ->';
  }
});

$('#template-apply-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#template-apply-submit');
  const payload = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  submit.textContent = 'Aplicando...';

  try {
    const result = await api(`/api/document-templates/${encodeURIComponent(safeId(payload.templateId))}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: payload.caseId })
    });
    closeTemplateApplyModal();
    await loadDocuments();
    await loadCases();
    const deliveredCount = (result.notifications || []).filter((item) => item.delivered).length;
    const notificationCopy = result.createdCount
      ? deliveredCount === result.createdCount
        ? ` E-mails enviados: ${deliveredCount}.`
        : deliveredCount
          ? ` E-mails enviados: ${deliveredCount} de ${result.createdCount}.`
          : ' Nenhum e-mail foi enviado; confira o cadastro do cliente.'
      : '';
    showToast(`${result.createdCount} item${result.createdCount === 1 ? '' : 's'} aplicados ao caso.${notificationCopy}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Aplicar checklist ->';
  }
});

$('#document-note-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingDocumentAction?.documentId) return;

  const form = event.currentTarget;
  const submit = $('#document-note-submit');
  const note = String(form.elements.note.value || '').trim();

  if (pendingDocumentAction.required && !note) {
    showToast('Preencha a observacao para continuar.');
    form.elements.note.focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Salvando...';

  try {
    let result;
    if (pendingDocumentAction.action === 'request-resend') {
      result = await api(`/api/documents/${encodeURIComponent(pendingDocumentAction.documentId)}/request-resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });
      showToast(documentNotificationMessage(result.notification, 'Reenvio solicitado com observacao.'));
    } else {
      result = await api(`/api/documents/${encodeURIComponent(pendingDocumentAction.documentId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: pendingDocumentAction.status, note })
      });
      showToast(`Documento marcado como ${documentStatusLabel(pendingDocumentAction.status).toLowerCase()}.`);
    }

    documents = documents.map((item) => item.id === pendingDocumentAction.documentId ? result : item);
    renderDocuments();
    await loadCases();
    closeDocumentNoteModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = pendingDocumentAction?.submitLabel || 'Salvar ->';
  }
});

$('#update-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#update-submit');
  const payload = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  submit.textContent = 'Enviando...';

  try {
    const createdUpdate = await api(`/api/cases/${encodeURIComponent(safeId(payload.caseId))}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        message: payload.message
      })
    });
    caseUpdates.unshift(createdUpdate);
    renderUpdates();
    renderClientPortal();
    form.reset();
    populateCaseSelects();
    await loadActivityFeed();
    showToast('Atualizacao publicada para o cliente.');
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Enviar atualizacao ->';
  }
});

$('#team-role').addEventListener('change', (event) => {
  const isClient = event.target.value === 'client';
  $('#client-name-field').hidden = !isClient;
  $('#client-name-field input').required = isClient;
});

$('#team-cancel').addEventListener('click', () => {
  resetTeamForm();
  $('#team-feedback').hidden = true;
});

$('#team-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#team-submit');
  const feedback = $('#team-feedback');
  const payload = Object.fromEntries(new FormData(form));
  const isEditing = Boolean(payload.userId);
  submit.disabled = true;
  submit.textContent = isEditing ? 'Salvando...' : 'Criando...';
  feedback.hidden = true;

  try {
    const safeUserId = safeId(payload.userId);
    const result = await api(isEditing ? `/api/team/users/${encodeURIComponent(safeUserId)}` : '/api/team/users', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (isEditing) {
      teamUsers = teamUsers.map((user) => user.id === result.user.id ? result.user : user);
      feedback.textContent = 'Acesso atualizado com sucesso.';
      showToast('Alteracoes salvas.');
    } else {
      teamUsers.unshift(result.user);
      feedback.textContent = result.developmentCode
        ? `Acesso criado. Codigo de teste do novo usuario: ${result.developmentCode}`
        : result.message;
      showToast('Novo acesso criado com sucesso.');
    }

    renderTeam();
    resetTeamForm();
    feedback.hidden = false;
    await loadAssignableUsers();
    await loadClients();
  } catch (error) {
    feedback.hidden = false;
    feedback.textContent = error.message;
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = isEditing ? 'Salvar alteracoes ->' : 'Criar acesso ->';
  }
});

$('#client-cancel').addEventListener('click', () => {
  resetClientForm();
  $('#client-feedback').hidden = true;
});

$('#client-search').addEventListener('input', async () => {
  await loadClients();
});

$('#client-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#client-submit');
  const feedback = $('#client-feedback');
  const payload = Object.fromEntries(new FormData(form));
  const isEditing = Boolean(payload.clientId);
  submit.disabled = true;
  submit.textContent = 'Salvando...';
  feedback.hidden = true;

  try {
    const safeClientId = safeId(payload.clientId);
    const result = await api(isEditing ? `/api/clients/${encodeURIComponent(safeClientId)}` : '/api/clients', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (isEditing) {
      clients = clients.map((client) => client.id === result.id ? result : client);
      feedback.textContent = 'Cliente atualizado com sucesso.';
      showToast('Cliente atualizado.');
    } else {
      clients.unshift(result);
      feedback.textContent = 'Cliente criado com sucesso.';
      showToast('Cliente criado com sucesso.');
    }

    renderClients();
    resetClientForm();
    feedback.hidden = false;
  } catch (error) {
    feedback.hidden = false;
    feedback.textContent = error.message;
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = isEditing ? 'Salvar alteracoes ->' : 'Salvar cliente ->';
  }
});

$('#case-detail-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#case-detail-submit');
  const payload = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  submit.textContent = 'Salvando...';

  try {
    const updatedCase = await api(`/api/cases/${encodeURIComponent(safeId(payload.caseId))}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    activeCaseDetail = { ...activeCaseDetail, ...updatedCase };
    await loadCases();
    await refreshCaseDetail();
    showToast('Caso atualizado com sucesso.');
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Salvar caso ->';
  }
});

$('#case-status-select').addEventListener('change', updateClosureFields);

$('#case-task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeCaseDetail?.id) return;

  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Adicionando...';

  try {
    const createdTask = await api(`/api/cases/${encodeURIComponent(activeCaseDetail.id)}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    activeCaseDetail.tasks.push(createdTask);
    form.reset();
    form.elements.caseId.value = activeCaseDetail.id;
    renderCaseTasks();
    await loadCases();
    showToast('Proximo passo adicionado.');
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Adicionar';
  }
});

document.addEventListener('click', async (event) => {
  const remindButton = event.target.closest('.remind');
  const editButton = event.target.closest('.edit-team-user');
  const deleteButton = event.target.closest('.delete-team-user');
  const uploadButton = event.target.closest('.upload-document');
  const editClientButton = event.target.closest('.edit-client');
  const deleteClientButton = event.target.closest('.delete-client');
  const useClientButton = event.target.closest('.use-client-in-case');
  const openCaseButton = event.target.closest('.open-case-detail');
  const toggleTaskButton = event.target.closest('.toggle-task');
  const deleteTaskButton = event.target.closest('.delete-task');
  const editTaskButton = event.target.closest('.edit-task');
  const markStatusButton = event.target.closest('.mark-document-status');
  const requestResendButton = event.target.closest('.request-resend');
  const applyTemplateButton = event.target.closest('.apply-template');
  const editTemplateButton = event.target.closest('.edit-template');

  if (remindButton) {
    remindButton.disabled = true;
    try {
      const documentId = safeId(remindButton.dataset.documentId);
      const result = await api(`/api/documents/${encodeURIComponent(documentId)}/remind`, { method: 'POST' });
      documents = documents.map((item) => item.id === documentId
        ? { ...item, remindedAt: result.remindedAt }
        : item);
      renderDocuments();
      showToast(documentNotificationMessage(result.notification, 'Lembrete enviado para o cliente.'));
    } catch (error) {
      remindButton.disabled = false;
      showToast(error.message);
    }
    return;
  }

  if (editButton) {
    startEditingUser(safeId(editButton.dataset.userId));
    return;
  }

  if (deleteButton) {
    const confirmed = window.confirm('Deseja realmente excluir este acesso?');
    if (!confirmed) return;

    try {
      const userId = safeId(deleteButton.dataset.userId);
      await api(`/api/team/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      teamUsers = teamUsers.filter((item) => item.id !== userId);
      renderTeam();
      if (editingTeamUserId === userId) resetTeamForm();
      await loadAssignableUsers();
      showToast('Acesso removido com sucesso.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  if (uploadButton) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.png,.jpg,.jpeg,.doc,.docx';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const body = new FormData();
      body.append('file', file);
      uploadButton.disabled = true;
      uploadButton.textContent = 'Enviando...';

      try {
        const documentId = safeId(uploadButton.dataset.documentId);
        const result = await api(`/api/documents/${encodeURIComponent(documentId)}/upload`, {
          method: 'POST',
          body
        });
        documents = documents.map((item) => item.id === documentId ? { ...item, ...result } : item);
        renderDocuments();
        await loadCases();
        showToast('Arquivo enviado com sucesso.');
      } catch (error) {
        uploadButton.disabled = false;
        uploadButton.textContent = 'Enviar arquivo';
        showToast(error.message);
      }
    });
    fileInput.click();
    return;
  }

  if (editClientButton) {
    startEditingClient(safeId(editClientButton.dataset.clientId));
    return;
  }

  if (deleteClientButton) {
    const confirmed = window.confirm('Deseja realmente excluir este cliente?');
    if (!confirmed) return;

    try {
      const clientId = safeId(deleteClientButton.dataset.clientId);
      await api(`/api/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
      clients = clients.filter((item) => item.id !== clientId);
      renderClients();
      if (editingClientId === clientId) resetClientForm();
      showToast('Cliente removido com sucesso.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  if (useClientButton) {
    $('#case-form').elements.client.value = useClientButton.dataset.clientName || '';
    populateResponsibleOptions();
    $('#modal-backdrop').hidden = false;
    return;
  }

  if (openCaseButton) {
    await openCaseDetail(safeId(openCaseButton.dataset.caseId));
    return;
  }

  if (toggleTaskButton && activeCaseDetail?.id) {
    const taskId = safeId(toggleTaskButton.dataset.taskId);
    const currentTask = activeCaseDetail.tasks.find((item) => item.id === taskId);
    if (!currentTask) return;

    try {
      const updatedTask = await api(`/api/cases/${encodeURIComponent(activeCaseDetail.id)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: currentTask.title,
          dueDate: currentTask.dueDate,
          done: toggleTaskButton.checked
        })
      });
      activeCaseDetail.tasks = activeCaseDetail.tasks.map((task) => task.id === taskId ? updatedTask : task);
      renderCaseTasks();
      await loadCases();
    } catch (error) {
      toggleTaskButton.checked = !toggleTaskButton.checked;
      showToast(error.message);
    }
    return;
  }

  if (deleteTaskButton && activeCaseDetail?.id) {
    const confirmed = window.confirm('Deseja remover este proximo passo?');
    if (!confirmed) return;

    try {
      const taskId = safeId(deleteTaskButton.dataset.taskId);
      await api(`/api/cases/${encodeURIComponent(activeCaseDetail.id)}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
      activeCaseDetail.tasks = activeCaseDetail.tasks.filter((task) => task.id !== taskId);
      renderCaseTasks();
      await loadCases();
      showToast('Proximo passo removido.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  if (editTaskButton && activeCaseDetail?.id) {
    const taskId = safeId(editTaskButton.dataset.taskId);
    const currentTask = activeCaseDetail.tasks.find((item) => item.id === taskId);
    if (!currentTask) return;

    const nextTitle = window.prompt('Atualize o titulo da tarefa:', currentTask.title);
    if (!nextTitle) return;

    try {
      const updatedTask = await api(`/api/cases/${encodeURIComponent(activeCaseDetail.id)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nextTitle,
          dueDate: currentTask.dueDate,
          done: currentTask.done
        })
      });
      activeCaseDetail.tasks = activeCaseDetail.tasks.map((task) => task.id === taskId ? updatedTask : task);
      renderCaseTasks();
      await loadCases();
      showToast('Tarefa atualizada.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  if (markStatusButton) {
    const documentId = safeId(markStatusButton.dataset.documentId);
    const status = markStatusButton.dataset.status;
    openDocumentNoteModal({
      action: 'status',
      documentId,
      status,
      eyebrow: status === 'rejected' ? 'RECUSAR DOCUMENTO' : status === 'pending' ? 'RETORNAR A PENDENTE' : 'CONFIRMAR RECEBIMENTO',
      title: status === 'rejected' ? 'Explique o que precisa ser corrigido' : status === 'pending' ? 'Registrar retorno para pendente' : 'Registrar recebimento manual',
      description: status === 'rejected'
        ? 'Essa mensagem ajuda o cliente a entender o que precisa ajustar antes de reenviar.'
        : status === 'pending'
          ? 'Use este campo se quiser contextualizar por que o documento voltou para a lista pendente.'
          : 'Opcionalmente, registre uma observacao sobre o recebimento deste documento.',
      label: status === 'rejected' ? 'Motivo da recusa' : 'Observacao',
      placeholder: status === 'rejected'
        ? 'Ex.: O arquivo veio sem assinatura na ultima pagina.'
        : status === 'pending'
          ? 'Ex.: Voltamos este item para pendente enquanto aguardamos um arquivo mais atualizado.'
          : 'Ex.: Documento conferido e recebido por outro canal.',
      required: status === 'rejected',
      submitLabel: status === 'rejected' ? 'Recusar documento ->' : status === 'pending' ? 'Salvar observacao ->' : 'Marcar recebido ->'
    });
    return;
  }

  if (requestResendButton) {
    const documentId = safeId(requestResendButton.dataset.documentId);
    openDocumentNoteModal({
      action: 'request-resend',
      documentId,
      eyebrow: 'PEDIR REENVIO',
      title: 'Explique o que precisa ser reenviado',
      description: 'Essa observacao aparece no fluxo do cliente para orientar o novo envio.',
      label: 'Orientacao para o cliente',
      placeholder: 'Ex.: Reenvie o comprovante com assinatura legivel e todas as paginas.',
      required: true,
      submitLabel: 'Solicitar reenvio ->'
    });
    return;
  }

  if (applyTemplateButton) {
    openTemplateApplyModal(safeId(applyTemplateButton.dataset.templateId));
    return;
  }

  if (editTemplateButton) {
    openTemplateModal(safeId(editTemplateButton.dataset.templateId));
  }
});

$('.mobile-menu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
document.addEventListener('click', (event) => {
  const button = event.target.closest('.password-toggle');
  if (!button) return;
  const input = button.closest('.password-input').querySelector('input');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  button.setAttribute('title', visible ? 'Ocultar senha' : 'Mostrar senha');
  button.textContent = visible ? '◉' : '👁';
});
$('#logout-button').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.assign('/');
});

(async function boot() {
  try {
    await loadSession();
    await loadData();
    resetTeamForm();
    resetClientForm();
    closeTemplateModal();
  } catch (error) {
    showToast(error.message);
    window.location.assign('/?login=1');
  }
}());
