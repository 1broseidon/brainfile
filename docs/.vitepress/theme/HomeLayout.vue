<script setup lang="ts">
import { useData } from 'vitepress'

const { site } = useData()
</script>

<template>
  <div class="home-root">
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
      <!-- Section 1: Opening -->
      <section class="opening">
        <h1 class="wordmark">brainfile</h1>
        <p class="headline">The missing coordination layer for AI agents.</p>
        <p class="subline">Tasks as files. Contracts as code. Validation as proof.<br>Git-native. Vendor-agnostic. MIT licensed.</p>
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

      <!-- Section 2b: Contract Lifecycle -->
      <section class="lifecycle">
        <span class="section-label">A contract has a lifecycle.</span>
        <div class="state-machine">
          <svg viewBox="0 0 750 240" xmlns="http://www.w3.org/2000/svg" class="contract-state-diagram">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a2a38" />
              </marker>
              <marker id="arrow-success" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" />
              </marker>
            </defs>

            <!-- Ready -> In Progress -->
            <line x1="150" y1="60" x2="200" y2="60" class="line success" marker-end="url(#arrow-success)" />
            
            <!-- In Progress -> Delivered -->
            <line x1="340" y1="60" x2="400" y2="60" class="line success" marker-end="url(#arrow-success)" />
            
            <!-- Delivered -> Done -->
            <line x1="540" y1="60" x2="600" y2="60" class="line success" marker-end="url(#arrow-success)" />
            
            <!-- Delivered -> Failed -->
            <line x1="470" y1="80" x2="470" y2="140" class="line" marker-end="url(#arrow)" />
            
            <!-- In Progress -> Failed -->
            <path d="M 340 70 L 370 70 L 370 160 L 400 160" class="line" marker-end="url(#arrow)" />
            
            <!-- In Progress -> Blocked -->
            <line x1="270" y1="80" x2="270" y2="140" class="line" marker-end="url(#arrow)" />
            
            <!-- Blocked -> Ready -->
            <path d="M 200 160 L 80 160 L 80 80" class="line" marker-end="url(#arrow)" />

            <!-- Failed -> Ready -->
            <path d="M 470 180 L 470 210 L 120 210 L 120 80" class="line" marker-end="url(#arrow)" />

            <!-- Box: Ready -->
            <g transform="translate(50, 40)">
              <rect x="0" y="0" width="100" height="40" class="box" />
              <text x="50" y="20" class="text">ready</text>
            </g>
            
            <!-- Box: In Progress -->
            <g transform="translate(200, 40)">
              <rect x="0" y="0" width="140" height="40" class="box success" />
              <text x="70" y="20" class="text success">in_progress</text>
            </g>
            
            <!-- Box: Delivered -->
            <g transform="translate(400, 40)">
              <rect x="0" y="0" width="140" height="40" class="box success" />
              <text x="70" y="20" class="text success">delivered</text>
            </g>
            
            <!-- Box: Done -->
            <g transform="translate(600, 40)">
              <rect x="0" y="0" width="100" height="40" class="box success" />
              <text x="50" y="20" class="text success">done</text>
            </g>
            
            <!-- Box: Blocked -->
            <g transform="translate(200, 140)">
              <rect x="0" y="0" width="140" height="40" class="box blocked" />
              <text x="70" y="20" class="text blocked">blocked</text>
            </g>

            <!-- Box: Failed -->
            <g transform="translate(400, 140)">
              <rect x="0" y="0" width="140" height="40" class="box failed" />
              <text x="70" y="20" class="text failed">failed</text>
            </g>
          </svg>
        </div>
      </section>

      <!-- Section 3: How it works -->
      <section class="how-it-works">
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
        <p class="ecosystem-note">Integrations are optional adapters. The protocol comes first.</p>
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
          <a href="/tools/pi" class="eco-item">
            <span class="eco-name">Pi Extension</span>
            <span class="eco-desc">Showcase orchestrator integration for multi-agent runs.</span>
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

.ecosystem-note {
  margin: 0 0 1rem;
  font-size: 0.88rem;
  color: #585868;
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

  .eco-item {
    flex-direction: column;
    gap: 0.25rem;
  }

  .eco-name {
    min-width: unset;
  }

  .protocol-hero,
  .lifecycle,
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
