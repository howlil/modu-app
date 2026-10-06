<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Compress Image — Module</title></svelte:head>

<section class="page">
  <ToolHeader
    eyebrow="Module / Images"
    title="Compress Image"
    description="Reduce image size locally while controlling output quality."
    privacy="Image stays on this device"
  />

  <div class="panel">
    <div class="panel-head">Image workspace</div>
    <div class="panel-body empty">
      <p>Choose an image to start a local compression job.</p>
      <button class="button" type="button">Choose image</button>
    </div>
  </div>
</section>

<style>
  .empty {
    min-height: 260px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 10px;
    color: var(--muted);
    text-align: center;
  }

  .empty p {
    margin: 0;
  }
</style>
