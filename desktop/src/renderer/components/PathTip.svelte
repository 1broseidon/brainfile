<script lang="ts">
  import { api } from '../lib/state.svelte';
  import { tildify } from '../lib/format';
  import Icon from './Icon.svelte';

  /**
   * Where a project lives, kept behind a key: hover to read the path, press to
   * reveal it in Finder. With a `label` the key is that name itself, as the
   * board's band has it; without one it is a folder glyph.
   */
  let { path, line, projectId, label }: { path: string; line: string; projectId: string; label?: string } = $props();

  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** The pointer may be passing, so it waits; keyboard focus is asking, so it doesn't. */
  function show(delay: number): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (open = true), delay);
  }

  function hide(): void {
    if (timer) clearTimeout(timer);
    open = false;
  }
</script>

<span class="where" role="presentation" onmouseenter={() => show(800)} onmouseleave={hide}>
  <button
    class={label ? 'name' : 'icon-btn'}
    aria-label="Reveal {tildify(path)} in Finder"
    onclick={() => api.revealProject(projectId)}
    onfocus={(e) => (e.currentTarget as HTMLElement).matches(':focus-visible') && show(0)}
    onblur={hide}
  >
    {#if label}{label}{:else}<Icon name="folder" size={14} />{/if}
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
  /* Not `.tip`: that is the window's tooltip (app.css), and its bubble would wrap the key. */
  .where {
    position: relative;
    display: inline-flex;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
  }

  /* The name as the key: set in its own weight, its hover fill the only sign it can be pressed. */
  .name {
    height: var(--control-h);
    padding: 0 6px;
    border-radius: var(--r-control);
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    transition: background var(--d-press) var(--ease);
  }

  .name:hover {
    background: var(--fill-hover);
  }

  .pop {
    position: absolute;
    z-index: var(--z-tip);
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
