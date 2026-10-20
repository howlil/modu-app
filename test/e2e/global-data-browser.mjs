// @ts-nocheck — Node ChromeDriver smoke, no external production access.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const SITE = "http://127.0.0.1:4174";
const DRIVER = "http://127.0.0.1:9516";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const launched = [];
let session = null;

function start(command, args, label) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let output = "";
  child.stdout.on("data", c => { output += String(c); });
  child.stderr.on("data", c => { output += String(c); });
  launched.push({ child, label, logs: () => output.slice(-4000) });
}
async function waitForService(url, name) {
  for (let i = 0; i < 200; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("Service unavailable: " + name);
}
async function driver(method, path, body) {
  const response = await fetch(DRIVER + path, {
    method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result.value));
  return result.value;
}
const route = path => "/session/" + session + path;
const execute = script => driver("POST", route("/execute/sync"), { script, args: [] });
const executeAsync = (script, args = []) => driver("POST", route("/execute/async"), { script, args });
const navigate = url => driver("POST", route("/url"), { url });
async function waitFor(label, expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await execute("return Boolean(" + expression + ")")) return; } catch {}
    await sleep(180);
  }
  throw new Error("Timed out: " + label);
}
async function click(label) {
  const clicked = await execute(
    'const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()===' +
    JSON.stringify(label) + ' && !x.disabled); if(!b) return false; b.click(); return true;'
  );
  assert.equal(clicked, true, "Missing button " + label);
}

async function run() {
  assert.ok(process.env.CHROME_BIN && process.env.CHROMEDRIVER_BIN);
  start("bun", ["run", "dev", "--host", "127.0.0.1", "--port", "4174", "--strictPort"], "Vite");
  start(process.env.CHROMEDRIVER_BIN, ["--port=9516"], "ChromeDriver");
  await Promise.all([waitForService(SITE + "/settings/data", "app"), waitForService(DRIVER + "/status", "driver")]);
  const created = await driver("POST", "/session", {
    capabilities: { alwaysMatch: {
      browserName: "chrome", "goog:chromeOptions": {
        binary: process.env.CHROME_BIN,
        args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1240,900"]
      }
    }}
  });
  session = created.sessionId;
  await navigate(SITE + "/settings/data");
  await waitFor("global data modules", 'document.body.textContent.includes("habit-tracker") && document.body.textContent.includes("language-learning")');
  assert.equal(await execute(`const old=URL.createObjectURL; URL.createObjectURL=function(blob){window.__moduBlob=blob;return old.call(URL,blob)};return true;`), true);
  await click("Export");
  await waitFor("download confirmation", 'document.body.textContent.includes("Global backup exported")');
  const json = await executeAsync('const done=arguments[arguments.length-1];window.__moduBlob.text().then(done).catch(e=>done("ERROR:"+e.message));');
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, "modu-global-backup");
  assert.deepEqual(Object.keys(parsed.modules).sort(), ["habit-tracker", "language-learning", "pomodoro"]);

  await navigate(SITE + "/habit");
  await waitFor("habit page ready", 'document.body.textContent.includes("New habit") && !document.body.textContent.includes("Loading habits")');
  await click("New habit");
  await waitFor("habit editor ready", 'Boolean(document.querySelector("dialog[open] #habit-title"))');
  const typed = await execute('const e=document.querySelector("#habit-title");e.value="Restore smoke";e.dispatchEvent(new Event("input",{bubbles:true}));return true;');
  assert.equal(typed, true);
  await click("Create habit");
  await waitFor("habit committed", 'document.body.textContent.includes("Restore smoke")');

  await navigate(SITE + "/settings/data");
  await waitFor("storage updated", 'document.body.textContent.includes("habit-tracker") && !document.body.textContent.includes("Reading local module data")');
  const injected = await executeAsync(
    'const done=arguments[arguments.length-1];const file=new File([arguments[0]],"restore.json",{type:"application/json"});const input=document.querySelector("input[type=file]");const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));done(Boolean(input.files.length));',
    [json]
  );
  assert.equal(injected, true);
  await waitFor("restore preview", 'document.body.textContent.includes("Restore preview")');
  assert.equal(await execute(
    'const box=document.querySelector("input[type=checkbox]");if(!box)return false;box.click();return box.checked;'
  ), true);
  await click("Restore all modules");
  await waitFor("restored storage after reload", 'performance.getEntriesByType("navigation")[0]?.type === "reload" && document.body.textContent.includes("Module data")', 30000);
  await navigate(SITE + "/habit");
  await waitFor("habit restored", 'document.body.textContent.includes("New habit") && !document.body.textContent.includes("Loading habits")');
  assert.equal(await execute('return document.body.textContent.includes("Restore smoke");'), false);
  await navigate(SITE + "/settings/data");
  await waitFor("module data ready", 'document.body.textContent.includes("Module data") && !document.body.textContent.includes("Reading local module data")');
  const migratedStores = await executeAsync(
    'const done=arguments[arguments.length-1];const names=[["modu-habit-tracker",4],["modu-language-learning",6],["module-pomodoro-activity",3]];let count=0;const results=[];for(const [name,version] of names){const req=indexedDB.open(name);req.onsuccess=()=>{const db=req.result;results.push({name,version:db.version,stores:[...db.objectStoreNames]});db.close();if(++count===names.length)done(results)};req.onerror=()=>done("ERROR: "+name+" database unavailable");}',
  );
  assert.ok(Array.isArray(migratedStores), "All three feature databases must be available in Chrome");
  for (const entry of migratedStores) {
    assert.ok(entry.stores.includes("sync_outbox"), entry.name + " outbox missing");
    assert.ok(entry.stores.includes("sync_metadata"), entry.name + " capture metadata missing");
    assert.equal(entry.version,
      entry.name === "modu-habit-tracker" ? 4 :
      entry.name === "modu-language-learning" ? 6 : 3);
  }
  process.stdout.write("Global Data & Sync Chrome smoke passed: export → mutate → restore → reload → M3 schema upgrade.\\n");
}

let failure = null;
try { await run(); } catch (error) {
  failure = error;
  process.stderr.write(String(error?.stack ?? error) + "\n");
} finally {
  if (session) try { await driver("DELETE", "/session/" + session); } catch {}
  for (const item of launched.reverse()) {
    item.child.kill("SIGTERM");
    if (failure) process.stderr.write("--- " + item.label + " logs ---\n" + item.logs() + "\n");
  }
}
if (failure) process.exitCode = 1;
