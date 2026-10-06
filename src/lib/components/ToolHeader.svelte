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
  <h1 class="m-0 text-[clamp(28px,4vw,34px)] font-[750] leading-none tracking-[-0.04em]">{title}</h1>
  {#if description}
    <p class="mt-2 max-w-[560px] text-sm leading-[1.5] text-muted-foreground">{description}</p>
  {/if}
</header>
