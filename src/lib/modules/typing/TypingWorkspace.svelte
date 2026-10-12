<script lang="ts">
  import { Settings2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import TypingCanvas from './components/TypingCanvas.svelte';
  import ProgressView from './components/ProgressView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import { LESSONS } from './core/trainer.ts';
  import { createTypingController } from './controller/typing.svelte.ts';

  const controller = createTypingController();
</script>

<section class="mx-auto w-full max-w-[1180px] px-4 py-8 max-[760px]:px-2.5 max-[760px]:py-6">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader title="Typing Practice" />
    <Tabs.Root bind:value={controller.primaryTab} class="gap-0">
      <Tabs.List variant="default"
        class="-mt-2 h-9 w-full min-w-0 justify-start rounded-full bg-muted/65 p-1">
        {#each [
          {value:'train', label:'Train'},
          {value:'lessons', label:'Lessons'},
          {value:'test', label:'Test'},
          {value:'progress', label:'Progress'}
        ] as tab}
          <Tabs.Trigger value={tab.value}
            class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
            onclick={() => controller.setPrimaryTab(tab.value as 'train' | 'lessons' | 'test' | 'progress')}>
            {tab.label}
          </Tabs.Trigger>
        {/each}
        <Tabs.Trigger value="settings" aria-label="Typing settings"
          onclick={() => controller.setPrimaryTab('settings')}
          class="ml-auto size-7 flex-none rounded-full p-0 after:hidden data-[state=active]:bg-background data-[state=active]:shadow-none">
          <Settings2 class="size-4" strokeWidth={1.8} />
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="train" class="min-w-0 pt-8 max-[640px]:pt-6">
        <TypingCanvas {controller} mode="train" />
      </Tabs.Content>

      <Tabs.Content value="lessons" class="min-w-0 pt-8">
        <header class="mb-6 text-center">
          <h2 class="text-page-title font-semibold tracking-[-0.04em]">Learn one movement at a time.</h2>
          <p class="mt-2 text-ui text-muted-foreground">Ten focused lessons, from home row to developer symbols.</p>
        </header>
        <div class="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
          {#each LESSONS as lesson, index}
            <Button variant="outline"
              class="h-auto min-h-[92px] w-full items-start justify-start gap-4 rounded-[20px] bg-card px-5 py-5 text-left font-normal whitespace-normal shadow-none hover:border-primary/30 hover:bg-accent"
              onclick={() => controller.startLesson(index)}>
              <span class="shrink-0 font-mono text-meta text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <span class="min-w-0 flex-1">
                <strong class="block text-ui font-medium text-foreground">{lesson[0]}</strong>
                <span class="mt-1 block text-meta leading-5 text-muted-foreground">{lesson[1]}</span>
              </span>
              <span class="text-meta text-primary" aria-hidden="true">↗</span>
            </Button>
          {/each}
        </div>
      </Tabs.Content>

      <Tabs.Content value="test" class="min-w-0 pt-8 max-[640px]:pt-6">
        <TypingCanvas {controller} mode="test" />
      </Tabs.Content>

      <Tabs.Content value="progress" class="min-w-0 pt-8">
        <ProgressView learningState={controller.learningState} preferences={controller.preferences} />
      </Tabs.Content>

      <Tabs.Content value="settings" class="min-w-0 pt-8">
        <SettingsView
          preferences={controller.preferences}
          audioUnavailable={controller.audioUnavailable}
          onTogglePreference={controller.togglePreference}
          onPreviewSound={controller.previewKeyboardSound} />
      </Tabs.Content>
    </Tabs.Root>
  </div>
</section>
