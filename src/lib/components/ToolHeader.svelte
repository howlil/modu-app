<script lang="ts">
  let {
    title,
    description
  }: {
    title: string;
    description?: string;
  } = $props();
</script>

<header class="mb-6">
  <h1 class="m-0 text-page-title font-semibold tracking-[-0.04em]">{title}</h1>
  {#if description}
    <p class="mt-2 max-w-[560px] text-body text-muted-foreground">{description}</p>
  {/if}
</header>
