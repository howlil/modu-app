<script lang="ts">
  let {
    eyebrow,
    title,
    description,
    privacy = 'Processed locally on this device'
  }: {
    eyebrow: string;
    title: string;
    description: string;
    privacy?: string;
  } = $props();
</script>

<div class="page-head">
  <div>
    <div class="eyebrow">{eyebrow}</div>
    <h1 class="page-title">{title}</h1>
    <p class="page-copy">{description}</p>
  </div>

  <div class="privacy-badge">{privacy}</div>
</div>

<style>
  .eyebrow {
    margin-bottom: 12px;
    color: var(--muted-2);
    font-size: 12px;
  }
</style>
