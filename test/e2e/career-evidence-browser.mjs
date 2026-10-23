// @ts-nocheck — ChromeDriver acceptance, same dependency-free pattern as other Modu E2E.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const SITE = "http://127.0.0.1:4175";
const DRIVER = "http://127.0.0.1:9517";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const launched = [];
let session = null;

function start(command, args, label) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let logs = "";
  child.stdout.on("data", chunk => { logs += String(chunk); });
  child.stderr.on("data", chunk => { logs += String(chunk); });
  launched.push({ child, label, logs: () => logs.slice(-6000) });
}

async function service(url, label, timeout = 45000) {
  const begin = Date.now();
  while (Date.now() - begin < timeout) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch { /* Starting */ }
    await sleep(200);
  }
  throw new Error(label + " unavailable");
}

async function driver(method, path, body) {
  const response = await fetch(DRIVER + path, {
    method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) throw new Error(method + " " + path + " " + JSON.stringify(json.value));
  return json.value;
}
const current = path => "/session/" + session + path;
const js = source => driver("POST", current("/execute/sync"), { script: source, args: [] });
const nav = url => driver("POST", current("/url"), { url });
const refresh = () => driver("POST", current("/refresh"), {});

async function until(label, expression, timeout = 16000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      if (await js("return Boolean(" + expression + ");")) return;
    } catch { /* still loading */ }
    await sleep(150);
  }
  throw new Error("Timed out: " + label);
}

async function clickButton(name) {
  const found = await js("const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===" +
    JSON.stringify(name) + "&&!x.disabled);if(!b)return false;b.click();return true;");
  assert.equal(found, true, "Button " + name);
}
async function clickSelector(selector) {
  const found = await js("const b=document.querySelector(" + JSON.stringify(selector) +
    ");if(!b||b.disabled)return false;b.click();return true;");
  assert.equal(found, true, selector);
}
async function fill(selector, value, type = "input") {
  const ok = await js("const e=document.querySelector(" + JSON.stringify(selector) +
    ");if(!e)return false;e.value=" + JSON.stringify(value) +
    ";e.dispatchEvent(new Event(" + JSON.stringify(type) + ",{bubbles:true}));return true;");
  assert.equal(ok, true, selector);
}

