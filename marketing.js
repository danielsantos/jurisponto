const modal = document.querySelector('#auth-modal');
const signupForm = document.querySelector('#signup-form');
const loginForm = document.querySelector('#login-form');
const success = document.querySelector('.auth-success');
let pendingVerificationEmail = sessionStorage.getItem('rota_do_caso_pending_verification_email') || '';

const signupSubmit = signupForm.querySelector('[type="submit"]');
const signupTrialHighlight = document.createElement('div');
signupTrialHighlight.setAttribute('aria-label', '14 dias grátis, sem cartão de crédito');
signupTrialHighlight.innerHTML = '<strong>14 dias grátis</strong><span>Sem cartão de crédito</span>';
Object.assign(signupTrialHighlight.style, {
  alignItems: 'center',
  background: '#fff6e3',
  border: '1px solid #efd7a6',
  borderRadius: '6px',
  color: '#7c8797',
  display: 'flex',
  fontSize: '10px',
  gap: '12px',
  justifyContent: 'space-between',
  padding: '9px 11px'
});
signupTrialHighlight.querySelector('strong').style.cssText = 'color:#9b6c17;font-size:11px';
signupSubmit.textContent = 'Começar 14 dias grátis →';
signupSubmit.style.marginTop = '0';
signupSubmit.insertAdjacentElement('beforebegin', signupTrialHighlight);

function openModal(view) {
  modal.hidden = false;
  signupForm.hidden = view !== 'signup';
  loginForm.hidden = view !== 'login';
  success.hidden = true;
  document.body.classList.add('modal-open');
  modal.querySelector(`#${view}-form input`).focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function showFormError(container, message) {
  const error = container.querySelector('.auth-error');
  error.textContent = message;
  error.hidden = false;
}

function clearFormError(container) {
  container.querySelector('.auth-error').hidden = true;
}

async function request(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Nao foi possivel concluir esta acao.');
    error.data = result.error || null;
    error.meta = result.meta || null;
    throw error;
  }
  return result.data;
}

function showVerification(email, developmentCode) {
  pendingVerificationEmail = email;
  sessionStorage.setItem('rota_do_caso_pending_verification_email', email);
  signupForm.hidden = true;
  loginForm.hidden = true;
  success.hidden = false;
  success.innerHTML = `<span>OK</span><h2>Confira seu e-mail</h2><p>Digite o codigo de seis digitos enviado para o endereco informado.</p><p class="auth-error" hidden role="alert"></p>${developmentCode ? `<p class="development-code">Codigo de teste: <b>${developmentCode}</b></p>` : ''}<form class="verification-form"><input required name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" /><button class="button" type="submit">Confirmar e abrir painel -></button></form><button class="resend-code" type="button">Enviar novo codigo</button>`;
  success.querySelector('input').focus();
  success.querySelector('.verification-form').addEventListener('submit', verifyCode);
  success.querySelector('.resend-code').addEventListener('click', resendCode);
}

function showPasswordResetRequest() {
  signupForm.hidden = true;
  loginForm.hidden = true;
  success.hidden = false;
  success.innerHTML = `<span>+</span><h2>Redefina sua senha</h2><p>Informe seu e-mail e enviaremos um codigo para criar uma nova senha.</p><p class="auth-error" hidden role="alert"></p><form class="reset-request-form"><input required name="email" type="email" placeholder="voce@escritorio.com.br" /><button class="button" type="submit">Enviar codigo -></button></form><button class="resend-code back-to-login" type="button">Voltar para o login</button>`;
  success.querySelector('input').focus();
  success.querySelector('.reset-request-form').addEventListener('submit', requestPasswordReset);
  success.querySelector('.back-to-login').addEventListener('click', () => openModal('login'));
}

