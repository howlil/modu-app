// @ts-nocheck — Node-only browser runner, verified by ChromeDriver in CI.
/**
 * Real Chrome WebDriver smoke: no new JS dependencies or lockfile changes.
 * CI installs Chrome and its matched ChromeDriver using setup-chrome.
 * Does not access production or external services.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const SITE = 'http://127.0.0.1:4173';
const DRIVER = 'http://127.0.0.1:9515';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const launched = [];
let session = null;

function start(command, args, label) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'], env: process.env
  });
  let output = '';
  child.stdout.on('data', c => { output += String(c); });
  child.stderr.on('data', c => { output += String(c); });
  launched.push({ child, label, logs: () => output.slice(-5000) });
  return child;
}

async function waitForService(url, label, deadline = 45000) {
  const startTime = Date.now();
  while (Date.now() - startTime < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await sleep(200);
  }
  throw new Error(label + ' did not become available.');
}

async function driver(method, path, body) {
  const response = await fetch(DRIVER + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) {
    throw new Error(method + ' ' + path + ': ' + JSON.stringify(json.value));
  }
  return json.value;
}
const withSession = (path) => '/session/' + session + path;
const execute = (script) => driver('POST', withSession('/execute/sync'), { script, args: [] });
const navigate = (url) => driver('POST', withSession('/url'), { url });
const refresh = () => driver('POST', withSession('/refresh'), {});

async function waitUntil(description, predicate, timeout = 16000) {
  const startTime = Date.now();
  let lastValue = null;
  while (Date.now() - startTime < timeout) {
    try {
      const result = await execute('return (' + predicate + ')');
      lastValue = result;
      if (result) return result;
    } catch (error) { lastValue = error.message; }
    await sleep(150);
  }
  throw new Error('Timed out: ' + description + ' (last=' + JSON.stringify(lastValue) + ')');
}
const clickButton = async (label) => {
  const escaped = JSON.stringify(label);
  const result = await execute(
    'const b=[...document.querySelectorAll("button")].find(x => x.textContent.trim() === ' +
    escaped + ' && !x.disabled); if(!b) return false; b.click(); return true;'
  );
  assert.equal(result, true, 'Click ' + label);
};
const clickAria = async (label) => {
  const result = await execute(
    'const e=document.querySelector("button[aria-label=" + ' + JSON.stringify(JSON.stringify(label)) +
    ' + "]"); if(!e || e.disabled) return false; e.click(); return true;'
  );
  assert.equal(result, true, 'Click aria ' + label);
};
const typeValue = async (selector, value, eventType = 'input') => {
  const script = 'const e=document.querySelector(' + JSON.stringify(selector) +
    '); if(!e) return false; e.value=' + JSON.stringify(value) +
    '; e.dispatchEvent(new Event(' + JSON.stringify(eventType) +
    ',{bubbles:true})); return true;';
  assert.equal(await execute(script), true, 'Fill ' + selector);
};

async function run() {
  const chrome = process.env.CHROME_BIN;
  const chromeDriver = process.env.CHROMEDRIVER_BIN;
  assert.ok(chrome, 'CHROME_BIN is required');
  assert.ok(chromeDriver, 'CHROMEDRIVER_BIN is required');
  start('bun', ['run', 'dev', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], 'Vite');
  start(chromeDriver, ['--port=9515'], 'ChromeDriver');
  await Promise.all([
    waitForService(SITE + '/habit', 'Vite application'),
    waitForService(DRIVER + '/status', 'ChromeDriver')
  ]);

  const result = await driver('POST', '/session', {
    capabilities: { alwaysMatch: {
      browserName: 'chrome', 'goog:chromeOptions': {
        binary: chrome,
        args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
          '--window-size=1240,900']
      }
    }}
  });
  session = result.sessionId;
  assert.ok(session, 'ChromeDriver session ID');

  await navigate(SITE + '/habit');
  await waitUntil('Today workspace and IndexedDB ready',
    'Boolean(document.querySelector("button") && document.body.textContent.includes("New habit") && !document.body.textContent.includes("Loading habits"))');
  await clickButton('New habit');
  await waitUntil('Create dialog opens', 'Boolean(document.querySelector("dialog[open] #habit-title"))');
  await typeValue('#habit-title', 'Browser smoke');
  await typeValue('#habit-measurement', 'COUNT', 'change');
  await waitUntil('Count target input appears', 'Boolean(document.querySelector("#habit-target"))');
  await typeValue('#habit-target', '3');
  await waitUntil('Create submit enabled',
    'Boolean([...document.querySelectorAll("dialog button")].find(x => x.textContent.trim()==="Create habit" && !x.disabled))');
  await clickButton('Create habit');
  await waitUntil('Persisted Count habit appears',
    'Boolean(document.body.textContent.includes("Browser smoke") && document.body.textContent.includes("0 / 3"))');
  for (const expected of [1, 2, 3]) {
    await clickAria('Increase Browser smoke');
    await waitUntil('Count increments to ' + expected,
      JSON.stringify(expected + ' / 3') + ' && document.body.textContent.includes(' + JSON.stringify(expected + ' / 3') + ')');
  }

  await refresh();
  await waitUntil('Count survives reload',
    'Boolean(document.body.textContent.includes("Browser smoke") && document.body.textContent.includes("3 / 3"))');

  await clickButton('History');
  await waitUntil('History and calendar visible',
    'Boolean(document.querySelector(\'section[aria-label="Habit calendar"]\') && document.body.textContent.includes("Browser smoke"))');
  await clickAria('Correct Browser smoke');
  await waitUntil('Correction dialog opens', 'Boolean(document.querySelector("dialog[open] #correction-amount"))');
  await typeValue('#correction-amount', '2');
  await clickButton('Save correction');
  await waitUntil('Correction saved', 'Boolean(document.body.textContent.includes("2 / 3"))');

  await clickButton('Insights');
  await waitUntil('Insights rendered', 'Boolean(document.querySelector(\'section[aria-label="Habit insights"]\'))');
  const snapshot = await execute(
    'return {hasCalendar: Boolean(document.querySelector(\'section[aria-label="Habit calendar"]\')),' +
    'hasFilter:Boolean(document.querySelector("#habit-insights-filter")),' +
    'hasTimezone:document.body.textContent.includes("Tracking timezone")};'
  );
  assert.deepEqual(snapshot, { hasCalendar: true, hasFilter: true, hasTimezone: true });
  await refresh();
  await waitUntil('Insights survive reload', 'Boolean(document.body.textContent.includes("Habit Tracker"))');
  await clickButton('History');
  await waitUntil('Corrected Count survives second reload',
    'Boolean(document.body.textContent.includes("Browser smoke") && document.body.textContent.includes("2 / 3"))');

  const firstTab = await driver('GET', withSession('/window'));
  const secondTab = await driver('POST', withSession('/window/new'), { type: 'tab' });
  await driver('POST', withSession('/window'), { handle: secondTab.handle });
  await navigate(SITE + '/habit');
  await waitUntil('Second tab loads persisted habits',
    'Boolean(document.body.textContent.includes("Browser smoke") && !document.body.textContent.includes("Loading habits"))');
  await clickButton('New habit');
  await waitUntil('Second tab create editor appears',
    'Boolean(document.querySelector("dialog[open] #habit-title"))');
  await typeValue('#habit-title', 'Created in second tab');
  await clickButton('Create habit');
  await waitUntil('Second tab commits its new habit',
    'Boolean(document.body.textContent.includes("Created in second tab") && !document.querySelector("dialog[open]"))');

  await driver('POST', withSession('/window'), { handle: firstTab });
  await clickButton('Today');
  await waitUntil('First tab sees second tab mutation',
    'Boolean(document.body.textContent.includes("Created in second tab") && document.body.textContent.includes("Browser smoke"))');
  process.stdout.write('Habit Tracker Chrome smoke passed: create → increment → reload → correction → insights → cross-tab visibility.\n');

  await navigate(SITE + '/');
  await waitUntil('Landing exposes all three active modules',
    'document.querySelectorAll("#tools a[href]").length === 3');
  const links = await execute(
    'return [...document.querySelectorAll("#tools a[href]")].map(a => a.getAttribute("href"));'
  );
  assert.deepEqual(links, ['/language', '/habit', '/pomodoro']);
  await navigate(SITE + '/language');
  await waitUntil('Language Learning workspace renders',
    'Boolean(document.body.textContent.includes("Language library") && !document.body.textContent.includes("Loading learning history"))');
  assert.equal(await execute(
    'return !document.body.textContent.includes("Retry connection") && document.title.includes("Language Learning");'
  ), true, 'Language Learning route is functional');
  process.stdout.write('Landing Chrome smoke passed: 3 cards and Language Learning route.\n');
}

let failure = null;
try { await run(); }
catch (error) {
  failure = error;
  process.stderr.write(String(error?.stack ?? error) + '\n');
} finally {
  if (session) {
    try { await driver('DELETE', '/session/' + session); } catch { /* chrome may already have exited */ }
  }
  for (const processInfo of launched.reverse()) {
    processInfo.child.kill('SIGTERM');
    if (failure) process.stderr.write('--- ' + processInfo.label + ' logs ---\n' + processInfo.logs() + '\n');
  }
}
if (failure) process.exitCode = 1;
