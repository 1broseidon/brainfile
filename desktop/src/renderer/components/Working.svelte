<script lang="ts">
  /**
   * The one thing that moves while an agent works (design.md, Motion): a
   * muted status word with a slow shimmer across it, so the window reads as
   * busy without asking to be watched. The word turns over every few seconds
   * among honest names for the kind of work under way; it never invents
   * progress. Reduced motion holds the first word still.
   */
  import type { AgentRun } from '../../shared/api';

  // A run that ends clears its holder a beat before the block showing it is
  // torn down, so everything read from it here must survive it being gone.
  let { run, rotate = true }: { run: AgentRun | undefined; rotate?: boolean } = $props();

  const agent = $derived(run?.agentId ?? '');
  const activity = $derived(run?.activity ?? 'working');
  const waiting = $derived(run?.state === 'waiting');

  const WORDS: Record<string, string[]> = {
    starting: ['Starting', 'Waking up'],
    thinking: ['Thinking', 'Considering', 'Working it out'],
    reading: ['Reading', 'Looking through the board'],
    searching: ['Searching', 'Looking around'],
    editing: ['Editing', 'Writing it down', 'Updating the board'],
    running: ['Running', 'Checking'],
    fetching: ['Fetching'],
    working: ['Working', 'On it'],
  };

  const words = $derived(waiting ? ['Needs you'] : (WORDS[activity] ?? [activity.charAt(0).toUpperCase() + activity.slice(1)]));
  let index = $state(0);

  $effect(() => {
    void words;
    index = 0;
    if (!rotate || words.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => (index = (index + 1) % words.length), 2600);
    return () => clearInterval(timer);
  });
</script>

<span class="working mono" class:still={waiting} role="status" aria-live="polite">
  <span class="who">{agent}</span>
  <span class="sep">·</span>
  {#key index + words[index]}
    <span class="word">{words[index]}…</span>
  {/key}
</span>

<style>
  .working {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .sep {
    color: var(--ink-4);
  }

  /* A slow band of light across the word, the only motion at work. */
  .word {
    background: linear-gradient(90deg, var(--ink-3) 0%, var(--ink-3) 38%, var(--ink) 50%, var(--ink-3) 62%, var(--ink-3) 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation:
      shimmer 1800ms linear infinite,
      enter var(--d-move) var(--ease);
  }

  .still .word {
    background: none;
    color: var(--warn);
    animation: none;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -150% 0;
    }
  }

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .word {
      background: none;
      color: var(--ink-3);
      animation: none;
    }
  }
</style>
