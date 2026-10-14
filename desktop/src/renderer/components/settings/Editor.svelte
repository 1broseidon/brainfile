<script module lang="ts">
  /** Where the section stands in Settings: lower comes first. */
  export const order = 30;
</script>

<script lang="ts">
  /** The editor files open in, at their line. */
  import { app } from '../../lib/state.svelte';
  import Icon from '../Icon.svelte';

  let picking = $state(false);

  $effect(() => {
    void app.refreshEditors();
  });

  /** The editor files open in now: the chosen editor, else automatic. */
  const editorNow = $derived(app.editors.find((e) => e.id === app.editor) ?? app.editors[0]);
</script>

<h2>Editor</h2>
<p class="lede">Where a file an agent names in a reply opens, at its line.</p>
<div class="group">
  <div class="row">
    <span class="name">Open files in</span>
    {#if app.editors.length === 0}
      <span class="mono note">looking…</span>
    {:else}
      <span class="anchor">
        <button class="pick" onclick={() => (picking = !picking)}>
          {editorNow?.name}
          {#if !app.editor}<span class="mono dflt">default</span>{/if}
          <Icon name="chevron" size={10} />
        </button>
        {#if picking}
          <div class="catch" role="presentation" onmousedown={() => (picking = false)}></div>
          <div class="menu">
            {#each app.editors as e (e.id)}
              <button
                class="item"
                onclick={() => {
                  app.chooseEditor(e.id);
                  picking = false;
                }}
              >
                <span class="line">
                  <span>{e.name}</span>
                  <span class="spacer"></span>
                  {#if e.id === editorNow?.id}<Icon name="check" size={12} />{/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </span>
    {/if}
  </div>
</div>
<p class="foot">Found on your computer and PATH, including your $EDITOR. Automatic prefers a running editor, then the first found.</p>
