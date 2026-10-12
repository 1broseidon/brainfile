<script lang="ts">
  /** An on/off key: a box that slides in a sunk track, the checkbox's corner kept (design.md, Icons). */
  let { on, label, onchange }: { on: boolean; label: string; onchange: (on: boolean) => void } = $props();
</script>

<button class="switch" class:on role="switch" aria-checked={on} aria-label={label} onclick={() => onchange(!on)}>
  <span class="knob"></span>
</button>

<style>
  .switch {
    width: 30px;
    height: 18px;
    flex: none;
    padding: 2px;
    border-radius: var(--r-chip);
    background: var(--well);
    box-shadow: inset 0 0 0 var(--hairline) var(--line-strong);
    transition:
      background var(--d-press) var(--ease),
      box-shadow var(--d-press) var(--ease);
  }

  .knob {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: var(--ink-3);
    transition:
      transform var(--d-open) var(--ease),
      background var(--d-press) var(--ease);
  }

  .switch:hover .knob {
    background: var(--ink-2);
  }

  .on {
    background: var(--accent);
    box-shadow: none;
  }

  .on .knob,
  .on:hover .knob {
    transform: translateX(12px);
    background: var(--on-accent);
  }
</style>
