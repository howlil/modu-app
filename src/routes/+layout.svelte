<script lang="ts">
  import '../app.css';
  import AppHeader from '#lib/components/AppHeader.svelte';

  let { children } = $props();
</script>

<AppHeader />

<main class="mx-auto w-full max-w-[1180px] px-4 max-[700px]:px-2.5">
  {@render children()}
</main>
