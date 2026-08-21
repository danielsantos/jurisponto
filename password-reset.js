const emailForm = document.querySelector('#email-form');
const resetForm = document.querySelector('#reset-form');
const message = document.querySelector('#message');
const resendButton = document.querySelector('#resend');
const emailInput = document.querySelector('#email');
const codeInput = document.querySelector('#code');
const passwordInput = document.querySelector('#password');
const intro = document.querySelector('#reset-intro');

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `message ${type}`;
  message.hidden = false;
}

function clearMessage() { message.hidden = true; }

async function post(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || 'Não foi possível concluir esta ação.');
  return result.data;
}

async function requestCode() {
  const submit = emailForm.querySelector('[type="submit"]');
  clearMessage();
  submit.disabled = true;
  submit.textContent = 'Enviando...';
  try {
    const result = await post('/api/auth/request-password-reset', { email: emailInput.value });
    emailInput.disabled = true;
    emailForm.hidden = true;
    resetForm.hidden = false;
    resendButton.hidden = false;
    intro.textContent = 'Se houver uma conta com esse e-mail, enviamos um código de seis dígitos. Ele expira em 15 minutos.';
    showMessage(result.message, 'success');
    if (result.developmentCode) showMessage(`${result.message} Código de teste: ${result.developmentCode}`, 'success');
    codeInput.focus();
  } catch (error) {
    showMessage(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Enviar código';
  }
}

emailForm.addEventListener('submit', (event) => { event.preventDefault(); requestCode(); });
resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = resetForm.querySelector('[type="submit"]');
  clearMessage();
  submit.disabled = true;
  submit.textContent = 'Salvando...';
  try {
    const result = await post('/api/auth/reset-password', { email: emailInput.value, code: codeInput.value, password: passwordInput.value });
    resetForm.hidden = true;
    resendButton.hidden = true;
    intro.textContent = 'Sua senha foi atualizada. Agora você pode entrar normalmente.';
    showMessage(result.message, 'success');
  } catch (error) {
    showMessage(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Salvar nova senha';
  }
});

resendButton.addEventListener('click', async () => {
  resendButton.disabled = true;
  resendButton.textContent = 'Enviando...';
  try {
    const result = await post('/api/auth/request-password-reset', { email: emailInput.value });
    showMessage(result.developmentCode ? `${result.message} Código de teste: ${result.developmentCode}` : result.message, 'success');
    codeInput.focus();
  } catch (error) {
    showMessage(error.message);
  } finally {
    resendButton.disabled = false;
    resendButton.textContent = 'Enviar um novo código';
  }
});

document.querySelector('.toggle-password').addEventListener('click', (event) => {
  const visible = passwordInput.type === 'password';
  passwordInput.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'Ocultar' : 'Mostrar';
  event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
});
