<script lang="ts">
  import { onMount } from "svelte";
  import { Download, Database, RefreshCw, HardDrive, CloudOff, ArrowLeft } from "lucide-svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { globalDataPorts } from "#lib/platform/data/registry.ts";
  import { createGlobalBackup, encodeGlobalBackup, inspectGlobalData } from "#lib/platform/data/backup.ts";
  import type { DataInspection } from "#lib/platform/data/contracts.ts";

  let summaries = $state<DataInspection[]>([]);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let loaded = $state(false);

  async function refresh() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      summaries = await inspectGlobalData(globalDataPorts);
      loaded = true;
    } catch (cause) {
      loaded = false;
      error = cause instanceof Error ? cause.message : "Unable to read local module data.";
    } finally {
      busy = false;
    }
  }

  async function downloadBackup() {
    if (busy) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const backup = await createGlobalBackup(globalDataPorts);
      const content = encodeGlobalBackup(backup);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = "modu-global-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notice = "Global backup exported. Store the file somewhere safe.";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Backup failed. No complete backup was created.";
    } finally {
      busy = false;
    }
  }

  onMount(() => { void refresh(); });
</script>

<svelte:head>
  <title>Data &amp; Sync — Modu</title>
  <meta name="description" content="Manage local Modu data and export a complete backup." />
</svelte:head>

<section class="mx-auto w-full max-w-[760px] px-4 pb-12 pt-8 max-[760px]:px-2.5">
  <a href="/" class="mb-6 inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground">
    <ArrowLeft class="size-3.5" /> Home
  </a>
  <header class="mb-6">
    <h1 class="text-page-title font-semibold tracking-[-0.04em]">Data &amp; Sync</h1>
    <p class="mt-1 text-ui text-muted-foreground">Your local data stays in this browser unless you export it.</p>
  </header>
  <div class="overflow-hidden rounded-[16px] border border-border bg-card">
    <section class="flex items-center justify-between gap-3 p-5">
      <div class="flex items-center gap-3">
        <div class="flex size-9 items-center justify-center rounded-xl bg-muted"><HardDrive class="size-4 text-muted-foreground" /></div>
        <div>
          <h2 class="text-ui font-medium">Local storage</h2>
          <p class="text-meta text-muted-foreground">IndexedDB and browser preferences</p>
        </div>
      </div>
      <Button variant="outline" size="sm" class="rounded-full shadow-none" onclick={refresh} disabled={busy}>
        <RefreshCw class="size-3.5" /> Refresh
      </Button>
    </section>
    <section class="border-t border-border px-5 py-4">
      <h2 class="mb-3 text-ui font-medium">Module data</h2>
      {#if loaded}
        {#each summaries as module (module.moduleId)}
          <div class="flex items-center justify-between gap-3 py-2">
            <div class="flex items-center gap-2"><Database class="size-3.5 text-muted-foreground" /><span class="text-ui">{module.moduleId}</span></div>
            <span class="text-meta text-muted-foreground">{module.recordCount} records</span>
          </div>
        {/each}
      {:else if !error}
        <p class="text-meta text-muted-foreground">Reading local module data…</p>
      {/if}
    </section>
    <section class="flex items-center justify-between gap-4 border-t border-border p-5">
      <div>
        <h2 class="text-ui font-medium">Export all data</h2>
        <p class="mt-1 text-meta text-muted-foreground">One JSON backup containing every registered module.</p>
      </div>
      <Button size="sm" class="shrink-0 rounded-full shadow-none" onclick={downloadBackup} disabled={busy}>
        <Download class="size-3.5" /> Export
      </Button>
    </section>
    <section class="flex items-center gap-3 border-t border-border p-5">
      <CloudOff class="size-4 shrink-0 text-muted-foreground" />
      <div>
        <h2 class="text-ui font-medium">Device sync is not configured</h2>
        <p class="mt-1 text-meta text-muted-foreground">Cross-browser sync and global restore are not available yet. Local storage works offline.</p>
      </div>
    </section>
  </div>
  {#if error}
    <p role="alert" class="mt-4 rounded-xl border border-destructive/30 px-4 py-3 text-ui text-destructive">{error}</p>
  {/if}
  {#if notice}
    <p role="status" class="mt-4 text-ui text-muted-foreground">{notice}</p>
  {/if}
  <p class="mt-5 text-meta text-muted-foreground">Exporting a backup does not change or upload your data. Browser storage is not guaranteed to survive clearing site data.</p>
</section>
