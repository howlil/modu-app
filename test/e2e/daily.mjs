// @ts-nocheck — independent Playwright browser suite, excluded from application typecheck.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.MODU_DAILY_E2E_URL || 'http://127.0.0.1:8787/daily';
const output = process.env.MODU_E2E_ARTIFACTS || 'test-results/daily';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let activePage;
const browserErrors = [];
const results = [];
function capture(page) { page.on('pageerror', error => browserErrors.push(error.message)); }
function record(name) { results.push(name); console.log('PASS', name); }
async function ready(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'New activity' }).waitFor();
}
async function noOverflow(page, label) {
  const { width, scrollWidth } = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.ok(scrollWidth <= width + 1, label + ': horizontal overflow ' + scrollWidth + ' > ' + width);
}
async function add(page, title) {
  const captureInput = page.getByRole('textbox', { name: 'New activity' });
  await captureInput.fill(title);
  await captureInput.press('Enter');
  await page.getByRole('button', { name: title, exact: true }).waitFor();
  assert.equal(await captureInput.inputValue(), '', 'Capture should reset on successful save');
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  activePage = await context.newPage();
  capture(activePage);
  await ready(activePage);
  await activePage.locator('body').click({ position: { x: 5, y: 5 } });
  await activePage.keyboard.press('/');
  assert.equal(await activePage.getByRole('textbox', { name: 'New activity' }).evaluate(el => document.activeElement === el), true);
  await add(activePage, 'Pay electricity bill');
  record('DLY-01 fresh capture, keyboard shortcut, and local persistence');

  await activePage.getByRole('button', { name: 'Complete Pay electricity bill' }).click();
  await activePage.getByRole('button', { name: 'Completed (1)' }).click();
  await activePage.getByRole('button', { name: 'Reopen Pay electricity bill' }).click();
  await activePage.getByRole('button', { name: 'Complete Pay electricity bill' }).waitFor();
  record('DLY-04 one-click completion and undo');

  await activePage.getByRole('navigation', { name: 'Daily views' }).getByRole('button', { name: 'All' }).click();
  await add(activePage, 'Read a book');
  await activePage.getByRole('navigation', { name: 'Daily views' }).getByRole('button', { name: 'Today' }).click();
  await activePage.getByRole('button', { name: 'Add Read a book to Today' }).click();
  await activePage.getByRole('button', { name: 'Make Read a book next' }).click();
  await activePage.getByRole('button', { name: 'Arrange' }).click();
  await activePage.getByRole('button', { name: 'Move Read a book up' }).click();
  await activePage.getByRole('button', { name: 'Done', exact: true }).click();
  await activePage.getByText('READY WHEN YOU ARE').waitFor();
  record('DLY-02/03 existing activity selection, explicit Next, and reorder');

  const editButton = activePage.getByRole('button', { name: 'Read a book', exact: true }).first();
  await editButton.click();
  const details = activePage.getByRole('dialog', { name: 'Activity details' });
  await details.waitFor();
  assert.equal(await details.getByRole('textbox', { name: 'Activity', exact: true }).evaluate(el => document.activeElement === el), true);
  await details.getByRole('textbox', { name: 'Activity', exact: true }).fill('Read 10 pages');
  await details.getByRole('button', { name: 'Save' }).click();
  await activePage.reload();
  await activePage.getByRole('button', { name: 'Read 10 pages', exact: true }).waitFor();
  await activePage.getByRole('button', { name: 'Read 10 pages', exact: true }).click();
  await activePage.keyboard.press('Escape');
  await details.waitFor({ state: 'hidden' });
  record('DLY-05 details persist after reload, initial focus, Escape');

  const second = await context.newPage();
  capture(second);
  await ready(second);
  await add(second, 'Added in another tab');
  await activePage.getByRole('button', { name: 'Added in another tab', exact: true }).waitFor();
  await second.close();
  record('DLY-07 cross-tab storage synchronization');

  await activePage.screenshot({ path: output + '/desktop.png', fullPage: true });
  await activePage.getByRole('button', { name: 'Start focus' }).click();
  await activePage.waitForURL(/\/pomodoro\?taskId=/);
  await activePage.getByRole('timer').waitFor();
  await activePage.goto(url);
  await activePage.getByRole('button', { name: 'Complete Read 10 pages' }).waitFor();
  record('DLY-06 one-shot Pomodoro route handoff without completing a task');

  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await activePage.setViewportSize({ width, height: 844 });
    await noOverflow(activePage, width + 'px');
    if (width === 390) {
      const shelf = activePage.getByRole('button', { name: /From your list|Browse list/ }).first();
      await shelf.click();
      await activePage.getByRole('heading', { name: 'From your list' }).waitFor();
      await activePage.screenshot({ path: output + '/mobile.png', fullPage: true });
    }
  }
  record('DLY-09 responsive widths and mobile activity shelf');

  const perfContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const perf = await perfContext.newPage(); activePage = perf;
  capture(perf);
  await ready(perf);
  const started = Date.now();
  await perf.evaluate(() => {
    const tasks = Array.from({ length: 1000 }, (_, index) => ({
      id: 'stress-' + index,
      title: 'Stress activity ' + String(index).padStart(4,'0'),
      nextAction: '', workstream:'general', impact:'medium', estimateMinutes:0,
      status:'ready', createdAt: 1000 + index
    }));
    localStorage.setItem('modu-daily-execution-v1', JSON.stringify({tasks}));
  });
  await perf.reload();
  await perf.getByRole('navigation', { name: 'Daily views' }).getByRole('button', { name: 'All' }).click();
  await perf.getByRole('textbox', { name: 'Search all activities' }).fill('Stress activity 0999');
  await perf.getByRole('button', { name: 'Stress activity 0999' }).waitFor();
  assert.ok(Date.now() - started < 20000, '1,000-activity smoke took too long');
  record('DLY-11 large-list filtering (1000 activities) within 20s CI smoke budget');
  await perfContext.close();

  const corruptCtx = await browser.newContext();
  const corruptPage = await corruptCtx.newPage(); activePage = corruptPage;
  await ready(corruptPage);
  await corruptPage.evaluate(() => localStorage.setItem('modu-daily-execution-v1','{invalid-json'));
  await corruptPage.reload();
  await corruptPage.getByText('Daily storage needs attention').waitFor();
  assert.equal(await corruptPage.evaluate(() => localStorage.getItem('modu-daily-execution-v1')), '{invalid-json');
  record('DLY-10 corrupt-storage recovery without overwrite');
  await corruptCtx.close();
  await context.close();

  assert.deepEqual(browserErrors, [], 'No uncaught JavaScript page errors');
  console.log('Daily browser acceptance passed:', results.length, 'scenarios');
} catch (error) {
  console.error('Daily browser acceptance FAILED:', error);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {});
  }
  console.error('Completed scenarios:', results);
  console.error('Uncaught browser errors:', browserErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}