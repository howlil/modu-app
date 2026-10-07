<script lang="ts">
  import '../app.css';
  import AppHeader from '#lib/components/AppHeader.svelte';

  let { children } = $props();
</script>

<AppHeader />

<main class="w-full">
  {@render children()}
</main>
