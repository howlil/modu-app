// @ts-nocheck — executed by the separate Playwright job; not part of the Svelte application typecheck.
import { chromium } from 'playwright';
import { stat } from 'node:fs/promises';
import assert from 'node:assert/strict';

const host = process.env.MODU_E2E_URL || 'http://127.0.0.1:8787/image/compress';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(error.message));

async function previewSize() {
  return page.getByAltText('Compressed preview').evaluate((img) => ({
    width: img.naturalWidth, height: img.naturalHeight
  }));
}

async function makeSyntheticImage() {
  const pixels = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 1600, 1200);
    gradient.addColorStop(0, '#d1c3b8');
    gradient.addColorStop(1, '#293d56');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1600, 1200);
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 2500; n++) {
      ctx.fillStyle = 'rgba(' + Math.floor(rand() * 255) + ',40,90,0.4)';
      ctx.beginPath();
      ctx.arc(rand() * 1600, rand() * 1200, 1 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.locator('#modu-image-input').setInputFiles({
    name: 'm1-recovery-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pixels)
  });
  await page.getByText('m1-recovery-fixture.png').waitFor({ timeout: 15000 });
}

try {
  await page.goto(host, { waitUntil: 'networkidle' });
  await makeSyntheticImage();

  // First run: preserve dimensions so a strict 20 KB target is quality-limited.
  await page.locator('#modu-target-kb').fill('20');
  const originalToggle = page.getByRole('switch', { name: 'Allow smart resize' });
  assert.equal(await originalToggle.getAttribute('data-state'), 'unchecked');
  await page.getByRole('button', { name: 'Compress image' }).click();
  await page.getByText('Target size not reached').waitFor({ timeout: 120000 });
  const firstPreview = await previewSize();
  assert.deepEqual(firstPreview, { width: 1600, height: 1200 });

  const cta = page.getByRole('button', { name: 'Smart resize & retry 20 KB' });
  await cta.waitFor();
  const previousLabel = await page.locator('figcaption').last().innerText();
  assert.match(previousLabel, /Output/);
  const [previousDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download larger result' }).click()
  ]);
  const previousBytes = (await stat(await previousDownload.path())).size;
  assert.ok(previousBytes > 20_000, 'Fixture should require resizing before recovery');

  // One click must grant permission, preserve previous output and start encoding.
  await cta.click();
  await page.getByText('Resizing and recompressing…').waitFor({ timeout: 15000 });
  assert.equal(await originalToggle.getAttribute('data-state'), 'checked');
  assert.match(await page.locator('figcaption').last().innerText(), /Previous result/);
  await page.getByRole('button', { name: 'Download previous result' }).waitFor();
  await page.getByText('Target reached').waitFor({ timeout: 120000 });
  const resizedPreview = await previewSize();
  assert.ok(resizedPreview.width < 1600 && resizedPreview.height < 1200);
  assert.ok(Math.min(resizedPreview.width, resizedPreview.height) >= 640);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download image' }).click()
  ]);
  const finalBytes = (await stat(await download.path())).size;
  assert.ok(finalBytes <= 20_000, 'Recovered file must satisfy strict 20,000-byte budget');
  assert.equal(await cta.count(), 0, 'Retry CTA should not repeat after success');
  assert.ok((await page.locator('body').innerText()).includes('WASM encoder'));
  assert.deepEqual(browserErrors, []);
  console.log('Image recovery E2E passed:', {
    previousBytes,
    finalBytes,
    finalDimensions: resizedPreview,
    format: download.suggestedFilename()
  });
} catch (error) {
  console.error('Image recovery E2E failed:', error);
  console.error('Visible page status:', (await page.locator('body').innerText().catch(() => 'unavailable')).slice(-2800));
  console.error('Browser errors:', browserErrors);
  throw error;
} finally {
  await browser.close();
}
