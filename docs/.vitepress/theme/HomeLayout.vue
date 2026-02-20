<script setup lang="ts">
import { useData } from 'vitepress'
import { ref, onMounted, onUnmounted } from 'vue'
import ArchitectureDiagram from './components/ArchitectureDiagram.vue'
import ComparisonTable from './components/ComparisonTable.vue'
import CodeShowcase from './components/CodeShowcase.vue'
import StateMachine from './components/StateMachine.vue'

const { site } = useData()

const copySuccess = ref(false)
const codeBlockCopySuccess = ref(false)
const homeRef = ref<HTMLElement | null>(null)
const codeBlockRef = ref<HTMLElement | null>(null)

// IntersectionObserver for scroll-triggered fade-in animations
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!homeRef.value) return
  const sections = homeRef.value.querySelectorAll('.fade-section')

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          observer?.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.1 }
  )

  sections.forEach((section) => observer?.observe(section))
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

async function copyCodeBlock() {
  const text = codeBlockRef.value?.textContent || ''
  try {
    await navigator.clipboard.writeText(text)
    codeBlockCopySuccess.value = true
    setTimeout(() => { codeBlockCopySuccess.value = false }, 2000)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    codeBlockCopySuccess.value = true
    setTimeout(() => { codeBlockCopySuccess.value = false }, 2000)
  }
}

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
  <div class="home-root" ref="homeRef">
    <nav class="home-nav">
      <div class="nav-brand">
        <a href="/" class="nav-wordmark">brainfile</a>
        <span class="version-badge"><span class="status-dot"></span>v2.0</span>
      </div>
      <div class="nav-links">
        <a href="/reference/protocol">Specification</a>
        <a href="/quick-start">Quick Start</a>
        <a href="/guides/contracts">Guides</a>
        <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>

    <main class="home-content">
      <!-- Section 1: Opening (with dot grid background) -->
      <section class="opening fade-section">
        <div class="dot-grid-bg"></div>
        <h1 class="wordmark">brainfile</h1>
        <p class="headline">An open protocol for agent-to-agent task coordination.</p>
        <p class="subline">Human-in-the-loop compatible. File-system native. MIT licensed.</p>
        <div class="opening-links">
          <a href="/reference/protocol" class="link-primary">Read the Specification <span class="arrow">&rarr;</span></a>
          <a href="/quick-start" class="link-secondary">Quick Start <span class="arrow">&rarr;</span></a>
        </div>
      </section>

      <!-- Section 2: The Protocol -->
      <section class="protocol-hero fade-section">
        <span class="section-label">A contract is a file.</span>
        <CodeShowcase />
      </section>

      <!-- Section 2b: Contract Lifecycle -->
      <section class="lifecycle fade-section">
        <span class="section-label">A contract has a lifecycle.</span>
        <StateMachine />
      </section>

      <!-- Section 3: How it works -->
      <section class="how-it-works fade-section">
        <div class="step">
          <div class="step-left">
            <span class="step-number">01</span>
            <span class="step-keyword">define</span>
          </div>
          <div class="step-content">
            <p class="step-desc">Write a contract as a markdown file in your repo.</p>
            <p class="step-details">Create a <code>.brainfile/brainfile.md</code> containing task constraints and validation parameters. Since it's just a file, you get full version control, branch-based workflows, and pull request reviews out-of-the-box.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-left">
            <span class="step-number">02</span>
            <span class="step-keyword">delegate</span>
          </div>
          <div class="step-content">
            <p class="step-desc">An agent picks it up, implements, and delivers.</p>
            <p class="step-details">The agent reads the task constraints, claims the contract by switching its status to <code>in_progress</code>, and starts creating code. Once the implementation matches the requirements, the agent commits the files and sets the status to <code>delivered</code>.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-left">
            <span class="step-number">03</span>
            <span class="step-keyword">validate</span>
          </div>
          <div class="step-content">
            <p class="step-desc">Automated commands verify the deliverables. Done.</p>
            <p class="step-details">The protocol runs your defined validation shell commands against the delivered files. If the tests pass, the task progresses to <code>done</code>. If they fail, the agent receives the error logs directly and refactors the code.</p>
          </div>
        </div>
      </section>

      <!-- Section 4: Architecture -->
      <section class="architecture fade-section">
        <span class="section-label">How it fits together.</span>
        <ArchitectureDiagram />
      </section>

      <!-- Section 5: Design decisions -->
      <section class="decisions fade-section">
        <div class="decision">
          <h3>Why files?</h3>
          <p>Tasks live in your repo. Git history is your audit trail. No database, no API, no vendor lock-in.</p>
        </div>
        <div class="decision">
          <h3>Why contracts?</h3>
          <p>Informal "please do X" breaks down at scale. Structured deliverables and validation commands make agent output verifiable.</p>
        </div>
        <div class="decision">
          <h3>Why a protocol?</h3>
          <p>Tools change. Claude, Cursor, Copilot, the next thing. A protocol survives all of them.</p>
        </div>
      </section>

      <!-- Section 6: Comparison -->
      <ComparisonTable />

      <!-- Section 7: Ecosystem (Card-based) -->
      <section class="ecosystem fade-section">
        <span class="section-label">Ecosystem</span>
        <p class="ecosystem-note">Integrations are optional adapters. The protocol comes first.</p>
        <div class="eco-grid">
          <a href="/tools/cli" class="eco-card">
            <div class="eco-card-header">
              <span class="eco-icon">⌘</span>
              <span class="eco-badge eco-badge-stable">stable</span>
            </div>
            <span class="eco-card-name">CLI &amp; TUI</span>
            <span class="eco-card-desc">The reference implementation. Manage boards, contracts, and validation from the terminal.</span>
          </a>
          <a href="/tools/mcp" class="eco-card">
            <div class="eco-card-header">
              <span class="eco-icon">◈</span>
              <span class="eco-badge eco-badge-stable">stable</span>
            </div>
            <span class="eco-card-name">MCP Server</span>
            <span class="eco-card-desc">Expose your board to any LLM. Model Context Protocol bridge for agent integration.</span>
          </a>
          <a href="/tools/core" class="eco-card">
            <div class="eco-card-header">
              <span class="eco-icon">◻</span>
              <span class="eco-badge eco-badge-stable">stable</span>
            </div>
            <span class="eco-card-name">Core Library</span>
            <span class="eco-card-desc">Build your own integrations. TypeScript SDK for parsing, validating, and manipulating boards.</span>
          </a>
          <a href="/tools/pi" class="eco-card">
            <div class="eco-card-header">
              <span class="eco-icon">π</span>
              <span class="eco-badge eco-badge-beta">beta</span>
            </div>
            <span class="eco-card-name">Pi Extension</span>
            <span class="eco-card-desc">Showcase orchestrator integration for multi-agent runs with contract coordination.</span>
          </a>
        </div>
      </section>

      <!-- Section 6: Quick Start Terminal -->
      <section class="quick-start fade-section">
        <span class="section-label">Get started in 30 seconds.</span>
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

      <!-- Section 7: Footer -->
      <footer class="home-footer">
        <div class="footer-columns">
          <div class="footer-col">
            <h4 class="footer-col-title">Protocol</h4>
            <a href="/reference/protocol">Specification</a>
            <a href="/quick-start">Quick Start</a>
            <a href="/guides/contracts">Guides</a>
          </div>
          <div class="footer-col">
            <h4 class="footer-col-title">Tools</h4>
            <a href="/tools/cli">CLI</a>
            <a href="/tools/mcp">MCP Server</a>
            <a href="/tools/core">Core Library</a>
          </div>
          <div class="footer-col">
            <h4 class="footer-col-title">Community</h4>
            <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
            <a href="https://github.com/brainfile/brainfile/discussions" target="_blank" rel="noopener">Discussions</a>
            <a href="https://github.com/brainfile/brainfile/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Contributing</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span class="footer-version">Brainfile v2.0 · Protocol Stable · MIT License</span>
          <span class="footer-agent">For agents: <a href="/llms-install.txt">brainfile.md/llms-install.txt</a></span>
        </div>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.home-root {
  min-height: 100vh;
  background: #050508;
  color: #e8e8ec;
  font-family: 'Inter', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ---- Nav ---- */
.home-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem 0;
}

