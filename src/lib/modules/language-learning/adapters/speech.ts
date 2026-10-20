/** Browser speech synthesis is an optional audio aid, not pronunciation grading. */
export type SpeechFailureCode = 'unsupported' | 'invalid' | 'cancelled' | 'playback';
export class SpeechPlaybackError extends Error {
  constructor(readonly code:SpeechFailureCode,message:string){super(message);this.name='SpeechPlaybackError';}
}
export interface SpeechCapability {
  readonly synthesizer: Pick<SpeechSynthesis,'speak'|'cancel'>;
  createUtterance(text:string): SpeechSynthesisUtterance;
}
function browserCapability(): SpeechCapability | null {
  if(typeof window==='undefined' || !('speechSynthesis' in window) ||
    typeof SpeechSynthesisUtterance==='undefined')return null;
  return {synthesizer:window.speechSynthesis,
    createUtterance:(text)=>new SpeechSynthesisUtterance(text)};
}
/** One player owned by one mounted controller. Cancellation and late browser events
 * never complete a newer utterance or mark a skipped sentence as played. */
export function createSpeechPlayback(resolveCapability:()=>SpeechCapability|null=browserCapability){
  let current: {utterance:SpeechSynthesisUtterance; reject:(e:SpeechPlaybackError)=>void}|null=null;
  let disposed=false;
  function stop(){
    const active=current;
    current=null;
    if(active){
      active.utterance.onend=null;
      active.utterance.onerror=null;
      active.reject(new SpeechPlaybackError('cancelled','Audio playback was stopped.'));
      try{resolveCapability()?.synthesizer.cancel();}catch{ /* best effort stop */ }
    }
  }
  function dispose(){disposed=true;stop();}
  async function play(text:string,lang:string):Promise<void>{
    if(disposed)throw new SpeechPlaybackError('cancelled','Audio controller is no longer mounted.');
    if(typeof text!=='string' || !text.trim() || text.length>2000 ||
      typeof lang!=='string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)){
      throw new SpeechPlaybackError('invalid','Invalid speech text or target language.');
    }
    // Stop only if this player owns a previous utterance.
    stop();
    const capability=resolveCapability();
    if(!capability)throw new SpeechPlaybackError('unsupported','Speech playback is unavailable in this browser.');
    return new Promise<void>((resolve,reject)=>{
      let utterance:SpeechSynthesisUtterance;
      try{
        utterance=capability.createUtterance(text);
        utterance.lang=lang;
        utterance.rate=0.9;
        const pending={utterance,reject};
        current=pending;
        utterance.onend=()=>{
          if(current!==pending)return;
          current=null;
          utterance.onend=null;utterance.onerror=null;
          resolve();
        };
        utterance.onerror=(event)=>{
          if(current!==pending)return;
          current=null;
          utterance.onend=null;utterance.onerror=null;
          reject(new SpeechPlaybackError('playback',
            event.error==='language-unavailable'
              ? 'No speech voice is available for this language.'
              : 'Audio playback did not complete. Replay before continuing.'));
        };
        capability.synthesizer.speak(utterance);
      }catch{
        const active=current;
        current=null;
        if(active){active.utterance.onend=null;active.utterance.onerror=null;}
        reject(new SpeechPlaybackError('playback','Browser speech playback failed to start.'));
      }
    });
  }
  return {play,stop,dispose,isSupported:()=>!disposed && resolveCapability()!==null};
}
