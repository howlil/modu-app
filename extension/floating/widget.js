(() => {
  // A dynamically registered script may also be injected into an existing tab.
  if (globalThis.__moduFloatingInjectedV1) return;
  globalThis.__moduFloatingInjectedV1 = true;

  const SETTINGS_KEY = 'module-floating-settings-v1';
  const SNAPSHOT_KEY = 'module-floating-focus-v1';
  const POSITION_KEY = 'module-floating-position-v1';
  const HOST_ID = 'modu-floating-focus-root';
  if (/^(modu\.howlil\.site|localhost|127\.0\.0\.1)$/i.test(location.hostname)) return;

  const MODU_URL = 'https://modu.howlil.site/pomodoro';
  const BRAND_IMAGE = '<img class="modu-logo" alt="" src="' +
    chrome.runtime.getURL('floating/modu-logo.svg') + '">';
  // Lucide icon paths. The unpacked MV3 content script cannot import Svelte components.
  const glyphs = {
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'eye-off': '<path d="M10.58 10.59a2 2 0 0 0 2.83 2.83"/><path d="M9.88 5.09A10.93 10.93 0 0 1 12 4.9c7 0 10 7.1 10 7.1a12.06 12.06 0 0 1-4.09 4.92"/><path d="M6.61 6.61C3.4 8.5 2 12 2 12s3 7.1 10 7.1c1.61 0 3.09-.37 4.4-1.01"/><path d="M2 2 22 22"/>',
    'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'
  };
  const icon = (name) => '<svg class="modu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + glyphs[name] + '</svg>';

  let settings = { enabled: false, showTask: true, excludedDomains: [] };
  let snapshot = null;
  let mini = true;
  let dismissedId = null;
  let host = null;
  let shadow = null;
  let lastMarkupKind = '';
  let tickId = null;
  let position = null;
  let drag = null;

  const isExcluded = () => (settings.excludedDomains || []).some(
    (domain) => location.hostname === domain || location.hostname.endsWith('.' + domain)
  );
  const eligible = () => Boolean(settings.enabled && !isExcluded() && snapshot &&
    Number.isFinite(snapshot.updatedAt) && Date.now() - snapshot.updatedAt < 24 * 60 * 60 * 1000 &&
    snapshot.timer && snapshot.timer.status !== 'idle');
  const active = () => eligible() && snapshot.sessionId !== dismissedId;

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
    const progress = t.status === 'complete' || reached || t.status === 'overtime'
      ? 100 : Math.min(100, Math.max(0, 100 * (t.durationMs - remaining) / Math.max(1, t.durationMs)));
    return { label, text, progress, status: t.status };
  };

  // Fractions of available space keep placement visible across viewport sizes.
  const GAP = 8;
  const limit = (v, maximum) => Math.max(GAP, Math.min(
    Number.isFinite(v) ? v : GAP, Math.max(GAP, maximum)
  ));
  function normalizePosition(value) {
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: Math.max(0, Math.min(1, value.x)), y: Math.max(0, Math.min(1, value.y)) }
      : null;
  }
  function bounds() {
    const rect = host.getBoundingClientRect();
    return {
      maxX: Math.max(GAP, window.innerWidth - rect.width - GAP),
      maxY: Math.max(GAP, window.innerHeight - rect.height - GAP)
    };
  }
  function moveTo(x, y) {
    if (!host) return;
    const { maxX, maxY } = bounds();
    host.style.setProperty('right', 'auto', 'important');
    host.style.setProperty('bottom', 'auto', 'important');
    host.style.setProperty('left', limit(x, maxX) + 'px', 'important');
    host.style.setProperty('top', limit(y, maxY) + 'px', 'important');
  }
  function applyPosition() {
    if (!host?.isConnected || drag) return;
    const { maxX, maxY } = bounds();
    if (position) moveTo(GAP + position.x * (maxX - GAP), GAP + position.y * (maxY - GAP));
    else moveTo(maxX - 16, maxY - 16);
  }
  function onDragStart(event) {
    if (!event.isPrimary || event.button !== 0 || !host) return;
    if (event.target.closest('button, a, input, textarea, select')) return;
    const panel = shadow?.getElementById('modu-panel');
    if (!panel) return;
    const rect = host.getBoundingClientRect();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
      left: rect.left, top: rect.top, moved: false };
    panel.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function onDragMove(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    shadow?.getElementById('modu-panel')?.classList.add('modu-dragging');
    moveTo(drag.left + dx, drag.top + dy);
    event.preventDefault();
  }
  function onDragEnd(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    const panel = shadow?.getElementById('modu-panel');
    panel?.classList.remove('modu-dragging');
    if (panel?.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
    if (!moved || !host?.isConnected) return;
    const rect = host.getBoundingClientRect();
    const { maxX, maxY } = bounds();
    position = normalizePosition({
      x: (rect.left - GAP) / Math.max(1, maxX - GAP),
      y: (rect.top - GAP) / Math.max(1, maxY - GAP)
    });
    void chrome.storage.local.set({ [POSITION_KEY]: position }).catch(() => {});
  }

  function unmount() {
    if (tickId !== null) { clearInterval(tickId); tickId = null; }
    drag = null;
    host?.remove();
    host = null;
    shadow = null;
    lastMarkupKind = '';
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
    link.addEventListener('load', applyPosition);
    const panel = document.createElement('div');
    panel.id = 'modu-panel';
    shadow.append(panel);
    panel.addEventListener('pointerdown', onDragStart);
    panel.addEventListener('pointermove', onDragMove);
    panel.addEventListener('pointerup', onDragEnd);
    panel.addEventListener('pointercancel', onDragEnd);
    document.documentElement.append(host);
  }

  function rebuild(kind) {
    const panel = shadow?.getElementById('modu-panel');
    if (!panel) return;
    panel.className = kind === 'mini' ? 'modu-widget mini' : 'modu-widget';

    if (kind === 'mini') {
      panel.innerHTML =
        '<div class="modu-mini">' +
          '<div class="modu-mini-main" title="Drag to move">' +
            '<span class="modu-mini-brand">' + BRAND_IMAGE + '</span>' +
            '<span class="modu-mini-details">' +
              '<span class="modu-mini-top"><strong id="time" class="modu-mini-time" role="timer"></strong>' +
                '<span class="modu-mini-status"><span class="modu-status-dot" aria-hidden="true"></span><span id="state"></span></span>' +
              '</span>' +
              '<span class="modu-mini-task" id="mini-task"></span>' +
            '</span>' +
          '</div>' +
          '<button id="expand" class="modu-mini-expand" type="button" title="Expand focus timer" aria-label="Expand Modu floating timer">' +
            icon('chevron-up') +
          '</button>' +
        '</div>' +
        '<div class="modu-mini-progress" aria-hidden="true"><span id="progress"></span></div>';
      panel.querySelector('#expand').addEventListener('click', () => { mini = false; render(); });
    } else {
      panel.innerHTML =
        '<header class="modu-header">' +
          '<div class="modu-brand" title="Drag to move">' +
            BRAND_IMAGE + '<span class="modu-brand-copy"><strong>Modu</strong><span>Focus companion</span></span></div>' +
          '<div class="modu-controls">' +
            '<button id="collapse" class="modu-icon-button" type="button" title="Minimize" aria-label="Minimize floating timer">' + icon('chevron-down') + '</button>' +
            '<button id="hide" class="modu-icon-button" type="button" title="Hide until next session · click the extension toolbar icon to restore" aria-label="Hide floating timer until next session. Use the extension toolbar icon to restore.">' + icon('eye-off') + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="modu-content">' +
          '<div id="heading" class="modu-section-label"></div>' +
          '<div id="task" class="modu-task"></div>' +
          '<div id="next" class="modu-next" hidden></div>' +
          '<div class="modu-timer-row"><strong id="time" class="modu-timer" role="timer"></strong>' +
            '<span class="modu-status"><span class="modu-status-dot" aria-hidden="true"></span><span id="state"></span></span>' +
          '</div>' +
          '<div class="modu-progress" aria-hidden="true"><span id="progress"></span></div>' +
        '</div>' +
        '<footer class="modu-footer"><span class="modu-footer-copy">Focus at your pace</span>' +
          '<a class="modu-open" href="' + MODU_URL + '" target="_blank" rel="noopener noreferrer">Open timer ' + icon('arrow-up-right') + '</a>' +
        '</footer>';
      panel.querySelector('#collapse').addEventListener('click', () => { mini = true; render(); });
      panel.querySelector('#hide').addEventListener('click', () => {
        dismissedId = snapshot?.sessionId ?? null;
        unmount();
      });
    }
    lastMarkupKind = kind;
    applyPosition();
  }

  function render() {
    if (!active()) { unmount(); return; }
    mount();
    if (!shadow) return;
    if (tickId === null) tickId = setInterval(render, 1000);
    const kind = mini ? 'mini' : 'expanded';
    if (lastMarkupKind !== kind) rebuild(kind);
    const panel = shadow.getElementById('modu-panel');
    if (!panel) return;
    const values = timerValues();
    panel.dataset.status = values.status;
    panel.querySelector('#time').textContent = values.text;
    panel.querySelector('#state').textContent = values.label;
    panel.querySelector('#progress').style.width = values.progress + '%';
    if (mini) {
      const hasTask = settings.showTask && snapshot.timer.mode === 'focus' && snapshot.task?.title;
      panel.querySelector('#mini-task').textContent = hasTask ? snapshot.task.title :
        snapshot.timer.mode === 'focus' ? 'Focus session' : 'Take a break';
    } else {
      const hasTask = settings.showTask && snapshot.timer.mode === 'focus' && snapshot.task?.title;
      const nextAction = hasTask ? snapshot.task.nextAction || '' : '';
      const next = panel.querySelector('#next');
      panel.querySelector('#heading').textContent = snapshot.timer.mode === 'focus' ? 'CURRENT FOCUS' : 'BREAK';
      panel.querySelector('#task').textContent = hasTask ? snapshot.task.title :
        snapshot.timer.mode === 'focus' ? 'Focus session' : 'Take a short break';
      next.textContent = nextAction;
      next.hidden = !nextAction;
    }
  }

  window.addEventListener('resize', applyPosition);

  // Toolbar action restores the widget in this tab even during the same session.
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== 'MODU_FLOATING_RESTORE') return;
    dismissedId = null;
    mini = false;
    render();
    respond({ visible: Boolean(host?.isConnected) });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_KEY]) {
      const wasEnabled = settings.enabled;
      settings = changes[SETTINGS_KEY].newValue || settings;
      if (!wasEnabled && settings.enabled) { dismissedId = null; mini = true; }
    }
    if (changes[POSITION_KEY]) {
      position = normalizePosition(changes[POSITION_KEY].newValue);
      applyPosition();
    }
    if (changes[SNAPSHOT_KEY]) {
      const oldId = snapshot?.sessionId;
      snapshot = changes[SNAPSHOT_KEY].newValue || null;
      if (snapshot?.sessionId !== oldId) { dismissedId = null; mini = true; }
    }
    render();
  });
  chrome.storage.local.get([SETTINGS_KEY, SNAPSHOT_KEY, POSITION_KEY]).then((state) => {
    settings = state[SETTINGS_KEY] || settings;
    snapshot = state[SNAPSHOT_KEY] || null;
    position = normalizePosition(state[POSITION_KEY]);
    render();
  }).catch(() => {});
})();