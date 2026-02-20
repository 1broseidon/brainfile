<template>
  <section class="how-it-works fade-section">
    <span class="section-label">How it works.</span>
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
</template>

<style scoped>
.how-it-works {
  padding-bottom: 8rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-label {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #505060;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1.25rem;
  text-align: center;
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
