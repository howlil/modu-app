// @ts-nocheck — quality benchmark runs only on GitHub Actions.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const pageUrl=process.env.MODU_BENCH_URL||'http://127.0.0.1:8787/image/compress';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true});
const report={schemaVersion:1,metric:'MILO runtime; SSIMULACRA2 reference for retained samples',results:[],failures:[]};
const selectedCase=process.env.MODU_BENCH_KIND;
const cases=selectedCase?[selectedCase]:['portrait','earthrise','screenshot','transparent','noisy'];
const root='m2-quality-results/'+(selectedCase||'all');
await mkdir(root+'/reference',{recursive:true});
const targetSet=[50,100,200,500];
const codecs=['WebP','JPEG','AVIF'];
async function sourceImage(kind) {
  if (kind==='portrait'||kind==='earthrise') {
    const bytes=await readFile('test/fixtures/image-compress/'+kind+'.jpg');
    return page.evaluate(async(bytes)=>{
      const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}));
      const width=Math.round(image.width*960/Math.max(image.width,image.height));
      const height=Math.round(image.height*960/Math.max(image.width,image.height));
      const c=document.createElement('canvas');c.width=width;c.height=height;
      c.getContext('2d').drawImage(image,0,0,width,height);image.close();
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    },[...bytes]);
  }
  return page.evaluate(async(kind)=>{
    const c=document.createElement('canvas');c.width=960;c.height=640;
    const ctx=c.getContext('2d');
    if(kind==='screenshot'){
      ctx.fillStyle='#f5f7f8';ctx.fillRect(0,0,960,640);
      ctx.font='19px Arial';
      for(let i=0;i<15;i++){
        ctx.fillStyle=i%2?'#dae3fb':'white';ctx.fillRect(40,20+i*39,880,34);
        ctx.fillStyle='#192e55';ctx.fillText('Compression benchmark — readable UI text '+i,55,44+i*39);
      }
    }else if(kind==='transparent'){
      for(let i=0;i<80;i++){
        ctx.fillStyle=`rgba(${(i*31)%255},${(i*53)%255},200,.65)`;
        ctx.beginPath();ctx.arc(i*37%960,i*43%640,10+(i%20),0,Math.PI*2);ctx.fill();
      }
    }else{
      const data=ctx.createImageData(960,640);
      let seed=123456789;
      for(let i=0;i<data.data.length;i+=4){
        seed=(1664525*seed+1013904223)>>>0;
        const n=seed&255;data.data[i]=n;data.data[i+1]=n^71;data.data[i+2]=(n+93)%256;data.data[i+3]=255;
      }
      ctx.putImageData(data,0,0);
    }
    const b=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  },kind);
}
async function download(buttonName){
  const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:buttonName,exact:true}).click()]);
  return readFile(await d.path());
}
async function normalizedPNG(bytes,width,height){
  return page.evaluate(async(bytes)=>{
    const b=await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const c=document.createElement('canvas');c.width=width;c.height=height;
    const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,width,height);
    x.drawImage(b,0,0,width,height);b.close();
    const png=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    return [...new Uint8Array(await png.arrayBuffer())];
  },[...bytes],width,height);
}
let sample=0;
async function runCase(kind,original,format,targetKB,resize){
  await page.locator('#modu-image-input').setInputFiles({name:kind+'.png',mimeType:'image/png',buffer:Buffer.from(original)});
  await page.getByText(kind+'.png').waitFor({timeout:20000});
  await page.locator('#modu-target-kb').fill(String(targetKB));
  await page.getByRole('button',{name:format,exact:true}).click();
  const toggle=page.getByRole('switch',{name:'Allow smart resize'});
  if((await toggle.getAttribute('data-state')==='checked')!==resize)await toggle.click();
  await page.getByText(resize?'Adaptive':'Preserved',{exact:true}).waitFor();
  const started=performance.now();
  await page.getByRole('button',{name:'Compress image',exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('Target reached')||
    document.body.innerText.includes('Target size not reached'),null,{timeout:180000});
  const completed=await page.getByText('Target reached',{exact:true}).count()>0;
  const baselineBytes=await download(completed?'Download image':'Download larger result');
  const baselineMs=Math.round(performance.now()-started);
  const dimensions=await page.getByAltText('Compressed preview').evaluate(img=>({
    width:img.naturalWidth,height:img.naturalHeight
  }));
  const sourceDims=await page.getByAltText('Original preview').evaluate(img=>({
    width:img.naturalWidth,height:img.naturalHeight
  }));
  if(!resize&&(dimensions.width!==sourceDims.width||dimensions.height!==sourceDims.height))
    throw new Error('Unpermitted resize');
  if(completed&&baselineBytes.length>targetKB*1000)throw new Error('False success');
  const row={kind,format,targetKB,resize,status:completed?'complete':'quality-limited',
    baselineBytes:baselineBytes.length,baselineMs,dimensions,improved:false};
  if(!completed){report.results.push(row);return;}
  const optimizeStarted=performance.now();
  await page.getByRole('button',{name:'Optimize visual quality',exact:true}).click();
  await page.waitForFunction(()=>{
    const t=document.body.innerText;return t.includes('Raw error')||t.includes('No better result found')||
      t.includes('Unable to initialize quality comparison')||t.includes('Image encoder failed');
  },null,{timeout:180000});
  const text=await page.locator('body').innerText();
  if(!text.includes('Raw error')&&!text.includes('No better result found'))
    throw new Error('Perceptual scorer failed: '+text.slice(-500));
  const output=await download('Download image');
  if(output.length>targetKB*1000)throw new Error('M2 file exceeded budget');
  row.optimizedMs=Math.round(performance.now()-optimizeStarted);
  row.optimizedBytes=output.length;
  row.improved=text.includes('Raw error');
  if(row.improved && output.length===baselineBytes.length && Buffer.compare(output,baselineBytes)===0) {
    throw new Error('M2 falsely reported improvement without changing output');
  }
  const m=text.match(/Raw error ([0-9.]+)/);
  row.miloRawError=m?Number(m[1]):null;
  report.results.push(row);
  if(row.improved&&sample<24){
    const id=String(sample++).padStart(2,'0');
    const sourceSize=await page.getByAltText('Original preview').evaluate(img=>({
      width:img.naturalWidth,height:img.naturalHeight
    }));
    const longSide=Math.max(sourceSize.width,sourceSize.height);
    const width=Math.max(16,Math.round(sourceSize.width*256/longSide));
    const height=Math.max(16,Math.round(sourceSize.height*256/longSide));
    await writeFile(root+'/reference/'+id+'-original.png',Buffer.from(await normalizedPNG(original,width,height)));
    await writeFile(root+'/reference/'+id+'-baseline.png',Buffer.from(await normalizedPNG(baselineBytes,width,height)));
    await writeFile(root+'/reference/'+id+'-optimized.png',Buffer.from(await normalizedPNG(output,width,height)));
    row.referenceId=id;
  }
  console.log('M2_BENCH',JSON.stringify(row));
}
try{
  await page.goto(pageUrl,{waitUntil:'networkidle'});
  for(const kind of cases){
    const original=await sourceImage(kind);
    for(const format of codecs)for(const target of targetSet)for(const resize of [false,true]){
      try{await runCase(kind,original,format,target,resize);}
      catch(error){const failure={kind,format,target,resize,error:String(error)};
        report.failures.push(failure);console.error('M2_BENCH_ERROR',JSON.stringify(failure));
        await page.reload({waitUntil:'networkidle'});
      }
      await writeFile(root+'/results.json',JSON.stringify(report,null,2));
    }
  }
}finally{
  await writeFile(root+'/results.json',JSON.stringify(report,null,2));
  await browser.close();
}
if(report.failures.length)throw new Error(report.failures.length+' M2 benchmark combinations failed');
