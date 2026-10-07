const STORAGE_KEY = 'module-focus-state-v1';

const timeElement = document.getElementById('time');
const domainElement = document.getElementById('domain');
const backLink = document.getElementById('back');

const params = new URLSearchParams(window.location.search);
const domain = params.get('domain');

if (domain) {
  domainElement.textContent = domain;
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function render() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY];
  const session = state?.activeSession;

  if (typeof state?.controlOrigin === 'string') {
    backLink.href = `${state.controlOrigin}/pomodoro`;
  }

  if (!session) {
    timeElement.textContent = 'Protection active';
    return;
  }

  if (
    typeof session.endsAt === 'number' &&
    !session.overtimeEnabled &&
    session.endsAt > Date.now()
  ) {
    timeElement.textContent = formatRemaining(session.endsAt - Date.now());
    return;
  }

  if (
    typeof session.endsAt === 'number' &&
    session.endsAt > Date.now()
  ) {
    timeElement.textContent = formatRemaining(session.endsAt - Date.now());
    return;
  }

  timeElement.textContent = session.overtimeEnabled ? 'Focus overtime' : 'Protection active';
}

void render();
window.setInterval(() => void render(), 1000);
