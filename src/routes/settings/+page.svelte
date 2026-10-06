<svelte:head><title>Settings — Module</title></svelte:head>

<section class="page">
  <div class="page-head">
    <div>
      <h1 class="page-title">Settings</h1>
      <p class="page-copy">Local preferences, storage, backup, and privacy controls.</p>
    </div>
  </div>

  <div class="settings">
    <section>
      <div class="label">General</div>
      <div class="setting-row">
        <div>
          <strong>Remember recent tools</strong>
          <p>Persist recently opened modules on this device.</p>
        </div>
        <button class="toggle on" type="button" aria-label="Remember recent tools"></button>
      </div>
    </section>

    <section>
      <div class="label">Storage</div>
      <div class="setting-row">
        <div>
          <strong>Export local data</strong>
          <p>Create a versioned backup before clearing browser data.</p>
        </div>
        <button class="button" type="button">Export</button>
      </div>
    </section>

    <section>
      <div class="label">Privacy</div>
      <p class="privacy-copy">
        Local modules are designed so user files and tool content remain in the browser.
        Local storage is device-local, not a cloud backup.
      </p>
    </section>
  </div>
</section>

<style>
  .settings {
    max-width: 760px;
  }

  section {
    padding: 0 0 26px;
    margin-bottom: 26px;
    border-bottom: 1px solid var(--line);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 14px 0;
  }

  .setting-row strong {
    font-size: 13px;
  }

  .setting-row p,
  .privacy-copy {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.55;
  }

  .toggle {
    width: 40px;
    height: 22px;
    border: 0;
    border-radius: 999px;
    background: #c9cbc7;
    position: relative;
  }

  .toggle::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
  }

  .toggle.on {
    background: var(--brand);
  }

  .toggle.on::after {
    left: 21px;
  }
</style>