.nav-wordmark {
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: 1.1rem;
  color: #e8e8ec;
  text-decoration: none;
  letter-spacing: -0.02em;
}

.nav-links {
  display: flex;
  gap: 1.75rem;
}

.nav-links a {
  font-size: 0.85rem;
  color: #707080;
  text-decoration: none;
  transition: color 0.15s;
}

.nav-links a:hover {
  color: #e8e8ec;
}

/* ---- Content container ---- */
.home-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* ---- Section 1: Opening (with dot grid) ---- */
.opening {
  position: relative;
  padding-top: 10rem;
  padding-bottom: 8rem;
}

.dot-grid-bg {
  position: absolute;
  top: 0;
  left: -50%;
  right: -50%;
  bottom: 0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 60% 70% at 50% 40%, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 60% 70% at 50% 40%, black 20%, transparent 70%);
}

.wordmark {
  position: relative;
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: clamp(3rem, 7vw, 4.5rem);
  letter-spacing: -0.04em;
  line-height: 1;
  color: #f0f0f4;
  margin: 0 0 1.5rem;
}

.headline {
  position: relative;
  font-size: clamp(1.15rem, 2.5vw, 1.35rem);
  line-height: 1.5;
  color: #c0c0c8;
  margin: 0 0 0.75rem;
  max-width: 36ch;
}

