<script lang="ts">
  import { ArrowDown, Download, FileImage, ImageUp, RefreshCcw } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';
  import { formatBytes, type ImageOutputFormat } from '../core/target-size.ts';
  import type { createImageCompressController } from '../controller/image-compress.svelte.ts';

  let { controller }: { controller: ReturnType<typeof createImageCompressController> } = $props();
  let picker: HTMLInputElement;
  const presets = [50, 100, 200, 500];

  function picked(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void controller.setFile(input.files?.[0] ?? null);
    input.value = '';
  }

  function dropped(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void controller.setFile(file);
  }
</script>

<div class="flex flex-col gap-6">
  <input bind:this={picker} class="sr-only" id="modu-image-input" type="file"
    accept="image/jpeg,image/png,image/webp" onchange={picked} aria-label="Choose an image" />

  <div role="group" aria-label="Image upload" ondragover={(event) => event.preventDefault()} ondrop={dropped}
    class="rounded-[20px] border border-dashed border-border bg-card p-6 max-[640px]:p-4">
    {#if controller.file}
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <FileImage class="size-5 text-secondary-foreground" strokeWidth={1.7} />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-ui font-medium">{controller.file.name}</p>
          <p class="mt-1 text-meta text-muted-foreground">
            {formatBytes(controller.file.size)}
            {#if controller.info} · {controller.info.width} × {controller.info.height} px{/if}
          </p>
        </div>
        <Button variant="outline" size="sm" onclick={() => picker.click()} disabled={controller.status === 'processing'}>
          Replace
        </Button>
      </div>
    {:else}
      <label for="modu-image-input" class="flex cursor-pointer flex-col items-center justify-center gap-2 py-6 text-center">
        <ImageUp class="size-7 text-primary" strokeWidth={1.5} />
        <span class="text-ui font-medium">Choose an image or drop it here</span>
        <span class="text-meta text-muted-foreground">JPG, PNG, WebP · Up to 100 MB · Processed in your browser</span>
      </label>
    {/if}
  </div>

  <div class="grid grid-cols-12 items-start gap-3 max-[720px]:grid-cols-1">
    <div class="col-span-5 min-w-0 rounded-[20px] border border-border bg-card p-5 max-[720px]:col-span-1 max-[640px]:p-4">
      <h2 class="text-title font-semibold">Compression settings</h2>
      <div class="mt-6">
        <label for="modu-target-kb" class="mb-2 block text-ui font-medium">Target size</label>
        <div class="relative">
          <input id="modu-target-kb" type="number" min="10" max="20480" step="1"
            value={controller.targetInput}
            oninput={(event) => controller.setTargetInput(event.currentTarget.value)}
            aria-invalid={Boolean(controller.targetError)}
            aria-describedby="modu-target-description"
            class="h-10 w-full rounded-lg border border-input bg-background px-3 pr-12 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span class="pointer-events-none absolute right-3 top-2.5 text-ui text-muted-foreground">KB</span>
        </div>
        <p id="modu-target-description" class="mt-2 text-meta text-muted-foreground">Custom target · 10–20,480 KB</p>
        {#if controller.targetError}
          <p role="alert" class="mt-2 text-meta text-destructive">{controller.targetError}</p>
        {/if}
        <div class="mt-3 flex flex-wrap gap-2">
          {#each presets as preset}
            <Button variant={controller.targetInput === String(preset) ? 'secondary' : 'outline'}
              size="sm" onclick={() => controller.setTargetInput(String(preset))}>
              {preset} KB
            </Button>
          {/each}
        </div>
      </div>

      <div class="mt-6 border-t border-border pt-5">
        <p class="mb-3 text-ui font-medium">Output format</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Output format">
          {#each [{ label: 'WebP', value: 'image/webp' }, { label: 'JPEG', value: 'image/jpeg' }] as option}
            <Button variant={controller.format === option.value ? 'secondary' : 'outline'} size="sm"
              aria-pressed={controller.format === option.value}
              onclick={() => controller.setFormat(option.value as ImageOutputFormat)}>
              {option.label}
            </Button>
          {/each}
        </div>
        <p class="mt-2 text-meta text-muted-foreground">
          {controller.format === 'image/jpeg'
            ? 'JPEG works with most upload forms. Transparent pixels turn white.'
            : 'WebP generally gives smaller files, but some forms require JPEG.'}
        </p>
      </div>

      <div class="mt-6 border-t border-border pt-5">
        <div class="flex items-center justify-between gap-2 text-ui">
          <span class="font-medium">Original resolution</span>
          <span class="text-muted-foreground">{controller.allowResize ? 'Adaptive' : 'Preserved'}</span>
        </div>
        <p class="mt-2 text-meta text-muted-foreground">Original dimensions stay unchanged unless you allow resizing.</p>
        <div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div class="min-w-0">
            <label for="modu-smart-resize" class="text-ui font-medium">Allow smart resize</label>
            <p class="mt-1 text-meta text-muted-foreground">Find the largest image that fits the target. Minimum short side: 640 px.</p>
          </div>
          <Switch id="modu-smart-resize" checked={controller.allowResize}
            aria-label="Allow smart resize"
            onclick={() => controller.setAllowResize(!controller.allowResize)} />
        </div>
      </div>

      <Button class="mt-6 w-full" disabled={!controller.file || !controller.info || Boolean(controller.targetError) || controller.status === 'processing'}
        onclick={() => void controller.compress()}>
        {#if controller.status === 'processing'}
          Encoding attempt {controller.attempts}…
        {:else}
          Compress image
        {/if}
        <ArrowDown class="size-4" strokeWidth={1.8} />
      </Button>
    </div>

    <div class="col-span-7 min-w-0 rounded-[20px] border border-border bg-card p-5 max-[720px]:col-span-1 max-[640px]:p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-title font-semibold">Preview</h2>
        {#if controller.file}
          <Button variant="ghost" size="sm" onclick={() => controller.setFile(null)}
            disabled={controller.status === 'processing'} aria-label="Clear selected image">
            <RefreshCcw class="size-4" /> Clear
          </Button>
        {/if}
      </div>

      {#if controller.originalUrl}
        <div class="mt-4 grid grid-cols-2 gap-3">
          <figure class="min-w-0">
            <div class="flex h-48 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted max-[640px]:h-36">
              <img src={controller.originalUrl} class="max-h-full max-w-full object-contain" alt="Original image preview" />
            </div>
            <figcaption class="mt-2 text-meta text-muted-foreground">
              Original · {formatBytes(controller.file?.size ?? 0)}
            </figcaption>
          </figure>
          <figure class="min-w-0">
            <div class="flex h-48 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted max-[640px]:h-36">
              {#if controller.outputUrl}
                <img src={controller.outputUrl} class="max-h-full max-w-full object-contain" alt="Compressed image preview" />
              {:else}
                <span class="text-meta text-muted-foreground">Result</span>
              {/if}
            </div>
            <figcaption class="mt-2 text-meta text-muted-foreground">
              {controller.output ? 'Output · ' + formatBytes(controller.output.blob.size) : 'Not generated yet'}
            </figcaption>
          </figure>
        </div>
      {:else}
        <div class="mt-4 flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50">
          <p class="text-ui text-muted-foreground">Your image preview appears here.</p>
        </div>
      {/if}

      <div role="status" aria-live="polite" class="mt-5">
        {#if controller.status === 'processing'}
          <p class="text-ui">Optimizing image…</p>
          <p class="mt-1 text-meta text-muted-foreground">Testing quality and, if allowed, resolution. Large images may take a moment.</p>
        {:else if controller.status === 'complete' && controller.output}
          <p class="text-ui font-medium text-success">Target reached</p>
          <p class="mt-1 text-meta text-muted-foreground">
            {formatBytes(controller.output.blob.size)} · Quality setting {Math.round(controller.output.quality * 100)}%
            · {controller.output.width} × {controller.output.height} px {controller.output.resized ? '(resized with permission)' : '(original resolution)'}
            · {controller.output.engine === 'wasm' ? 'WASM encoder' : controller.output.engine === 'browser-fallback' ? 'Browser encoder fallback' : 'Original file'}
          </p>
        {:else if controller.status === 'quality-limited' && controller.output}
          <p class="text-ui font-medium text-destructive">Target cannot be reached within the quality and resolution limits</p>
          <p class="mt-1 text-meta text-muted-foreground">
            Best available: {formatBytes(controller.output.blob.size)} · {controller.output.width} × {controller.output.height} px
            · encoder setting {Math.round(controller.output.quality * 100)}.
            {controller.allowResize ? 'The 640 px minimum short side was respected. Try a larger target.' : 'Enable smart resize or increase the target.'}
          </p>
        {:else if controller.error}
          <p role="alert" class="text-ui text-destructive">{controller.error}</p>
        {:else if controller.status === 'ready'}
          <p class="text-ui text-muted-foreground">Choose a target and compress to see the result.</p>
        {/if}
      </div>

      {#if controller.output}
        <div class="mt-5 border-t border-border pt-5">
          <Button class="w-full" onclick={controller.download}>
            <Download class="size-4" strokeWidth={1.8} />
            {controller.status === 'quality-limited' ? 'Download larger result' : 'Download image'}
          </Button>
        </div>
      {/if}
    </div>
  </div>
</div>
