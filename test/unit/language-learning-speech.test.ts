import {describe,expect,it} from 'vitest';
import {
  createSpeechPlayback, SpeechPlaybackError,
  type SpeechCapability
} from '../../src/lib/modules/language-learning/adapters/speech.ts';

type FakeUtterance={
  text:string; lang:string; rate:number;
  onend:SpeechSynthesisUtterance['onend'];
  onerror:SpeechSynthesisUtterance['onerror'];
};
function fakeCapability() {
  const queue:FakeUtterance[]=[];
  let cancelCalls=0;
  const capability:SpeechCapability={
    synthesizer:{
      speak(utterance){
        queue.push(utterance as unknown as FakeUtterance);
      },
      cancel(){cancelCalls++;}
    },
    createUtterance(text){
      return {text,lang:'',rate:1,onend:null,onerror:null} as unknown as SpeechSynthesisUtterance;
    }
  };
  return {
    queue,capability,
    get cancelled(){return cancelCalls;},
    finished(index:number){
      queue[index].onend?.call(queue[index] as unknown as SpeechSynthesisUtterance,
        {type:'end'} as SpeechSynthesisEvent);
    },
    failed(index:number,error:string){
      queue[index].onerror?.call(queue[index] as unknown as SpeechSynthesisUtterance,
        {error,type:'error'} as SpeechSynthesisErrorEvent);
    }
  };
}
describe('M6 — browser speech lifecycle',()=>{
  it('supports a completed browser utterance without storing or grading a recording',async()=>{
    const fake=fakeCapability();
    const player=createSpeechPlayback(()=>fake.capability);
    const pending=player.play('Good morning','en');
    expect(fake.queue).toHaveLength(1);
    expect(fake.queue[0]).toMatchObject({text:'Good morning',lang:'en',rate:0.9});
    fake.finished(0);
    await expect(pending).resolves.toBeUndefined();
    player.dispose();
  });
  it('cancels a prior playback and ignores late events from the cancelled utterance',async()=>{
    const fake=fakeCapability();
    const player=createSpeechPlayback(()=>fake.capability);
    const first=player.play('First','en');
    const cancelledEvent=fake.queue[0].onend;
    const second=player.play('Second','en');
    await expect(first).rejects.toMatchObject({code:'cancelled'});
    cancelledEvent?.call(fake.queue[0] as unknown as SpeechSynthesisUtterance,
      {type:'end'} as SpeechSynthesisEvent);
    expect(fake.queue).toHaveLength(2);
    fake.finished(1);
    await expect(second).resolves.toBeUndefined();
    expect(fake.cancelled).toBe(1);
    player.dispose();
  });
  it('does not treat error, stop, unsupported browser or teardown as playback success',async()=>{
    const unsupported=createSpeechPlayback(()=>null);
    await expect(unsupported.play('Hello','en')).rejects.toMatchObject({code:'unsupported'});
    const fake=fakeCapability();
    const player=createSpeechPlayback(()=>fake.capability);
    const error=player.play('Example','en');
    fake.failed(0,'language-unavailable');
    await expect(error).rejects.toMatchObject({code:'playback'});
    const cancelled=player.play('New','en');
    player.stop();
    await expect(cancelled).rejects.toMatchObject({code:'cancelled'});
    const unmount=player.play('Last','en');
    player.dispose();
    await expect(unmount).rejects.toMatchObject({code:'cancelled'});
    await expect(player.play('Another','en')).rejects.toMatchObject({code:'cancelled'});
  });
  it('rejects invalid language and text before accessing the speech engine',async()=>{
    const fake=fakeCapability();
    const player=createSpeechPlayback(()=>fake.capability);
    await expect(player.play(' ','en')).rejects.toBeInstanceOf(SpeechPlaybackError);
    await expect(player.play('Hello','not a language')).rejects.toMatchObject({code:'invalid'});
    await expect(player.play('x'.repeat(2001),'en')).rejects.toMatchObject({code:'invalid'});
    expect(fake.queue).toHaveLength(0);
    player.dispose();
  });
});
