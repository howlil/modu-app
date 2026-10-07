<script lang="ts">
  import FeatureRequestDialog from '#lib/components/FeatureRequestDialog.svelte';
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  const imageCompressPreview: ModuleDefinition = {
    id: 'image-compress',
    name: 'Image Compress',
    route: '#',
    layout: 'file-transform'
  };
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="Small browser utilities that run locally." />
</svelte:head>

<section class="hero-cloud relative -mt-[68px] overflow-hidden pt-[68px]">
  <div class="cloud-field pointer-events-none absolute inset-x-0 bottom-[-12px] h-[53%]" aria-hidden="true">
    <span class="cloud cloud-1"></span>
    <span class="cloud cloud-2"></span>
    <span class="cloud cloud-3"></span>
    <span class="cloud cloud-4"></span>
    <span class="cloud cloud-5"></span>
  </div>

  <div class="relative z-10 grid min-h-[570px] place-items-center px-4 py-[72px] pb-[98px] text-center max-[760px]:px-2.5 max-[700px]:min-h-[500px] max-[700px]:py-14">
    <div class="mx-auto w-full max-w-[820px]">
      <h1 class="m-0 text-[clamp(42px,6vw,64px)] font-[520] leading-[0.98] tracking-[-0.055em]">
        Useful tools.<br />Nothing extra.
      </h1>

      <p class="mx-auto mt-5 max-w-[540px] text-[15px] font-normal leading-[1.55] tracking-[-0.01em] text-muted-foreground">
        Small utilities for files, focus, and everyday work — designed to get out of the way.
      </p>

      <div class="mt-7 flex justify-center">
        <FeatureRequestDialog />
      </div>
    </div>
  </div>
</section>

<section id="tools" class="px-4 pb-16 pt-2 max-[760px]:px-2.5 max-[700px]:pb-12">
  <div class="mx-auto grid w-full max-w-[1040px] grid-cols-4 gap-3 max-[820px]:grid-cols-2">
    {#each modules as module}
      <ToolCard {module} />
    {/each}

    <ToolCard module={imageCompressPreview} preview />
  </div>
</section>

<style>
  .hero-cloud {
    width: 100%;
    background:
      radial-gradient(
        900px 350px at 50% -4%,
        color-mix(in srgb, var(--primary) 40%, transparent) 0%,
        color-mix(in srgb, var(--primary) 24%, transparent) 28%,
        color-mix(in srgb, var(--primary) 10%, transparent) 53%,
        transparent 78%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--primary) 23%, transparent) 0%,
        color-mix(in srgb, var(--primary) 16%, transparent) 16%,
        color-mix(in srgb, var(--primary) 9%, transparent) 31%,
        color-mix(in srgb, var(--primary) 3.5%, transparent) 50%,
        color-mix(in srgb, var(--background) 76%, transparent) 72%,
        var(--background) 100%
      );
  }

  .hero-cloud::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      180deg,
      transparent 0%,
      transparent 44%,
      color-mix(in srgb, var(--background) 14%, transparent) 58%,
      color-mix(in srgb, var(--background) 58%, transparent) 78%,
      var(--background) 100%
    );
  }

  .cloud-field::before,
  .cloud-field::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.6);
    filter: blur(20px);
  }

  .cloud-field::before {
    width: 30%;
    height: 26%;
    left: 19%;
    top: 23%;
    transform: rotate(-4deg);
  }

  .cloud-field::after {
    width: 31%;
    height: 23%;
    right: 17%;
    top: 18%;
    transform: rotate(5deg);
  }

  .cloud {
    position: absolute;
    display: block;
    border-radius: 999px;
    background:
      radial-gradient(
        circle at 50% 38%,
        rgb(255 255 255 / 0.98) 0%,
        rgb(255 255 255 / 0.94) 45%,
        rgb(255 255 255 / 0.78) 68%,
        rgb(255 255 255 / 0) 100%
      );
    box-shadow:
      0 -18px 60px rgb(255 255 255 / 0.72),
      0 25px 90px color-mix(in srgb, var(--primary) 3.5%, transparent);
  }

  .cloud-1 {
    width: 34%;
    height: 48%;
    left: -3%;
    bottom: -2%;
    opacity: 0.88;
  }

  .cloud-2 {
    width: 34%;
    height: 60%;
    left: 13%;
    bottom: -13%;
    opacity: 0.96;
  }

  .cloud-3 {
    width: 38%;
    height: 66%;
    left: 33%;
    bottom: -18%;
  }

  .cloud-4 {
    width: 35%;
    height: 57%;
    left: 60%;
    bottom: -11%;
    opacity: 0.95;
  }

  .cloud-5 {
    width: 31%;
    height: 46%;
    right: -2%;
    bottom: -2%;
    opacity: 0.86;
  }

  @media (max-width: 700px) {
    .cloud-field {
      height: 46%;
      bottom: -22px;
    }
  }
</style>
