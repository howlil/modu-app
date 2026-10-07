const STORAGE_KEY = 'module-focus-state-v1';
const ALARM_NAME = 'module-focus-end';
const RULE_ID_BASE = 10000;
const RULE_ID_MAX = 10199;
const MAX_BLOCKED_DOMAINS = 200;
const MAX_ACTIVE_SESSION_MS = 24 * 60 * 60 * 1000;
const PRODUCTION_CONTROL_ORIGIN = 'https://modu.howlil.site';
const PROTECTED_DOMAINS = new Set([
  'modu.howlil.site',
  'localhost',
  '127.0.0.1'
]);

const DEFAULT_STATE = {
  enabled: false,
  blockedDomains: [],
  activeSession: null,
  controlOrigin: 'https://modu.howlil.site'
};

function normalizeDomain(input) {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    let hostname = new URL(candidate).hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, '').replace(/\.$/, '');

    if (!hostname) return null;
    if (PROTECTED_DOMAINS.has(hostname)) return null;
    if (hostname.endsWith('.modu.howlil.site')) return null;

    return hostname;
  } catch {
    return null;
  }
}

function normalizeBlocklist(domains) {
  const normalized = new Set();

  for (const domain of Array.isArray(domains) ? domains : []) {
    const value = normalizeDomain(domain);
    if (value) normalized.add(value);
    if (normalized.size >= MAX_BLOCKED_DOMAINS) break;
  }

  return [...normalized].sort();
}

async function readState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const saved = result[STORAGE_KEY];

  return {
    ...DEFAULT_STATE,
    ...(saved && typeof saved === 'object' ? saved : {}),
    blockedDomains: normalizeBlocklist(saved?.blockedDomains),
    activeSession:
      saved?.activeSession &&
      typeof saved.activeSession.sessionId === 'string' &&
      typeof saved.activeSession.startedAt === 'number'
        ? {
            sessionId: saved.activeSession.sessionId,
            startedAt: saved.activeSession.startedAt,
            endsAt:
              typeof saved.activeSession.endsAt === 'number'
                ? saved.activeSession.endsAt
                : null,
            overtimeEnabled: saved.activeSession.overtimeEnabled === true
          }
        : null
  };
}

async function writeState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state
  });
}

function isActiveState(state) {
  return Boolean(
    state.enabled &&
      state.activeSession &&
      state.blockedDomains.length > 0
  );
}

function statusFromState(state) {
  return {
    installed: true,
    enabled: state.enabled === true,
    active: isActiveState(state),
    blockedDomains: [...state.blockedDomains],
    sessionId: state.activeSession?.sessionId ?? null
  };
}

function controlOriginFromSender(sender) {
  const source = sender?.tab?.url ?? sender?.url;
  if (!source) return null;

  try {
    const url = new URL(source);
    const origin = url.origin;

    if (origin === PRODUCTION_CONTROL_ORIGIN) return origin;

    if (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

async function clearModuleSessionRules() {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = rules
    .map((rule) => rule.id)
    .filter((id) => id >= RULE_ID_BASE && id <= RULE_ID_MAX);

  if (removeRuleIds.length === 0) return;

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds
  });
}

function buildBlockingRules(state) {
  if (!isActiveState(state)) return [];

  return state.blockedDomains.map((domain, index) => ({
    id: RULE_ID_BASE + index,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        url: `${chrome.runtime.getURL('blocked/index.html')}?domain=${encodeURIComponent(domain)}`
      }
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ['main_frame']
    }
  }));
}

async function applyBlockingRules(state) {
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existingRules
    .map((rule) => rule.id)
    .filter((id) => id >= RULE_ID_BASE && id <= RULE_ID_MAX);

  const addRules = buildBlockingRules(state);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds,
    addRules
  });
}

async function syncEndAlarm(state) {
  await chrome.alarms.clear(ALARM_NAME);

  const session = state.activeSession;
  if (!state.enabled || !session || session.overtimeEnabled || session.endsAt === null) {
    return;
  }

  if (session.endsAt <= Date.now()) {
    await endFocus(state, session.sessionId);
    return;
  }

  await chrome.alarms.create(ALARM_NAME, {
    when: session.endsAt
  });
}

