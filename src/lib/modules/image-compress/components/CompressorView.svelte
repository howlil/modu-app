<script lang="ts">
  import { ArrowDown, Download, FileImage, ImageUp, RefreshCcw, WandSparkles, X } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';
  import FocusRegionOverlay from './FocusRegionOverlay.svelte';
  import { formatBytes, type ImageOutputFormat } from '../core/target-size.ts';
  import type { createImageCompressController } from '../controller/image-compress.svelte.ts';

  let { controller }: { controller: ReturnType<typeof createImageCompressController> } = $props();
  let picker: HTMLInputElement;
  const presets = [50, 100, 200, 500];
  let previewMode = $state<'compare' | 'original' | 'result'>('compare');
  let zoom = $state<'fit' | 100 | 200>('fit');
  let choosingFocus = $state(false);

  function picked(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void controller.setFile(input.files?.[0] ?? null);
    input.value = '';
  }

  function dropped(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && controller.status !== 'processing') void controller.setFile(file);
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
            value={controller.targetInput} disabled={controller.status === 'processing'}
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
              size="sm" disabled={controller.status === 'processing'} onclick={() => controller.setTargetInput(String(preset))}>
              {preset} KB
            </Button>
          {/each}
        </div>
      </div>

      <div class="mt-6 border-t border-border pt-5">
        <p class="mb-3 text-ui font-medium">Output format</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Output format">
          {#each [{ label: 'WebP', value: 'image/webp' }, { label: 'JPEG', value: 'image/jpeg' }, { label: 'AVIF', value: 'image/avif' }] as option}
            <Button variant={controller.format === option.value ? 'secondary' : 'outline'} size="sm"
              aria-pressed={controller.format === option.value} disabled={controller.status === 'processing'}
              onclick={() => controller.setFormat(option.value as ImageOutputFormat)}>
              {option.label}
            </Button>
          {/each}
        </div>
        <p class="mt-2 text-meta text-muted-foreground">
          {controller.format === 'image/jpeg'
            ? 'JPEG works with most upload forms. Transparent pixels turn white.'
            : controller.format === 'image/avif'
              ? 'AVIF can compress efficiently but encodes more slowly. Some upload forms reject it.'
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
          <Switch id="modu-smart-resize" checked={controller.allowResize} disabled={controller.status === 'processing'}
            aria-label="Allow smart resize"
            onCheckedChange={(checked) => controller.setAllowResize(checked)} />
        </div>
      </div>

      <Button class="mt-6 w-full"
        variant={controller.status === 'quality-limited' && !controller.allowResize ? 'outline' : 'default'}
        disabled={!controller.file || !controller.info || Boolean(controller.targetError) || controller.status === 'processing'}
        onclick={() => void controller.compress()}>
        {#if controller.status === 'processing'}
          Encoding attempt {controller.attempts}…
        {:else}
          Compress image
        {/if}
        <ArrowDown class="size-4" strokeWidth={1.8} />
      </Button>
      {#if controller.status === 'processing'}
        <Button variant="outline" class="mt-2 w-full" onclick={controller.cancel}>
          <X class="size-4" strokeWidth={1.8} />
          Cancel compression
        </Button>
      {/if}
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
        {#if controller.outputUrl}
          <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Preview mode" class="flex flex-wrap gap-2">
              {#each [{ id: 'compare', label: 'Compare' }, { id: 'original', label: 'Original' }, { id: 'result', label: 'Result' }] as item}
                <Button size="sm" variant={previewMode === item.id ? 'secondary' : 'outline'}
                  aria-pressed={previewMode === item.id}
                  onclick={() => previewMode = item.id as typeof previewMode}>{item.label}</Button>
              {/each}
            </div>
            <div role="group" aria-label="Preview zoom" class="flex flex-wrap gap-2">
              {#each [{ id: 'fit', label: 'Fit' }, { id: 100, label: '100%' }, { id: 200, label: '200%' }] as option}
                <Button size="sm" variant={zoom === option.id ? 'secondary' : 'outline'}
                  aria-pressed={zoom === option.id}
                  onclick={() => zoom = option.id as typeof zoom}>{option.label}</Button>
              {/each}
            </div>
          </div>
        {/if}
        <div class={previewMode === 'compare' || !controller.outputUrl
          ? 'mt-4 grid grid-cols-2 gap-3' : 'mt-4 grid grid-cols-1 gap-3'}>
          {#if previewMode !== 'result' || !controller.outputUrl}
          <figure class="min-w-0">
            <div class="h-48 overflow-auto rounded-xl border border-border bg-muted max-[640px]:h-36">
              <div class={zoom === 'fit' ? 'flex h-full w-full items-center justify-center' : 'w-max min-w-full'}>
                <img src={controller.originalUrl} alt="Original preview"
                  class={zoom === 'fit' ? 'max-h-48 max-w-full object-contain max-[640px]:max-h-36' : 'max-w-none'}
                  style={zoom === 'fit' ? '' : 'width: ' + (controller.info?.width ?? 0) * zoom / 100 + 'px; height: auto;'} />
              </div>
            </div>
            <figcaption class="mt-2 text-meta text-muted-foreground">
              Original · {formatBytes(controller.file?.size ?? 0)}
            </figcaption>
          </figure>
          {/if}
          {#if previewMode !== 'original' || !controller.outputUrl}
          <figure class="min-w-0">
            <div class="h-48 overflow-auto rounded-xl border border-border bg-muted max-[640px]:h-36">
              <div class={zoom === 'fit' ? 'flex h-full w-full items-center justify-center' : 'w-max min-w-full'}>
              {#if controller.outputUrl}
                <img src={controller.outputUrl} alt="Compressed preview"
                  class={zoom === 'fit' ? 'max-h-48 max-w-full object-contain max-[640px]:max-h-36' : 'max-w-none'}
                  style={zoom === 'fit' ? '' : 'width: ' + (controller.output?.width ?? 0) * zoom / 100 + 'px; height: auto;'} />
              {:else}
                <span class="text-meta text-muted-foreground">Result</span>
              {/if}
              </div>
            </div>
            <figcaption class="mt-2 text-meta text-muted-foreground">
              {controller.output ? (controller.status === 'processing' ? 'Previous result · ' : 'Output · ') + formatBytes(controller.output.blob.size) : 'Not generated yet'}
            </figcaption>
          </figure>
          {/if}
        </div>
      {:else}
        <div class="mt-4 flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50">
          <p class="text-ui text-muted-foreground">Your image preview appears here.</p>
        </div>
      {/if}

      <div role="status" aria-live="polite" class="mt-5">
        {#if controller.status === 'processing'}
          <p class="text-ui">{controller.runningMode === 'content-aware' ? 'Checking important details…' : controller.runningMode === 'perceptual' ? 'Comparing visual quality…' : controller.output ? 'Resizing and recompressing…' : 'Optimizing image…'}</p>
          <p class="mt-1 text-meta text-muted-foreground">
            {controller.output
              ? 'Your previous result remains available during this attempt.'
              : 'Testing quality and, if allowed, resolution. Large images may take a moment.'}
          </p>
        {:else if controller.status === 'complete' && controller.output}
          <p class="text-ui font-medium text-success">Target reached</p>
          <p class="mt-1 text-meta text-muted-foreground">
            {formatBytes(controller.output.blob.size)} · Quality setting {Math.round(controller.output.quality * 100)}%
            · {controller.output.width} × {controller.output.height} px {controller.output.resized ? '(resized with permission)' : '(original resolution)'}
            · {controller.output.engine === 'wasm' ? 'WASM encoder' : controller.output.engine === 'browser-fallback' ? 'Browser encoder fallback' : 'Original file'}
          </p>
        {:else if controller.status === 'quality-limited' && controller.output}
          <p class="text-ui font-medium">Target size not reached</p>
          <p class="mt-1 text-meta text-muted-foreground">
            Current result: {formatBytes(controller.output.blob.size)} · {controller.output.width} × {controller.output.height} px
            · encoder setting {Math.round(controller.output.quality * 100)}.
            {#if !controller.allowResize}
              Allow resizing to try reaching {controller.targetInput} KB.
            {:else if !controller.retryNotice}
              The 640 px minimum short side was respected. Try a larger target.
            {/if}
          </p>
          {#if controller.retryNotice}
            <p class="mt-2 text-meta text-muted-foreground">{controller.retryNotice}</p>
          {/if}
        {:else if controller.status === 'ready'}
          <p class="text-ui text-muted-foreground">Choose a target and compress to see the result.</p>
        {/if}
        {#if controller.optimizationNotice}
          <p class="mt-2 text-meta text-muted-foreground">{controller.optimizationNotice}</p>
        {/if}
        {#if controller.output?.qualityEvidence}
          <p class="mt-2 text-meta text-muted-foreground">
            Evaluated {controller.output.qualityEvidence.scoredCandidates} candidates using MILO at
            {controller.output.qualityEvidence.comparisonLongSide}px display size.
            Raw error {controller.output.qualityEvidence.rawError.toFixed(5)}
            {#if controller.output.qualityEvidence.baselineRawError !== undefined}
              vs baseline {controller.output.qualityEvidence.baselineRawError.toFixed(5)}
            {/if}
            (lower is better; not a quality percentage).
          </p>
        {/if}
        {#if controller.contentReview}
          <p class="mt-2 text-meta text-muted-foreground">
            Important details checked: {controller.contentReview.regions.filter((r) => r.kind === 'face').length} face,
            {controller.contentReview.regions.filter((r) => r.kind === 'text-like').length} text-like,
            {controller.contentReview.regions.filter((r) => r.kind === 'manual').length} selected.
            {controller.contentReview.faceStatus === 'unavailable' ? 'Automatic face detection unavailable.' : ''}
            {controller.contentReview.improved ? 'A better matching result was found.' : 'Previous result retained.'}
          </p>
          {#if controller.contentReview.regions.length && controller.contentReview.regionErrors}
            <details class="mt-2 text-meta text-muted-foreground">
              <summary class="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Quality comparison details</summary>
              <div class="mt-2 space-y-1">
                <p>Global MILO error:
                  {controller.contentReview.baselineGlobalError?.toFixed(5) ?? 'n/a'} →
                  {controller.contentReview.globalError?.toFixed(5) ?? 'n/a'}.
                </p>
                {#each controller.contentReview.regions as region (region.id)}
                  <p data-roi-id={region.id} data-roi-kind={region.kind}
                    data-roi-bounds={JSON.stringify(region.bounds)}>{region.kind}:
                    {controller.contentReview.baselineRegionErrors?.find((e) => e.regionId === region.id)?.error.toFixed(5) ?? 'n/a'} →
                    {controller.contentReview.regionErrors?.find((e) => e.regionId === region.id)?.error.toFixed(5) ?? 'n/a'}.
                  </p>
                {/each}
              </div>
            </details>
          {/if}
        {/if}
        {#if controller.error}
          <p role="alert" class="mt-2 text-ui text-destructive">{controller.error}</p>
        {/if}
      </div>

      {#if controller.output}
        {#if controller.status === 'complete' && controller.originalUrl}
          <div class="mt-5 space-y-3 border-t border-border pt-5">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-ui font-medium">Important details</p>
                <p class="mt-1 text-meta text-muted-foreground">Check faces, text-like strokes or one selected area.</p>
              </div>
              <Button size="sm" variant="outline" aria-expanded={choosingFocus}
                onclick={() => choosingFocus = !choosingFocus}>
                {choosingFocus ? 'Close focus' : 'Choose focus'}
              </Button>
            </div>
            {#if choosingFocus}
              <FocusRegionOverlay src={controller.originalUrl}
                bounds={controller.manualRegion?.bounds ?? null}
                onSelect={(bounds) => controller.setManualRegion(bounds)} />
              <div class="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline"
                  onclick={() => controller.setManualRegion({x:.3,y:.3,width:.4,height:.4})}>Center</Button>
                <Button size="sm" variant="outline"
                  onclick={() => controller.setManualRegion({x:.2,y:.05,width:.6,height:.35})}>Top</Button>
                <Button size="sm" variant="outline" disabled={!controller.manualRegion}
                  onclick={() => controller.setManualRegion(null)}>Clear focus</Button>
              </div>
              <p class="text-meta text-muted-foreground">
                Drag to select an area, or use the preset buttons. The original image stays unchanged.
              </p>
            {/if}
            {#if !controller.contentReview && !controller.output.contentEvidence}
              <Button class="w-full" variant="outline" onclick={() => void controller.optimizeImportantDetails()}>
                <WandSparkles class="size-4" strokeWidth={1.8} />
                Optimize important details
              </Button>
            {/if}
          </div>
        {/if}
        <div class="mt-5 flex flex-col gap-3 border-t border-border pt-5">
          {#if controller.status === 'quality-limited' && !controller.allowResize}
            <p class="text-meta text-muted-foreground">
              Resizing may reduce pixel dimensions. Your original image remains unchanged.
            </p>
            <Button class="w-full" onclick={() => void controller.recompressWithResize()}>
              <WandSparkles class="size-4" strokeWidth={1.8} />
              Smart resize &amp; retry {controller.targetInput} KB
            </Button>
          {/if}
          {#if controller.status === 'complete' && !controller.output.qualityEvidence && !controller.optimizationNotice}
            <Button class="w-full" variant="outline" onclick={() => void controller.optimizeVisualQuality()}>
              <WandSparkles class="size-4" strokeWidth={1.8} />
              Optimize visual quality
            </Button>
          {/if}
          <Button variant={controller.status === 'complete' ? 'default' : 'outline'} class="w-full"
            onclick={controller.download}>
            <Download class="size-4" strokeWidth={1.8} />
            {controller.status === 'processing'
              ? 'Download previous result'
              : controller.status === 'quality-limited' ? 'Download larger result' : 'Download image'}
          </Button>
        </div>
      {/if}
    </div>
  </div>
</div>
