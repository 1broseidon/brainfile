<script setup lang="ts">
import { computed } from 'vue'

export interface RelatedPage {
  title: string
  description: string
  href: string
  icon?: string
}

const props = withDefaults(defineProps<{
  title?: string
  pages: RelatedPage[]
  columns?: number
}>(), {
  title: 'Related Pages',
  columns: 2,
})

const gridColumns = computed(() => Math.min(Math.max(props.columns, 1), 3))
</script>

<template>
  <nav
    class="related-pages"
    :aria-label="title"
  >
    <div class="related-divider" aria-hidden="true" />
    <h2 class="related-title">{{ title }}</h2>
    <div
      class="related-grid"
      :style="{ '--grid-cols': gridColumns }"
    >
      <a
        v-for="page in pages"
        :key="page.href"
        :href="page.href"
        class="related-card"
        :aria-label="`${page.title}: ${page.description}`"
      >
        <div class="card-top">
          <div class="card-title-row">
            <span v-if="page.icon" class="card-icon" aria-hidden="true">{{ page.icon }}</span>
            <span class="card-title">{{ page.title }}</span>
          </div>
          <span class="card-arrow" aria-hidden="true">→</span>
        </div>
        <p class="card-desc">{{ page.description }}</p>
      </a>
    </div>
  </nav>
</template>

<style scoped>
.related-pages {
  margin-top: 3rem;
  padding-bottom: 1rem;
}

/* ── Divider ── */

.related-divider {
  border-top: 1px solid var(--void-border);
  margin-bottom: 1.5rem;
}

/* ── Title ── */

.related-title {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--void-text-2);
  margin: 0 0 1rem;
  padding: 0;
  border: none;
}

/* ── Grid ── */

.related-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols, 2), 1fr);
  gap: 1rem;
}

/* ── Card ── */

.related-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.25rem;
  background-color: var(--void-surface);
  border: 1px solid var(--void-border);
  border-radius: 8px;
  text-decoration: none !important;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.related-card:hover {
  border-color: rgba(92, 200, 255, 0.5);
  background-color: rgba(15, 17, 26, 0.8);
  box-shadow: 0 0 16px rgba(92, 200, 255, 0.04);
}

.related-card:focus-visible {
  outline: 2px solid var(--accent-cyan);
  outline-offset: -2px;
}

/* Override global vp-doc a styles */
.related-card,
.related-card:hover,
.related-card:focus {
  text-decoration: none !important;
  color: inherit;
}

/* Remove external link arrow if present */
.related-card::after {
  content: none !important;
  display: none !important;
}

/* ── Card internals ── */

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.card-icon {
  font-size: 1rem;
  flex-shrink: 0;
  line-height: 1;
}

.card-title {
  font-family: 'Inter', var(--vp-font-family-base);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--void-text-1);
  transition: color 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.related-card:hover .card-title {
  color: var(--accent-cyan);
}

.card-arrow {
  font-size: 0.85rem;
  color: var(--void-text-3);
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.2s ease, transform 0.2s ease, color 0.2s ease;
}

.related-card:hover .card-arrow {
  opacity: 1;
  transform: translateX(0);
  color: var(--accent-cyan);
}

.card-desc {
  font-size: 0.82rem;
  color: var(--void-text-2);
  line-height: 1.5;
  margin: 0;
}

/* ── Reduced motion ── */

@media (prefers-reduced-motion: reduce) {
  .related-card,
  .card-title,
  .card-arrow {
    transition: none;
  }

  .card-arrow {
    opacity: 1;
    transform: none;
  }
}

/* ── Responsive ── */

@media (max-width: 640px) {
  .related-grid {
    grid-template-columns: 1fr;
  }

  .related-pages {
    margin-top: 2rem;
  }
}
</style>
