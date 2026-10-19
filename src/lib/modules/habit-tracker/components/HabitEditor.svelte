<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';

  let {
    mode, title, busy, onSave, onCancel
  }: {
    mode: 'create' | 'edit';
    title: string;
    busy: boolean;
    onSave: (title: string) => Promise<void>;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let draftTitle = $state(title);
  let touched = $state(false);
  const invalid = $derived(!draftTitle.trim() || draftTitle.trim().length > 80);

  onMount(() => {
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (invalid || busy) return;
    void onSave(draftTitle.trim());
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="habit-editor-title"
  onclose={onCancel}
  class="fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-full w-full max-w-[420px] overflow-hidden border-0 bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
>
  <form onsubmit={submit} class="flex h-full flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-border p-5">
      <div>
        <h2 id="habit-editor-title" class="text-title font-medium">{mode === 'create' ? 'New habit' : 'Edit habit'}</h2>
        <p class="mt-1 text-meta text-muted-foreground">Daily check-off</p>
      </div>
      <Button type="button" variant="ghost" size="icon" class="rounded-full" aria-label="Close editor" disabled={busy} onclick={onCancel}>
        <X class="size-4"/>
      </Button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-5">
      <label for="habit-title" class="mb-2 block text-ui font-medium">Habit name</label>
      <Input id="habit-title" name="habit-title" bind:value={draftTitle} maxlength={80} placeholder="e.g. Read every day" aria-invalid={touched && invalid} required/>
      {#if touched && invalid}
        <p role="alert" class="mt-2 text-meta text-destructive">Enter a habit name (up to 80 characters).</p>
      {/if}
      {#if mode === 'create'}
        <div class="mt-6 rounded-lg border border-border bg-muted/50 p-4">
          <p class="text-ui font-medium">Build · Daily</p>
          <p class="mt-1 text-meta text-muted-foreground">Mark this habit complete once per day.</p>
        </div>
      {:else}
        <p class="mt-3 text-meta text-muted-foreground">Renaming does not change your past check-ins.</p>
      {/if}
    </div>
    <footer class="flex justify-end gap-2 border-t border-border p-4">
      <Button type="button" variant="outline" class="rounded-full" disabled={busy} onclick={onCancel}>Cancel</Button>
      <Button type="submit" class="rounded-full" disabled={busy || invalid}>{busy ? 'Saving…' : mode === 'create' ? 'Create habit' : 'Save changes'}</Button>
    </footer>
  </form>
</dialog>
