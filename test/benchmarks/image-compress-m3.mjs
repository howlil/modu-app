// @ts-nocheck — M3 browser benchmark; Playwright installed only in CI.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

const kind=process.env.MODU_BENCH_KIND||'screenshot';
const root='m3-quality-results/'+kind;
await mkdir(root+'/reference',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true});
const report={metric:'MILO ROI runtime; SSIMULACRA2 independent offline review',kind,results:[],failures:[]};

async function sourceImage(){
  if(kind==='portrait'||kind==='earthrise'){
    const path='test/fixtures/image-compress/'+(kind==='portrait'?'portrait':'earthrise')+'.jpg';
    const bytes=await readFile(path);
    return Buffer.from(await page.evaluate(async(bytes)=>{
      const img=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}));
      const w=Math.round(img.width*1280/Math.max(img.width,img.height));
      const h=Math.round(img.height*1280/Math.max(img.width,img.height));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);img.close();
      const b=await new Promise(ok=>c.toBlob(ok,'image/png'));
      return [...new Uint8Array(await b.arrayBuffer())];
    },[...bytes]));
  }
  return Buffer.from(await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=1440;c.height=960;
    const x=c.getContext('2d');x.fillStyle='#fafbfc';x.fillRect(0,0,1440,960);
    x.font='20px Arial';
    for(let i=0;i<22;i++){
      x.fillStyle=i%2?'#dfeafe':'#f1f5f9';
      x.fillRect(40,20+i*40,1360,34);
      x.fillStyle='#253a5e';x.fillText('Quality benchmark small text and UI controls '+i,55,45+i*40);
    }
    const b=await new Promise(ok=>c.toBlob(ok,'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  }));
}
async function download(label){
  const [file]=await Promise.all([page.waitForEvent('download'),
    page.getByRole('button',{name:label,exact:true}).click()]);
  return readFile(await file.path());
}
async function normalized(input,bounds,referenceDimensions){
  return Buffer.from(await page.evaluate(async ({input,bounds,referenceDimensions})=>{
    const bmp=await createImageBitmap(new Blob([new Uint8Array(input)]));
    const x=Math.floor(bounds.x*bmp.width),y=Math.floor(bounds.y*bmp.height);
    const w=Math.max(1,Math.ceil(bounds.width*bmp.width));
    const h=Math.max(1,Math.ceil(bounds.height*bmp.height));
    const rw=Math.max(1,Math.ceil(bounds.width*referenceDimensions.w));
    const rh=Math.max(1,Math.ceil(bounds.height*referenceDimensions.h));
    const ratio=256/Math.max(rw,rh);
    const tw=Math.max(16,Math.round(rw*ratio)),th=Math.max(16,Math.round(rh*ratio));
    const c=document.createElement('canvas');c.width=tw;c.height=th;
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,tw,th);
    ctx.drawImage(bmp,x,y,w,h,0,0,tw,th);
    bmp.close();const output=await new Promise(ok=>c.toBlob(ok,'image/png'));
    return [...new Uint8Array(await output.arrayBuffer())];
  },{input:[...input],bounds,referenceDimensions}));
}
let sampleCount=0;
async function attempt(original,format,targetKB,resize){
  await page.goto('http://127.0.0.1:8787/image/compress',{waitUntil:'networkidle'});
  await page.locator('#modu-image-input').setInputFiles({
    name:kind+'.png',mimeType:'image/png',buffer:original
  });
  await page.getByText(kind+'.png').waitFor({timeout:25000});
  await page.getByRole('button',{name:format,exact:true}).click();
  await page.locator('#modu-target-kb').fill(String(targetKB));
  if(resize)await page.getByRole('switch',{name:'Allow smart resize'}).click();
  const start=performance.now();
  await page.getByRole('button',{name:'Compress image',exact:true}).click();
  await page.waitForFunction(()=>{
    const t=document.body.innerText;
    return t.includes('Target reached')||t.includes('Target size not reached');
  },null,{timeout:180000});
  const complete=await page.getByText('Target reached',{exact:true}).count()>0;
  const prev=await download(complete?'Download image':'Download larger result');
  const row={kind,format,targetKB,resize,status:complete?'complete':'quality-limited',
    baselineBytes:prev.length,baselineMs:Math.round(performance.now()-start),
    improved:false,faces:0,regions:0};
  if(!complete){report.results.push(row);console.log('M3_BENCH',JSON.stringify(row));return;}
  const sourceDims=await page.getByAltText('Original preview').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
  const baselineDims=await page.getByAltText('Compressed preview').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
  if(!resize)assert.deepEqual(baselineDims,sourceDims,'Baseline unexpectedly resized');
  if(kind==='screenshot'||kind==='earthrise'){
    await page.getByRole('button',{name:'Choose focus',exact:true}).click();
    await page.getByRole('button',{name:kind==='screenshot'?'Top':'Center',exact:true}).click();
  }
  const startM3=performance.now();
  await page.getByRole('button',{name:'Optimize important details'}).click();
  await page.getByText(/Important details checked:/).waitFor({timeout:180000});
  const body=await page.locator('body').innerText();
  row.faces=Number(body.match(/Important details checked:\s*(\d+) face/)?.[1]||0);
  if(kind==='portrait' && row.faces===0)throw new Error('Face ROI is missing from the portrait benchmark');
  row.improved=body.includes('A better matching result was found.');
  row.m3Ms=Math.round(performance.now()-startM3);
  const last=await download('Download image');
  if(last.length>targetKB*1000)throw new Error('Output exceeded target bytes.');
  if(!resize){
    const dims=await page.getByAltText('Compressed preview').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.deepEqual(dims,sourceDims,'Unauthorized M3 resizing');
  }
  if(!row.improved)assert.equal(Buffer.compare(prev,last),0,'M3 unexpectedly replaced previous Blob');
  row.outputBytes=last.length;
  const regionRows=page.locator('[data-roi-id]');
  row.regions=await regionRows.count();
  if(row.regions>0){
    const details=page.getByText('Quality comparison details',{exact:true});
    await details.click();
    const metrics=(await page.locator('details').last().innerText()).match(/Global MILO error:\s*([0-9.]+)\s*→\s*([0-9.]+)/);
    if(!metrics)throw new Error('Missing M3 global quality evidence');
    row.globalBefore=Number(metrics[1]);row.globalAfter=Number(metrics[2]);
    if(row.improved&&row.globalAfter>row.globalBefore+Math.max(.00005,row.globalBefore*.02))
      throw new Error('False improvement in global error');
  }
  row.referenceIds=[];
  if(sampleCount<7){
    const bounds={x:0,y:0,width:1,height:1};
    const id=String(sampleCount++).padStart(2,'0');
    for(const [label,bytes] of [['original',original],['baseline',prev],['optimized',last]]){
      await writeFile(root+'/reference/'+id+'-global-'+label+'.png',await normalized(bytes,bounds,sourceDims));
    }
    row.referenceIds.push(id+'-global');
    if(row.regions>0){
      const first=regionRows.first();
      const regionBounds=JSON.parse(await first.getAttribute('data-roi-bounds'));
      for(const [label,bytes] of [['original',original],['baseline',prev],['optimized',last]]){
        await writeFile(root+'/reference/'+id+'-roi-'+label+'.png',await normalized(bytes,regionBounds,sourceDims));
      }
      row.referenceIds.push(id+'-roi');
    }
  }
  report.results.push(row);
  console.log('M3_BENCH',JSON.stringify(row));
}
try{
  await page.goto('http://127.0.0.1:8787/image/compress',{waitUntil:'networkidle'});
  const original=await sourceImage();
  for(const format of ['JPEG','WebP','AVIF']){
    for(const target of [50,200]){
      for(const resize of [false,true]){
        if(format==='AVIF' && (target!==200||!resize))continue;
        try{await attempt(original,format,target,resize);}
        catch(e){
          const failure={kind,format,target,resize,error:String(e)};
          report.failures.push(failure);console.error('M3_BENCH_ERROR',JSON.stringify(failure));
        }
        await writeFile(root+'/results.json',JSON.stringify(report,null,2));
      }
    }
  }
}finally{
  await writeFile(root+'/results.json',JSON.stringify(report,null,2));
  await browser.close();
}
if(report.failures.length)throw new Error(report.failures.length+' M3 benchmark cases failed');
