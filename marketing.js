const modal = document.querySelector('#auth-modal');
const signupForm = document.querySelector('#signup-form');
const loginForm = document.querySelector('#login-form');
const success = document.querySelector('.auth-success');

function openModal(view) {
  modal.hidden = false;
  signupForm.hidden = view !== 'signup';
  loginForm.hidden = view !== 'login';
  success.hidden = true;
  document.body.classList.add('modal-open');
  modal.querySelector('input').focus();
}
function closeModal() { modal.hidden = true; document.body.classList.remove('modal-open'); }

document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', () => openModal(button.dataset.openModal)));
document.querySelectorAll('[data-show-form]').forEach((button) => button.addEventListener('click', () => {
  signupForm.hidden = button.dataset.showForm !== 'signup';
  loginForm.hidden = button.dataset.showForm !== 'login';
}));
document.querySelector('.modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
document.querySelectorAll('.auth-form form').forEach((form) => form.addEventListener('submit', (event) => {
  event.preventDefault();
  signupForm.hidden = true;
  loginForm.hidden = true;
  success.hidden = false;
}));
