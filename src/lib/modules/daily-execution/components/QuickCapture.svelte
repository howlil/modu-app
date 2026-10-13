<script lang="ts">
 import { Plus, ArrowRight } from 'lucide-svelte';
 import { Button } from '#lib/components/ui/button/index.js';
 let { onAdd }: { onAdd: (title: string) => boolean } = $props();
 let title = $state('');
 let input: HTMLInputElement;
 function shortcut(event: KeyboardEvent) {
   if (event.defaultPrevented || event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
   if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
   const target = event.target;
   if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable], [role="textbox"]')) return;
   event.preventDefault();
   input?.focus();
 }
 function submit(event: SubmitEvent) {
   event.preventDefault();
   if (onAdd(title)) { title = ''; input?.focus(); }
 }
</script>
<svelte:window onkeydown={shortcut}/>
<form onsubmit={submit} class="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
 <Plus class="size-4 shrink-0 text-primary"/>
 <input bind:this={input} bind:value={title} maxlength="120" aria-label="New activity" placeholder="Add anything..."
   class="h-10 min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground" />
 <kbd class="hidden rounded border border-border px-1.5 py-0.5 text-meta text-muted-foreground sm:inline-flex" title="Press / to add an activity">/</kbd>
 <Button type="submit" size="sm" class="h-8 rounded-lg" disabled={!title.trim()}>Add <ArrowRight class="ml-1 size-3.5"/></Button>
</form>