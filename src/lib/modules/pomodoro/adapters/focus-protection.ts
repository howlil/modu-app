export type FocusProtectionConnection =
  | 'checking'
  | 'missing'
  | 'ready'
  | 'active'
  | 'error';

export type FocusProtectionExtensionStatus = {
  installed: boolean;
  enabled: boolean;
  active: boolean;
  blockedDomains: string[];
  sessionId: string | null;
};

export type FocusProtectionSession = {
  sessionId: string;
  startedAt: number;
  endsAt: number | null;
  overtimeEnabled: boolean;
};

type BridgeRequest =
  | { type: 'PING' }
  | { type: 'GET_STATUS' }
  | { type: 'SET_ENABLED'; enabled: boolean }
  | { type: 'SET_BLOCKLIST'; blockedDomains: string[] }
  | ({ type: 'START_FOCUS' } & FocusProtectionSession)
  | { type: 'END_FOCUS'; sessionId?: string };

type BridgeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

const REQUEST_TYPE = 'MODULE_FOCUS_REQUEST';
const RESPONSE_TYPE = 'MODULE_FOCUS_RESPONSE';
const WEB_SOURCE = 'module-web';
const EXTENSION_SOURCE = 'module-extension';
const DEFAULT_TIMEOUT_MS = 900;

export const PROTECTED_DOMAINS = ['modu.howlil.site', 'localhost', '127.0.0.1'] as const;

export function normalizeBlockedDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) throw new Error('Enter a website first.');

  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let hostname: string;

  try {
    hostname = new URL(withScheme).hostname.toLowerCase();
  } catch {
    throw new Error('Enter a valid website or domain.');
  }

  hostname = hostname.replace(/^www\./, '').replace(/\.$/, '');

  if (!hostname || !hostname.includes('.') && hostname !== 'localhost') {
    throw new Error('Enter a valid website or domain.');
  }

  if (isProtectedDomain(hostname)) {
    throw new Error('Module cannot block its own control surface.');
  }

  return hostname;
}

export function isProtectedDomain(domain: string) {
  const normalized = domain.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');

  return PROTECTED_DOMAINS.some(
    (protectedDomain) =>
      normalized === protectedDomain || normalized.endsWith(`.${protectedDomain}`)
  );
}

export function normalizeBlocklist(domains: string[]) {
  const normalized = new Set<string>();

  for (const domain of domains) {
    try {
      normalized.add(normalizeBlockedDomain(domain));
    } catch {
      // Ignore stale invalid entries while restoring local settings.
    }
  }

  return [...normalized].sort();
}

function requestExtension<T>(
  payload: BridgeRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BridgeResponse<T>> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, error: 'Browser bridge unavailable.' });
  }

  return new Promise((resolve) => {
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: 'Module Focus extension not detected.' });
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;

      const message = event.data as
        | {
            source?: string;
            type?: string;
            requestId?: string;
            response?: BridgeResponse<T>;
          }
        | undefined;

      if (
        !message ||
        message.source !== EXTENSION_SOURCE ||
        message.type !== RESPONSE_TYPE ||
        message.requestId !== requestId
      ) {
        return;
      }

      cleanup();
      resolve(message.response ?? { ok: false, error: 'Invalid extension response.' });
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
    };

    window.addEventListener('message', onMessage);
    window.postMessage(
      {
        source: WEB_SOURCE,
        type: REQUEST_TYPE,
        requestId,
        payload
      },
      window.location.origin
    );
  });
}

export async function getFocusProtectionStatus() {
  const response = await requestExtension<FocusProtectionExtensionStatus>({
    type: 'GET_STATUS'
  });

  if (!response.ok || !response.data) return null;
  return response.data;
}

export async function pingFocusProtection() {
  const response = await requestExtension<FocusProtectionExtensionStatus>(
    { type: 'PING' },
    500
  );

  if (!response.ok || !response.data) return null;
  return response.data;
}

export async function setFocusProtectionEnabled(enabled: boolean) {
  return requestExtension<FocusProtectionExtensionStatus>({
    type: 'SET_ENABLED',
    enabled
  });
}

export async function syncFocusProtectionBlocklist(blockedDomains: string[]) {
  return requestExtension<FocusProtectionExtensionStatus>({
    type: 'SET_BLOCKLIST',
    blockedDomains: normalizeBlocklist(blockedDomains)
  });
}

export async function startFocusProtection(session: FocusProtectionSession) {
  return requestExtension<FocusProtectionExtensionStatus>({
    type: 'START_FOCUS',
    ...session
  });
}

export async function stopFocusProtection(sessionId?: string) {
  return requestExtension<FocusProtectionExtensionStatus>({
    type: 'END_FOCUS',
    sessionId
  });
}
