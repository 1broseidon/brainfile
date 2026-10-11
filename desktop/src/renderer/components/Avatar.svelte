<script lang="ts">
  import { initials, tagHue } from '../lib/format';

  let { name, size = 18 }: { name?: string; size?: number } = $props();
</script>

{#if name}
  <span
    class="avatar"
    title={name}
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * (size < 20 ? 0.52 : 0.42))}px"
    style:--hue={tagHue(name)}
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
    letter-spacing: 0.02em;
    color: hsl(var(--hue) 70% 88%);
    background: hsl(var(--hue) 38% 32%);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.12);
  }
</style>
