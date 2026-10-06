<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>UUID Generator — Module</title></svelte:head>

<section class="page">
  <ToolHeader
    eyebrow="Module / Developer"
    title="UUID Generator"
    description="Generate UUIDs instantly in your browser."
    privacy="Generated locally"
  />

  <div class="generator">
    <aside class="panel">
      <div class="panel-head">Options</div>
      <div class="panel-body options">
        <label class="field">
          <span>Version</span>
          <select class="select">
            <option>UUID v4</option>
            <option>UUID v7</option>
          </select>
        </label>

        <label class="field">
          <span>Count</span>
          <input class="input" type="number" min="1" value="3" />
        </label>

        <button class="button primary block" type="button">Generate</button>
      </div>
    </aside>

    <div class="panel">
      <div class="panel-head">Generated values</div>
      <div class="panel-body empty">Generated UUIDs will appear here.</div>
    </div>
  </div>
</section>

<style>
  .generator {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 20px;
  }

  .options {
    display: grid;
    gap: 12px;
  }

  .empty {
    min-height: 180px;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 760px) {
    .generator {
      grid-template-columns: 1fr;
    }
  }
</style>
