<header class="topbar">
  <div class="shell topbar-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </span>
      Module
    </a>

    <a class="search-trigger" href="/#search" aria-label="Search tools">
      <span>⌕</span>
      <span class="search-label">Search tools</span>
      <kbd>⌘ K</kbd>
    </a>

    <div class="actions">
      <a class="local-pill" href="/settings">Local-first</a>
      <a class="icon-button" href="/settings" aria-label="Settings">⚙</a>
    </div>
  </div>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    height: 62px;
    border-bottom: 1px solid var(--line);
    background: rgb(252 252 248 / 95%);
    backdrop-filter: blur(14px);
  }

  .topbar-inner {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 16px;
    font-weight: 760;
    letter-spacing: -0.02em;
  }

  .brand-mark {
    display: grid;
    width: 27px;
    height: 27px;
    grid-template-columns: repeat(2, 1fr);
    gap: 3px;
    border-radius: 8px;
    background: var(--brand);
    padding: 6px;
  }

  .brand-mark span {
    border-radius: 2px;
    background: #fff;
  }

  .search-trigger {
    display: flex;
    width: min(440px, 40vw);
    height: 36px;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
    padding: 0 10px;
    color: var(--muted);
    font-size: 13px;
  }

  .search-label {
    flex: 1;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .local-pill,
  .icon-button {
    display: inline-flex;
    height: 34px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  .local-pill {
    gap: 7px;
    border-radius: 999px;
    padding: 0 10px;
    color: var(--muted);
    font-size: 12px;
  }

  .local-pill::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--success);
  }

  .icon-button {
    width: 34px;
    border-radius: 9px;
  }

  @media (max-width: 700px) {
    .search-trigger {
      width: 34px;
      padding: 0;
      justify-content: center;
    }

    .search-label,
    .search-trigger kbd,
    .local-pill {
      display: none;
    }
  }
</style>
