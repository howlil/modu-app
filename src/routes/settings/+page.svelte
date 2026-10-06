<script lang="ts">
  import { Button, Switch } from 'bits-ui';

  let rememberRecent = $state(true);
</script>

<svelte:head><title>Settings — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <div class="mb-7">
    <h1 class="m-0 text-[clamp(30px,4vw,36px)] font-[750] leading-[1.05] tracking-[-0.045em]">Settings</h1>
    <p class="mt-2 max-w-[680px] text-sm leading-[1.55] text-muted">Local preferences, storage, backup, and privacy controls.</p>
  </div>

  <div class="max-w-[760px]">
    <section class="mb-[26px] border-b border-line pb-[26px]">
      <div class="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-2">General</div>
      <div class="flex items-center justify-between gap-6 py-3.5">
        <div>
          <strong class="text-[13px]">Remember recent tools</strong>
          <p class="mt-1 text-xs leading-[1.55] text-muted">Persist recently opened modules on this device.</p>
        </div>

        <Switch.Root
          bind:checked={rememberRecent}
          class="relative h-[22px] w-10 shrink-0 rounded-full bg-[#c9cbc7] outline-none transition-colors data-[checked]:bg-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label="Remember recent tools"
        >
          <Switch.Thumb class="block size-4 translate-x-[3px] rounded-full bg-white transition-transform data-[checked]:translate-x-[21px]" />
        </Switch.Root>
      </div>
    </section>

    <section class="mb-[26px] border-b border-line pb-[26px]">
      <div class="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-2">Storage</div>
      <div class="flex items-center justify-between gap-6 py-3.5">
        <div>
          <strong class="text-[13px]">Export local data</strong>
          <p class="mt-1 text-xs leading-[1.55] text-muted">Create a versioned backup before clearing browser data.</p>
        </div>
        <Button.Root class="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-[650] hover:bg-surface-soft" type="button">
          Export
        </Button.Root>
      </div>
    </section>

    <section>
      <div class="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-2">Privacy</div>
      <p class="mt-3 text-xs leading-[1.55] text-muted">
        Local modules are designed so user files and tool content remain in the browser.
        Local storage is device-local, not a cloud backup.
      </p>
    </section>
  </div>
</section>
