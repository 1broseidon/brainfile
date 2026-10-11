<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import { columnProgress, priorityLabel, relativeTime, shortDate, tagHue } from '../lib/format';
  import { renderMarkdown } from '../lib/markdown';
  import type { BoardSnapshot, TaskDetail } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let { board, taskId }: { board: BoardSnapshot; taskId: string } = $props();

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
  const progress = $derived(detail?.archived ? 1 : detail ? columnProgress(board.columns, detail.column) : 0);
  const parent = $derived(detail?.parentId ? board.tasks.find((t) => t.id === detail!.parentId) : undefined);
  const children = $derived(board.tasks.filter((t) => t.parentId === taskId));

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
      app.notify(`${detail.id} completed`);
      close();
    } else app.notify(result.error, 'warn');
  }

  async function remove(): Promise<void> {
    if (!detail || !confirm(`Delete ${detail.id}? The file is removed from the board; git keeps its history.`)) return;
    const result = await api.deleteTask(board.projectId, detail.id);
    if (result.ok) close();
    else app.notify(result.error, 'warn');
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

<div class="detail">
  <header class="crumbs drag">
    <button class="icon-btn no-drag" title="Back (Esc)" onclick={close}><Icon name="back" /></button>
    <span class="crumb">{board.title}</span>
    <Icon name="chevron" size={12} />
    <span class="crumb current tabular">{taskId}</span>
    <span class="spacer"></span>
    {#if detail && !detail.archived}
      <button class="btn ghost no-drag" onclick={complete}><Icon name="archive" size={14} />Complete</button>
      <button class="icon-btn no-drag" title="Delete" onclick={remove}><Icon name="trash" size={15} /></button>
    {/if}
  </header>

  {#if error}
    <div class="missing">{error}</div>
  {:else if detail}
    <div class="body">
      <article class="main">
        <div class="inner">
          {#if detail.type && detail.type !== 'task'}<div class="kind">{detail.type}</div>{/if}
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

          {#if editingDescription}
            <textarea
              class="description-input"
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
            <div class="prose" ondblclick={startEditing}>{@html renderMarkdown(detail.description)}</div>
          {:else if !detail.archived}
            <button class="placeholder" onclick={startEditing}>Add description…</button>
          {/if}

          {#if detail.subtasks?.length || !detail.archived}
            <section class="block">
              <h3>
                Sub-tasks
                {#if detail.subtasks?.length}
                  <span class="tabular">{detail.subtasks.filter((s) => s.completed).length}/{detail.subtasks.length}</span>
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

          {#if children.length}
            <section class="block">
              <h3>Child tasks <span class="tabular">{children.length}</span></h3>
              <ul class="children">
                {#each children as child (child.id)}
                  <li>
                    <button onclick={() => (app.openTaskId = child.id)}>
                      <StatusIcon progress={columnProgress(board.columns, child.column)} />
                      <span class="cid tabular">{child.id}</span>
                      <span>{child.title}</span>
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
                    {#if entry.at}<span class="at">{entry.at}</span>{/if}
                  </li>
                {/each}
              </ol>
            </section>
          {/if}
        </div>
      </article>

      <aside class="props">
        <div class="prop">
          <span class="key">Status</span>
          <button
            class="value"
            disabled={detail.archived}
            onclick={(e) => app.openMenu('status', detail!.id, e.currentTarget)}
          >
            <StatusIcon {progress} />
            {detail.archived ? 'Completed' : (column?.title ?? detail.column)}
          </button>
        </div>
        <div class="prop">
          <span class="key">Priority</span>
          <button
            class="value"
            disabled={detail.archived}
            onclick={(e) => app.openMenu('priority', detail!.id, e.currentTarget)}
          >
            <PriorityIcon priority={detail.priority} />
            {priorityLabel(detail.priority)}
          </button>
        </div>
        <div class="prop">
          <span class="key">Assignee</span>
          <button
            class="value"
            disabled={detail.archived}
            onclick={(e) => app.openMenu('assignee', detail!.id, e.currentTarget)}
          >
            <Avatar name={detail.assignee} size={16} />
            {detail.assignee ?? 'Unassigned'}
          </button>
        </div>
        <div class="prop top">
          <span class="key">Labels</span>
          <div class="labels">
            {#each detail.tags ?? [] as tag (tag)}
              <span class="tag" style:--hue={tagHue(tag)}><i></i>{tag}</span>
            {/each}
            {#if !detail.archived}
              <button class="tag add" onclick={(e) => app.openMenu('labels', detail!.id, e.currentTarget)}>
                <Icon name="plus" size={12} />
              </button>
            {/if}
          </div>
        </div>
        {#if parent || detail.parentId}
          <div class="prop">
            <span class="key">Parent</span>
            <button class="value" onclick={() => (app.openTaskId = detail!.parentId!)}>
              <span class="tabular dim">{detail.parentId}</span>
              {parent?.title ?? ''}
            </button>
          </div>
        {/if}
        {#if detail.dueDate}
          <div class="prop">
            <span class="key">Due</span>
            <span class="value static"><Icon name="calendar" size={14} />{shortDate(detail.dueDate)}</span>
          </div>
        {/if}
        {#if detail.contractStatus}
          <div class="prop">
            <span class="key">Contract</span>
            <span class="value static"><Icon name="contract" size={14} />{detail.contractStatus.replace('_', ' ')}</span>
          </div>
        {/if}

        {#if detail.relatedFiles?.length}
          <div class="divider"></div>
          <div class="files">
            <span class="key">Related files</span>
            {#each detail.relatedFiles as file (file)}
              <code>{file}</code>
            {/each}
          </div>
        {/if}

        <div class="divider"></div>
        <dl class="stamps">
          {#if detail.createdAt}<dt>Created</dt><dd>{relativeTime(detail.createdAt)}</dd>{/if}
          {#if detail.updatedAt}<dt>Updated</dt><dd>{relativeTime(detail.updatedAt)}</dd>{/if}
          {#if detail.completedAt}<dt>Completed</dt><dd>{relativeTime(detail.completedAt)}</dd>{/if}
        </dl>
      </aside>
    </div>
  {/if}
</div>

<style>
  .detail {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .crumbs {
    height: var(--header-h);
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s3) 0 var(--s2);
    border-bottom: 0.5px solid var(--line);
    color: var(--ink-3);
  }

  .crumb {
    color: var(--ink-2);
  }

  .crumb.current {
    color: var(--ink);
    font-weight: 500;
  }

  .spacer {
    flex: 1;
  }

  .missing {
    padding: var(--s10);
    color: var(--ink-3);
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .inner {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--s10) var(--s10) 96px;
  }

  .kind {
    margin-bottom: var(--s2);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-3);
  }

  .title {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    resize: none;
    overflow: hidden;
    font-size: var(--text-2xl);
    font-weight: 600;
    letter-spacing: -0.018em;
    line-height: 1.3;
  }

  .prose,
  .placeholder,
  .description-input {
    margin-top: var(--s4);
  }

  .placeholder {
    color: var(--ink-3);
    font-size: var(--text-lg);
  }

  .placeholder:hover {
    color: var(--ink-2);
  }

  .description-input {
    width: 100%;
    min-height: 120px;
    padding: var(--s3);
    border: 0;
    border-radius: var(--r-lg);
    background: var(--pane-raised);
    box-shadow: inset 0 0 0 0.5px var(--line-strong);
    resize: none;
    font-size: var(--text-lg);
    line-height: 1.6;
  }

  .prose {
    font-size: var(--text-lg);
    line-height: 1.65;
    color: #d4d5d9;
    -webkit-user-select: text;
    user-select: text;
  }

  .prose :global(h1),
  .prose :global(h2),
  .prose :global(h3),
  .prose :global(h4) {
    margin: 1.4em 0 0.5em;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--ink);
  }

  .prose :global(h1) {
    font-size: var(--text-xl);
  }

  .prose :global(p) {
    margin: 0 0 0.8em;
  }

  .prose :global(ul),
  .prose :global(ol) {
    margin: 0 0 0.8em;
    padding-left: 1.4em;
  }

  .prose :global(li) {
    margin: 0.2em 0;
  }

  .prose :global(code) {
    font-family: var(--mono);
    font-size: 0.86em;
    padding: 1px 5px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.06);
  }

  .prose :global(pre) {
    padding: var(--s3) var(--s4);
    border-radius: var(--r-lg);
    background: var(--pane-sunken);
    box-shadow: inset 0 0 0 0.5px var(--line-strong);
    overflow-x: auto;
  }

  .prose :global(pre code) {
    padding: 0;
    background: none;
  }

  .prose :global(a) {
    color: var(--accent-strong);
    text-decoration: none;
  }

  .prose :global(hr) {
    border: 0;
    border-top: 0.5px solid var(--line-strong);
    margin: 1.6em 0;
  }

  .prose :global(blockquote) {
    margin: 0 0 0.8em;
    padding-left: var(--s4);
    border-left: 2px solid var(--line-strong);
    color: var(--ink-2);
  }

  .block {
    margin-top: var(--s10);
  }

  h3 {
    margin: 0 0 var(--s3);
    display: flex;
    gap: var(--s2);
    font-size: var(--text-md);
    font-weight: 600;
  }

  h3 span {
    color: var(--ink-3);
    font-weight: 500;
  }

  ul,
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .subtasks li {
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s2);
    border-radius: var(--r-md);
  }

  .subtasks li:hover {
    background: var(--hover);
  }

  .check {
    width: 16px;
    height: 16px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1.5px var(--ink-4);
    color: var(--pane);
    transition: background var(--fast) var(--ease);
  }

  .check.on {
    background: var(--accent);
    box-shadow: none;
  }

  .check.ghost {
    box-shadow: none;
    color: var(--ink-3);
  }

  .subtasks .done {
    color: var(--ink-3);
    text-decoration: line-through;
    text-decoration-color: var(--ink-4);
  }

  .new input {
    flex: 1;
    height: 30px;
    border: 0;
    background: transparent;
  }

  .new input::placeholder {
    color: var(--ink-3);
  }

  .children button {
    width: 100%;
    height: 34px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s2);
    border-radius: var(--r-md);
    text-align: left;
  }

  .children button:hover {
    background: var(--hover);
  }

  .cid {
    color: var(--ink-3);
    font-size: var(--text-sm);
  }

  .log li {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: var(--s3);
    padding: 6px 0 6px var(--s6);
    color: var(--ink-2);
  }

  .log li i {
    position: absolute;
    left: 6px;
    top: 13px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-4);
  }

  .log li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 8.5px;
    top: 22px;
    bottom: -8px;
    width: 1px;
    background: var(--line-strong);
  }

  .log .text {
    flex: 1;
  }

  .log .at {
    flex: none;
    font-size: var(--text-sm);
    color: var(--ink-3);
  }

  .props {
    width: 300px;
    flex: none;
    padding: var(--s5) var(--s5);
    border-left: 0.5px solid var(--line);
    overflow-y: auto;
  }

  .prop {
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .prop.top {
    align-items: flex-start;
    padding-top: 7px;
  }

  .key {
    width: 84px;
    flex: none;
    color: var(--ink-3);
    font-size: var(--text-sm);
  }

  .prop.top .key {
    padding-top: 3px;
  }

  .value {
    min-width: 0;
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    margin-left: calc(-1 * var(--s2));
    border-radius: var(--r-md);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  button.value:not(:disabled):hover {
    background: var(--hover-strong);
  }

  .value.static {
    margin-left: 0;
    padding: 0;
    color: var(--ink-2);
  }

  .dim {
    color: var(--ink-3);
  }

  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1);
  }

  .tag {
    height: 24px;
    padding: 0 var(--s2);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 12px;
    font-size: var(--text-sm);
    color: var(--ink-2);
    box-shadow: inset 0 0 0 0.5px var(--line-strong);
  }

  .tag i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: hsl(var(--hue) 65% 60%);
  }

  .tag.add {
    width: 24px;
    padding: 0;
    justify-content: center;
    color: var(--ink-3);
  }

  .tag.add:hover {
    color: var(--ink);
    background: var(--hover-strong);
  }

  .divider {
    height: 0.5px;
    margin: var(--s4) 0;
    background: var(--line-strong);
  }

  .files {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }

  .files code {
    font-family: var(--mono);
    font-size: var(--text-xs);
    color: var(--ink-2);
    overflow-wrap: anywhere;
    -webkit-user-select: text;
    user-select: text;
  }

  .stamps {
    margin: 0;
    display: grid;
    grid-template-columns: 84px 1fr;
    row-gap: var(--s2);
    font-size: var(--text-sm);
  }

  .stamps dt {
    color: var(--ink-3);
  }

  .stamps dd {
    margin: 0;
    color: var(--ink-2);
  }
</style>
