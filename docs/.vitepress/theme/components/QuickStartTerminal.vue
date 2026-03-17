<script setup lang="ts">
import { ref } from 'vue'

const copySuccess = ref(false)

const quickStartCommands = `npm install -g @brainfile/cli
brainfile init
brainfile add -c todo --title "My first task" --with-contract \\
  --deliverable "file:src/feature.ts:Implementation" \\
  --validation "npm test"
brainfile contract pickup -t task-1
brainfile contract deliver -t task-1`

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(quickStartCommands)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = quickStartCommands
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  }
}
</script>

<template>
  <section class="quick-start fade-section">
    <div class="section-header">
      <h2 class="section-title">Quick Start</h2>
      <div class="section-divider"></div>
    </div>
    <div class="terminal">
      <div class="terminal-header">
        <div class="terminal-dots">
          <span class="terminal-dot dot-red"></span>
          <span class="terminal-dot dot-yellow"></span>
          <span class="terminal-dot dot-green"></span>
        </div>
        <span class="terminal-title">terminal</span>
        <button class="terminal-copy" @click="copyToClipboard" :title="copySuccess ? 'Copied!' : 'Copy to clipboard'">
          <svg v-if="!copySuccess" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M3 11V3C3 2.44772 3.44772 2 4 2H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="terminal-body">
        <button class="copy-overlay" @click="copyToClipboard" :title="copySuccess ? 'Copied!' : 'Copy to clipboard'">
          <template v-if="!copySuccess">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M3 11V3C3 2.44772 3.44772 2 4 2H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </template>
          <template v-else>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="copy-overlay-text">Copied!</span>
          </template>
        </button>
        <pre><code><span class="t-prompt">$</span> <span class="t-cmd">npm install -g</span> @brainfile/cli

<span class="t-prompt">$</span> <span class="t-cmd">brainfile init</span>
<span class="t-output">✓ Created .brainfile/brainfile.md</span>

<span class="t-prompt">$</span> <span class="t-cmd">brainfile add</span> -c todo --title <span class="t-string">"My first task"</span> --with-contract \
  --deliverable <span class="t-string">"file:src/feature.ts:Implementation"</span> \
  --validation <span class="t-string">"npm test"</span>
<span class="t-output">✓ Created task-1</span>

<span class="t-prompt">$</span> <span class="t-cmd">brainfile contract pickup</span> -t task-1
<span class="t-output">✓ Contract status: in_progress</span>

<span class="t-prompt">$</span> <span class="t-cmd">brainfile contract deliver</span> -t task-1
<span class="t-output">✓ Contract status: delivered</span></code></pre>
      </div>
    </div>
    <a href="/quick-start" class="quick-start-link">Full Quick Start guide <span class="arrow">&rarr;</span></a>
  </section>
</template>

<style scoped>
/* ---- Quick Start Terminal ---- */
.quick-start {
  padding-bottom: 8rem;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.section-title {
  font-family: 'Work Sans', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4em;
  color: #5cc8ff;
  flex-shrink: 0;
  margin: 0;
}

.section-divider {
  height: 1px;
  flex-grow: 1;
  margin-left: 2rem;
  background: #21262d;
}

.section-label-old {
  display: none;
}

.terminal {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  margin-top: 1.25rem;
}

.terminal-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #0c0c12;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.terminal-dots {
  display: flex;
  gap: 6px;
}

.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-red {
  background: #ff5f57;
  opacity: 0.6;
}

.dot-yellow {
  background: #febc2e;
  opacity: 0.6;
}

.dot-green {
  background: #28c840;
  opacity: 0.6;
}

.terminal-title {
  flex: 1;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: #383848;
}

.terminal-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  color: #505060;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  padding: 0;
}

.terminal-copy:hover {
  color: #a0a0b0;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.terminal-body {
  position: relative;
  background: #08080c;
  padding: 1.5rem;
  overflow-x: auto;
}

.terminal-body pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.7;
  color: #a0a0b0;
}

.terminal-body code {
  font-family: inherit;
}

.t-prompt {
  color: #43d08a;
  user-select: none;
}

.t-cmd {
  color: #5cc8ff;
}

.t-string {
  color: #ffb86c;
}

.t-output {
  color: #43d08a;
  opacity: 0.7;
}

.quick-start-link {
  display: block;
  margin-top: 1.25rem;
  font-size: 0.9rem;
  color: #707080;
  text-decoration: none;
  transition: color 0.15s;
  text-align: center;
}

.quick-start-link:hover {
  color: #5cc8ff;
}

.arrow {
  display: inline-block;
  transition: transform 0.15s;
}

.quick-start-link:hover .arrow {
  transform: translateX(3px);
}

/* ---- Copy overlay button ---- */
.copy-overlay {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  background: rgba(10, 10, 14, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  color: #505060;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  z-index: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  line-height: 1;
}

.terminal-body:hover .copy-overlay {
  opacity: 1;
}

.copy-overlay:hover {
  color: #a0a0b0;
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(10, 10, 14, 0.95);
}

.copy-overlay-text {
  color: #43d08a;
}

/* ---- Scroll fade-in animation ---- */
@media (prefers-reduced-motion: no-preference) {
  .fade-section {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 300ms ease-out, transform 300ms ease-out;
  }

  .fade-section.visible {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .quick-start {
    padding-bottom: 5rem;
  }

  .terminal-body pre {
    font-size: 0.72rem;
  }
}
</style>
