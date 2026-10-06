<script lang="ts">
  import { getModulesByCategory } from '#lib/platform/registry/modules.ts';
  import type { ModuleCategory } from '#lib/platform/registry/types.ts';

  let {
    category,
    title,
    description
  }: {
    category: ModuleCategory;
    title: string;
    description: string;
  } = $props();

  const items = getModulesByCategory(category);
</script>

<section class="page">
  <div class="page-head">
    <div>
      <div class="breadcrumb">Module / {title}</div>
      <h1 class="page-title">{title}</h1>
      <p class="page-copy">{description}</p>
    </div>
  </div>

  <div class="search-wrap">
    <span>⌕</span>
    <input aria-label={"Search in " + title} placeholder={"Search in " + title} />
  </div>

  <div class="tool-list">
    {#each items as item}
      <a class="tool-row" href={item.route}>
        <div class="tool-icon">{item.name.slice(0, 2)}</div>
        <div>
          <div class="name">{item.name}</div>
          <div class="description">{item.description}</div>
        </div>
        <span class="arrow">→</span>
      </a>
    {/each}
  </div>
</section>

<style>
  .breadcrumb {
    margin-bottom: 12px;
    color: var(--muted-2);
    font-size: 12px;
  }

  .search-wrap {
    position: relative;
    margin-bottom: 20px;
  }

  .search-wrap span {
    position: absolute;
    top: 50%;
    left: 13px;
    transform: translateY(-50%);
    color: var(--muted);
  }

  .search-wrap input {
    width: 100%;
    height: 42px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
    padding: 0 12px 0 38px;
    outline: none;
    font-size: 13px;
  }

  .tool-list {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }

  .tool-row {
    display: grid;
    min-height: 68px;
    grid-template-columns: 38px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
  }

  .tool-row:last-child {
    border-bottom: 0;
  }

  .tool-row:hover {
    background: var(--brand-pale);
  }

  .name {
    font-size: 13px;
    font-weight: 700;
  }

  .description {
    margin-top: 3px;
    color: var(--muted);
    font-size: 12px;
  }

  .arrow {
    color: var(--muted-2);
  }
</style>