async function endFocus(state, sessionId) {
  if (
    sessionId &&
    state.activeSession &&
    state.activeSession.sessionId !== sessionId
  ) {
    return state;
  }

  const nextState = {
    ...state,
    activeSession: null
  };

  await clearModuleSessionRules();
  await chrome.alarms.clear(ALARM_NAME);
  await writeState(nextState);

  return nextState;
}

async function reconcileState() {
  let state = await readState();
  const session = state.activeSession;

  if (session) {
    const staleAt = session.startedAt + MAX_ACTIVE_SESSION_MS;

    if (
      Date.now() >= staleAt ||
      (!session.overtimeEnabled &&
        session.endsAt !== null &&
        session.endsAt <= Date.now())
    ) {
      state = await endFocus(state, session.sessionId);
      return state;
    }
  }

  await applyBlockingRules(state);
  await syncEndAlarm(state);
  return state;
}

async function handleMessage(message, sender) {
  const origin = controlOriginFromSender(sender);
  if (!origin) throw new Error('Untrusted Module control surface.');

  let state = await readState();

  switch (message?.type) {
    case 'PING':
    case 'GET_STATUS':
      return statusFromState(state);

    case 'SET_ENABLED': {
      const nextState = {
        ...state,
        enabled: message.enabled === true,
        activeSession: message.enabled === true ? state.activeSession : null,
        controlOrigin: origin
      };

      if (!nextState.enabled) {
        await clearModuleSessionRules();
        await chrome.alarms.clear(ALARM_NAME);
        await writeState(nextState);
        return statusFromState(nextState);
      }

      await applyBlockingRules(nextState);
      await writeState(nextState);
      await syncEndAlarm(nextState);
      return statusFromState(nextState);
    }

    case 'SET_BLOCKLIST': {
      const nextState = {
        ...state,
        blockedDomains: normalizeBlocklist(message.blockedDomains),
        controlOrigin: origin
      };

      await applyBlockingRules(nextState);
      await writeState(nextState);
      return statusFromState(nextState);
    }

    case 'START_FOCUS': {
      if (!state.enabled) return statusFromState(state);

      if (
        typeof message.sessionId !== 'string' ||
        typeof message.startedAt !== 'number'
      ) {
        throw new Error('Invalid focus session.');
      }

      const now = Date.now();
      const endsAt =
        typeof message.endsAt === 'number' ? message.endsAt : null;

      if (
        message.startedAt > now + 60_000 ||
        message.startedAt < now - MAX_ACTIVE_SESSION_MS ||
        (endsAt !== null &&
          (endsAt < message.startedAt ||
            endsAt > message.startedAt + MAX_ACTIVE_SESSION_MS))
      ) {
        throw new Error('Invalid focus session timing.');
      }

      const nextState = {
        ...state,
        controlOrigin: origin,
        activeSession: {
          sessionId: message.sessionId,
          startedAt: message.startedAt,
          endsAt,
          overtimeEnabled: message.overtimeEnabled === true
        }
      };

      await applyBlockingRules(nextState);
      await writeState(nextState);
      await syncEndAlarm(nextState);
      return statusFromState(nextState);
    }

    case 'END_FOCUS':
      state = await endFocus(
        state,
        typeof message.sessionId === 'string' ? message.sessionId : undefined
      );
      return statusFromState(state);

    default:
      throw new Error('Unknown focus protection command.');
  }
}

let commandQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const task = commandQueue.then(() => handleMessage(message, sender));

  commandQueue = task.then(
    () => undefined,
    () => undefined
  );

  task
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Focus protection failed.'
      })
    );

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  void readState().then((state) =>
    endFocus(state, state.activeSession?.sessionId)
  );
});

chrome.runtime.onInstalled.addListener(() => {
  void reconcileState();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcileState();
});

void reconcileState();