.subline {
  position: relative;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #585868;
  margin: 0 0 2.5rem;
}

.opening-links {
  position: relative;
  display: flex;
  gap: 2rem;
  align-items: center;
}

.link-primary,
.link-secondary {
  font-size: 0.95rem;
  text-decoration: none;
  transition: color 0.15s;
}

.link-primary {
  color: #5cc8ff;
}

.link-primary:hover {
  color: #8cddff;
}

.link-secondary {
  color: #707080;
}

.link-secondary:hover {
  color: #a0a0b0;
}

.arrow {
  display: inline-block;
  transition: transform 0.15s;
}

.link-primary:hover .arrow,
.link-secondary:hover .arrow {
  transform: translateX(3px);
}

/* ---- Section 2: Protocol hero ---- */
.protocol-hero {
  padding-bottom: 8rem;
}

.section-label {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #505060;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1.25rem;
}

.code-block {
  background: #0a0a0e;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 2rem;
  overflow-x: auto;
}

.code-block pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
  line-height: 1.7;
  color: #a0a0b0;
}

.code-block code {
  font-family: inherit;
}

.code-block .hl-key {
  color: #c8c8d0;
}

/* ---- Section 2b: Contract Lifecycle ---- */
.lifecycle {
  padding-bottom: 8rem;
}

/* ---- Section 3: How it works ---- */
.how-it-works {
  padding-bottom: 8rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.step {
  display: flex;
  align-items: baseline;
  gap: 2rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.step:first-child {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.step-left {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-shrink: 0;
  min-width: 160px;
}

.step-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #383848;
}

.step-keyword {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e8e8ec;
}

.step-desc {
  font-size: 0.95rem;
  color: #707080;
  margin: 0;
  line-height: 1.5;
}

/* ---- Section 4: Architecture ---- */
.architecture {
  padding-bottom: 8rem;
}

/* ---- Section 5: Design decisions ---- */
.decisions {
  padding-bottom: 8rem;
  display: flex;
  flex-direction: column;
  gap: 3rem;
}

.decision h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.1rem;
  font-weight: 500;
  color: #c0c0c8;
  margin: 0 0 0.5rem;
  letter-spacing: -0.01em;
}

.decision p {
  font-size: 0.95rem;
  color: #707080;
  margin: 0;
  line-height: 1.6;
  max-width: 52ch;
}

/* ---- Section 5: Ecosystem (Card Grid) ---- */
.ecosystem {
  padding-bottom: 8rem;
}

.ecosystem-note {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  color: #585868;
}

.eco-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.eco-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.25rem 1.5rem;
  background: rgba(10, 10, 14, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  text-decoration: none;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.eco-card:hover {
  border-color: rgba(92, 200, 255, 0.25);
  box-shadow: 0 0 20px rgba(92, 200, 255, 0.06);
  transform: translateY(-2px);
}

.eco-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eco-icon {
  font-size: 1.25rem;
  color: #585868;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.eco-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.eco-badge-stable {
  color: #43d08a;
  background: rgba(67, 208, 138, 0.1);
  border: 1px solid rgba(67, 208, 138, 0.2);
}

.eco-badge-beta {
  color: #ffb86c;
  background: rgba(255, 184, 108, 0.1);
  border: 1px solid rgba(255, 184, 108, 0.2);
}

.eco-card-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e8e8ec;
  transition: color 0.15s;
}

.eco-card:hover .eco-card-name {
  color: #5cc8ff;
}

.eco-card-desc {
  font-size: 0.82rem;
  color: #585868;
  line-height: 1.5;
}

/* ---- Section 6: Quick Start Terminal ---- */
.quick-start {
  padding-bottom: 8rem;
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
  display: inline-block;
  margin-top: 1.25rem;
  font-size: 0.9rem;
  color: #707080;
  text-decoration: none;
  transition: color 0.15s;
}

.quick-start-link:hover {
  color: #5cc8ff;
}

.quick-start-link:hover .arrow {
  transform: translateX(3px);
}

/* ---- Section 7: Footer (Column Layout) ---- */
.home-footer {
  padding: 4rem 0 6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  gap: 3rem;
}

.footer-columns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 2rem;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.footer-col-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: #707080;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.5rem;
}

