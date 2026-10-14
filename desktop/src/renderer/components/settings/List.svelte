<script module lang="ts">
  /** Where the section stands in Settings: lower comes first. */
  export const order = 10;
</script>

<script lang="ts">
  /** How a board's list reads: calm or full (task-43). */
  import { app } from '../../lib/state.svelte';
  import Switch from '../Switch.svelte';
</script>

<h2>List</h2>
<p class="lede">How a board's list reads.</p>
<div class="group">
  <div class="row toggle">
    <span class="label">
      <span class="name">Calm list</span>
      <span class="sub">
        {#if app.calm}
          One signal a row, nearest done first, a few to a group. The rest waits for the task.
        {:else}
          Every signal on its row; the ID and tags under the pointer.
        {/if}
      </span>
    </span>
    <span class="own"><Switch on={app.calm} label="Calm list" onchange={(on) => app.setCalm(on)} /></span>
  </div>
</div>
<p class="foot">⇧V turns it on or off from the list.</p>