async function run() {
  const chrome = process.env.CHROME_BIN, chromeDriver = process.env.CHROMEDRIVER_BIN;
  assert.ok(chrome && chromeDriver, "Chrome and ChromeDriver are required");
  start("bun", ["run", "dev", "--host", "127.0.0.1", "--port", "4175", "--strictPort"], "Vite");
  start(chromeDriver, ["--port=9517"], "ChromeDriver");
  await Promise.all([service(SITE + "/brag-document", "Career Evidence"), service(DRIVER + "/status", "ChromeDriver")]);
  const created = await driver("POST", "/session", {
    capabilities: { alwaysMatch: {
      browserName: "chrome", "goog:chromeOptions": {
        binary: chrome, args: ["--headless=new", "--no-sandbox",
          "--disable-dev-shm-usage", "--window-size=1240,900"]
      }
    }}
  });
  session = created.sessionId;
  await nav(SITE + "/brag-document");
  await until("Capture ready", 'document.querySelector("#career-note") && !document.querySelector("#career-note").disabled');

  await fill("#career-note", "M7 browser smoke: improved routing reliability");
  await clickButton("Save moment");
  await until("Captured moment saved",
    'document.body.textContent.includes("Moment saved.")&&document.body.textContent.includes("M7 browser smoke: improved routing reliability")');

  await clickButton("History");
  await until("History contains saved note",
    'document.body.textContent.includes("M7 browser smoke: improved routing reliability")&&document.querySelector("[id^=moment-open-]")');
  await clickSelector("[id^=moment-open-]");
  await until("Editor details", 'Boolean(document.querySelector("#moment-note")&&document.querySelector("#moment-project"))');
  await fill("#moment-project", "SOPFlow");
  await clickSelector("details summary");
  await fill("#moment-contribution", "Evaluated deterministic route ordering");
  await clickButton("Save changes");
  await until("Moment edit saved", 'document.body.textContent.includes("Changes saved.")');

  await clickButton("Archive moment");
  await until("Archive committed", 'document.body.textContent.includes("Moment archived.")');
  await clickButton("Archived (1)");
  await until("Archived history", 'Boolean(document.body.textContent.includes("M7 browser smoke: improved routing reliability"))');
  await clickButton("Restore");
  await until("Restored moment", 'document.body.textContent.includes("Moment restored.")');

  await clickButton("Documents");
  await until("Documents view", 'document.body.textContent.includes("No documents yet.")');
  await clickButton("Create your first document");
  await until("Goal form", 'Boolean(document.querySelector("#career-goal-title"))');
  await fill("#career-goal-title", "M7 Backend Interview");
  await fill("#career-goal-role", "Backend Engineer");
  await clickButton("Create document");
  await until("Output builder", 'Boolean(document.querySelector("section[aria-label=\"Choose career evidence\"] input[type=checkbox]"))');
  await clickSelector('section[aria-label="Choose career evidence"] input[type=checkbox]');
  await until("Evidence selected", 'document.body.textContent.includes("1 selected")');
  await fill('textarea[id^="output-story-"]',
    "Investigated an ordering-based router and verified the corrected paths.");
  await clickButton("Save draft");
  await until("Document draft persisted", 'document.body.textContent.includes("Document saved.")');
  await clickButton("Finalize version");
  await until("Final preview", 'Boolean(document.querySelector("#career-print-sheet")&&document.body.textContent.includes("Version 1"))');

  const snapshot = await js('return document.querySelector("#career-print-sheet").textContent;');
  assert.ok(snapshot.includes("M7 Backend Interview"));
  assert.ok(snapshot.includes("Investigated an ordering-based router"));
  assert.ok(snapshot.includes("M7 browser smoke: improved routing reliability"));
  assert.equal(await js('window.print=()=>{window.__careerPrinted=true};return true;'), true);
  await clickButton("Print / Save as PDF");
  assert.equal(await js('return window.__careerPrinted===true;'), true);

  await refresh();
  await until("Post-refresh capture", 'Boolean(document.querySelector("#career-note")&&!document.querySelector("#career-note").disabled)');
  await clickButton("Documents");
  await until("Persisted document", 'document.body.textContent.includes("M7 Backend Interview")');
  await clickSelector('[id^="output-open-"]');
  await until("Finalized history", 'document.body.textContent.includes("Version 1")');
  await clickSelector('[id^="career-snapshot-"]');
  await until("Immutable preview survives reload", 'Boolean(document.querySelector("#career-print-sheet"))');
  assert.equal(await js(
    "return document.querySelector('#career-print-sheet').textContent.includes(" +
      JSON.stringify("Investigated an ordering-based router") + ");"
  ), true);

  await driver("POST", current("/window/rect"), { width: 390, height: 844 });
  await until("Responsive viewport", 'window.innerWidth<=400');
  const mobile = await js('return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth};');
  assert.ok(mobile.documentWidth <= mobile.viewport + 2,
    "Career Evidence has horizontal page overflow at 390px: " + JSON.stringify(mobile));
  process.stdout.write("Career Evidence Chrome E2E passed: capture → enrich → archive/restore → document → finalize → print → reload → mobile.\n");
}

let failed = null;
try { await run(); }
catch (error) {
  failed = error;
  process.stderr.write(String(error?.stack ?? error) + "\n");
} finally {
  if (session) try { await driver("DELETE", "/session/" + session); } catch {}
  for (const proc of launched.reverse()) {
    proc.child.kill("SIGTERM");
    if (failed) process.stderr.write("--- " + proc.label + " ---\n" + proc.logs() + "\n");
  }
}
if (failed) process.exitCode = 1;
