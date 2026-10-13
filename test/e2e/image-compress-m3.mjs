// @ts-nocheck — M3 Playwright harness runs only in CI.
import {chromium,firefox,webkit} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const type=process.env.MODU_E2E_BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[type].launch({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1200,height:900}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error') console.log('M3 browser console:',msg.text());});
try{
  await page.goto(process.env.MODU_E2E_URL||'http://127.0.0.1:8787/image/compress',{waitUntil:'networkidle'});
  for(const resource of [
    '/models/image-compress/blaze_face_short_range.tflite',
    '/models/image-compress/vision_bundle.js',
    '/models/image-compress/wasm/vision_wasm_internal.wasm'
  ]){
    const resp=await page.request.get(new URL(resource,page.url()).toString());
    assert.equal(resp.status(),200,'Local face inference asset missing: '+resource);
    const bytes=(await resp.body()).byteLength;
    assert.ok(bytes>100000,
      'Face inference asset too small: '+resource+' ('+bytes+' bytes)');
  }
  const buffer=Buffer.from(await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=1200;c.height=800;
    const x=c.getContext('2d');x.fillStyle='#f9fafb';x.fillRect(0,0,1200,800);
    x.font='20px Arial';
    for(let i=0;i<15;i++){
      x.fillStyle=i%2?'#dbeafe':'#eff6ff';
      x.fillRect(50,40+i*45,1100,35);
      x.fillStyle='#172554';x.fillText('Modu regional OCR-like label '+i,80,70+i*45);
    }
    const b=await new Promise(ok=>c.toBlob(ok,'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  }));
  await page.locator('#modu-image-input').setInputFiles({
    name:'m3-text-fixture.png',mimeType:'image/png',buffer
  });
  await page.getByText('m3-text-fixture.png').waitFor();
  await page.getByRole('button',{name:'JPEG',exact:true}).click();
  await page.locator('#modu-target-kb').fill('200');
  await page.getByRole('button',{name:'Compress image',exact:true}).click();
  await page.getByText('Target reached').waitFor({timeout:120000});
  const [initial]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Download image',exact:true}).click()
  ]);
  const prev=await readFile(await initial.path());
  assert.ok(prev.length<=200000);
  await page.getByRole('button',{name:'Choose focus',exact:true}).click();
  await page.getByRole('button',{name:'Center',exact:true}).click();
  const picker=page.getByRole('button',{name:/Draw a focus area on the original image/});
  assert.equal(await picker.count(),1);
  await picker.focus();
  await page.keyboard.press('ArrowRight');
  await page.setViewportSize({width:360,height:780});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=2);
  await page.getByRole('button',{name:'Optimize important details'}).click();
  await page.getByText('Checking important details…').waitFor({timeout:15000});
  await page.waitForFunction(()=>{
    const text=document.body.innerText;
    return text.includes('Important details checked:') ||
           text.includes('Content-aware optimization requires') ||
           text.includes('ROI quality comparison') ||
           text.includes('Invalid ROI');
  },null,{timeout:180000});
  const body=await page.locator('body').innerText();
  assert.match(body,/Important details checked:/);
  assert.match(body,/1 selected/);
  assert.ok(body.includes('Previous result retained')||body.includes('A better matching result was found'));
  assert.equal(await page.getByRole('switch',{name:'Allow smart resize'}).getAttribute('data-state'),'unchecked');
  const [final]=await Promise.all([page.waitForEvent('download'),
    page.getByRole('button',{name:'Download image',exact:true}).click()]);
  const out=await readFile(await final.path());
  assert.ok(out.length>0&&out.length<=200000);
  const dims=await page.getByAltText('Compressed preview').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
  assert.deepEqual(dims,{w:1200,h:800});
  assert.deepEqual(pageErrors,[]);
  console.log('M3 ROI E2E passed',JSON.stringify({browser:type,initialBytes:prev.length,finalBytes:out.length,dims}));

  // Independent real-face smoke: automatic detections must be honest and local.
  await page.setViewportSize({width:1200,height:900});
  const portrait=await readFile('test/fixtures/image-compress/portrait.jpg');
  await page.locator('#modu-image-input').setInputFiles({
    name:'portrait.jpg',mimeType:'image/jpeg',buffer:portrait
  });
  await page.getByText('portrait.jpg').waitFor();
  await page.getByRole('button',{name:'WebP',exact:true}).click();
  await page.locator('#modu-target-kb').fill('500');
  await page.getByRole('button',{name:'Compress image',exact:true}).click();
  await page.getByText('Target reached').waitFor({timeout:180000});
  await page.getByRole('button',{name:'Optimize important details'}).click();
  await page.getByText(/Important details checked:/).waitFor({timeout:180000});
  const portraitResult=await page.locator('body').innerText();
  const faceCount=Number(portraitResult.match(/Important details checked:\s*(\d+) face/)?.[1]||0);
  if(type==='chromium'){
    assert.ok(faceCount>0,'Local MediaPipe did not detect a face in portrait fixture: '+portraitResult.slice(-1000));
    assert.ok(!portraitResult.includes('Automatic face detection unavailable.'));
  }else{
    // Firefox/WebKit headless CI cannot initialize MediaPipe's Worker WebGL.
    // Never fake face detections; the already-tested manual/text ROI must work.
    assert.ok(faceCount>0||portraitResult.includes('Automatic face detection unavailable.'),
      'Browser must show real face detections or truthful fallback status.');
  }
  console.log('M3 face capability verified',JSON.stringify({
    browser:type,faces:faceCount,
    fallback:portraitResult.includes('Automatic face detection unavailable.')
  }));
} catch(e) {
  console.error('M3 ROI E2E failed',e);
  console.error('Body tail',(await page.locator('body').innerText().catch(()=>'')).slice(-2400));
  console.error('Page errors',pageErrors);
  throw e;
} finally{await browser.close();}
