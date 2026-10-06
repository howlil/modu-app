<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Merge PDF — Module</title></svelte:head>

<section class="page">
  <ToolHeader
    eyebrow="Module / Files / PDF"
    title="Merge PDF"
    description="Combine multiple PDF files into one document. Reorder before processing."
    privacy="Files stay on this device"
  />

  <div class="workspace">
    <div>
      <div class="dropzone">
        <div>
          <div class="drop-icon">↑</div>
          <strong>Drop PDF files here</strong>
          <p>or choose files from your device</p>
          <button class="button" type="button">Choose files</button>
        </div>
      </div>

      <div class="placeholder-list">Selected files will appear here.</div>
    </div>

    <aside class="panel">
      <div class="panel-head">Output</div>
      <div class="panel-body options">
        <label class="field">
          <span>File name</span>
          <input class="input" value="merged.pdf" />
        </label>

        <button class="button primary block" type="button" disabled>Merge PDF</button>

        <p class="local-note">
          The PDF engine is intentionally not wired in this scaffold. Add it as a lazy-loaded,
          worker-backed vertical slice.
        </p>
      </div>
    </aside>
  </div>
</section>

<style>
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 290px;
    gap: 22px;
    align-items: start;
  }

  .dropzone {
    display: grid;
    min-height: 240px;
    place-items: center;
    border: 1px dashed #cdcdc7;
    border-radius: 12px;
    background: var(--surface);
    padding: 24px;
    text-align: center;
  }

  .dropzone p,
  .local-note {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .drop-icon {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    margin: 0 auto 12px;
    border-radius: 10px;
    background: var(--brand-soft);
    color: var(--brand);
  }

  .placeholder-list {
    margin-top: 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    padding: 18px;
    color: var(--muted);
    font-size: 13px;
  }

  .options {
    display: grid;
    gap: 14px;
  }

  @media (max-width: 860px) {
    .workspace {
      grid-template-columns: 1fr;
    }
  }
</style>
