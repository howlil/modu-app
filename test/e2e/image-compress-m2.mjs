// @ts-nocheck — used by the M2 Playwright workflow, not the app typecheck.
import {chromium,firefox,webkit} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const kind=process.env.MODU_E2E_BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[kind].launch({headless:true});
const page=await browser.newPage({acceptDownloads:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(process.env.MODU_E2E_URL||'http://127.0.0.1:8787/image/compress',{waitUntil:'networkidle'});
  const image=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=480;c.height=320;
    const g=c.getContext('2d');
    const bg=g.createLinearGradient(0,0,480,320);
    bg.addColorStop(0,'#fac779');bg.addColorStop(1,'#20446b');
    g.fillStyle=bg;g.fillRect(0,0,480,320);
    for(let i=0;i<80;i++){g.fillStyle=`rgba(${i*37%255},50,${i*43%255},.5)`;
      g.fillRect(i*31%480,i*17%320,20,28);}
    const b=await new Promise(ok=>c.toBlob(ok,'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  await page.locator('#modu-image-input').setInputFiles({
    name:'quality-test.png',mimeType:'image/png',buffer:Buffer.from(image)
  });
  await page.getByText('quality-test.png').waitFor();
  await page.getByRole('button',{name:'AVIF',exact:true}).click();
  await page.locator('#modu-target-kb').fill('200');
  const resize=page.getByRole('switch',{name:'Allow smart resize'});
  assert.equal(await resize.getAttribute('data-state'),'unchecked');
  await page.getByRole('button',{name:'Compress image',exact:true}).click();
  await page.getByText('Target reached').waitFor({timeout:180000});
  const dims=await page.getByAltText('Compressed preview').evaluate(img=>({
    width:img.naturalWidth,height:img.naturalHeight
  }));
  assert.deepEqual(dims,{width:480,height:320});
  const [first]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Download image'}).click()
  ]);
  const oldBytes=await readFile(await first.path());
  assert.ok(oldBytes.length<=200000);
  assert.equal(oldBytes.toString('ascii',4,8),'ftyp');
  assert.match(first.suggestedFilename(),/\.avif$/);
  console.log('AVIF encode passed',JSON.stringify({browser:kind,bytes:oldBytes.length}));

  await page.getByRole('button',{name:'Optimize visual quality',exact:true}).click();
  await page.waitForFunction(()=>{
    const t=document.body.innerText;
    return t.includes('Raw error')||t.includes('No better result found')||
      t.includes('Perceptual scoring unavailable')||t.includes('quality comparison')||
      t.includes('Image encoder failed')||t.includes('Perceptual scorer returned');
  },null,{timeout:180000});
  const body=await page.locator('body').innerText();
  if(!body.includes('Raw error')&&!body.includes('No better result found'))
    throw new Error('Perceptual scorer failed: '+body.slice(-1000));
  const [final]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Download image'}).click()
  ]);
  const bytes=await readFile(await final.path());
  assert.ok(bytes.length<=200000);
  assert.equal(bytes.toString('ascii',4,8),'ftyp');
  assert.equal(await resize.getAttribute('data-state'),'unchecked');
  assert.deepEqual(errors,[]);
  console.log('M2 quality optimization passed',JSON.stringify({
    browser:kind,previous:oldBytes.length,final:bytes.length,
    verdict:body.includes('No better result found')?'no-improvement':'scored'
  }));
} catch(e) {
  console.error('M2 browser failure',e);
  console.error('Body:',(await page.locator('body').innerText().catch(()=>'')).slice(-2000));
  console.error('JS errors:',errors);
  throw e;
} finally {await browser.close();}
