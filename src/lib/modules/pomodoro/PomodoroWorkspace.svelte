<script lang="ts">
  import { Settings2 } from 'lucide-svelte';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import { createPomodoroController } from './controller/pomodoro.svelte.ts';
  import TimerView from './components/TimerView.svelte';
  import ActivityView from './components/ActivityView.svelte';
  import SettingsView from './components/SettingsView.svelte';

  const controller = createPomodoroController();
</script>

<section
  class="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5 max-[760px]:pt-6"
  style={`--pomodoro-accent: ${controller.modeMeta.accent}; --pomodoro-soft: ${controller.modeMeta.soft};`}
>
  <div class="mx-auto mb-6 w-full max-w-[860px] min-w-0">
    <ToolHeader title="Pomodoro" />

    <Tabs.Root bind:value={controller.activeView} class="gap-0">
      <Tabs.List variant="default" class="-mt-2 h-9 w-full min-w-0 justify-start rounded-full bg-muted/65 p-1">
        <Tabs.Trigger value="timer" class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none">
          Timer
        </Tabs.Trigger>
        <Tabs.Trigger value="activity" class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none">
          Activity
        </Tabs.Trigger>
        <Tabs.Trigger
          value="settings"
          class="ml-auto size-7 flex-none rounded-full p-0 after:hidden data-[state=active]:bg-background data-[state=active]:shadow-none"
          aria-label="Pomodoro settings"
          title="Settings"
          onclick={controller.openSettingsPage}
        >
          <Settings2 class="size-4" strokeWidth={1.7} />
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  <div class="mx-auto w-full max-w-[860px] min-w-0">
    {#if controller.activeView === 'timer'}
      <TimerView {controller} />
    {:else if controller.activeView === 'activity'}
      <ActivityView
        sessions={controller.activitySessions}
        goalHours={controller.dailyGoalHours}
        goalSchedule={controller.goalSchedule}
        clockNow={controller.clockNow}
        onGoalChange={controller.updateGoal}
      />
    {:else}
      <SettingsView {controller} />
    {/if}
  </div>
</section>
