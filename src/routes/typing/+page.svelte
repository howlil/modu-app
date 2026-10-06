<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Typing Practice — Module</title></svelte:head>

<section class="page">
  <ToolHeader
    eyebrow="Module / Productivity"
    title="Typing Practice"
    description="Practice typing speed and accuracy with local session summaries."
    privacy="Session data stays local"
  />

  <div class="modes">
    <button class="active" type="button">Time</button>
    <button type="button">Words</button>
    <button type="button">Paragraph</button>
    <button type="button">Custom</button>
  </div>

  <div class="typing-surface">
    <span class="done">The quick brown fox jumps over the lazy dog. </span>
    <span class="current">A</span>
    <span> focused typing session belongs here.</span>
  </div>

  <div class="footer">
    <span>60 seconds · English</span>
    <button class="button primary" type="button">Start session</button>
  </div>
</section>

<style>
  .modes {
    display: flex;
    max-width: 420px;
    gap: 3px;
    margin-bottom: 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-soft);
    padding: 3px;
  }

  .modes button {
    flex: 1;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 7px 10px;
    color: var(--muted);
    font-size: 12px;
  }

  .modes button.active {
    background: var(--surface);
    color: var(--ink);
    font-weight: 650;
  }

  .typing-surface {
    min-height: 210px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    padding: 24px;
    color: #b4b4b4;
    font: 18px/1.8 "SFMono-Regular", Consolas, monospace;
  }

  .done {
    color: var(--ink);
  }

  .current {
    border-radius: 3px;
    background: var(--brand-soft);
    color: var(--brand);
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
