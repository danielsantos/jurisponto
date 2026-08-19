const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';
const intro = document.querySelector('#intro');
const details = document.querySelector('#document-details');
const form = document.querySelector('#upload-form');
const error = document.querySelector('#form-error');

async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível concluir esta ação.');
  return payload.data;
}

async function loadLink() {
  try {
    const documentInfo = await request(`/api/document-upload-link?token=${encodeURIComponent(token)}`);
    document.querySelector('#document-name').textContent = documentInfo.documentName;
    document.querySelector('#case-title').textContent = `Caso: ${documentInfo.caseTitle}`;
    intro.textContent = 'Envie o arquivo solicitado pela equipe.';
    details.hidden = false;
    form.hidden = false;
  } catch (exception) {
    intro.textContent = exception.message;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = document.querySelector('#file').files?.[0];
  if (!file) return;
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Enviando…';
  error.hidden = true;
  const body = new FormData();
  body.append('token', token);
  body.append('file', file);
  try {
    await request('/api/document-upload-link/upload', { method: 'POST', body });
    form.hidden = true;
    details.hidden = true;
    intro.textContent = 'Arquivo enviado com sucesso. A equipe responsável será avisada.';
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Enviar arquivo';
  }
});

loadLink();
