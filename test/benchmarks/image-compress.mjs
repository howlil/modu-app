// @ts-nocheck — Playwright is installed only in the benchmark workflow.
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const baseUrl = process.env.MODU_BENCH_URL || 'http://127.0.0.1:8787/image/compress';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });
const results = [];
const failures = [];
await mkdir('image-benchmark-results', { recursive: true });

async function upload(bytes, name, mimeType) {
  await page.locator('#modu-image-input').setInputFiles({ name, mimeType, buffer: bytes });
  await page.getByText(name).waitFor({ timeout: 30000 });
}
async function synthetic(kind) {
  const arr = await page.evaluate(async (kind) => {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1200;
    const x = c.getContext('2d');
    if (!x) throw new Error('Canvas unavailable');
    if (kind === 'screenshot') {
      x.fillStyle = '#fbfaf7'; x.fillRect(0,0,c.width,c.height);
      for(let i=0;i<20;i++) {
        x.fillStyle = i%2 ? '#2348a5' : '#eef1f5';
        x.fillRect(80,70+i*48,1200,35);
        x.fillStyle = '#252525';x.font='22px Arial';
        x.fillText('Image Compressor quality test - '+i,100,97+i*48);
      }
    } else {
      x.clearRect(0,0,c.width,c.height);
      for(let i=0;i<50;i++) {
        const px=100+i*27;
        x.fillStyle='rgba(36,104,242,'+(i/60)+')';
        x.beginPath();x.arc(px,600,30+i*3,0,Math.PI*2);x.fill();
      }
    }
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  },kind);
  return Buffer.from(arr);
}
async function one(name, bytes, mimeType, format, target, resize) {
  await upload(bytes,name,mimeType);
  await page.locator('#modu-target-kb').fill(String(target));
  await page.getByRole('button',{name:format,exact:true}).click();
  const toggle=page.getByRole('switch',{name:'Allow smart resize'});
  const current=await toggle.getAttribute('data-state')==='checked';
  if(current!==resize) await toggle.click();
  await page.getByText(resize ? 'Adaptive' : 'Preserved', { exact: true }).waitFor({timeout:3000});
  const checked=await toggle.getAttribute('data-state')==='checked';
  if(checked!==resize) throw new Error('Switch UI state did not match resize permission');
  const inputDimensions = await page.getByAltText('Original preview').evaluate(async img => {
    await img.decode();
    return {width:img.naturalWidth,height:img.naturalHeight};
  });
  const started=performance.now();
  await page.getByRole('button',{name:'Compress image',exact:true}).click();
  await page.waitForFunction(() => {
    const text=document.body.innerText;
    return text.includes('Target reached') || text.includes('Target size not reached') ||
      text.includes('Image encoder failed') || text.includes('Compression failed');
  },null,{timeout:180000});
  const elapsedMs=Math.round(performance.now()-started);
  const status=(await page.getByText('Target reached',{exact:true}).count())?'complete':'quality-limited';
  const downloadBtn=status==='complete'?'Download image':'Download larger result';
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:downloadBtn,exact:true}).click()
  ]);
  const data=await readFile(await download.path());
  const dimensions=await page.getByAltText('Compressed preview').evaluate(img=>({
    width:img.naturalWidth,height:img.naturalHeight
  }));
  if(!dimensions.width || !dimensions.height) throw new Error('Invalid encoded dimensions');
  if(!resize && (dimensions.width!==inputDimensions.width || dimensions.height!==inputDimensions.height)) {
    throw new Error('Resolution changed without permission: '+JSON.stringify({inputDimensions,dimensions}));
  }
  if(status==='complete' && data.length>target*1000) throw new Error('False success: '+data.length+' > '+target*1000);
  const result={case:name,format,targetKB:target,allowResize:resize,status,inputBytes:bytes.length,
    outputBytes:data.length,...dimensions,elapsedMs};
  if(target===50 && format==='WebP' && resize) {
    await writeFile('image-benchmark-results/'+name.replace(/\.[^.]+$/,'')+'-50kb.webp',data);
    await page.screenshot({path:'image-benchmark-results/'+name.replace(/\.[^.]+$/,'')+'-ui.png'});
  }
  results.push(result); console.log('BENCH',JSON.stringify(result));
}
try {
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  const cases=[
    ['portrait.jpg',await readFile('test/fixtures/image-compress/portrait.jpg'),'image/jpeg'],
    ['earthrise.jpg',await readFile('test/fixtures/image-compress/earthrise.jpg'),'image/jpeg'],
    ['screenshot.png',await synthetic('screenshot'),'image/png'],
    ['transparent.png',await synthetic('alpha'),'image/png']
  ];
  for(const [name,data,mime] of cases) {
    for(const format of ['WebP','JPEG']) {
      for(const target of [50,100,200,500]) {
        for(const resize of [false,true]) {
          try {await one(name,data,mime,format,target,resize);}
          catch(error) {
            const record={case:name,format,targetKB:target,allowResize:resize,error:String(error)};
            failures.push(record);
            console.error('BENCH ERROR',JSON.stringify(record));
            await page.reload({waitUntil:'networkidle'});
          }
        }
      }
    }
  }
} finally {
  await writeFile('image-benchmark-results/results.json',JSON.stringify({results,failures},null,2));
  const cols=['case','format','targetKB','allowResize','status','inputBytes','outputBytes','width','height','elapsedMs'];
  await writeFile('image-benchmark-results/results.csv',
    cols.join(',')+'\n'+results.map(row=>cols.map(k=>row[k]).join(',')).join('\n')+'\n');
  await browser.close();
}
if(failures.length) throw new Error(failures.length+' benchmark cases failed. See artifacts.');