.footer-col a {
  font-size: 0.85rem;
  color: #505060;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-col a:hover {
  color: #e8e8ec;
}

.footer-bottom {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.footer-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #383848;
}

.footer-agent {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #2a2a38;
}

.footer-agent a {
  color: #383848;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-agent a:hover {
  color: #5cc8ff;
}


.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.version-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.6rem;
  background: rgba(42, 42, 56, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: #a0a0b0;
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: #43d08a; /* subtle green */
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(67, 208, 138, 0.4);
}

.state-machine {
  margin-top: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  background: rgba(10, 10, 14, 0.3);
  padding: 2rem 1rem;
  overflow-x: auto;
}

.contract-state-diagram {
  min-width: 700px;
  max-width: 100%;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.step-details {
  font-size: 0.9rem;
  color: #585868;
  margin: 0;
  line-height: 1.6;
  max-width: 58ch;
}


.contract-state-diagram .box { fill: #0a0a0e; stroke: #2a2a38; stroke-width: 2; rx: 6; }
.contract-state-diagram .text { fill: #a0a0b0; font-family: 'JetBrains Mono', monospace; font-size: 14px; text-anchor: middle; dominant-baseline: middle; }
.contract-state-diagram .line { stroke: #2a2a38; stroke-width: 2; fill: none; }

.contract-state-diagram .box.success { stroke: #5cc8ff; }
.contract-state-diagram .text.success { fill: #5cc8ff; }

.contract-state-diagram .box.blocked { stroke: #ffb86c; }
.contract-state-diagram .text.blocked { fill: #ffb86c; }

.contract-state-diagram .box.failed { stroke: #ff5555; }
.contract-state-diagram .text.failed { fill: #ff5555; }

.contract-state-diagram .line.success { stroke: #5cc8ff; }

/* ---- Scroll fade-in animations ---- */
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

/* ---- Copy overlay buttons ---- */
.code-block,
.terminal-body {
  position: relative;
}

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

.code-block:hover .copy-overlay,
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

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .home-nav {
    padding-top: 1.5rem;
  }

  .nav-links {
    gap: 1rem;
  }

  .opening {
    padding-top: 6rem;
    padding-bottom: 5rem;
  }

  .step {
    flex-direction: column;
    gap: 0.25rem;
  }

  .step-left {
    min-width: unset;
  }
  .state-machine {
    padding: 1.5rem 0.5rem;
  }

  .eco-grid {
    grid-template-columns: 1fr;
  }

  .protocol-hero,
  .lifecycle,
  .how-it-works,
  .architecture,
  .decisions,
  .ecosystem,
  .quick-start {
    padding-bottom: 5rem;
  }

  .code-block {
    padding: 1.25rem;
  }

  .code-block pre {
    font-size: 0.72rem;
  }

  .terminal-body pre {
    font-size: 0.72rem;
  }

  .footer-columns {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}
</style>
