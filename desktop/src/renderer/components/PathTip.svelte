<script lang="ts">
  import { api } from '../lib/state.svelte';
  import { tildify } from '../lib/format';
  import Icon from './Icon.svelte';

  /** Where a project lives, kept behind a folder key: hover to read the path, press to reveal it in Finder. */
  let { path, line, projectId }: { path: string; line: string; projectId: string } = $props();

  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (open = true), 250);
  }

  function hide(): void {
    if (timer) clearTimeout(timer);
    open = false;
  }
</script>

<span class="tip" role="presentation" onmouseenter={show} onmouseleave={hide}>
  <button class="icon-btn" aria-label="Reveal {tildify(path)} in Finder" onclick={() => api.revealProject(projectId)} onfocus={show} onblur={hide}>
    <Icon name="folder" size={14} />
  </button>
  {#if open}
    <span class="pop" role="tooltip">
      <span class="path mono">{tildify(path)}</span>
      <span class="line">{line}</span>
      <span class="hint mono">press to reveal in Finder</span>
    </span>
  {/if}
</span>

<style>
  .tip {
    position: relative;
    display: inline-flex;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
  }

  .pop {
    position: absolute;
    z-index: 30;
    top: calc(100% + 6px);
    left: -4px;
    min-width: 220px;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--s2) var(--s3);
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
    animation: open var(--d-open) var(--ease);
    pointer-events: none;
  }

  @keyframes open {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
  }

  .path {
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-user-select: text;
    user-select: text;
  }

  .line {
    white-space: nowrap;
    color: var(--ink-2);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
  }

  .hint {
    color: var(--ink-4);
  }
</style>
