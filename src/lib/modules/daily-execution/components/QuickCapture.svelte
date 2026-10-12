<script lang="ts">
 import { Plus, ArrowRight } from 'lucide-svelte';
 import { Button } from '$lib/components/ui/button/index.js';
 let { onAdd }: { onAdd: (title: string) => boolean } = $props();
 let title = $state('');
 let input: HTMLInputElement;
 function submit(event: SubmitEvent) {
   event.preventDefault();
   if (onAdd(title)) { title = ''; input?.focus(); }
 }
</script>
<form onsubmit={submit} class="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
 <Plus class="size-4 shrink-0 text-primary"/>
 <input bind:this={input} bind:value={title} maxlength="120" aria-label="New activity" placeholder="Add anything..."
   class="h-10 min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground" />
 <Button type="submit" size="sm" class="h-8 rounded-lg" disabled={!title.trim()}>Add <ArrowRight class="ml-1 size-3.5"/></Button>
</form>