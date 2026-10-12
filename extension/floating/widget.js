
(() => {
  // The ISOLATED world survives repeated programmatic injection in the same tab.
  if (globalThis.__moduFloatingInjectedV1) return;
  globalThis.__moduFloatingInjectedV1 = true;

  const SETTINGS_KEY = 'module-floating-settings-v1';
  const SNAPSHOT_KEY = 'module-floating-focus-v1';
  const HOST_ID = 'modu-floating-focus-root';
  const ownOrigin = /^(modu\.howlil\.site|localhost|127\.0\.0\.1)$/i.test(location.hostname);
  if (ownOrigin) return;

  let settings = { enabled: false, showTask: true, excludedDomains: [] };
  let snapshot = null;
  let mini = true;
  let dismissedId = null;
  let host = null;
  let shadow = null;
  let lastMarkupKind = '';
  let tickId = null;
  const isExcluded = () => (settings.excludedDomains || []).some(
    (domain) => location.hostname === domain || location.hostname.endsWith('.' + domain)
  );
  const active = () => Boolean(settings.enabled && !isExcluded() && snapshot &&
    Number.isFinite(snapshot.updatedAt) && Date.now() - snapshot.updatedAt < 24 * 60 * 60 * 1000 &&
    snapshot.timer && snapshot.timer.status !== 'idle' && snapshot.sessionId !== dismissedId);
  const fmt = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' +
      String(total % 60).padStart(2, '0');
  };
  const timerValues = () => {
    const t = snapshot.timer;
    const now = Date.now();
    const elapsed = t.status === 'overtime' && Number.isFinite(t.overtimeStartedAt)
      ? Math.max(0, now - t.overtimeStartedAt) : 0;
    const remaining = t.status === 'running' && Number.isFinite(t.endsAt)
      ? Math.max(0, t.endsAt - now)
      : t.status === 'complete' ? 0 : t.remainingMs;
    const reached = t.status === 'running' && remaining === 0;
    const label = reached ? 'Time reached' : t.status === 'running' ? (t.mode === 'focus' ? 'Focusing' : 'Break')
      : t.status === 'paused' ? 'Paused' : t.status === 'overtime' ? 'Overtime'
      : t.status === 'complete' ? 'Complete' : 'Ready';
    const text = t.status === 'overtime' ? '+' + fmt(elapsed) : fmt(remaining);
    const progress = t.status === 'complete' || reached ? 100 :
      t.status === 'overtime' ? 100 : Math.min(100, Math.max(0,
        100 * (t.durationMs - remaining) / Math.max(1, t.durationMs)));
    return { label, text, progress };
  };
  function unmount() {
    if (tickId !== null) { clearInterval(tickId); tickId = null; }
    host?.remove();
    host = null; shadow = null; lastMarkupKind = '';
  }
  function mount() {
    if (host?.isConnected) return;
    if (!document.documentElement) return;
    unmount();
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial!important;position:fixed!important;right:min(24px,5vw)!important;bottom:24px!important;z-index:2147483000!important;display:block!important;pointer-events:auto!important;';
    shadow = host.attachShadow({ mode: 'closed' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('floating/widget.css');
    shadow.append(link);
    const panel = document.createElement('div');
    panel.id = 'modu-panel';
    shadow.append(panel);
    document.documentElement.append(host);
  }
  function rebuild(kind) {
    const panel = shadow.getElementById('modu-panel');
    if (!panel) return;
    panel.className = kind === 'mini' ? 'modu-widget mini' : 'modu-widget';
    if (kind === 'mini') {
      panel.innerHTML = '<button class="modu-mini" id="expand" type="button" aria-label="Expand Modu floating focus"><span class="modu-mark" aria-hidden="true">m</span><span class="modu-mini-copy"><span class="modu-mini-time" id="time"></span><span class="modu-label" style="display:block" id="state"></span></span><span aria-hidden="true">⌃</span></button>';
      panel.querySelector('#expand').addEventListener('click', () => { mini = false; render(); });
    } else {
      panel.innerHTML = '<div class="modu-head"><span class="modu-brand"><span class="modu-mark" aria-hidden="true">m</span>modu</span><span class="modu-controls"><button class="modu-quiet" id="hide" type="button" aria-label="Hide until next session">Hide</button><button class="modu-quiet" id="collapse" type="button" aria-label="Minimize floating focus">−</button></span></div><div class="modu-separator"></div><div class="modu-label" id="heading"></div><div class="modu-task" id="task"></div><div class="modu-next" id="next"></div><div class="modu-row modu-space"><span class="modu-timer" id="time" role="timer"></span><span class="modu-state" id="state"></span></div><div class="modu-progress" aria-hidden="true"><div id="progress"></div></div><div class="modu-row"><span class="modu-label">Focus companion</span><a class="modu-open" id="open" target="_blank" rel="noopener noreferrer">Open Modu ↗</a></div>';
      panel.querySelector('#collapse').addEventListener('click', () => { mini = true; render(); });
      panel.querySelector('#hide').addEventListener('click', () => { dismissedId = snapshot?.sessionId ?? null; unmount(); });
      panel.querySelector('#open').href = 'https://modu.howlil.site/pomodoro';
    }
    lastMarkupKind = kind;
  }
  function render() {
    if (!active()) { unmount(); return; }
    mount();
    if (tickId === null) tickId = setInterval(render, 1000);
    const kind = mini ? 'mini' : 'expanded';
    if (lastMarkupKind !== kind) rebuild(kind);
    const values = timerValues();
    const panel = shadow.getElementById('modu-panel');
    panel.querySelector('#time').textContent = values.text;
    panel.querySelector('#state').textContent = values.label;
    if (!mini) {
      const taskVisible = settings.showTask && snapshot.timer.mode === 'focus' && snapshot.task?.title;
      panel.querySelector('#heading').textContent = snapshot.timer.mode === 'focus' ? 'CURRENT FOCUS' : 'BREAK';
      panel.querySelector('#task').textContent = taskVisible ? snapshot.task.title :
        snapshot.timer.mode === 'focus' ? 'Focus session' : 'Take a short break';
      panel.querySelector('#next').textContent = taskVisible ? (snapshot.task.nextAction || '') : '';
      panel.querySelector('#progress').style.width = values.progress + '%';
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_KEY]) settings = changes[SETTINGS_KEY].newValue || settings;
    if (changes[SNAPSHOT_KEY]) {
      const oldId = snapshot?.sessionId;
      snapshot = changes[SNAPSHOT_KEY].newValue || null;
      if (snapshot?.sessionId !== oldId) { dismissedId = null; mini = true; }
    }
    render();
  });
  chrome.storage.local.get([SETTINGS_KEY, SNAPSHOT_KEY]).then((state) => {
    settings = state[SETTINGS_KEY] || settings;
    snapshot = state[SNAPSHOT_KEY] || null;
    render();
  }).catch(() => {});
})();
