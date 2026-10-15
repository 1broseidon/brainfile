<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { api, app } from '../lib/state.svelte';
  import { childrenOf, columnProgress, priorityLabel, relativeTime, shortDate, workColumn } from '../lib/format';
  import { renderMarkdown } from '../lib/markdown';
  import { sourceLabel } from '../../shared/issues';
  import type { BoardSnapshot, TaskDetail } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import HandTo from './HandTo.svelte';
  import AskLine from './AskLine.svelte';
  import Review from './Review.svelte';
  import Lead from './Lead.svelte';
  import Working from './Working.svelte';

  /** `full`: the task takes the list's place beside the chat, with a way back to the list. */
  let { board, taskId, full = false }: { board: BoardSnapshot; taskId: string; full?: boolean } = $props();

  let detail = $state<TaskDetail | null>(null);
  let error = $state<string | null>(null);
  let editingDescription = $state(false);
  let draftDescription = $state('');
  let newSubtask = $state('');
  let titleEl = $state<HTMLTextAreaElement>();

  // Reload whenever the board changes underneath (an agent, the CLI, a sync).
  $effect(() => {
    void board;
    const id = taskId;
    void api.getTask(board.projectId, id).then((result) => {
      if (id !== taskId) return;
      if (result.ok) {
        detail = result.value;
        error = null;
      } else {
        error = result.error;
      }
    });
  });

  const column = $derived(detail ? board.columns.find((c) => c.id === detail!.column) : undefined);
  /** The board's review column, found the way a hand-off's brief finds it. */
  const inReview = $derived(!!column && (/review/i.test(column.id) || /review/i.test(column.title)));
  const progress = $derived(detail?.archived ? 1 : detail ? columnProgress(board.columns, detail.column) : 0);
  const parent = $derived(detail?.parentId ? board.tasks.find((t) => t.id === detail!.parentId) : undefined);
  /** Open and completed alike, as the list draws them under it (task-20). */
  const children = $derived(childrenOf(taskId, board.columns, board.tasks, board.completed));
  /** With open children, Hand to… starts a lead that runs them (decision-15). */
  const leads = $derived(children.some((c) => !c.done));
  const lead = $derived(app.leadFor(taskId, board.projectId));
  /** A lead runs this epic, or one is on it waiting to be resumed: it is the lead's, not Hand to…'s. */
  const led = $derived((!!lead && (lead.state === 'leading' || lead.state === 'paused')) || (!!detail?.lead && lead?.state !== 'stopped' && lead?.state !== 'done'));
  const leadRun = $derived(app.leadRunFor(taskId));
  const decision = $derived(detail?.decision);
  const decisionProps = $derived(
    !!decision &&
      !!(decision.claimKey || (decision.kind && decision.kind !== 'decision') || decision.stance || decision.holdsWhile || decision.recheck || decision.validUntil || decision.supersedes.length || decision.supersededBy)
  );
  /** The decisions this work rests on, as the board knows them. */
  const restsOn = $derived((detail?.decisions ?? []).map((id) => ({ id, d: board.decisions.find((d) => d.id === id) })));
  const restingOnIt = $derived((decision?.restingOn ?? []).map((id) => board.tasks.find((t) => t.id === id)).filter((t) => !!t));

  function close(): void {
    app.openTaskId = null;
  }

  function saveTitle(e: Event): void {
    const value = (e.currentTarget as HTMLTextAreaElement).value.replace(/\s+/g, ' ').trim();
    if (detail && value && value !== detail.title) void app.patch(detail.id, { title: value });
  }

  function startEditing(): void {
    if (!detail || detail.archived) return;
    draftDescription = detail.description ?? '';
    editingDescription = true;
  }

  function saveDescription(): void {
    if (!detail) return;
    const next = draftDescription.trim();
    editingDescription = false;
    if (next !== (detail.description ?? '')) {
      detail.description = next || undefined;
      void app.patch(detail.id, { description: next || null });
    }
  }

  async function toggleSubtask(id: string): Promise<void> {
    if (!detail || detail.archived) return;
    const sub = detail.subtasks?.find((s) => s.id === id);
    if (sub) sub.completed = !sub.completed;
    const result = await api.toggleSubtask(board.projectId, detail.id, id);
    if (!result.ok) app.notify(result.error, 'warn');
  }

  async function addSubtask(): Promise<void> {
    const title = newSubtask.trim();
    if (!detail || !title) return;
    newSubtask = '';
    const result = await api.addSubtask(board.projectId, detail.id, title);
    if (!result.ok) app.notify(result.error, 'warn');
  }

  async function complete(): Promise<void> {
    if (!detail) return;
    const result = await api.completeTask(board.projectId, detail.id);
    if (result.ok) {
      close();
    } else app.notify(result.error, 'warn');
  }

  /** No question first: the delete happens, and Undo puts the file back. */
  async function remove(): Promise<void> {
    if (!detail) return;
    const projectId = board.projectId;
    const result = await api.deleteTask(projectId, detail.id);
    if (!result.ok) {
      app.notify(result.error, 'warn');
      return;
    }
    const removed = result.value;
    close();
    app.offerUndo(`Deleted ${removed.taskId}`, async () => {
      const restored = await api.restoreTask(projectId, removed);
      if (!restored.ok) app.notify(restored.error, 'warn');
    });
  }

  function autosize(el: HTMLTextAreaElement): void {
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    el.addEventListener('input', fit);
  }

  function logStamp(line: string): { at: string; text: string } {
    const m = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z?):?\s*(.*)$/.exec(line);
    return m ? { at: relativeTime(m[1]), text: m[2] } : { at: '', text: line };
  }
