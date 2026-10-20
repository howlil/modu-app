<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { Copy, ShieldCheck } from "lucide-svelte";
  import { qrcodegen } from "#lib/platform/data/qrcodegen.ts";
  type Props = {
    link: string;
    deviceName: string;
    confirmation: string;
    busy: boolean;
    onCopy: () => void;
    onCancel: () => void;
    onApprove: () => void;
  };
  let { link, deviceName, confirmation, busy, onCopy, onCancel, onApprove }: Props = $props();
  let qr = $derived(link ? qrcodegen.QrCode.encodeText(link,qrcodegen.QrCode.Ecc.MEDIUM) : null);
  const modules = $derived.by(() => {
    if (!qr) return [] as Array<{ x:number; y:number }>;
    const result: Array<{ x:number; y:number }> = [];
    for (let y=0;y<qr.size;y++) for (let x=0;x<qr.size;x++) {
      if (qr.getModule(x,y)) result.push({x,y});
    }
    return result;
  });
</script>

<div class="mt-3 space-y-3 rounded-lg border border-border p-3">
  <p class="text-ui font-medium">Scan this QR code with your phone</p>
  <p class="text-meta text-muted-foreground">Open the link with your phone camera. Invitation expires after 5 minutes.</p>
  {#if qr}
    <svg role="img" aria-label="Private Modu device pairing QR code" viewBox={"0 0 " + (qr.size+8) + " " + (qr.size+8)}
      class="size-48 rounded-lg border border-border bg-white p-2" shape-rendering="crispEdges">
      <rect width={qr.size+8} height={qr.size+8} fill="white"/>
      {#each modules as cell (cell.x + ":" + cell.y)}
        <rect x={cell.x+4} y={cell.y+4} width="1" height="1" fill="#252525"/>
      {/each}
    </svg>
  {/if}
  <div class="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" class="rounded-full shadow-none" onclick={onCopy}>
      <Copy class="size-3.5"/> Copy link
    </Button>
    <Button size="sm" variant="ghost" class="rounded-full" onclick={onCancel}>Cancel</Button>
  </div>
  {#if confirmation}
    <div class="space-y-2 border-t border-border pt-3">
      <p class="text-ui font-medium">{deviceName || "New device"} wants to connect</p>
      <p class="text-meta text-muted-foreground">Only approve if this code matches the new device:</p>
      <p class="font-mono text-title font-semibold tracking-widest">{confirmation}</p>
      <Button class="rounded-full shadow-none" disabled={busy} onclick={onApprove}>
        <ShieldCheck class="size-4"/> Codes match — Approve
      </Button>
    </div>
  {:else}
    <p class="text-meta text-muted-foreground" role="status">Waiting for the new device…</p>
  {/if}
</div>
