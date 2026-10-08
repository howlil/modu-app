<script lang="ts">
  import { Dialog } from '$lib/components/ui/dialog/index.js';
  import { Check, ExternalLink, Send, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';

  let open = $state(false);
  let title = $state('');
  let details = $state('');
  let website = $state('');
  let submitting = $state(false);
  let error = $state('');
  let issueUrl = $state('');
  let fallbackUrl = $state('');

  function reset() {
    title = '';
    details = '';
    website = '';
    submitting = false;
    error = '';
    issueUrl = '';
    fallbackUrl = '';
  }

  function openDialog() {
    reset();
    open = true;
  }

  async function submitRequest(event: SubmitEvent) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanDetails = details.trim();

    if (!cleanTitle) {
      error = 'Add a short feature name.';
      return;
    }

    submitting = true;
    error = '';
    fallbackUrl = '';

    try {
      const response = await fetch('/api/feature-request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          title: cleanTitle,
          details: cleanDetails,
          website
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        fallbackUrl = typeof payload.fallbackUrl === 'string' ? payload.fallbackUrl : '';
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : 'Could not send the feature request.'
        );
      }

      issueUrl = typeof payload.url === 'string' ? payload.url : '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not send the feature request.';
    } finally {
      submitting = false;
    }
  }
</script>

<Button
  class="h-10 rounded-full px-4 text-ui font-medium !text-white shadow-none"
  onclick={openDialog}
>
  Request feature
</Button>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />

    <Dialog.Content
      class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-border bg-background p-5 text-left shadow-[0_24px_70px_rgba(25,25,25,0.18)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <Dialog.Title class="text-title font-semibold tracking-[-0.025em]">
            Request a feature
          </Dialog.Title>
          <Dialog.Description class="mt-1 text-ui leading-5 text-muted-foreground">
            Send an idea directly to the Modu GitHub issues.
          </Dialog.Description>
        </div>

        <Dialog.Close
          class="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Close"
        >
          <X class="size-4" strokeWidth={1.8} />
        </Dialog.Close>
      </div>

      {#if issueUrl}
        <div class="mt-6 rounded-2xl border border-border bg-muted/45 p-4">
          <div class="flex items-center gap-2 text-ui font-medium">
            <span class="grid size-7 place-items-center rounded-full bg-success-muted text-success">
              <Check class="size-4" strokeWidth={2} />
            </span>
            Request sent
          </div>

          <p class="mt-2 text-ui leading-5 text-muted-foreground">
            The GitHub issue was created successfully.
          </p>

          <Button
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            variant="outline"
            class="mt-4 h-9 rounded-full px-3 text-meta font-medium shadow-none"
          >
            View issue
            <ExternalLink class="size-3.5" strokeWidth={1.8} />
          </Button>
        </div>
      {:else}
        <form class="mt-6 space-y-4" onsubmit={submitRequest}>
          <div class="space-y-2">
            <label for="feature-title" class="text-meta font-medium">Feature</label>
            <Input
              id="feature-title"
              bind:value={title}
              maxlength={100}
              placeholder="e.g. Split PDF"
              autocomplete="off"
              required
              class="h-10 rounded-xl shadow-none"
            />
          </div>

          <div class="space-y-2">
            <label for="feature-details" class="text-meta font-medium">
              What should it do?
              <span class="font-normal text-muted-foreground">Optional</span>
            </label>
            <Textarea
              id="feature-details"
              bind:value={details}
              maxlength={1500}
              rows={5}
              placeholder="A short use case or expected behavior."
              class="w-full resize-none rounded-xl border border-input bg-transparent px-3 py-3 text-ui leading-5 shadow-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div class="hidden" aria-hidden="true">
            <label for="feature-website">Website</label>
            <Input
              id="feature-website"
              bind:value={website}
              tabindex="-1"
              autocomplete="off"
            />
          </div>

          {#if error}
            <div class="rounded-xl bg-destructive/8 px-3 py-3 text-meta leading-5 text-destructive">
              {error}
              {#if fallbackUrl}
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="ml-1 font-medium underline underline-offset-2"
                >
                  Open GitHub instead
                </a>
              {/if}
            </div>
          {/if}

          <div class="flex justify-end gap-2 pt-1">
            <Dialog.Close
              class="inline-flex h-9 items-center justify-center rounded-full border border-border bg-background px-3 text-meta font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Cancel
            </Dialog.Close>

            <Button
              type="submit"
              disabled={submitting}
              class="h-9 rounded-full px-3 text-meta font-medium !text-white shadow-none"
            >
              {submitting ? 'Sending…' : 'Send request'}
              <Send class="size-3.5" strokeWidth={1.8} />
            </Button>
          </div>
        </form>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