</script>

<section class="pane" class:full>
  <header class="band">
    {#if full}
      <button class="icon-btn back" use:tip={'Back to list  Esc'} aria-label="Back to list" onclick={close}><Icon name="back" size={14} /></button>
    {/if}
    {#if detail?.glyph}<span class="glyph">{detail.glyph}</span>{/if}
    <span class="id mono">{taskId}</span>
    {#if detail?.archived && !decision}<span class="state mono">done</span>{/if}
    <span class="spacer"></span>
    {#if decision && decision.status !== 'current'}
      <span class="dstate mono" class:retired={decision.status !== 'proposed'}>{decision.status}</span>
    {/if}
    {#if detail && !detail.archived && !decision}
      {#if !app.runFor(detail.id)}
        <!-- Talk it over first (task-35): the chat opens on this task; the agent may change its spec, not its code. -->
        <button class="btn quiet" use:tip={'Talk it over with an agent'} onclick={() => detail && app.discussTask(detail.id)}
          ><Icon name="ask" size={13} />Discuss</button
        >
      {/if}
      {#if led}
        {#if leadRun}<span class="running"><Working run={leadRun} /></span>{/if}
      {:else}
        <HandTo taskId={detail.id} {leads} waitsOn={detail.dependencies.filter((d) => !d.done && !d.ref.includes(':')).map((d) => d.ref)} />
      {/if}
      <button class="btn quiet" onclick={complete}><StatusIcon progress={1} size={13} />Complete</button>
      <button class="icon-btn destroy" use:tip={'Delete'} onclick={remove}><Icon name="trash" size={15} /></button>
    {:else if detail?.archived && !decision}
      <button class="btn quiet" use:tip={`Back to ${workColumn(board.columns)?.title ?? 'the board'}, open again`} onclick={() => detail && app.reopenTask(detail.id)}
        ><StatusIcon progress={0} size={13} />Reopen</button
      >
    {/if}
    {#if !full}
      <button class="icon-btn" use:tip={'Close  Esc'} onclick={close}><Icon name="close" size={14} /></button>
    {/if}
  </header>

  {#if error}
    <div class="missing">{error}</div>
  {:else if detail}
    <div class="scroll">
      {#key detail.id}
        <textarea
          class="title"
          rows="1"
          bind:this={titleEl}
          use:autosize
          value={detail.title}
          readonly={detail.archived}
          onblur={saveTitle}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              titleEl?.blur();
            }
            e.stopPropagation();
          }}
        ></textarea>
      {/key}

      {#each app.asks.filter((a) => a.runId === app.runFor(detail!.id)?.id) as ask (ask.id)}
        <div class="asking"><AskLine {ask} stacked /></div>
      {/each}

      {#if !detail.archived && !decision}
        <Lead {board} epicId={detail.id} record={detail.lead} />
        <Review {board} taskId={detail.id} {inReview} assignee={detail.assignee} />
      {/if}

      {#if decision}
        <!-- A decision is not work: it has a claim and a stance, not a status, priority or assignee. -->
        {#if decisionProps}
        <div class="group">
          {#if decision.claimKey}
            <div class="prop"><span class="key">Claim key</span><span class="value static mono">{decision.claimKey}</span></div>
          {/if}
          {#if decision.kind && decision.kind !== 'decision'}
            <div class="prop"><span class="key">Kind</span><span class="value static">{decision.kind}</span></div>
          {/if}
          {#if decision.stance}
            <div class="prop">
              <span class="key">Stance</span>
              <span class="value static">{decision.stance}{#if decision.subject}&nbsp;<span class="mono">{decision.subject}</span>{/if}</span>
            </div>
          {/if}
          {#if decision.holdsWhile}
            <div class="prop"><span class="key">Holds while</span><span class="value static clip">{decision.holdsWhile}</span></div>
          {/if}
          {#if decision.recheck}
            <div class="prop"><span class="key">Recheck</span><span class="value static clip">{decision.recheck}</span></div>
          {/if}
          {#if decision.validUntil}
            <div class="prop"><span class="key">Valid until</span><span class="value static mono">{shortDate(decision.validUntil)}</span></div>
          {/if}
          {#each decision.supersedes as id (id)}
            <div class="prop">
              <span class="key">Replaces</span>
              <button class="value" onclick={() => (app.openTaskId = id)}>
                <span class="mono dim">{id}</span>
                <span class="clip">{board.decisions.find((d) => d.id === id)?.title ?? ''}</span>
              </button>
            </div>
          {/each}
          {#if decision.supersededBy}
            <div class="prop">
              <span class="key">Replaced by</span>
              <button class="value" onclick={() => (app.openTaskId = decision!.supersededBy!)}>
                <span class="mono dim">{decision.supersededBy}</span>
                <span class="clip">{board.decisions.find((d) => d.id === decision!.supersededBy)?.title ?? ''}</span>
              </button>
            </div>
          {/if}
        </div>
        {/if}
      {:else}
      <div class="group">
        <div class="prop">
          <span class="key">Status</span>
          <button class="value" disabled={detail.archived} onclick={(e) => app.openMenu('status', detail!.id, e.currentTarget)}>
            <StatusIcon {progress} />
            {detail.archived ? 'Done' : (column?.title ?? detail.column)}
          </button>
        </div>
        <div class="prop">
          <span class="key">Priority</span>
          <button class="value" disabled={detail.archived} onclick={(e) => app.openMenu('priority', detail!.id, e.currentTarget)}>
            <PriorityIcon priority={detail.priority} placeholder />
            <span class:dim={!detail.priority}>{priorityLabel(detail.priority)}</span>
          </button>
        </div>
        <div class="prop">
          <span class="key">Assignee</span>
          <button class="value" disabled={detail.archived} onclick={(e) => app.openMenu('assignee', detail!.id, e.currentTarget)}>
            <Avatar name={detail.assignee} size={16} />
            <span class:dim={!detail.assignee}>{detail.assignee ?? 'Nobody'}</span>
          </button>
        </div>
        <div class="prop">
          <span class="key">Labels</span>
          <button class="value labels" disabled={detail.archived} onclick={(e) => app.openMenu('labels', detail!.id, e.currentTarget)}>
            {#each detail.tags ?? [] as tag (tag)}
              <span class="tag">{tag}</span>
            {:else}
              <span class="dim">None</span>
            {/each}
          </button>
        </div>
        {#if detail.parentId}
          <div class="prop">
            <span class="key">Parent</span>
            <button class="value" onclick={() => (app.openTaskId = detail!.parentId!)}>
              <span class="mono dim">{detail.parentId}</span>
              <span class="clip">{parent?.title ?? ''}</span>
            </button>
          </div>
        {/if}
        {#if detail.source}
          <!-- Where the work came from (task-26): the issue it was made from, opened in the browser. -->
          <div class="prop">
            <span class="key">Source</span>
            {#if /^https?:\/\//.test(detail.source)}
              <a class="value link" href={detail.source} target="_blank" rel="noreferrer" use:tip={detail.source}>
                <span class="mono clip">{sourceLabel(detail.source)}</span>
                <Icon name="reveal" size={12} />
              </a>
            {:else}
              <span class="value static mono clip">{detail.source}</span>
            {/if}
          </div>
        {/if}
        {#if detail.dueDate}
          <div class="prop">
            <span class="key">Due</span>
            <span class="value static mono">{shortDate(detail.dueDate)}</span>
          </div>
        {/if}
        {#if detail.contractStatus}
          <div class="prop">
            <span class="key">Contract</span>
            <span class="value static"><span class="contract" data-status={detail.contractStatus}>{detail.contractStatus.replace('_', ' ')}</span></span>
          </div>
        {/if}
      </div>
      {/if}

      {#if editingDescription}
        <textarea
          class="description-input field"
          bind:value={draftDescription}
          use:autosize
          placeholder="Add description…"
          onblur={saveDescription}
          onkeydown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && e.metaKey)) {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
            e.stopPropagation();
          }}
        ></textarea>
      {:else if detail.description}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="prose" ondblclick={startEditing} use:tip={'Double-click to edit'}>{@html renderMarkdown(detail.description)}</div>
      {:else if !detail.archived}
        <button class="placeholder" onclick={startEditing}>Add description…</button>
      {/if}

      {#if !decision && (detail.subtasks?.length || !detail.archived)}
        <section class="block">
          <h3>
            Sub-tasks
            {#if detail.subtasks?.length}
              <span class="mono">{detail.subtasks.filter((s) => s.completed).length}/{detail.subtasks.length}</span>
            {/if}
          </h3>
          <ul class="subtasks">
            {#each detail.subtasks ?? [] as sub (sub.id)}
              <li>
                <button class="check" class:on={sub.completed} onclick={() => toggleSubtask(sub.id)} aria-label="Toggle">
                  {#if sub.completed}<Icon name="check" size={11} stroke={2.2} />{/if}
                </button>
                <span class:done={sub.completed}>{sub.title}</span>
              </li>
            {/each}
            {#if !detail.archived}
              <li class="new">
                <span class="check ghost"><Icon name="plus" size={11} stroke={2} /></span>
                <input
                  placeholder="Add sub-task"
                  bind:value={newSubtask}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') void addSubtask();
                    if (e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
                    e.stopPropagation();
                  }}
                />
              </li>
            {/if}
          </ul>
        </section>
      {/if}

      {#if detail.dependencies.length}
        <section class="block">
          <h3>Depends on</h3>
          <ul class="children">
            {#each detail.dependencies as dep (dep.ref)}
              {@const target = dep.ref.includes(':') ? app.projects.find((p) => dep.folder && p.id === dep.folder) : app.active}
              <li>
                <button disabled={!target || dep.state === 'missing' || dep.state === 'no-board'} onclick={() => target && app.goTo(target.id, dep.ref.split(':').pop()!)}>
                  <StatusIcon progress={dep.done ? 1 : 0} />
                  <span class="cid ref mono">{dep.ref}</span>
                  <span class="clip" class:dim={!dep.title}>{dep.title ?? (dep.state === 'missing' ? 'not on this machine' : dep.state === 'no-board' ? 'no board there' : dep.state === 'unknown-alias' ? 'unknown board' : 'not found')}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if restsOn.length}
        <section class="block">
          <h3>Rests on</h3>
          <ul class="children">
            {#each restsOn as { id, d } (id)}
              <li>
                <button disabled={!d} onclick={() => (app.openTaskId = id)}>
                  <span class="dglyph" aria-hidden="true">{d && (d.status === 'current' || d.status === 'proposed') ? '●' : '○'}</span>
                  <span class="cid ref mono">{id}</span>
                  <span class="clip" class:dim={!d}>{d?.title ?? 'not on this board'}</span>
                  {#if d && d.status !== 'current' && d.status !== 'proposed'}
                    <span class="mono retired">{d.status}{#if d.supersededBy}{` → ${d.supersededBy}`}{/if}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if restingOnIt.length}
        <section class="block">
          <h3>Work resting on it <span class="mono">{restingOnIt.length}</span></h3>
          <ul class="children">
            {#each restingOnIt as t (t!.id)}
              <li>
                <button onclick={() => app.goTo(board.projectId, t!.id)}>
                  <StatusIcon progress={columnProgress(board.columns, t!.column)} />
                  <span class="cid mono">{t!.id}</span>
                  <span class="clip">{t!.title}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if children.length}
        <section class="block">
          <h3>Child tasks <span class="mono">{children.length}</span></h3>
          <ul class="children">
            {#each children as { task: child, done } (child.id)}
              <li>
                <button onclick={() => (app.openTaskId = child.id)}>
                  <StatusIcon progress={done ? 1 : columnProgress(board.columns, child.column)} />
                  <span class="cid mono">{child.id}</span>
                  <span class="clip">{child.title}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if detail.log.length}
        <section class="block">
          <h3>Activity</h3>
          <ol class="log">
            {#each detail.log as line, i (i)}
              {@const entry = logStamp(line)}
              <li>
                <i></i>
                <span class="text">{entry.text}</span>
                {#if entry.at}<span class="at mono">{entry.at}</span>{/if}
              </li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if detail.relatedFiles?.length}
        <section class="block">
          <h3>Files</h3>
          {#each detail.relatedFiles as file (file)}
            <div class="file mono">{file}</div>
          {/each}
        </section>
      {/if}

      <footer class="stamps mono">
        {#if detail.createdAt}<span>created {relativeTime(detail.createdAt)}</span>{/if}
        {#if detail.updatedAt}<span>updated {relativeTime(detail.updatedAt)}</span>{/if}
        {#if detail.completedAt}<span>done {relativeTime(detail.completedAt)}</span>{/if}
      </footer>
    </div>
  {/if}
</section>

<style>
  .pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--canvas);
    box-shadow: var(--top-light), 0 0 0 var(--hairline) var(--line);
    overflow: hidden;
  }

  .band {
    height: var(--band-h);
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2) 0 var(--s5);
  }

  .glyph {
    color: var(--ink-3);
    font-size: var(--t-xs);
  }

  .id {
    color: var(--ink-3);
  }

  /* The lead's turn at work, where Hand to… would be. */
  .running {
    color: var(--ink-3);
    margin-right: var(--s1);
  }

  .state {
    color: var(--accent-ink);
  }

  .spacer {
    flex: 1;
  }

  .destroy:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }

  .missing {
    padding: var(--s6);
    color: var(--ink-3);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--s1) var(--s5) var(--s12);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px);
    mask-image: linear-gradient(to bottom, transparent 0, #000 12px);
  }

  /* In the list's place the text keeps a reading measure, the rest of the width left empty. */
  .full .scroll {
    padding-right: max(var(--s5), calc(100% - 760px));
  }

  /* The way back sits where the eye starts, before the task's ID. */
  .back {
    margin-left: calc(-1 * var(--s1));
  }

  .title {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    resize: none;
    overflow: hidden;
    font-size: var(--t-xl);
    line-height: var(--lh-xl);
    font-weight: 600;
  }

  .asking {
    margin-top: var(--s4);
    padding: var(--s3);
    border-radius: var(--r-group);
    background: var(--raised);
    box-shadow: var(--top-light);
  }

  /* A group in a pane column: a surface of its own, set in, radius 14. */
  .group {
    margin: var(--s4) 0 var(--s5);
    padding: var(--s1) var(--s3);
    border-radius: var(--r-group);
    background: var(--raised);
    box-shadow: var(--top-light);
  }

  .prop {
    height: 34px;
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .prop + .prop {
    box-shadow: inset 0 var(--hairline) 0 var(--line);
  }

  .key {
    width: 76px;
    flex: none;
    color: var(--ink-3);
  }

  .value {
    min-width: 0;
    height: var(--control-h);
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    margin-left: calc(-1 * var(--s2));
    border-radius: var(--r-control);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
  }

  button.value:not(:disabled):hover,
  a.value:hover {
    background: var(--fill-hover);
  }

  .value.link {
    color: var(--ink-2);
    text-decoration: none;
  }

  .value.link :global(svg) {
    flex: none;
    color: var(--ink-4);
  }

  .value.static {
    margin-left: 0;
    padding: 0;
    color: var(--ink-2);
  }

  .labels {
    gap: var(--s3);
  }

  .dim {
    color: var(--ink-4);
    font-weight: 400;
  }

  .clip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    color: var(--ink-4);
    font-size: var(--t-read);
  }

  .placeholder:hover {
    color: var(--ink-3);
  }

  .description-input {
    width: 100%;
    min-height: 120px;
    height: auto;
    padding: var(--s2) var(--s3);
    resize: none;
    font-size: var(--t-read);
    line-height: var(--lh-read);
  }

  .prose {
    font-size: var(--t-read);
    line-height: var(--lh-read);
    color: var(--ink-2);
    -webkit-user-select: text;
    user-select: text;
  }

  .prose :global(h1),
  .prose :global(h2),
  .prose :global(h3),
  .prose :global(h4) {
    margin: 22px 0 6px;
    font-size: var(--t-read);
    font-weight: 600;
    color: var(--ink);
  }

  .prose :global(p) {
    margin: 0 0 10px;
  }

  .prose :global(strong) {
    color: var(--ink);
    font-weight: 600;
  }

  .prose :global(em) {
    font-style: normal;
    color: var(--ink);
  }

  .prose :global(ul),
  .prose :global(ol) {
    margin: 0 0 10px;
    padding-left: 20px;
  }

  .prose :global(li::marker) {
    color: var(--ink-4);
  }

  .prose :global(code) {
    font-family: var(--mono);
    font-size: var(--t-sm);
    padding: 1px 5px;
    border-radius: var(--r-chip);
    background: var(--fill-code);
    color: var(--ink);
  }

  .prose :global(pre) {
    padding: var(--s3);
    border-radius: var(--r-card);
    background: var(--well);
    overflow-x: auto;
  }

  .prose :global(pre code) {
    padding: 0;
    background: none;
  }

  .prose :global(a) {
    color: var(--accent-ink);
    text-decoration: none;
  }

  .prose :global(hr) {
    border: 0;
    border-top: var(--hairline) solid var(--line);
    margin: 22px 0;
  }

  .prose :global(blockquote) {
    margin: 0 0 10px;
    padding-left: var(--s3);
    border-left: 2px solid var(--line-strong);
    color: var(--ink-3);
  }

  .block {
    margin-top: var(--s8);
  }

  h3 {
    margin: 0 0 var(--s2);
    display: flex;
    align-items: baseline;
    gap: var(--s2);
    font-size: var(--t-md);
    font-weight: 600;
  }

  h3 span {
    color: var(--ink-4);
  }

  ul,
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .subtasks li {
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s2);
    margin: 0 calc(-1 * var(--s2));
    border-radius: var(--r-control);
  }

  .subtasks li:hover {
    background: var(--fill-hover);
  }

  .check {
    width: 14px;
    height: 14px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1.5px var(--ink-4);
    color: var(--on-accent);
  }

  .check:hover {
    box-shadow: inset 0 0 0 1.5px var(--ink-2);
  }

  .check.on {
    background: var(--accent);
    box-shadow: none;
  }

  .check.ghost {
    box-shadow: none;
    color: var(--ink-4);
  }

  .subtasks .done {
    color: var(--ink-4);
    text-decoration: line-through;
  }

  .new input {
    flex: 1;
    height: 30px;
    border: 0;
    background: transparent;
  }

  .children button {
    width: calc(100% + var(--s4));
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s2);
    margin: 0 calc(-1 * var(--s2));
    border-radius: var(--r-control);
    text-align: left;
  }

  .children button:hover {
    background: var(--fill-hover);
  }

  /* A reference can be longer than an ID (`mobile:task-12`); it never wraps. */
  .cid.ref {
    width: auto;
    white-space: nowrap;
  }

  /* A decision's mark, the TUI's glyph, in the place a status box takes. */
  .dglyph {
    width: 16px;
    flex: none;
    text-align: center;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  .retired {
    flex: none;
    color: var(--warn);
  }

  /* A decision says where it stands only when it is not simply current. */
  .dstate {
    color: var(--ink-3);
  }

  .cid {
    width: var(--id-w);
    flex: none;
    color: var(--ink-4);
  }

  .log li {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: var(--s3);
    padding: 5px 0 5px 20px;
    color: var(--ink-2);
  }

  .log li i {
    position: absolute;
    left: 4px;
    top: 11px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ink-4);
  }

  .log li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 20px;
    bottom: -7px;
    width: 1px;
    background: var(--line);
  }

  .log .text {
    flex: 1;
  }

  .log .at {
    flex: none;
    color: var(--ink-4);
  }

  .file {
    color: var(--ink-2);
    padding: 3px 0;
    overflow-wrap: anywhere;
    -webkit-user-select: text;
    user-select: text;
  }

  .stamps {
    margin-top: var(--s8);
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1) var(--s4);
    color: var(--ink-4);
  }
</style>
