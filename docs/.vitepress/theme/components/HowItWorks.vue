<template>
  <section class="how-it-works fade-section">
    <div class="section-header">
      <h2 class="section-title">How It Works</h2>
      <div class="section-divider"></div>
    </div>
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

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 3rem;
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

.step {
  display: flex;
  align-items: baseline;
  gap: 2rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid #21262d;
}

.step:first-child {
  border-top: 1px solid #21262d;
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
  color: #7d8590;
}

.step-keyword {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  font-weight: 500;
  color: #c9d1d9;
}

.step-desc {
  font-size: 0.95rem;
  color: #9198a1;
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
