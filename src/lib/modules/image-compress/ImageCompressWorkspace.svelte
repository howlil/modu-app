<script lang="ts">
  import { onDestroy } from 'svelte';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import CompressorView from './components/CompressorView.svelte';
  import { createImageCompressController } from './controller/image-compress.svelte.ts';

  const controller = createImageCompressController();
  onDestroy(() => controller.dispose());
</script>

<section class="mx-auto w-full max-w-[1180px] px-4 py-8 max-[760px]:px-2.5 max-[760px]:py-6">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader title="Image Compressor" description="Choose a target size. Resize only when you allow it." />
    <CompressorView {controller} />
  </div>
</section>
