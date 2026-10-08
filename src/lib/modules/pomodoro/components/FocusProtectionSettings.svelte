<script lang="ts">
  import { ChevronRight, Plus, X } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    normalizeBlockedDomain,
    type FocusProtectionConnection
  } from '#lib/modules/pomodoro/focus-protection.ts';

  type Props = {
    view?: 'summary' | 'manager';
    enabled: boolean;
    blockedDomains: string[];
    connection: FocusProtectionConnection;
    errorMessage?: string;
    onToggle: () => void | Promise<void>;
    onBlocklistChange: (domains: string[]) => void | Promise<void>;
    onManage?: () => void;
  };

  let {
    view = 'summary',
    enabled,
    blockedDomains,
    connection,
    errorMessage = '',
    onToggle,
    onBlocklistChange,
    onManage = () => {}
  }: Props = $props();

  let domainDraft = $state('');
  let domainError = $state('');

  const suggestions = ['youtube.com', 'instagram.com', 'reddit.com', 'x.com'];

  const connectionLabel = $derived(
    connection === 'checking'
      ? 'Checking…'
      : connection === 'missing'
        ? 'Requires Module extension'
        : connection === 'active'
          ? 'Active'
          : connection === 'error'
            ? 'Unavailable'
            : 'Connected'
  );

  const toggleDisabled = $derived(connection === 'checking' || connection === 'missing');

  function addDomain(value = domainDraft) {
    domainError = '';

    let normalized: string;

    try {
      normalized = normalizeBlockedDomain(value);
    } catch (error) {
      domainError = error instanceof Error ? error.message : 'Unable to add website.';
      return;
    }

    if (blockedDomains.includes(normalized)) {
      domainError = 'Website is already blocked.';
      return;
    }

    domainDraft = '';
    void onBlocklistChange([...blockedDomains, normalized]);
  }

  function removeDomain(domain: string) {
    domainError = '';
    void onBlocklistChange(blockedDomains.filter((item) => item !== domain));
  }
</script>

{#if view === 'summary'}
  <div class="mt-4 border-t pt-4">
    <div class="mb-1 text-meta font-medium text-muted-foreground">Focus protection</div>

    <div class="flex h-10 w-full items-center justify-between gap-4 px-1 text-meta">
      <span>Block distracting websites</span>
      <Switch
        checked={enabled}
        aria-label="Block distracting websites"
        disabled={toggleDisabled}
        onclick={onToggle}
      />
    </div>

    <Button
      variant="ghost"
      class="flex h-10 w-full items-center justify-between rounded-full px-1 text-meta font-normal"
      onclick={onManage}
    >
      <span>Blocked websites</span>
      <span class="inline-flex items-center gap-2 text-meta text-muted-foreground">
        {blockedDomains.length}
        <ChevronRight class="size-3.5" strokeWidth={1.7} />
      </span>
    </Button>

    <div class="flex min-h-8 items-center justify-between gap-3 px-1 text-meta">
      <span class="text-muted-foreground">Module extension</span>
      <span
        class={[
          connection === 'active' || connection === 'ready'
            ? 'text-success'
            : connection === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground'
        ]}
      >
        {connectionLabel}
      </span>
    </div>

    {#if connection === 'missing'}
      <p class="m-0 px-1 text-meta  text-muted-foreground">
        Install or load the Module Focus extension to enable protection.
      </p>
    {:else if errorMessage}
      <p class="m-0 px-1 text-meta  text-destructive">{errorMessage}</p>
    {/if}
  </div>
{:else}
  <div>
    <p class="mb-4 mt-0 text-meta  text-muted-foreground">
      Add the sites that usually break your focus. Every route on these domains is blocked during Focus.
    </p>

    <div class="flex gap-2">
      <Input
        class="h-9 flex-1 text-meta"
        bind:value={domainDraft}
        placeholder="youtube.com"
        aria-label="Website to block"
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addDomain();
          }
        }}
      />
      <Button
        size="sm"
        class="h-9 shrink-0 rounded-full px-3 text-meta font-medium shadow-none"
        onclick={() => addDomain()}
      >
        Add
      </Button>
    </div>

    {#if domainError}
      <p class="mb-0 mt-2 text-meta text-destructive">{domainError}</p>
    {/if}

    <div class="mt-4">
      {#if blockedDomains.length === 0}
        <div class="rounded-xl border border-dashed px-4 py-6 text-center text-meta text-muted-foreground">
          No websites blocked yet.
        </div>
      {:else}
        <div class="divide-y">
          {#each blockedDomains as domain}
            <div class="flex min-h-10 items-center justify-between gap-3">
              <span class="truncate text-meta">{domain}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0 rounded-full text-muted-foreground"
                aria-label={`Remove ${domain}`}
                onclick={() => removeDomain(domain)}
              >
                <X class="size-3.5" strokeWidth={1.7} />
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="mt-5 border-t pt-4">
      <div class="mb-2 text-meta font-medium text-muted-foreground">Suggested</div>
      <div class="grid gap-1">
        {#each suggestions.filter((domain) => !blockedDomains.includes(domain)) as domain}
          <Button
            variant="ghost"
            class="flex h-9 w-full items-center justify-between rounded-full px-2 text-meta font-normal shadow-none"
            onclick={() => addDomain(domain)}
          >
            <span>{domain}</span>
            <span class="inline-flex items-center gap-1 text-meta text-muted-foreground">
              <Plus class="size-3" strokeWidth={1.7} />
              Add
            </span>
          </Button>
        {/each}
      </div>
    </div>
  </div>
{/if}
