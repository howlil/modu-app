import {validatePublicUrl,type SourceCandidate,type SourceConnection} from '../core/connected-activities.ts';

export async function parseActivityFile(file:Pick<File,'size'|'name'|'text'>):
 Promise<{connection:SourceConnection;items:SourceCandidate[]}> {
  if(file.size>256*1024)throw new Error('Activity JSON must be smaller than 256 KB.');
  const raw:unknown=JSON.parse(await file.text());
  if(!Array.isArray(raw)||raw.length>250)throw new Error('Provide an array of up to 250 activities.');
  const label=file.name.trim().slice(0,100)||'activities.json';
  const id='import:'+label.toLowerCase();
  const connection:SourceConnection={id,providerId:'import',label,status:'idle'};
  const items:SourceCandidate[]=[];
  const identities=new Set<string>();
  for(let index=0;index<raw.length;index++){
    const data=raw[index];
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid activity at row '+(index+1));
    const x=data as Record<string,unknown>;
    if(typeof x.title!=='string'||!x.title.trim()||x.title.length>160)
      throw new Error('Activity '+(index+1)+' requires a title (max 160 chars).');
    const externalId=typeof x.id==='string' && x.id.trim()?x.id.trim():String(index+1);
    if(externalId.length>256||identities.has(externalId))throw new Error('Duplicate or invalid activity ID.');
    identities.add(externalId);
    const url=typeof x.url==='string' ? validatePublicUrl(x.url) : undefined;
    if(x.url!==undefined&&!url)throw new Error('Invalid activity URL at row '+(index+1));
    const dueDate=typeof x.dueDate==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x.dueDate)?x.dueDate:undefined;
    items.push({title:x.title.trim(),
      source:{providerId:'import',connectionId:id,externalId,
        ...(url?{url}:{}),remoteStatus:x.status==='completed'?'completed':'open'},
      ...(dueDate?{dueDate}:{})});
  }
  return {connection,items};
}

export function manualSource(title:string,urlText:string):{connection:SourceConnection;item:SourceCandidate} {
  const url=validatePublicUrl(urlText.trim());
  if(!url)throw new Error('Enter a valid HTTPS link.');
  const clean=title.trim().slice(0,120);
  if(!clean)throw new Error('Enter an activity title.');
  const connection:SourceConnection={id:'link:manual',label:'Manual links',providerId:'link',status:'idle'};
  const item:SourceCandidate={title:clean,source:{
    providerId:'link',connectionId:connection.id,externalId:url,url,remoteStatus:'unknown'
  }};
  return {connection,item};
}
