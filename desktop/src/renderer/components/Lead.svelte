<script lang="ts">
  /**
   * An epic's lead (decision-15), said in its pane: who leads it, where it
   * stands, what it last said, and what waits on the person. Pause holds its
   * hand-offs (what runs goes on), Resume carries on, also after a restart
   * from its notes on the board, and Stop ends it, leaving what it handed off
   * to the person. A lead another runner runs (`brainfile run`, task-83) is
   * said from its record on the epic, and paused, resumed and stopped there.
   */
  import { app, isLive } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import type { BoardSnapshot, LeadRecord } from '../../shared/api';

  let { board, epicId, record }: { board: BoardSnapshot; epicId: string; record?: LeadRecord } = $props();

  const lead = $derived(app.leadFor(epicId, board.projectId));
  const active = $derived(!!lead && (lead.state === 'leading' || lead.state === 'paused'));
  /** On the epic, but not running here: another runner leads it, or none does. */
  const orphan = $derived(!active && !!record);
  /** Another runner leads it: where. */
  const elsewhere = $derived(orphan ? record?.where : undefined);

  /** Everything under the epic, at any depth. */
  const under = $derived.by(() => {
    const ids = new Set<string>();
    const all = [...board.tasks, ...board.completed];
    for (let at = [epicId]; at.length; ) {
      const next = all.filter((t) => t.parentId && at.includes(t.parentId) && !ids.has(t.id)).map((t) => t.id);
      for (const id of next) ids.add(id);
      at = next;
    }
    return ids;
  });
  const running = $derived(
    Object.values(app.runs).filter((r) => r.kind === 'dispatch' && r.projectId === board.projectId && r.taskId && under.has(r.taskId) && isLive(r)).length
  );
  const doneCount = $derived(board.completed.filter((t) => under.has(t.id)).length);
  const titleOf = (id: string) => board.tasks.find((t) => t.id === id)?.title ?? id;

  const agent = $derived(lead?.agentId ?? record?.agent);
  const model = $derived(lead?.model ?? record?.model);
  const until = $derived(lead?.until ?? record?.until);
  let busy = $state(false);

  async function act(fn: () => Promise<void>): Promise<void> {
    busy = true;
    await fn();
    busy = false;
  }
</script>

{#if active || orphan || lead}
  <section class="lead">
    <h3>
      Lead
      {#if agent}<span class="mono who">{app.agentName(agent)}{model ? ` · ${model}` : ''}</span>{/if}
    </h3>
    <div class="group">
      <div class="sum mono">
        {#if elsewhere}
          <span class:warn={record?.paused}>{record?.paused ? 'paused' : 'leading'}</span>
        {:else if orphan}
          <span class="warn">{record?.paused ? 'paused, not running' : 'not running'}</span>
        {:else if lead}
          <span class:warn={lead.state === 'paused'}>{lead.state}</span>
        {/if}
        <span>{doneCount} of {under.size} done</span>
        {#if active}<span>{running} running · at most {lead?.limit} at once</span>{/if}
        {#if until}<span class="dim far">{until === 'done' ? 'lands each child itself' : 'you merge each child'}</span>{/if}
      </div>
      {#if elsewhere}
        <div class="line">It runs in {elsewhere}, outside this window.</div>
      {:else if orphan}
        <div class="line">No runner is leading it. Resume runs it here, from its notes on {epicId}.</div>
      {:else if lead?.note}
        <div class="line said">{lead.note}</div>
      {/if}
      {#if lead?.waitingForYou.length}
        <div class="line warn">Added by the lead, waiting for you to hand off:</div>
        {#each lead.waitingForYou as id (id)}
          <button class="row" onclick={() => (app.openTaskId = id)}><span class="mono dim">{id}</span><span class="clip">{titleOf(id)}</span></button>
        {/each}
      {/if}
    </div>
    {#if active || orphan}
      <div class="actions">
        <span class="spacer"></span>
        <button class="btn quiet" disabled={busy} use:tip={'It hands off nothing more; what runs goes on, and is yours'} onclick={() => act(() => app.stopLead(epicId))}>
          <Icon name="stop" size={13} />{orphan ? 'Take off' : 'Stop'}
        </button>
        {#if elsewhere ? !record?.paused : lead?.state === 'leading'}
          <button class="btn quiet" disabled={busy} use:tip={'It hands off nothing until resumed; what runs goes on'} onclick={() => act(() => app.pauseLead(epicId))}>
            <Icon name="pause" size={13} />Pause
          </button>
        {:else}
          <button class="btn" disabled={busy} onclick={() => act(() => app.resumeLead(epicId))}><Icon name="play" size={13} />Resume</button>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .lead {
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

  .who {
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

  .far {
    margin-left: auto;
  }

  .line {
    padding: var(--s1) 0;
    color: var(--ink-2);
  }

  .said {
    color: var(--ink);
  }

  .warn {
    color: var(--warn);
  }

  .dim {
    color: var(--ink-4);
  }

  .row {
    width: 100%;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    color: var(--ink);
  }

  .clip {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    margin-top: var(--s3);
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .spacer {
    flex: 1;
  }
</style>
