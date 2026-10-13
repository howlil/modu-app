<script lang="ts">
  import type {NormalizedRect} from '../core/content-regions.ts';

  let {src,bounds,onSelect}:{
    src:string;
    bounds:NormalizedRect|null;
    onSelect:(value:NormalizedRect|null)=>void;
  }=$props();

  let surface:HTMLButtonElement;
  let drawing=$state<NormalizedRect|null>(null);
  let pointer=$state<{x:number;y:number}|null>(null);
  const visible=$derived(drawing??bounds);
  function normalized(event:PointerEvent):{x:number;y:number}{
    const area=surface.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-area.left)/area.width)),
      y:Math.max(0,Math.min(1,(event.clientY-area.top)/area.height))};
  }
  function start(event:PointerEvent){
    if(event.button!==0)return;
    surface.setPointerCapture(event.pointerId);
    pointer=normalized(event);
    drawing={...pointer,width:0,height:0};
  }
  function move(event:PointerEvent){
    if(!pointer)return;
    const at=normalized(event);
    drawing={x:Math.min(at.x,pointer.x),y:Math.min(at.y,pointer.y),
      width:Math.abs(at.x-pointer.x),height:Math.abs(at.y-pointer.y)};
  }
  function finish(event:PointerEvent){
    if(!pointer)return;
    move(event);
    const next=drawing;
    pointer=null;
    drawing=null;
    if(next&&next.width>=.04&&next.height>=.04)onSelect(next);
  }
  function keys(event:KeyboardEvent){
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      onSelect({x:.3,y:.3,width:.4,height:.4});
    }
    if(!bounds||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const offset=.02;
    const x=Math.max(0,Math.min(1-bounds.width,bounds.x+
      (event.key==='ArrowRight'?offset:event.key==='ArrowLeft'?-offset:0)));
    const y=Math.max(0,Math.min(1-bounds.height,bounds.y+
      (event.key==='ArrowDown'?offset:event.key==='ArrowUp'?-offset:0)));
    onSelect({...bounds,x,y});
  }
</script>

<div class="flex justify-center rounded-xl border border-border bg-muted p-3">
  <button bind:this={surface} type="button"
    class="relative block max-w-full touch-none select-none overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    aria-label="Draw a focus area on the original image. Press Enter for center, arrow keys to adjust the selected area."
    onpointerdown={start} onpointermove={move} onpointerup={finish}
    onpointercancel={() => {pointer=null;drawing=null;}}
    onkeydown={keys}>
    <img {src} alt="Original image for focus selection" draggable="false"
      class="block max-h-64 max-w-full object-contain" />
    {#if visible}
      <span aria-hidden="true" class="pointer-events-none absolute border-2 border-primary bg-primary/10"
        style:left="{visible.x*100}%" style:top="{visible.y*100}%"
        style:width="{visible.width*100}%" style:height="{visible.height*100}%"></span>
    {/if}
  </button>
</div>
