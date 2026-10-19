<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import HabitEmptyState from './components/HabitEmptyState.svelte';
  import { createHabitTrackerController } from './controller/habit-tracker.svelte.ts';

  // M0 is not registered as a route. The functional Today workflow arrives in M1.
  const controller = createHabitTrackerController();
</script>

<section class="mx-auto w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5">
  <div class="mx-auto w-full max-w-[860px]">
    <ToolHeader title="Habit Tracker" />
    <HabitEmptyState />
  </div>
</section>
