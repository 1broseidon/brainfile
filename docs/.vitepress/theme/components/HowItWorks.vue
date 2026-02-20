<template>
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
</template>

<style scoped>
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

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .step {
    flex-direction: column;
    gap: 0.25rem;
  }

  .step-left {
    min-width: unset;
  }

  .how-it-works {
    padding-bottom: 5rem;
  }
}
</style>
