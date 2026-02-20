<script setup lang="ts">
import { ref } from 'vue'
import { useData } from 'vitepress'

const { page } = useData()
const copied = ref(false)
const loading = ref(false)

const GITHUB_RAW = 'https://raw.githubusercontent.com/brainfile/protocol/main/docs/'

async function copyPage() {
  if (loading.value) return
  loading.value = true

  try {
    const rawUrl = GITHUB_RAW + page.value.relativePath
    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error(`${res.status}`)
    const text = await res.text()

    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }

    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Silently fail — button just doesn't respond
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <button class="copy-page-btn" @click="copyPage" :title="copied ? 'Copied!' : 'Copy page as markdown'">
    <svg v-if="!copied" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <path d="M3 11V3C3 2.44772 3.44772 2 4 2H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="copy-page-label">{{ copied ? 'Copied!' : 'Copy page' }}</span>
  </button>
</template>

<style scoped>
.copy-page-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-base);
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.copy-page-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--vp-c-text-1);
}

.copy-page-btn svg {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .copy-page-label {
    display: none;
  }

  .copy-page-btn {
    padding: 0.3rem;
  }
}
</style>
