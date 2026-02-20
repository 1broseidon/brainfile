<script setup lang="ts">
interface Props {
  label: string
  variant?: 'cyan' | 'amber' | 'red' | 'blue' | 'green' | 'muted'
  size?: 'sm' | 'md'
  icon?: string
}

withDefaults(defineProps<Props>(), {
  variant: 'cyan',
  size: 'sm',
})
</script>

<template>
  <span
    class="status-badge"
    :class="[`variant-${variant}`, `size-${size}`]"
    role="status"
    :aria-label="`${icon ? icon + ' ' : ''}${label}`"
  >
    <span v-if="icon" class="badge-icon" aria-hidden="true">{{ icon }}</span>
    <span class="badge-label">{{ label }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  border-radius: 9999px;
  font-family: var(--vp-font-family-mono, 'JetBrains Mono', monospace);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
  border-width: 1px;
  border-style: solid;
}

/* ── Sizes ── */

.size-sm {
  font-size: 0.75em;
  padding: 0.2em 0.6em;
}

.size-md {
  font-size: 0.85em;
  padding: 0.25em 0.75em;
}

/* ── Variants ── */

.variant-cyan {
  background-color: var(--accent-cyan-dim, rgba(92, 200, 255, 0.15));
  border-color: rgba(92, 200, 255, 0.3);
  color: var(--accent-cyan, #5cc8ff);
}

.variant-amber {
  background-color: var(--accent-amber-dim, rgba(255, 179, 71, 0.12));
  border-color: rgba(255, 179, 71, 0.3);
  color: var(--accent-amber, #ffb347);
}

.variant-red {
  background-color: var(--accent-red-dim, rgba(255, 107, 107, 0.12));
  border-color: rgba(255, 107, 107, 0.3);
  color: var(--accent-red, #ff6b6b);
}

.variant-blue {
  background-color: var(--accent-blue-dim, rgba(107, 138, 255, 0.12));
  border-color: rgba(107, 138, 255, 0.3);
  color: var(--accent-blue, #6b8aff);
}

.variant-green {
  background-color: rgba(80, 200, 120, 0.12);
  border-color: rgba(80, 200, 120, 0.3);
  color: #50c878;
}

.variant-muted {
  background-color: rgba(96, 96, 112, 0.12);
  border-color: rgba(96, 96, 112, 0.3);
  color: var(--void-text-3, #606070);
}

/* ── Icon ── */

.badge-icon {
  font-style: normal;
  line-height: 1;
}
</style>
