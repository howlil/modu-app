<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';

  let input = '{ "name": "Module", "localFirst": true }';
</script>

<svelte:head><title>Format JSON — Module</title></svelte:head>

<section class="page">
  <ToolHeader
    eyebrow="Module / Developer"
    title="Format JSON"
    description="Format, validate, and minify JSON without sending it anywhere."
    privacy="Text stays local"
  />

  <div class="actions">
    <button class="button primary" type="button">Format</button>
    <button class="button" type="button">Minify</button>
    <button class="button" type="button">Validate</button>
  </div>

  <div class="transform">
    <label class="field">
      <span>Input</span>
      <textarea class="textarea" bind:value={input}></textarea>
    </label>

    <label class="field">
      <span>Output</span>
      <textarea class="textarea" readonly value={input}></textarea>
    </label>
  </div>

  <p class="note">
    Behavior is intentionally a UI scaffold; domain formatting logic belongs in the module layer.
  </p>
</section>

<style>
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .transform {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .note {
    color: var(--muted);
    font-size: 12px;
  }

  @media (max-width: 760px) {
    .transform {
      grid-template-columns: 1fr;
    }
  }
</style>
