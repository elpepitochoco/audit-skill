function toggleMenu() {
  document.body.classList.toggle('menu-open');
}

const form = document.getElementById('signup');
const email = document.getElementById('email');
const error = document.getElementById('email-error');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!email.value.includes('@')) {
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const name = new URLSearchParams(location.search).get('name') || 'friend';
  document.getElementById('greeting').innerHTML = `Thanks, ${name}! Check your inbox.`;
  document.getElementById('toast').textContent = 'Subscription saved';
});

document.getElementById('open-terms').addEventListener('click', () => {
  document.getElementById('terms').hidden = false;
});
document.getElementById('close-terms').addEventListener('click', () => {
  document.getElementById('terms').hidden = true;
});