function showPasswordReset(email, developmentCode) {
  pendingVerificationEmail = email;
  success.innerHTML = `<span>OK</span><h2>Crie uma nova senha</h2><p>Digite o codigo recebido e escolha uma nova senha.</p><p class="auth-error" hidden role="alert"></p>${developmentCode ? `<p class="development-code">Codigo de teste: <b>${developmentCode}</b></p>` : ''}<form class="password-reset-form"><input required name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="Codigo de 6 digitos" /><span class="password-input"><input required name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Nova senha (minimo 8 caracteres)" /><button class="password-toggle" type="button" aria-label="Mostrar senha" title="Mostrar senha">👁</button></span><button class="button" type="submit">Salvar nova senha -></button></form><button class="resend-code" type="button">Enviar novo codigo</button>`;
  success.querySelector('.password-reset-form').addEventListener('submit', resetPassword);
  success.querySelector('.resend-code').addEventListener('click', resendPasswordResetCode);
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = new FormData(form).get('email');
  const button = form.querySelector('button');
  const error = success.querySelector('.auth-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Gerando codigo...';
  try {
    const result = await request('/api/auth/request-password-reset', { email });
    showPasswordReset(email, result.developmentCode);
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Enviar codigo ->';
  }
}

async function resetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const error = success.querySelector('.auth-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    await request('/api/auth/reset-password', { email: pendingVerificationEmail, ...Object.fromEntries(new FormData(form)) });
    success.innerHTML = '<span>OK</span><h2>Senha atualizada</h2><p>Sua senha foi redefinida com seguranca. Entre para continuar.</p><button class="button open-login" type="button">Ir para o login -></button>';
    success.querySelector('.open-login').addEventListener('click', () => openModal('login'));
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Salvar nova senha ->';
  }
}

async function verifyCode(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const error = success.querySelector('.auth-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Confirmando...';
  try {
    await request('/api/auth/verify-email', { email: pendingVerificationEmail, code: new FormData(form).get('code') });
    sessionStorage.removeItem('rota_do_caso_pending_verification_email');
    window.location.assign('/app');
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Confirmar e abrir painel ->';
  }
}

async function resendCode(event) {
  const button = event.currentTarget;
  const error = success.querySelector('.auth-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Enviando...';
  try {
    const result = await request('/api/auth/resend-verification', { email: pendingVerificationEmail });
    const code = success.querySelector('.development-code');
    if (result.developmentCode) {
      if (code) code.innerHTML = `Codigo de teste: <b>${result.developmentCode}</b>`;
      else button.insertAdjacentHTML('beforebegin', `<p class="development-code">Codigo de teste: <b>${result.developmentCode}</b></p>`);
    }
    button.textContent = 'Novo codigo enviado';
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Enviar novo codigo';
  }
}

async function resendPasswordResetCode(event) {
  const button = event.currentTarget;
  const error = success.querySelector('.auth-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Enviando...';
  try {
    const result = await request('/api/auth/request-password-reset', { email: pendingVerificationEmail });
    const code = success.querySelector('.development-code');
    if (result.developmentCode) {
      if (code) code.innerHTML = `Codigo de teste: <b>${result.developmentCode}</b>`;
      else button.insertAdjacentHTML('beforebegin', `<p class="development-code">Codigo de teste: <b>${result.developmentCode}</b></p>`);
    }
    button.textContent = 'Novo codigo enviado';
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Enviar novo codigo';
  }
}

document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', () => openModal(button.dataset.openModal)));
document.querySelectorAll('[data-show-form]').forEach((button) => button.addEventListener('click', () => {
  signupForm.hidden = button.dataset.showForm !== 'signup';
  loginForm.hidden = button.dataset.showForm !== 'login';
  success.hidden = true;
  clearFormError(button.dataset.showForm === 'signup' ? signupForm : loginForm);
}));
document.querySelector('.modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
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

signupForm.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  clearFormError(signupForm);
  submit.disabled = true;
  submit.textContent = 'Criando conta...';
  try {
    const result = await request('/api/auth/signup', Object.fromEntries(new FormData(form)));
    showVerification(result.user.email, result.developmentCode);
  } catch (exception) {
    showFormError(signupForm, exception.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Começar 14 dias grátis →';
  }
});

loginForm.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const email = new FormData(form).get('email');
  clearFormError(loginForm);
  submit.disabled = true;
  submit.textContent = 'Entrando...';
  try {
    await request('/api/auth/login', Object.fromEntries(new FormData(form)));
    window.location.assign('/app');
  } catch (exception) {
    if (exception.data?.details?.requiresVerification) showVerification(email, null);
    else showFormError(loginForm, exception.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Entrar na Rota do Caso ->';
  }
});

if (new URLSearchParams(window.location.search).get('login') === '1') openModal('login');
