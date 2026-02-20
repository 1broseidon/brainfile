<script setup lang="ts">
interface Row {
  criteria: string
  brainfile: { icon: '✓' | '✗' | '~'; text: string }
  jira: { icon: '✓' | '✗' | '~'; text: string }
  aiChat: { icon: '✓' | '✗' | '~'; text: string }
}

const rows: Row[] = [
  {
    criteria: 'Agent-native',
    brainfile: { icon: '✓', text: 'Contracts with validation' },
    jira: { icon: '✗', text: 'Human-only UI' },
    aiChat: { icon: '~', text: 'Unstructured' },
  },
  {
    criteria: 'Version controlled',
    brainfile: { icon: '✓', text: 'Git-native files' },
    jira: { icon: '✗', text: 'External database' },
    aiChat: { icon: '✗', text: 'Ephemeral' },
  },
  {
    criteria: 'Works offline',
    brainfile: { icon: '✓', text: 'Local filesystem' },
    jira: { icon: '✗', text: 'Cloud required' },
    aiChat: { icon: '✗', text: 'API required' },
  },
  {
    criteria: 'Automated validation',
    brainfile: { icon: '✓', text: 'Shell commands' },
    jira: { icon: '✗', text: 'Manual review' },
    aiChat: { icon: '✗', text: 'No verification' },
  },
  {
    criteria: 'Human-compatible',
    brainfile: { icon: '✓', text: 'Markdown readable' },
    jira: { icon: '✓', text: 'Rich UI' },
    aiChat: { icon: '✓', text: 'Natural language' },
  },
  {
    criteria: 'Vendor lock-in',
    brainfile: { icon: '✓', text: 'Open protocol' },
    jira: { icon: '✗', text: 'Proprietary' },
    aiChat: { icon: '✗', text: 'Provider-specific' },
  },
]

function iconClass(icon: string): string {
  if (icon === '✓') return 'icon-check'
  if (icon === '✗') return 'icon-x'
  return 'icon-tilde'
}
</script>

<template>
  <section class="comparison">
    <span class="section-label">How brainfile compares</span>
    <div class="table-wrapper">
      <table class="comparison-table">
        <thead>
          <tr>
            <th class="col-criteria">Criteria</th>
            <th class="col-tool">Brainfile</th>
            <th class="col-tool">Jira / Linear</th>
            <th class="col-tool">AI Chat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i">
            <td class="cell-criteria">{{ row.criteria }}</td>
            <td class="cell-value">
              <span :class="iconClass(row.brainfile.icon)">{{ row.brainfile.icon }}</span>
              <span class="cell-text">{{ row.brainfile.text }}</span>
            </td>
            <td class="cell-value">
              <span :class="iconClass(row.jira.icon)">{{ row.jira.icon }}</span>
              <span class="cell-text">{{ row.jira.text }}</span>
            </td>
            <td class="cell-value">
              <span :class="iconClass(row.aiChat.icon)">{{ row.aiChat.icon }}</span>
              <span class="cell-text">{{ row.aiChat.text }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.comparison {
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

.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(10, 10, 14, 0.3);
}

.comparison-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
  line-height: 1.5;
}

/* Header */
.comparison-table thead tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.comparison-table th {
  padding: 1rem 1.25rem;
  text-align: left;
  font-weight: 500;
  font-size: 0.72rem;
  color: #505060;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: transparent;
  white-space: nowrap;
}

.col-criteria {
  width: 22%;
}

.col-tool {
  width: 26%;
}

/* Body rows */
.comparison-table tbody tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  transition: background 0.15s;
}

.comparison-table tbody tr:last-child {
  border-bottom: none;
}

.comparison-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.comparison-table td {
  padding: 0.85rem 1.25rem;
  vertical-align: baseline;
  background: transparent;
}

/* Criteria column */
.cell-criteria {
  color: #c0c0c8;
  font-weight: 500;
  white-space: nowrap;
}

/* Value cells */
.cell-value {
  display: table-cell;
  color: #707080;
}

.cell-text {
  margin-left: 0.5rem;
}

/* Icon colors */
.icon-check {
  color: #5cc8ff;
}

.icon-x {
  color: #ff5555;
}

.icon-tilde {
  color: #ffb86c;
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .comparison {
    padding-bottom: 5rem;
  }

  .table-wrapper {
    margin-left: -0.5rem;
    margin-right: -0.5rem;
    border-radius: 6px;
  }

  .comparison-table {
    font-size: 0.75rem;
  }

  .comparison-table th,
  .comparison-table td {
    padding: 0.7rem 0.85rem;
  }
}
</style>
