<script setup lang="ts">
import { useData } from 'vitepress'

const { site } = useData()
</script>

<template>
  <div class="home-root">
    <nav class="home-nav">
      <a href="/" class="nav-wordmark">brainfile</a>
      <div class="nav-links">
        <a href="/reference/protocol">Specification</a>
        <a href="/quick-start">Quick Start</a>
        <a href="/guides/contracts">Guides</a>
        <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>

    <main class="home-content">
      <!-- Section 1: Opening -->
      <section class="opening">
        <h1 class="wordmark">brainfile</h1>
        <p class="headline">An open protocol for agent-to-agent task coordination.</p>
        <p class="subline">Human-in-the-loop compatible. File-system native. MIT licensed.</p>
        <div class="opening-links">
          <a href="/reference/protocol" class="link-primary">Read the Specification <span class="arrow">&rarr;</span></a>
          <a href="/quick-start" class="link-secondary">Quick Start <span class="arrow">&rarr;</span></a>
        </div>
      </section>

      <!-- Section 2: The Protocol -->
      <section class="protocol-hero">
        <span class="section-label">A contract is a file.</span>
        <div class="code-block">
          <pre><code><span class="hl-key">id:</span> task-12
<span class="hl-key">title:</span> Add rate limiting to API gateway
<span class="hl-key">column:</span> in-progress
<span class="hl-key">assignee:</span> codex
<span class="hl-key">priority:</span> high
<span class="hl-key">relatedFiles:</span>
  - src/api/gateway.ts
  - src/middleware/auth.ts

<span class="hl-key">contract:</span>
  <span class="hl-key">status:</span> in_progress

  <span class="hl-key">deliverables:</span>
    - <span class="hl-key">path:</span> src/middleware/rateLimiter.ts
    - <span class="hl-key">path:</span> src/__tests__/rateLimiter.test.ts

  <span class="hl-key">validation:</span>
    <span class="hl-key">commands:</span>
      - npm test -- rateLimiter
      - npm run build

  <span class="hl-key">constraints:</span>
    - Token bucket algorithm
    - Non-blocking async implementation</code></pre>
        </div>
      </section>

      <!-- Section 3: How it works -->
      <section class="how-it-works">
        <div class="step">
          <div class="step-left">
            <span class="step-number">01</span>
            <span class="step-keyword">define</span>
          </div>
          <p class="step-desc">Write a contract as a markdown file in your repo.</p>
        </div>
        <div class="step">
          <div class="step-left">
            <span class="step-number">02</span>
            <span class="step-keyword">delegate</span>
          </div>
          <p class="step-desc">An agent picks it up, implements, and delivers.</p>
        </div>
        <div class="step">
          <div class="step-left">
            <span class="step-number">03</span>
            <span class="step-keyword">validate</span>
          </div>
          <p class="step-desc">Automated commands verify the deliverables. Done.</p>
        </div>
      </section>

      <!-- Section 4: Design decisions -->
      <section class="decisions">
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

      <!-- Section 5: Ecosystem -->
      <section class="ecosystem">
        <span class="section-label">Ecosystem</span>
        <div class="eco-list">
          <a href="/tools/cli" class="eco-item">
            <span class="eco-name">CLI &amp; TUI</span>
            <span class="eco-desc">The reference implementation.</span>
          </a>
          <a href="/tools/mcp" class="eco-item">
            <span class="eco-name">MCP Server</span>
            <span class="eco-desc">Expose your board to any LLM.</span>
          </a>
          <a href="/tools/core" class="eco-item">
            <span class="eco-name">Core Library</span>
            <span class="eco-desc">Build your own integrations.</span>
          </a>
          <a href="/tools/vscode" class="eco-item">
            <span class="eco-name">VSCode Extension</span>
            <span class="eco-desc">Kanban board in your editor.</span>
          </a>
        </div>
      </section>

      <!-- Section 6: Footer -->
      <footer class="home-footer">
        <div class="footer-links">
          <a href="https://github.com/brainfile" target="_blank" rel="noopener">GitHub</a>
          <span class="footer-sep">/</span>
          <a href="https://www.npmjs.com/package/@brainfile/cli" target="_blank" rel="noopener">npm</a>
          <span class="footer-sep">/</span>
          <span class="footer-license">MIT Licensed</span>
        </div>
        <a href="/reference/protocol" class="footer-cta">Read the specification.</a>
        <span class="footer-agent">For agents: <a href="/llms-install.txt">brainfile.md/llms-install.txt</a></span>
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

/* ---- Section 1: Opening ---- */
.opening {
  padding-top: 10rem;
  padding-bottom: 8rem;
}

.wordmark {
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: clamp(3rem, 7vw, 4.5rem);
  letter-spacing: -0.04em;
  line-height: 1;
  color: #f0f0f4;
  margin: 0 0 1.5rem;
}

.headline {
  font-size: clamp(1.15rem, 2.5vw, 1.35rem);
  line-height: 1.5;
  color: #c0c0c8;
  margin: 0 0 0.75rem;
  max-width: 36ch;
}

.subline {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #585868;
  margin: 0 0 2.5rem;
}

.opening-links {
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

/* ---- Section 4: Design decisions ---- */
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

/* ---- Section 5: Ecosystem ---- */
.ecosystem {
  padding-bottom: 8rem;
}

.eco-list {
  display: flex;
  flex-direction: column;
}

.eco-item {
  display: flex;
  align-items: baseline;
  gap: 2rem;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  text-decoration: none;
  transition: background 0.15s;
}

.eco-item:first-child {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.eco-item:hover .eco-name {
  color: #5cc8ff;
}

.eco-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e8e8ec;
  min-width: 180px;
  flex-shrink: 0;
  transition: color 0.15s;
}

.eco-desc {
  font-size: 0.9rem;
  color: #585868;
}

/* ---- Section 6: Footer ---- */
.home-footer {
  padding: 4rem 0 6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.footer-links a {
  color: #585868;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-links a:hover {
  color: #a0a0b0;
}

.footer-sep {
  color: #2a2a38;
}

.footer-license {
  color: #383848;
}

.footer-cta {
  font-size: 0.9rem;
  color: #505060;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-cta:hover {
  color: #5cc8ff;
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

  .eco-item {
    flex-direction: column;
    gap: 0.25rem;
  }

  .eco-name {
    min-width: unset;
  }

  .protocol-hero,
  .how-it-works,
  .decisions,
  .ecosystem {
    padding-bottom: 5rem;
  }

  .code-block {
    padding: 1.25rem;
  }

  .code-block pre {
    font-size: 0.72rem;
  }
}
</style>
