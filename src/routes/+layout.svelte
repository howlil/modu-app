<script lang="ts">
  import '../app.css';
  import AppHeader from '#lib/components/AppHeader.svelte';
  import { onMount } from 'svelte';
  import { startGlobalSyncRuntime } from '#lib/platform/data/sync-runtime.ts';

  onMount(() => startGlobalSyncRuntime());

  let { children } = $props();
</script>

<AppHeader />

<main class="w-full min-w-0 overflow-x-clip pt-[68px]">
  {@render children()}
</main>
