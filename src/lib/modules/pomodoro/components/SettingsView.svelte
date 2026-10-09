<script lang="ts">
  import { ArrowLeft, Check, ChevronRight, Download, Trash2, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import { Dialog } from '$lib/components/ui/dialog/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { RINGTONE_OPTIONS } from '../sounds.ts';
  import type { PomodoroMode } from '../timer.ts';
  import type { PomodoroPreferences } from '../persistence.ts';
  import type { PomodoroController } from '../controller/pomodoro.svelte.ts';
  import FocusProtectionSettings from './FocusProtectionSettings.svelte';

  let { controller }: { controller: PomodoroController } = $props();
  const settingsPanel = $derived(controller.settingsPanel);
  const durations = $derived(controller.durations);
  const preferences = $derived(controller.preferences);
  const focusProtectionEnabled = $derived(controller.focusProtectionEnabled);
  const blockedDomains = $derived(controller.blockedDomains);
  const focusProtectionConnection = $derived(controller.focusProtectionConnection);
  const focusProtectionError = $derived(controller.focusProtectionError);
  const soundEnabled = $derived(controller.soundEnabled);
  const ringtone = $derived(controller.ringtone);
  const notificationsSupported = $derived(controller.notificationsSupported);
  const notificationsEnabled = $derived(controller.notificationsEnabled);
  const wakeLockSupported = $derived(controller.wakeLockSupported);
  const dataMessage = $derived(controller.dataMessage);
  const deleteConfirm = $derived(controller.deleteConfirm);
  const { openSettingsPanel, updateDuration, togglePreference, toggleFocusProtection, updateBlockedDomains, toggleSound, toggleNotifications, selectRingtone, exportAllPomodoroData, deleteAllPomodoroData } = controller;
</script>

<div class={settingsPanel === 'main'
      ? 'w-full min-w-0 text-left'
      : 'mx-auto w-full max-w-[680px] min-w-0 rounded-[20px] border border-border bg-card p-5 text-left'}>
      <div class="mb-6 flex min-h-8 items-center gap-1">
        {#if settingsPanel !== 'main'}
          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 rounded-full text-muted-foreground"
            aria-label="Back to Pomodoro settings"
            onclick={() => openSettingsPanel('main')}
          >
            <ArrowLeft class="size-4" strokeWidth={1.7} />
          </Button>
        {/if}

        <h2 class="m-0 truncate text-title font-semibold tracking-[-0.03em]">
          {settingsPanel === 'main' ? 'Settings' : 'Data'}
        </h2>
      </div>

        {#if settingsPanel === 'main'}
          <div class="grid grid-cols-12 gap-3">
            <Card.Root class="col-span-12 gap-4 rounded-[20px] p-5 shadow-none sm:col-span-7">
              <div>
                <h3 class="m-0 text-ui font-medium">Timer durations</h3>
                <p class="mt-1 text-meta text-muted-foreground">Set the length of each session.</p>
              </div>
              <div class="grid grid-cols-3 gap-2">
                {#each [['focus', 'Focus', 180], ['short', 'Short', 60], ['long', 'Long', 120]] as row}
                  {@const timerMode = row[0] as PomodoroMode}
                  <label class="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-muted p-3 text-meta text-muted-foreground">
                    <span>{row[1]}</span>
                    <Input
                      type="number"
                      min="1"
                      max={row[2]}
                      aria-label={row[1] + ' duration in minutes'}
                      class="h-8 w-full max-w-[76px] border-0 bg-transparent px-1 text-center text-title-lg font-medium text-foreground shadow-none focus-visible:ring-1"
                      value={durations[timerMode]}
                      onchange={(event) => updateDuration(timerMode, event.currentTarget.value)}
                    />
                    <span>minutes</span>
                  </label>
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="col-span-12 gap-3 rounded-[20px] p-5 shadow-none sm:col-span-5">
              <div>
                <h3 class="m-0 text-ui font-medium">Automation</h3>
                <p class="mt-1 text-meta text-muted-foreground">Control your focus rhythm.</p>
              </div>
              {#each [
                ['autoStartBreaks', 'Auto-start breaks'],
                ['autoStartFocus', 'Auto-start focus'],
                ['overtime', 'Count overtime']
              ] as option}
                {@const key = option[0] as keyof PomodoroPreferences}
                <div class="flex min-h-9 items-center justify-between gap-3 border-t border-border pt-2 text-ui">
                  <span>{option[1]}</span>
                  <Switch checked={preferences[key]} aria-label={option[1]} onclick={() => togglePreference(key)} />
                </div>
              {/each}
            </Card.Root>

            <Card.Root class="col-span-12 gap-0 rounded-[20px] p-5 shadow-none sm:col-span-7">
              <FocusProtectionSettings
                enabled={focusProtectionEnabled}
                {blockedDomains}
                connection={focusProtectionConnection}
                errorMessage={focusProtectionError}
                onToggle={toggleFocusProtection}
                onBlocklistChange={updateBlockedDomains}
                onManage={() => (controller.blockedSitesDialogOpen = true)}
              />
            </Card.Root>

            <Card.Root class="col-span-12 gap-2 rounded-[20px] p-5 shadow-none sm:col-span-5">
              <div>
                <h3 class="m-0 text-ui font-medium">Sounds & system</h3>
                <p class="mt-1 text-meta text-muted-foreground">Quiet feedback and device options.</p>
              </div>
              <div class="flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2 text-ui">
                <span>Sound</span>
                <Switch checked={soundEnabled} aria-label="Sound" onclick={toggleSound} />
              </div>
              <Button variant="ghost" class="flex h-10 w-full items-center justify-between rounded-lg px-3 text-ui font-normal text-foreground shadow-none hover:bg-muted/70 hover:text-foreground" onclick={() => (controller.ringtoneDialogOpen = true)}>
                <span>Ringtone</span>
                <span class="inline-flex items-center gap-1 text-meta text-muted-foreground">
                  {RINGTONE_OPTIONS.find((option) => option.id === ringtone)?.label ?? 'Soft chime'}
                  <ChevronRight class="size-3.5" strokeWidth={1.7} />
                </span>
              </Button>
              <div class="flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2 text-ui">
                <span>Notifications {#if !notificationsSupported}<span class="text-meta text-muted-foreground">Unavailable</span>{/if}</span>
                <Switch checked={notificationsEnabled} aria-label="Notifications" disabled={!notificationsSupported} onclick={toggleNotifications} />
              </div>
              <div class="flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2 text-ui">
                <span>Keep screen awake {#if !wakeLockSupported}<span class="text-meta text-muted-foreground">Unavailable</span>{/if}</span>
                <Switch checked={preferences.keepAwake} aria-label="Keep screen awake" disabled={!wakeLockSupported} onclick={() => togglePreference('keepAwake')} />
              </div>
            </Card.Root>

            <Card.Root class="col-span-12 gap-2 rounded-[20px] p-5 shadow-none">
              <h3 class="m-0 text-ui font-medium">Your data</h3>
              <p class="text-meta text-muted-foreground">Timer settings and focus history stay in your browser.</p>
              <Button variant="outline" size="sm" class="mt-1 w-fit rounded-full shadow-none" onclick={() => openSettingsPanel('data')}>
                Export & delete data <ChevronRight class="size-3.5" strokeWidth={1.7} />
              </Button>
            </Card.Root>
          </div>
        {:else}
          <div>
            <p class="mb-4 mt-0 text-meta  text-muted-foreground">
              Export or remove all Pomodoro data stored in this browser, including settings, blocked sites, goals, and activity history.
            </p>

            <Button
              variant="outline"
              class="h-10 w-full justify-start rounded-lg px-3 text-ui font-normal text-foreground shadow-none hover:bg-muted/70 hover:text-foreground"
              onclick={exportAllPomodoroData}
            >
              <Download class="size-3.5" strokeWidth={1.7} />
              Export all data
            </Button>

            {#if dataMessage}
              <p class="mb-0 mt-2 text-meta text-muted-foreground">{dataMessage}</p>
            {/if}

            <div class="mt-5 border-t pt-4">
              {#if !deleteConfirm}
                <Button
                  variant="ghost"
                  class="h-10 w-full justify-start rounded-lg px-3 text-ui font-normal text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                  onclick={() => {
                    controller.deleteConfirm = true;
                    controller.dataMessage = '';
                  }}
                >
                  <Trash2 class="size-3.5" strokeWidth={1.7} />
                  Delete all data
                </Button>
              {:else}
                <div class="rounded-xl border border-destructive/20 bg-destructive/[0.035] p-3">
                  <p class="m-0 text-meta ">
                    Delete timer settings, Focus Protection data, goals, and all activity history?
                  </p>
                  <p class="mb-0 mt-1 text-meta text-muted-foreground">This cannot be undone.</p>

                  <div class="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 rounded-full text-meta font-normal"
                      onclick={() => (controller.deleteConfirm = false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-8 rounded-full text-meta font-medium shadow-none"
                      onclick={deleteAllPomodoroData}
                    >
                      Delete all
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
    </div>


  <Dialog.Root bind:open={controller.blockedSitesDialogOpen}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-[110] bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
      <Dialog.Content
        class="fixed left-1/2 top-1/2 z-[111] flex max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[20px] border border-border bg-card p-5 text-left shadow-[0_24px_70px_rgba(25,25,25,0.18)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        aria-labelledby="pomodoro-blocked-title"
        aria-describedby="pomodoro-blocked-description"
      >
        <div class="flex shrink-0 items-start justify-between gap-4">
          <div>
            <Dialog.Title id="pomodoro-blocked-title" class="text-title font-semibold">Blocked websites</Dialog.Title>
            <Dialog.Description id="pomodoro-blocked-description" class="mt-1 text-ui text-muted-foreground">
              Choose which websites to block during focus sessions.
            </Dialog.Description>
          </div>
          <Dialog.Close class="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close blocked websites">
            <X class="size-4" strokeWidth={1.7} />
          </Dialog.Close>
        </div>
        <div class="mt-5 min-h-0 overflow-y-auto">
          <FocusProtectionSettings
            view="manager"
            enabled={focusProtectionEnabled}
            {blockedDomains}
            connection={focusProtectionConnection}
            errorMessage={focusProtectionError}
            onToggle={toggleFocusProtection}
            onBlocklistChange={updateBlockedDomains}
          />
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>

  <Dialog.Root bind:open={controller.ringtoneDialogOpen}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-[110] bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
      <Dialog.Content
        class="fixed left-1/2 top-1/2 z-[111] w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-border bg-card p-5 text-left shadow-[0_24px_70px_rgba(25,25,25,0.18)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        aria-labelledby="pomodoro-ringtone-title"
        aria-describedby="pomodoro-ringtone-description"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <Dialog.Title id="pomodoro-ringtone-title" class="text-title font-semibold">Ringtone</Dialog.Title>
            <Dialog.Description id="pomodoro-ringtone-description" class="mt-1 text-ui text-muted-foreground">
              Select a tone to preview and use at the end of each session.
            </Dialog.Description>
          </div>
          <Dialog.Close class="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close ringtone">
            <X class="size-4" strokeWidth={1.7} />
          </Dialog.Close>
        </div>
        <div class="mt-5 divide-y divide-border">
          {#each RINGTONE_OPTIONS as option}
            <Button
              variant="ghost"
              class="flex h-auto min-h-14 w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left text-ui font-normal whitespace-normal text-foreground shadow-none hover:bg-muted/70 hover:text-foreground"
              aria-pressed={ringtone === option.id}
              onclick={() => {
                selectRingtone(option.id);
                controller.ringtoneDialogOpen = false;
              }}
            >
              <span class="min-w-0">
                <span class="block text-ui font-medium">{option.label}</span>
                <span class="mt-1 block text-meta text-muted-foreground">{option.description}</span>
              </span>
              {#if ringtone === option.id}
                <Check class="size-4 shrink-0 text-primary" strokeWidth={1.8} />
              {/if}
            </Button>
          {/each}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
