<script lang="ts">
  import { categories, modules } from '#lib/platform/registry/modules.ts';

  const recentIds = ['pdf-merge', 'json-format', 'pomodoro'];
  const pinnedIds = ['image-compress', 'uuid', 'typing'];

  const recent = recentIds
    .map((id) => modules.find((module) => module.id === id))
    .filter((module) => module !== undefined);

  const pinned = pinnedIds
    .map((id) => modules.find((module) => module.id === id))
    .filter((module) => module !== undefined);
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta
    name="description"
    content="Private, local-first browser utilities for files, development, and productivity."
  />
</svelte:head>

<section class="page">
  <div class="hero">
    <div class="eyebrow">Private browser utilities</div>
    <h1>Useful tools.<br />Nothing extra.</h1>
    <p>
      Small utilities for files, focus, text, and development.
      Open a tool, finish the task, leave.
    </p>

    <a id="search" class="hero-search" href="#search">
      <span>⌕</span>
      <span class="placeholder">What do you want to do?</span>
      <kbd>⌘ K</kbd>
    </a>

    <div class="trust">
      <span>Runs locally</span><span>•</span><span>No account</span><span>•</span><span>Offline after load</span>
    </div>
  </div>

  <section class="section">
    <div class="section-head">
      <div>
        <h2>Recent</h2>
        <p>Continue with tools you already use.</p>
      </div>
    </div>

    <div class="tool-grid">
      {#each recent as module}
        <a class="tool-card" href={module.route}>
          <div class="tool-icon">{module.name.slice(0, 2)}</div>
          <div class="tool-name">{module.name}</div>
          <div class="tool-description">{module.description}</div>
        </a>
      {/each}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div>
        <h2>Pinned</h2>
        <p>Your highest-frequency tools stay close.</p>
      </div>
    </div>

    <div class="tool-grid">
      {#each pinned as module}
        <a class="tool-card" href={module.route}>
          <div class="tool-icon">{module.name.slice(0, 2)}</div>
          <div class="tool-name">{module.name}</div>
          <div class="tool-description">{module.description}</div>
        </a>
      {/each}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div>
        <h2>Explore</h2>
        <p>Browse by the kind of task you want to complete.</p>
      </div>
    </div>

    <div class="category-grid">
      {#each categories as category}
        <a class="category-card" href={category.route}>
          <div class="category-top">
            <strong>{category.name}</strong>
            <span>→</span>
          </div>
          <p>{category.description}</p>
        </a>
      {/each}
    </div>
  </section>
</section>

<style>
  .hero {
    max-width: 780px;
    margin: 20px auto 64px;
    text-align: center;
  }

  .eyebrow {
    margin-bottom: 14px;
    color: var(--brand);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  h1 {
    margin: 0;
    font-size: clamp(44px, 7vw, 70px);
    line-height: 0.97;
    letter-spacing: -0.06em;
    font-weight: 760;
  }

  .hero > p {
    max-width: 600px;
    margin: 18px auto 0;
    color: var(--muted);
    font-size: 16px;
    line-height: 1.6;
  }

  .hero-search {
    display: flex;
    max-width: 680px;
    height: 58px;
    align-items: center;
    gap: 10px;
    margin: 30px auto 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    padding: 0 14px;
    color: var(--muted);
  }

  .placeholder {
    flex: 1;
    text-align: left;
    font-size: 14px;
  }

  .trust {
    display: flex;
    justify-content: center;
    gap: 14px;
    margin-top: 14px;
    color: var(--muted);
    font-size: 12px;
  }

  .section {
    margin-top: 44px;
  }

  .section-head {
    margin-bottom: 14px;
  }

  .section-head h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: -0.02em;
  }

  .section-head p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }

  .category-card {
    min-height: 130px;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 18px;
  }

  .category-card:nth-child(2n) {
    border-right: 0;
  }

  .category-card:nth-last-child(-n + 2) {
    border-bottom: 0;
  }

  .category-card:hover {
    background: var(--brand-pale);
  }

  .category-top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 15px;
  }

  .category-card p {
    max-width: 420px;
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
  }

  @media (max-width: 700px) {
    .hero {
      margin-top: 8px;
      text-align: left;
    }

    .hero h1 {
      font-size: 44px;
    }

    .hero > p {
      margin-left: 0;
    }

    .trust {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .category-grid {
      grid-template-columns: 1fr;
    }

    .category-card,
    .category-card:nth-child(2n),
    .category-card:nth-last-child(-n + 2) {
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

    .category-card:last-child {
      border-bottom: 0;
    }
  }
</style>
