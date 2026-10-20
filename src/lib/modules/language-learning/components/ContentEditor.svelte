<script lang="ts">
  import { draftFromIsland, type ContentIsland, type IslandDraft } from '../core/content.ts';
  import type { LearningProfile } from '../core/orchestration.ts';

  let {profile, content, busy, onSave, onCancel}:{
    profile:LearningProfile;
    content:ContentIsland|null;
    busy:boolean;
    onSave:(draft:IslandDraft)=>void;
    onCancel:()=>void;
  }=$props();

  const initial=content?draftFromIsland(content):null;
  let id=$state(initial?.id??'');
  let title=$state(initial?.title??'');
  let sourceLanguage=$state(initial?.sourceLanguage??'id');
  let sentences=$state<{id:string;prompt:string;answer:string}[]>(
    initial?.sentences.map(s=>({...s}))??[{id:'sentence-1',prompt:'',answer:''}]
  );
  let vocabulary=$state<{id:string;sentenceId:string;term:string;meaning:string}[]>(
    initial?.vocabulary.map(v=>({...v}))??[]
  );
  function addSentence() {
    sentences=[...sentences,{id:crypto.randomUUID(),prompt:'',answer:''}];
  }
  function removeSentence(key:string) {
    if(sentences.length===1)return;
    sentences=sentences.filter(s=>s.id!==key);
    vocabulary=vocabulary.filter(v=>v.sentenceId!==key);
  }
  function addVocabulary() {
    const source=sentences[0];
    if(!source)return;
    vocabulary=[...vocabulary,{id:crypto.randomUUID(),sentenceId:source.id,term:'',meaning:''}];
  }
  function submit(event:SubmitEvent) {
    event.preventDefault();
    if(busy)return;
    onSave({id:id.trim(),title:title.trim(),
      sourceLanguage:sourceLanguage.trim(),targetLanguage:profile.targetLanguage,
      sentences:sentences.map(s=>({...s,prompt:s.prompt.trim(),answer:s.answer.trim()})),
      vocabulary:vocabulary.map(v=>({...v,term:v.term.trim(),meaning:v.meaning.trim()}))
    });
  }
</script>

<form class="rounded-xl border border-border p-4" onsubmit={submit}>
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-title font-medium">{content ? 'Edit Island' : 'New Island'}</h3>
    <button type="button" class="rounded-full px-3 py-2 text-ui" onclick={onCancel}>Cancel</button>
  </div>
  <div class="mt-4 grid gap-3 sm:grid-cols-2">
    <label class="text-meta text-muted-foreground">Island ID
      <input class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
        required maxlength="128" disabled={!!content||busy} bind:value={id} placeholder="cafe-basics"/>
    </label>
    <label class="text-meta text-muted-foreground">Title
      <input class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
        required maxlength="200" disabled={busy} bind:value={title} placeholder="At the café"/>
    </label>
    <label class="text-meta text-muted-foreground">Language to translate from
      <input class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
        required maxlength="32" disabled={!!content||busy} bind:value={sourceLanguage} placeholder="id"/>
    </label>
    <p class="self-end pb-2 text-meta text-muted-foreground">Target language: {profile.targetLanguage}</p>
  </div>
  <div class="mt-6 flex items-center justify-between gap-3">
    <h4 class="text-ui font-medium">Sentences</h4>
    <button type="button" class="rounded-full border border-border px-3 py-2 text-meta" onclick={addSentence} disabled={busy}>Add sentence</button>
  </div>
  {#each sentences as sentence (sentence.id)}
    <div class="mt-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
      <label class="text-meta text-muted-foreground">Prompt
        <textarea required maxlength="2000" rows="2" disabled={busy}
          class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
          bind:value={sentence.prompt}></textarea>
      </label>
      <label class="text-meta text-muted-foreground">Answer
        <textarea required maxlength="2000" rows="2" disabled={busy}
          class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
          bind:value={sentence.answer}></textarea>
      </label>
      <button type="button" class="self-center rounded-full px-3 py-2 text-meta"
        disabled={sentences.length===1||busy} onclick={()=>removeSentence(sentence.id)}>Remove</button>
    </div>
  {/each}
  <div class="mt-6 flex items-center justify-between gap-3">
    <h4 class="text-ui font-medium">Vocabulary</h4>
    <button type="button" class="rounded-full border border-border px-3 py-2 text-meta" onclick={addVocabulary} disabled={busy}>Add word</button>
  </div>
  {#each vocabulary as word (word.id)}
    <div class="mt-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label class="text-meta text-muted-foreground">Sentence
        <select class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
          disabled={busy} bind:value={word.sentenceId}>
          {#each sentences as sentence (sentence.id)}
            <option value={sentence.id}>{sentence.prompt || sentence.id}</option>
          {/each}
        </select>
      </label>
      <label class="text-meta text-muted-foreground">Term
        <input required maxlength="300" disabled={busy} class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
          bind:value={word.term}/>
      </label>
      <label class="text-meta text-muted-foreground">Meaning
        <input required maxlength="1000" disabled={busy} class="mt-1 w-full rounded-lg border border-border bg-background p-2 text-ui"
          bind:value={word.meaning}/>
      </label>
      <button type="button" class="self-center rounded-full px-3 py-2 text-meta" disabled={busy}
        onclick={()=>vocabulary=vocabulary.filter(v=>v.id!==word.id)}>Remove</button>
    </div>
  {/each}
  <p class="mt-3 text-meta text-muted-foreground">Editing sentence text creates a new recall revision. Earlier practice history stays intact.</p>
  <button type="submit" disabled={busy} class="mt-5 rounded-full bg-primary px-5 py-3 text-ui font-medium text-primary-foreground disabled:opacity-50">
    Save Island
  </button>
</form>
