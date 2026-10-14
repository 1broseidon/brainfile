<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import type { AgentId, BoardSnapshot, ReviewView } from '../../shared/api';

  /**
   * A hand-off's own branch, said in the task pane (spec-14): what the agent
   * committed, open it in your editor, merge it, send it back with a note, or
   * throw it away. Not an IDE: the diff is a summary, never edited here.
   */
  let { board, taskId, inReview, assignee }: { board: BoardSnapshot; taskId: string; inReview: boolean; assignee?: string } = $props();

  let review = $state<ReviewView | null>(null);
  let busy = $state(false);
  let sending = $state(false);
  let note = $state('');
  /** Discard asks once, in place, for a few seconds: what it throws away has no Undo. */
  let confirming = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  const run = $derived(app.runFor(taskId));
  /** Back to whoever did it, else the agent this board uses. */
  const agent = $derived<AgentId | null>(app.agents.some((a) => a.id === assignee) ? (assignee as AgentId) : app.defaultAgent);

  // Looked at again whenever the board changes (the agent moves the task, logs) and when its run ends.
  $effect(() => {
    void board;
    void run;
    const id = taskId;
    const projectId = board.projectId;
    void api.review(projectId, id).then((result) => {
      if (id === taskId && projectId === board.projectId) review = result.ok ? result.value : null;
    });
  });

  async function settle(how: 'merge' | 'discard'): Promise<void> {
    busy = true;
    confirming = false;
    if (await app.settleReview(taskId, how)) review = null;
    busy = false;
  }

  function discard(): void {
    if (!confirming) {
      confirming = true;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => (confirming = false), 4000);
      return;
    }
    void settle('discard');
  }

  async function sendBack(): Promise<void> {
    if (!note.trim() || !agent) return;
    busy = true;
    await app.sendBack(taskId, note, agent);
    note = '';
    sending = false;
    busy = false;
  }

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
</script>

{#if review}
  <section class="review">
    <h3>
      {inReview ? 'Review' : 'Branch'}
      <span class="mono branch">{review.branch}</span>
    </h3>
    <div class="group">
      <div class="sum mono">
        <span>{plural(review.ahead, 'commit')}</span>
        {#if review.filesChanged}
          <span>{plural(review.filesChanged, 'file')}</span>
          <span class="add">+{review.added}</span>
          <span class="del">−{review.removed}</span>
        {/if}
        {#if review.base}<span class="dim from">from {review.base}</span>{/if}
      </div>
      {#if review.uncommitted}
        <div class="line warn">{plural(review.uncommitted, 'file')} not committed in the worktree</div>
      {/if}
      {#if review.merged}
        <div class="line dim">Already in {review.into}: merging only lets the worktree go.</div>
      {/if}
      {#each review.commits as c (c.sha)}
        <div class="row"><span class="mono dim sha">{c.sha}</span><span class="clip">{c.subject}</span></div>
      {/each}
      {#if review.ahead > review.commits.length}
        <div class="row dim mono">and {review.ahead - review.commits.length} more</div>
      {/if}
      {#if review.files.length}
        <div class="files">
          {#each review.files as f (f.path)}
            <div class="row mono">
              <span class="clip path">{f.path}</span>
              <span class="add">+{f.added}</span>
              <span class="del">−{f.removed}</span>
            </div>
          {/each}
          {#if review.filesChanged > review.files.length}
            <div class="row dim mono">and {review.filesChanged - review.files.length} more</div>
          {/if}
        </div>
      {/if}
    </div>

    {#if sending}
      <textarea
        class="field note"
        rows="3"
        placeholder="What should change?"
        bind:value={note}
        onkeydown={(e) => {
          if (e.key === 'Enter' && e.metaKey) void sendBack();
          if (e.key === 'Escape') sending = false;
          e.stopPropagation();
        }}
      ></textarea>
      <div class="actions">
        <button class="btn primary" disabled={busy || !note.trim() || !agent} onclick={sendBack}>
          <Icon name="send" size={13} />Send to {agent ? app.agentName(agent) : 'an agent'}
        </button>
        <button class="btn quiet" onclick={() => (sending = false)}>Cancel</button>
      </div>
    {:else}
      <div class="actions">
        <button class="btn quiet" use:tip={review.path} onclick={() => app.openWorktree(taskId)}><Icon name="folder" size={13} />Open in {app.editorName || 'editor'}</button>
        <span class="spacer"></span>
        <button class="btn danger" disabled={busy || !!run} onclick={discard}>
          <Icon name="trash" size={13} />{confirming ? 'Discard its work?' : 'Discard'}
        </button>
        <button class="btn quiet" disabled={busy || !!run} onclick={() => (sending = true)}><Icon name="hand" size={13} />Send back…</button>
        <button
          class="btn"
          class:primary={inReview}
          disabled={busy || !!run || !review.into || review.uncommitted > 0 || review.ahead === 0}
          use:tip={review.uncommitted > 0 ? 'Commit or send back first' : review.ahead === 0 ? 'Nothing committed yet' : review.merged ? `Already in ${review.into}` : ''}
          onclick={() => settle('merge')}
        >
          <!-- Once its commits are in the branch, the button says the one thing left for it to do (decision-10). -->
          <Icon name="git" size={13} />{review.merged ? 'Merged · remove worktree' : `Merge into ${review.into ?? '…'}`}
        </button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .review {
    margin-top: var(--s5);
  }

  h3 {
    margin: 0 0 var(--s2);
    display: flex;
    align-items: baseline;
    gap: var(--s2);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .branch {
    color: var(--ink-3);
    font-weight: 400;
  }

  .group {
    padding: var(--s2) var(--s3);
    border-radius: var(--r-group);
    background: var(--raised);
    box-shadow: var(--top-light);
  }

  .sum {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1) var(--s3);
    padding: var(--s1) 0 var(--s2);
    color: var(--ink-2);
  }

  .from {
    margin-left: auto;
  }

  .line {
    padding: var(--s1) 0;
  }

  .warn {
    color: var(--warn);
  }

  .row {
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    color: var(--ink-2);
  }

  .sha {
    flex: none;
  }

  .files {
    margin-top: var(--s2);
    padding-top: var(--s2);
    box-shadow: inset 0 var(--hairline) 0 var(--line);
  }

  .path {
    flex: 1;
  }

  .add {
    flex: none;
    color: var(--ok);
  }

  .del {
    flex: none;
    color: var(--danger);
  }

  .dim {
    color: var(--ink-4);
  }

  .clip {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note {
    width: 100%;
    height: auto;
    margin-top: var(--s3);
    padding: var(--s2) var(--s3);
    resize: none;
  }

  .actions {
    margin-top: var(--s3);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s2);
  }

  .spacer {
    flex: 1;
  }
</style>
