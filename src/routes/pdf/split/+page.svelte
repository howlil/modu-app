<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Split PDF — Module</title></svelte:head>

<section class="page">
  <ToolHeader
    eyebrow="Module / Files / PDF"
    title="Split PDF"
    description="Extract selected pages or split one PDF into ranges."
  />

  <div class="panel">
    <div class="panel-head">File workspace</div>
    <div class="panel-body empty">
      <p>Choose a PDF to render page thumbnails and select ranges.</p>
      <button class="button" type="button">Choose PDF</button>
    </div>
  </div>
</section>

<style>
  .empty {
    min-height: 240px;
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
