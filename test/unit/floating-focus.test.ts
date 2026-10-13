import { describe, expect, it } from 'vitest';
// @ts-expect-error Node built-in typings are not part of this browser app's tsconfig.
import { readFileSync } from 'node:fs';
import { consumePendingFocusTask, writePendingFocusTask } from '../../src/lib/shared/focus-sessions/context.ts';
import { normalizePomodoroSnapshot } from '../../src/lib/modules/pomodoro/adapters/persistence.ts';

const workerSource = readFileSync(new URL('../../extension/service-worker.js', import.meta.url), 'utf8');
const widgetSource = readFileSync(new URL('../../extension/floating/widget.js', import.meta.url), 'utf8');
const widgetStyles = readFileSync(new URL('../../extension/floating/quiet-dock-v2.css', import.meta.url), 'utf8');
const legacyWidgetStyles = readFileSync(new URL('../../extension/floating/widget.css', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../../src/app.css', import.meta.url), 'utf8');

type ExtensionResponse = { ok: boolean; data?: Record<string, unknown>; error?: string };
type MessageHandler = (message: Record<string, unknown>, sender: { url: string }, send: (value: ExtensionResponse) => void) => boolean;

function makeExtension() {
  const data = new Map<string, unknown>();
  const registered = new Set<string>();
  const injectedTabIds: number[] = [];
  const restoredTabIds: number[] = [];
  let actionClickHandler: ((tab: { id: number; url: string }) => void) | null = null;
  let handler: MessageHandler | null = null;
  const event = { addListener: () => undefined };
  const local = {
    async get(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.filter((item) => data.has(item)).map((item) => [item, data.get(item)]));
    },
    async set(update: Record<string, unknown>) {
      for (const [key, value] of Object.entries(update)) data.set(key, value);
    },
    async remove(key: string) { data.delete(key); }
  };
  const chrome = {
    storage: { local },
    runtime: {
      onMessage: { addListener: (callback: MessageHandler) => { handler = callback; } },
      onInstalled: event, onStartup: event,
      getURL: (path: string) => 'chrome-extension://test/' + path
    },
    alarms: { clear: async () => true, create: async () => undefined, onAlarm: event },
    declarativeNetRequest: {
      getSessionRules: async () => [],
      updateSessionRules: async () => undefined
    },
    action: {
      onClicked: {
        addListener: (callback: (tab: { id: number; url: string }) => void) => {
          actionClickHandler = callback;
        }
      }
    },
    tabs: { sendMessage: async (tabId: number, message: { type: string }) => {
      if (message.type === 'MODU_FLOATING_RESTORE') restoredTabIds.push(tabId);
      return { visible: true };
    }, query: async () => [
      { id: 10, url: 'https://example.com/' },
      { id: 11, url: 'https://modu.howlil.site/pomodoro' },
      { id: 12, url: 'chrome://extensions/' }
    ], update: async () => undefined },
    webNavigation: { onCommitted: event, onHistoryStateUpdated: event },
    scripting: {
      getRegisteredContentScripts: async () => [...registered].map((id) => ({ id })),
      registerContentScripts: async (items: {id: string}[]) => { items.forEach((item) => registered.add(item.id)); },
      unregisterContentScripts: async (arg: {ids: string[]}) => { arg.ids.forEach((id) => registered.delete(id)); },
      executeScript: async ({ target }: {target: {tabId: number}}) => { injectedTabIds.push(target.tabId); }
    }
  };
  new Function('chrome', workerSource)(chrome);
  async function send(message: Record<string, unknown>): Promise<ExtensionResponse> {
    if (!handler) throw new Error('Missing extension message handler');
    return new Promise((resolve) => handler!(message, { url: 'https://modu.howlil.site/pomodoro' }, resolve));
  }
  return { send, data, registered, injectedTabIds, restoredTabIds,
    clickAction(tab: { id: number; url: string }) {
      if (!actionClickHandler) throw new Error('Missing toolbar handler');
      actionClickHandler(tab);
    }
  };
}

function snapshot(updatedAt: number) {
  return {
    version: 1,
    sessionId: 'focus-100',
    updatedAt,
    task: { id: 'task-1', title: 'Verify duplicate payments', nextAction: 'Write an integration test' },
    timer: {
      mode: 'focus', status: 'running',
      durationMs: 1_500_000, remainingMs: 600_000,
      endsAt: updatedAt + 600_000, overtimeStartedAt: null
    }
  };
}

describe('Modu Floating Focus', () => {
  it('compiles both extension JavaScript entry points', () => {
    expect(() => new Function('chrome', workerSource)).not.toThrow();
    expect(() => new Function('chrome', widgetSource)).not.toThrow();
  });

  it('reuses the existing Modu design palette without a second theme', () => {
    for (const color of ['#252525', '#2468f2', '#eaf1ff', '#7a7a7a', '#e7e7e2']) {
      expect(appStyles.toLowerCase()).toContain(color);
      expect(widgetStyles.toLowerCase()).toContain(color);
    }
    expect(widgetStyles).toContain('width: min(216px, calc(100vw - 16px))');
    expect(widgetStyles).toContain('width: min(276px, calc(100vw - 16px))');
    expect(widgetStyles).toContain('border-radius: 14px');
    expect(widgetStyles).toContain('border-radius: 16px');
    expect(widgetSource).toContain("attachShadow({ mode: 'closed' })");
    expect(widgetSource).toContain("quiet-dock-v2.css");
    expect(widgetSource).toContain("__moduFloatingQuietDockV2");
    expect(widgetSource).not.toContain("if (globalThis.__moduFloatingInjectedV1) return");
    expect(legacyWidgetStyles).toContain(".modu-mini-brand");
    expect(widgetStyles).not.toContain(".modu-mini-brand");
    expect(widgetSource).toContain("MODU_FLOATING_RESTORE");
    expect(widgetSource).toContain("modu-logo.svg");
    expect(widgetSource).toContain("chevron-up");
    expect(widgetSource).toContain("eye-off");
    expect(widgetStyles).toContain("--modu-primary: #2468f2");
    expect(widgetStyles).toContain(".modu-icon-button");
    expect(widgetSource).toContain("module-floating-position-v1");
    expect(widgetSource).toContain("setPointerCapture");
    expect(widgetSource).toContain("pointercancel");
    expect(widgetSource).toContain("normalizePosition");
    expect(widgetSource).toContain('id="mini-task"');
    expect(widgetStyles).toContain(".modu-mini-expand");
    expect(widgetStyles).toContain("touch-action: none");
    const miniMarkup = widgetSource.split("if (kind === 'mini') {")[1]?.split("} else {")[0] ?? '';
    expect(miniMarkup).toContain('modu-mini-led');
    expect(miniMarkup).toContain('modu-mini-digits');
    expect(miniMarkup).not.toContain('BRAND_IMAGE');
    expect(widgetSource).toContain('modu-session-label');
    expect(widgetSource).toContain('id="elapsed"');
    expect(widgetSource).toContain('id="duration"');
    expect(widgetSource).not.toContain('Focus at your pace');
    expect(widgetSource).toContain('MODU_FLOATING_RESTORE');

  });

  it('drags the mini widget with pointer capture, saves position, and clamps on resize', async () => {
    type Pointer = {
      pointerId: number; clientX: number; clientY: number; isPrimary: boolean; button: number;
      target: { closest: (selector: string) => null | object }; preventDefault: () => void;
    };
    const listeners = new Map<string, (event: Pointer) => void>();
    const actions = new Map<string, () => void>();
    const viewport = { width: 1200, height: 800 };
    const styles = new Map<string, string>();
    const writes: Record<string, unknown>[] = [];
    let legacyRemovals = 0;
    let runtimeListeners = 0;
    const panel = {
      id: '', className: '', innerHTML: '', dataset: {} as Record<string, string>,
      classList: { add: (_name: string) => {}, remove: (_name: string) => {} },
      addEventListener: (name: string, cb: (event: Pointer) => void) => listeners.set(name, cb),
      setPointerCapture: (_pointerId: number) => {},
      hasPointerCapture: (_pointerId: number) => true,
      releasePointerCapture: (_pointerId: number) => {},
      querySelector: (id: string) => ({
        addEventListener: (_name: string, cb: () => void) => actions.set(id, cb),
        style: { width: '' }, textContent: '', hidden: false
      })
    };
    const shadow = {
      append: (_node: unknown) => {},
      getElementById: (_id: string) => panel
    };
    const host = {
      id: '', isConnected: false, style: {
        cssText: '',
        setProperty: (name: string, value: string) => styles.set(name, value)
      },
      attachShadow: (_options: unknown) => shadow,
      getBoundingClientRect: () => {
        const width = panel.className.includes('mini') ? 216 : 276;
        const height = panel.className.includes('mini') ? 64 : 230;
        return {
          width, height,
          left: styles.has('left') ? Number.parseFloat(styles.get('left')!) : viewport.width - width - 24,
          top: styles.has('top') ? Number.parseFloat(styles.get('top')!) : viewport.height - height - 24
        };
      },
      remove: () => { host.isConnected = false; }
    };
    let divCount = 0;
    const document = {
      createElement: (tag: string) =>
        tag === 'div' ? (divCount++ === 0 ? host : panel) : {
          rel: '', href: '', addEventListener: (_name: string, _callback: () => void) => {}
        },
      getElementById: (id: string) => id === 'modu-floating-focus-root'
        ? { remove: () => { legacyRemovals++; } } : null,
      documentElement: { append: (_node: unknown) => { host.isConnected = true; } }
    };
    const resizeHandlers = new Map<string, () => void>();
    const window = {
      get innerWidth() { return viewport.width; },
      get innerHeight() { return viewport.height; },
      addEventListener: (type: string, callback: () => void) => resizeHandlers.set(type, callback)
    };
    const chrome = {
      runtime: {
        getURL: (name: string) => 'chrome-extension://test/' + name,
        onMessage: { addListener: (_handler: unknown) => { runtimeListeners++; } }
      },
      storage: {
        onChanged: { addListener: (_handler: unknown) => {} },
        local: {
          get: async (_keys: string[]) => ({
            'module-floating-settings-v1': { enabled: true, showTask: true, excludedDomains: [] },
            'module-floating-focus-v1': snapshot(Date.now())
          }),
          set: async (value: Record<string, unknown>) => { writes.push(value); }
        }
      }
    };
    const isolatedWorld = {};
    const runWidget = new Function(
      'chrome', 'document', 'window', 'location', 'globalThis', 'setInterval', 'clearInterval',
      widgetSource
    );
    const run = () => runWidget(chrome, document, window, { hostname: 'example.org' }, isolatedWorld,
      (_fn: unknown, _ms: number) => 1, (_id: number) => {});
    run();
    run(); // Re-injection must be idempotent, and must replace a legacy V1 root.
    expect(legacyRemovals).toBe(1);
    expect(runtimeListeners).toBe(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(panel.innerHTML).toContain('mini-task');
    expect(panel.innerHTML).toContain('modu-mini-led');
    expect(panel.innerHTML).not.toContain('modu-logo');
    expect(panel.className).toBe('modu-widget mini');
    const fire = (type: string, x: number, y: number, interactive = false) => {
      const event: Pointer = {
        pointerId: 5, clientX: x, clientY: y, isPrimary: true, button: 0,
        target: { closest: () => interactive ? {} : null }, preventDefault: () => {}
      };
      const callback = listeners.get(type);
      if (!callback) throw new Error('Missing event listener: ' + type);
      callback(event);
    };

    // The dedicated expand button must never initiate a drag.
    fire('pointerdown', 900, 710, true);
    fire('pointermove', 0, 0);
    fire('pointerup', 0, 0);
    expect(writes).toHaveLength(0);

    fire('pointerdown', 900, 710);
    fire('pointermove', -200, -200);
    fire('pointerup', -200, -200);
    expect(writes).toHaveLength(1);
    expect(writes[0]['module-floating-position-v1']).toEqual({ x: 0, y: 0 });
    expect(styles.get('left')).toBe('8px');
    expect(styles.get('top')).toBe('8px');

    // Normalized placement stays accessible after expanding and shrinking the viewport.
    actions.get('#expand')?.();
    expect(panel.className).toBe('modu-widget');
    viewport.width = 400;
    viewport.height = 360;
    resizeHandlers.get('resize')?.();
    expect(styles.get('left')).toBe('8px');
    expect(styles.get('top')).toBe('8px');
  });

  it('preserves Daily next action through the one-shot handoff and Pomodoro restore', () => {
    const data = new Map<string, string>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); }
    } });
    try {
      const task = { id: 'task-1', title: 'Payment test', nextAction: 'Verify idempotent callback' };
      writePendingFocusTask(task);
      expect(consumePendingFocusTask(task.id)).toEqual(task);
      expect(consumePendingFocusTask(task.id)).toBeNull();
      expect(normalizePomodoroSnapshot({ linkedTask: task }, Date.now()).linkedTask).toEqual(task);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
      else Reflect.deleteProperty(globalThis, 'sessionStorage');
    }
  });

  it('keeps floating independent from blocker and rejects outdated snapshots', async () => {
    const extension = makeExtension();
    const attemptedBeforeOptIn = await extension.send({
      type: 'SET_FLOATING_SNAPSHOT', snapshot: snapshot(Date.now())
    });
    expect(attemptedBeforeOptIn.data?.stored).toBe(false);
    expect(extension.data.has('module-floating-focus-v1')).toBe(false);

    const before = await extension.send({ type: 'PING' });
    expect(before.data?.active).toBe(false);
    expect((before.data?.floating as {enabled: boolean}).enabled).toBe(false);
    const enabled = await extension.send({
      type: 'SET_FLOATING_SETTINGS',
      settings: { enabled: true, showTask: true, excludedDomains: ['example.com'] }
    });
    expect(enabled.ok).toBe(true);
    expect(extension.registered.has('modu-floating-focus')).toBe(true);
    // Only ordinary websites are injected; injection is asynchronous after opt-in.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(extension.injectedTabIds).toContain(10);
    expect(extension.injectedTabIds).not.toContain(11);
    expect(extension.injectedTabIds).not.toContain(12);
    expect((await extension.send({type:'GET_STATUS'})).data?.active).toBe(false);

    const now = Date.now();
    expect((await extension.send({type:'SET_FLOATING_SNAPSHOT', snapshot:snapshot(now)})).ok).toBe(true);
    const stale = {...snapshot(now - 100), task:{ id:'task-1', title:'OLD' }};
    await extension.send({type:'SET_FLOATING_SNAPSHOT', snapshot:stale});
    const latest = extension.data.get('module-floating-focus-v1') as ReturnType<typeof snapshot>;
    expect(latest.task.title).toBe('Verify duplicate payments');

    await extension.send({ type: 'SET_FLOATING_SETTINGS', settings: { showTask: false } });
    expect((extension.data.get('module-floating-focus-v1') as ReturnType<typeof snapshot>).task).toBeNull();
    await extension.send({ type: 'SET_FLOATING_SNAPSHOT', snapshot: snapshot(now + 1) });
    expect((extension.data.get('module-floating-focus-v1') as ReturnType<typeof snapshot>).task).toBeNull();
    expect((await extension.send({type:'SET_FLOATING_SNAPSHOT', snapshot:{...snapshot(now),timer:{mode:'invalid'}}})).ok).toBe(false);

    extension.clickAction({ id: 10, url: 'https://example.com/' });
    extension.clickAction({ id: 11, url: 'https://modu.howlil.site/pomodoro' });
    extension.clickAction({ id: 12, url: 'brave://extensions/' });
    extension.clickAction({ id: 13, url: 'https://news.ycombinator.com/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(extension.restoredTabIds).toEqual([13]);
    expect(extension.injectedTabIds).toContain(13);

    expect((await extension.send({type:'SET_FLOATING_SETTINGS', settings:{enabled:false}})).ok).toBe(true);
    expect(extension.registered.size).toBe(0);
    extension.clickAction({ id: 14, url: 'https://example.org/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(extension.restoredTabIds).toEqual([13]);
    await extension.send({type:'CLEAR_FLOATING_CONTEXT'});
    expect(extension.data.has('module-floating-focus-v1')).toBe(false);
  });
});
