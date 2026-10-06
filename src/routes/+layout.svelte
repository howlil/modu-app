<script lang="ts">
  import '../app.css';
  import AppHeader from '#lib/components/AppHeader.svelte';

  let { children } = $props();
</script>

<AppHeader />

<main class="mx-auto w-[min(1180px,calc(100%-2rem))] max-[700px]:w-[calc(100%-1.25rem)]">
  {@render children()}
</main>
