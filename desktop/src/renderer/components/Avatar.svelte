<script lang="ts">
  import { hueOf, initials } from '../lib/format';

  let { name, size = 18 }: { name?: string; size?: number } = $props();
</script>

{#if name}
  <span
    class="avatar"
    aria-label={name}
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * (size < 20 ? 0.56 : 0.42))}px"
    style:--hue={hueOf(name)}
  >
    {size < 20 ? initials(name).slice(0, 1) : initials(name)}
  </span>
{:else}
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <circle cx="9" cy="9" r="8.25" stroke="var(--ink-4)" stroke-width="1.5" stroke-dasharray="2.2 2.2" />
  </svg>
{/if}

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    border-radius: 50%;
    font-weight: 600;
    color: var(--face-ink);
    background: oklch(var(--face-l) var(--face-c) var(--hue));
  }
</style>
