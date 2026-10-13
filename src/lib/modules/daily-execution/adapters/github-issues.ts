import type {SourceCandidate,SourceConnection} from '../core/connected-activities.ts';

export function githubRepository(value:string):string {
  const cleaned=value.trim().replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'');
  if(!/^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(cleaned) || cleaned.endsWith('.git')) {
    throw new Error('Enter a public repository as owner/repo.');
  }
  return cleaned.toLowerCase();
}

export function githubConnection(repository:string):SourceConnection {
  const repo=githubRepository(repository);
  return {id:'github:'+repo,providerId:'github',repository:repo,label:repo,status:'idle'};
}

export async function loadPublicGithubIssues(
  connection:SourceConnection, signal?:AbortSignal, fetcher:typeof fetch=fetch
):Promise<SourceCandidate[]> {
  if(connection.providerId!=='github'||!connection.repository)throw new Error('Invalid public GitHub source.');
  const repository=githubRepository(connection.repository);
  const result:SourceCandidate[]=[];
  // Full snapshot: never treat partial pages as a complete sync.
  for(let page=1;page<=10;page++){
    const url='https://api.github.com/repos/'+repository+'/issues?state=all&sort=updated&direction=desc&per_page=100&page='+page;
    const response=await fetcher(url,{signal,headers:{'Accept':'application/vnd.github+json'}});
    if(!response.ok){
      if(response.status===401||response.status===403||response.status===429)
        throw new Error('GitHub request was limited or denied. Try again later.');
      if(response.status===404)throw new Error('Public repository unavailable or Issues disabled.');
      throw new Error('Could not load GitHub issues ('+response.status+').');
    }
    const raw:unknown=await response.json();
    if(!Array.isArray(raw))throw new Error('Invalid GitHub issues response.');
    for(const entry of raw){
      if(!entry || typeof entry!=='object')throw new Error('Invalid GitHub issue.');
      const item=entry as Record<string,unknown>;
      if(item.pull_request)continue;
      if(!Number.isSafeInteger(item.number)||typeof item.title!=='string'||typeof item.html_url!=='string'
        ||!['open','closed'].includes(String(item.state)))throw new Error('Invalid GitHub issue fields.');
      const number=item.number as number;
      const expected='https://github.com/'+repository+'/issues/'+number;
      // The official web URL can vary in casing; derive a trusted URL from validated owner/repo + issue number.
      result.push({
        source:{providerId:'github',connectionId:connection.id,externalId:String(number),
          remoteStatus:item.state==='closed'?'completed':'open',url:expected},
        title:(item.title as string).slice(0,160)
      });
    }
    if(raw.length<100)return result;
    if(page===10)throw new Error('Repository has more than 1,000 issues. No partial data was saved.');
  }
  return result;
}
