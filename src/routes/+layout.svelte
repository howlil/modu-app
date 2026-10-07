<script lang="ts">
  import '../app.css';
  import AppHeader from '#lib/components/AppHeader.svelte';

  let { children } = $props();
</script>

<AppHeader />

<main class="w-full min-w-0 overflow-x-clip pt-[68px]">
  {@render children()}
</main>
