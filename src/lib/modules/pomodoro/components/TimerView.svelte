<script lang="ts">
  import { ChevronRight, Pencil, RotateCcw, SkipForward } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { getNextMode, type PomodoroMode } from '../timer.ts';
  import { MODE_META, type PomodoroController } from '../controller/pomodoro.svelte.ts';

  let { controller }: { controller: PomodoroController } = $props();
  const timer = $derived(controller.timer);
  const modeMeta = $derived(controller.modeMeta);
</script>

<div class="grid min-w-0 grid-cols-12 gap-3">
  <Card.Root class="col-span-12 gap-0 overflow-hidden rounded-[20px] bg-[radial-gradient(ellipse_at_50%_0%,#eaf1ff_0%,#f7faff_34%,#ffffff_77%)] py-0 shadow-none lg:col-span-8">
    <div class="flex min-h-[456px] flex-col items-center px-3 pb-6 pt-8 text-center sm:px-6">
      <div class="flex items-center gap-1 rounded-full border border-border bg-white/85 p-1" role="group" aria-label="Timer mode">
        {#each ['focus', 'short', 'long'] as mode}
          {@const typedMode = mode as PomodoroMode}
          <Button variant="ghost" size="sm" aria-pressed={timer.mode === typedMode}
            class={timer.mode === typedMode ? 'h-[30px] rounded-full bg-secondary px-4 text-meta font-medium text-secondary-foreground shadow-none hover:bg-secondary' : 'h-[30px] rounded-full px-4 text-meta font-normal text-muted-foreground shadow-none'}
            onclick={() => controller.switchPomodoroMode(typedMode)}>{MODE_META[typedMode].shortLabel}</Button>
        {/each}
      </div>
      <div class="mb-2 mt-12 max-w-full whitespace-nowrap text-[clamp(76px,10vw,122px)] font-normal leading-none tracking-[-0.075em] tabular-nums max-[420px]:text-[clamp(70px,17vw,92px)]"
        role="timer" aria-label={'Time remaining: ' + controller.formattedTime}>{controller.formattedTime}</div>
      <div class="flex min-h-4 items-center justify-center gap-1 text-meta text-muted-foreground">
        <span>{timer.status === 'paused' ? 'Paused' : timer.status === 'overtime' ? 'Overtime' : timer.status === 'complete' ? 'Complete' : timer.status === 'idle' ? '' : modeMeta.label}</span>
        {#if controller.protectionTimerLabel}<span>· {controller.protectionTimerLabel}</span>{/if}
      </div>
      <div class="mt-1 flex h-14 w-full max-w-[330px] items-center justify-center">
        {#if timer.mode === 'focus'}
          {#if controller.focusEditing}
            <Input bind:ref={controller.focusInput} class="w-full max-w-[300px] rounded-none border-0 border-b border-border bg-transparent px-2 py-2 text-center text-ui font-normal shadow-none focus-visible:ring-0"
              type="text" maxlength={80} bind:value={controller.focusDraft} placeholder="What are you focusing on?" aria-label="Focus label"
              onblur={controller.commitFocusEdit}
              onkeydown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); controller.commitFocusEdit(); }
                else if (event.key === 'Escape') { event.preventDefault(); controller.cancelFocusEdit(); }
              }} />
          {:else}
            <Button variant="ghost" size="sm" class="h-auto max-w-full rounded-full px-3 py-2 text-meta font-normal text-muted-foreground shadow-none" onclick={controller.beginFocusEdit}>
              <span class="truncate">{controller.focusText || '+ Add focus'}</span>
              {#if controller.focusText}<Pencil class="size-3 shrink-0 opacity-60" strokeWidth={1.7} />{/if}
            </Button>
          {/if}
        {/if}
      </div>
      <div class="mt-1 flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon-lg" class="size-10 rounded-full text-muted-foreground shadow-none" aria-label="Reset timer" title="Reset (R)" onclick={controller.handleReset}><RotateCcw class="size-[17px]" strokeWidth={1.7} /></Button>
        <Button class="h-11 min-w-[144px] rounded-full px-6 text-ui font-semibold shadow-none" onclick={controller.handlePrimary}>{controller.primaryLabel}</Button>
        <Button variant="ghost" size="icon-lg" class="size-10 rounded-full text-muted-foreground shadow-none" aria-label="Skip session" title="Skip (S)" onclick={controller.handleSkip}><SkipForward class="size-[17px]" strokeWidth={1.7} /></Button>
      </div>
      {#if timer.status === 'complete' || timer.status === 'overtime'}
        <p class="mt-3 text-meta text-muted-foreground">{timer.status === 'overtime' ? 'Focus target reached.' : timer.mode === 'focus' ? 'Focus complete.' : 'Break complete.'}</p>
      {/if}
      <div class="mt-auto pt-6 text-meta text-muted-foreground">Your focus, your pace.</div>
    </div>
  </Card.Root>
  <div class="col-span-12 grid min-w-0 grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1">
    <Card.Root class="min-w-0 justify-between gap-3 rounded-[20px] p-4 shadow-none sm:p-5">
      <div class="flex items-center justify-between">
        <h2 class="m-0 text-meta font-medium text-muted-foreground">TODAY</h2>
        <Button size="icon-xs" variant="ghost" class="rounded-full text-muted-foreground" aria-label="View focus activity" onclick={() => (controller.activeView = 'activity')}><ChevronRight class="size-4" strokeWidth={1.7} /></Button>
      </div>
      <div><strong class="block whitespace-nowrap text-[clamp(24px,4vw,36px)] font-normal tracking-[-0.05em] tabular-nums">{controller.formatFocusTotal(controller.todayFocusMs)}</strong><span class="text-meta text-muted-foreground">Focused time</span></div>
      <div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Today's focus goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.round((controller.todayFocusMs / controller.goalMs) * 100))}>
          <div class="h-full rounded-full bg-primary transition-[width]" style:width={Math.min(100, (controller.todayFocusMs / controller.goalMs) * 100) + '%'}></div>
        </div>
        <div class="mt-2 flex flex-wrap justify-between gap-1 text-meta text-muted-foreground"><span>{Math.round((controller.todayFocusMs / controller.goalMs) * 100)}% of goal</span><span>{controller.dailyGoalHours}h target</span></div>
      </div>
    </Card.Root>
    <Card.Root class="min-w-0 justify-between gap-3 rounded-[20px] p-4 shadow-none sm:p-5">
      <h2 class="m-0 text-meta font-medium text-muted-foreground">CURRENT CYCLE</h2>
      <div><div class="text-title-lg font-medium tabular-nums">{Math.min(timer.completedFocus + 1, 4)} <span class="text-ui font-normal text-muted-foreground">/ 4 sessions</span></div>
        <div class="mt-3 flex items-center gap-2" aria-label={timer.completedFocus + ' of 4 focus sessions completed'}>
          {#each [0, 1, 2, 3] as index}
            <span class={index < timer.completedFocus ? 'h-[7px] flex-1 rounded-full bg-primary' : 'h-[7px] flex-1 rounded-full bg-border'} aria-hidden="true"></span>
          {/each}
        </div>
      </div>
      <div class="border-t border-border pt-3 text-meta text-muted-foreground">Next up <strong class="font-medium text-foreground">{MODE_META[getNextMode(timer)].label}</strong></div>
    </Card.Root>
  </div>
</div>
