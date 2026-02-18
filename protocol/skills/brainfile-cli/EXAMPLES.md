# Brainfile CLI Examples

Real-world examples of using brainfile CLI for task management and multi-agent coordination.

## Example 1: Backend API Feature

**Scenario:** PM needs to delegate API endpoint implementation to backend specialist agent.

```bash
brainfile add -c todo \
  --title "Add user profile API endpoints" \
  --description "Implement CRUD endpoints for user profiles with proper validation and error handling. Should support avatar uploads and bio text. See existing user model in src/models/user.ts for schema." \
  --assignee codex \
  --priority high \
  --tags feature,backend,api \
  --with-contract \
  --deliverable "file:src/api/routes/profile.ts:Express route handlers" \
  --deliverable "file:src/api/controllers/profileController.ts:Business logic" \
  --deliverable "test:src/__tests__/api/profile.test.ts:Integration tests" \
  --deliverable "docs:docs/api/profile.md:API documentation" \
  --validation "npm test -- profile" \
  --validation "npm run lint" \
  --validation "npm run build" \
  --constraint "Use existing auth middleware for authentication" \
  --constraint "Validate inputs with Zod schemas" \
  --constraint "Return consistent error format matching ErrorResponse type" \
  --constraint "Support multipart/form-data for avatar uploads"
```

**Expected workflow:**
1. Agent `codex` picks up: `brainfile contract pickup -t task-XXX`
2. Agent implements all deliverables
3. Agent delivers: `brainfile contract deliver -t task-XXX`
4. PM validates: `brainfile contract validate -t task-XXX`
5. Tests pass → status becomes `done`
6. PM moves to done: `brainfile move -t task-XXX -c done`

## Example 2: Frontend Component with Design Review

**Scenario:** UI component needs implementation and design review cycle.

```bash
brainfile add -c todo \
  --title "Build responsive dashboard widget system" \
  --description "Create reusable widget components for dashboard. Widgets should be draggable, resizable, and support dark mode. Reference Figma design: https://figma.com/dashboard-widgets" \
  --assignee cursor \
  --priority medium \
  --tags feature,frontend,ui \
  --with-contract \
  --deliverable "file:src/components/Widget/Widget.tsx:Base widget component" \
  --deliverable "file:src/components/Widget/WidgetGrid.tsx:Grid layout container" \
  --deliverable "file:src/components/Widget/types.ts:TypeScript interfaces" \
  --deliverable "file:src/components/Widget/Widget.stories.tsx:Storybook stories" \
  --deliverable "test:src/__tests__/components/Widget.test.tsx:Component tests" \
  --validation "npm test -- Widget" \
  --validation "npm run storybook:build" \
  --constraint "Use react-grid-layout for drag-and-drop" \
  --constraint "Support min/max size constraints per widget type" \
  --constraint "Persist layout to localStorage" \
  --constraint "Match design system spacing and colors"
```

**With rework cycle:**

```bash
# After delivery, PM validates
brainfile contract validate -t task-XXX
# Tests fail

# PM manually edits YAML, adds feedback:
# contract.feedback: |
#   Widget resize is jerky on mobile viewports.
#   Dark mode colors don't match design tokens in theme.ts.
#   Missing accessibility labels for drag handles.

# PM changes status from 'failed' to 'ready'

# Agent sees rework needed
brainfile list --contract ready  # Shows task-XXX with reworkCount: 1

# Agent picks up again
brainfile contract pickup -t task-XXX
# Reads feedback, makes fixes, delivers again
brainfile contract deliver -t task-XXX

# PM validates successfully this time
brainfile contract validate -t task-XXX  # → done
```

## Example 3: Documentation Research Task

**Scenario:** Need comprehensive docs but no executable validation.

```bash
brainfile add -c todo \
  --title "Document WebSocket architecture" \
  --description "Create comprehensive documentation for our WebSocket implementation including connection lifecycle, message protocols, error handling, and scaling considerations." \
  --assignee gemini \
  --priority medium \
  --tags docs,research \
  --with-contract \
  --deliverable "docs:docs/architecture/websocket.md:Main architecture doc" \
  --deliverable "docs:docs/guides/websocket-client.md:Client integration guide" \
  --deliverable "docs:docs/guides/websocket-scaling.md:Scaling and deployment guide" \
  --deliverable "file:diagrams/websocket-flow.mmd:Mermaid sequence diagrams" \
  --constraint "Include code examples for common use cases" \
  --constraint "Document all event types and payloads" \
  --constraint "Explain Redis pub/sub for multi-instance scaling"
```

**Note:** No `--validation` commands because docs require manual review. PM must manually validate by reading the docs and either:
- Edit YAML to set status to `done`
- Edit YAML to add feedback and reset to `ready` for rework

## Example 4: Bug Fix with Root Cause Analysis

**Scenario:** Critical bug that needs investigation and fix.

```bash
brainfile add -c todo \
  --title "Fix memory leak in WebSocket connections" \
  --description "Users report browser memory usage climbing after 30+ minutes of use. Suspect WebSocket event listeners aren't being cleaned up. Chrome DevTools shows DOM nodes retained after disconnect." \
  --assignee codex \
  --priority critical \
  --tags bug,performance \
  --with-contract \
  --deliverable "file:src/services/websocket.ts:Fixed connection cleanup" \
  --deliverable "test:src/__tests__/services/websocket.test.ts:Tests for cleanup logic" \
  --deliverable "research:docs/postmortems/websocket-leak-2025-12.md:Root cause analysis" \
  --validation "npm test -- websocket" \
  --validation "npm run build" \
  --constraint "Ensure all event listeners are removed on disconnect" \
  --constraint "Clear any timers or intervals" \
  --constraint "Document the root cause in postmortem"
```

## Example 5: Multi-Agent Parallel Work

**Scenario:** Large feature split across frontend and backend agents.

```bash
# Backend task
brainfile add -c todo \
  --title "Real-time notifications API" \
  --assignee codex \
  --tags feature,backend,sprint-5 \
  --with-contract \
  --deliverable "file:src/api/notifications.ts:Notification endpoints" \
  --deliverable "file:src/services/notificationService.ts:Business logic" \
  --deliverable "test:src/__tests__/api/notifications.test.ts:Tests" \
  --validation "npm test -- notifications"

# Frontend task (depends on backend contract)
brainfile add -c todo \
  --title "Real-time notifications UI" \
  --assignee cursor \
  --tags feature,frontend,sprint-5 \
  --description "Implement notification bell UI and toast system. DEPENDS ON: task-XXX (backend API must be done first)" \
  --with-contract \
  --deliverable "file:src/components/NotificationBell.tsx:Bell icon component" \
  --deliverable "file:src/components/NotificationToast.tsx:Toast component" \
  --deliverable "file:src/hooks/useNotifications.ts:WebSocket hook" \
  --validation "npm test -- Notification"
```

**Workflow:**
1. Backend agent picks up and completes first
2. PM validates backend work
3. PM notifies frontend agent (or they check `brainfile list -t sprint-5`)
4. Frontend agent picks up and implements
5. Integration testing happens after both deliver

## Example 6: Subtask Tracking for Complex Deliverable

**Scenario:** Single contract with many subtasks to track progress.

```bash
# Create task with contract
brainfile add -c todo \
  --title "Migrate to PostgreSQL" \
  --assignee codex \
  --priority high \
  --with-contract \
  --deliverable "file:src/db/schema.sql:PostgreSQL schema" \
  --deliverable "file:src/db/migrations/001-initial.sql:Migration scripts" \
  --deliverable "file:src/config/database.ts:Connection config" \
  --validation "npm run db:test"

# Add subtasks to track individual steps
brainfile subtask --add "Set up PostgreSQL locally" -t task-XXX
brainfile subtask --add "Convert user model to SQL" -t task-XXX
brainfile subtask --add "Convert post model to SQL" -t task-XXX
brainfile subtask --add "Write migration scripts" -t task-XXX
brainfile subtask --add "Update connection config" -t task-XXX
brainfile subtask --add "Run migration on staging" -t task-XXX

# Agent toggles subtasks as they complete each step
brainfile subtask --toggle sub-1 -t task-XXX  # Setup done
brainfile subtask --toggle sub-2 -t task-XXX  # User model done
# ... etc
```

## Example 7: Using Filters for Sprint Planning

```bash
# Create sprint tasks
brainfile add -c todo --title "Feature A" --tags sprint-6,frontend
brainfile add -c todo --title "Feature B" --tags sprint-6,backend
brainfile add -c todo --title "Feature C" --tags sprint-6,frontend

# View sprint backlog
brainfile list -t sprint-6

# See what's in progress
brainfile list -c in-progress -t sprint-6

# Check contract status
brainfile list --contract in_progress -t sprint-6
brainfile list --contract delivered -t sprint-6
```

## Example 8: Manual Validation Workflow

**Scenario:** Task requires subjective review (e.g., design, UX).

```bash
brainfile add -c todo \
  --title "Redesign landing page" \
  --assignee cursor \
  --with-contract \
  --deliverable "file:src/pages/Landing.tsx:New landing page" \
  --deliverable "file:src/styles/landing.module.css:Styles" \
  --deliverable "design:figma-export/landing-final.png:Final design screenshot"
  # Note: NO --validation commands because this needs manual review
```

**After delivery:**

```bash
# PM reviews manually
brainfile show -t task-XXX
# Opens files, tests in browser, reviews design

# Option 1: Approve
# Edit YAML: change status from 'delivered' to 'done'

# Option 2: Request changes
# Edit YAML:
#   - Change status to 'ready'
#   - Add contract.feedback:
#     "Hero section needs more whitespace. CTA button should be primary color.
#      Mobile layout breaks on iPhone SE viewport."
```

## Example 9: Blocked Contract

**Scenario:** Agent can't proceed due to external dependency.

```bash
# Agent picks up task
brainfile contract pickup -t task-XXX

# Agent realizes they need API credentials that only PM can provide
# Agent manually edits YAML:
#   - Change status to 'blocked'
#   - Add contract.feedback: "Need AWS S3 credentials for file upload testing"

# PM sees blocked task
brainfile list --contract blocked  # Shows task-XXX

# PM resolves blocker (shares credentials), then:
# Edit YAML: change status from 'blocked' to 'in_progress'

# Agent continues work
```

## Example 10: Quick Task Without Contract

**Scenario:** Simple fix that doesn't need formal contract.

```bash
# Just a regular task, no contract
brainfile add -c todo \
  --title "Fix typo in README" \
  --assignee human \
  --priority low \
  --tags docs

# Human does it immediately
brainfile move -t task-XXX -c done
```

**Use contracts for:**
- Work delegated to external agents
- Deliverables that need validation
- Complex multi-file changes
- Anything requiring accountability/tracking

**Skip contracts for:**
- Immediate fixes you're doing yourself
- Trivial tasks
- Internal subagent work (@research, @review)

## Example 11: Amending a Contract Mid-Flight

**Scenario:** Requirements change while agent is working.

```bash
# Agent is in-progress on task
brainfile show -t task-XXX  # status: in_progress

# PM needs to add another deliverable
# PM manually edits YAML:
#   - Increment contract.version from 1 to 2
#   - Add new deliverable to contract.deliverables array
#   - Add note to contract.feedback explaining the change

# Agent sees the update next time they check
brainfile show -t task-XXX  # Sees version: 2 and feedback
```

**Best practice:** Avoid amending contracts unless necessary. Better to create a follow-up task.

## Example 12: Rework Metrics

**Scenario:** Tracking how many iterations a task took.

```bash
# After multiple rework cycles, check metrics
brainfile show -t task-XXX

# Output includes:
# contract:
#   metrics:
#     pickedUpAt: "2025-12-17T09:00:00Z"
#     deliveredAt: "2025-12-17T15:30:00Z"
#     duration: 23400  # seconds (6.5 hours)
#     reworkCount: 2   # Failed validation twice

# Useful for:
# - Estimating future similar tasks
# - Identifying unclear contracts (high reworkCount)
# - Agent performance tracking
```

## Common Patterns

### Pattern: Feature with Tests and Docs

```bash
brainfile add -c todo --with-contract \
  --title "Feature Name" \
  --deliverable "file:src/feature.ts:Implementation" \
  --deliverable "test:src/__tests__/feature.test.ts:Tests" \
  --deliverable "docs:docs/feature.md:Documentation" \
  --validation "npm test -- feature" \
  --validation "npm run build"
```

### Pattern: Bug with Root Cause

```bash
brainfile add -c todo --with-contract \
  --title "Fix: Bug Description" \
  --tags bug \
  --deliverable "file:src/buggy-file.ts:Fix" \
  --deliverable "test:src/__tests__/buggy-file.test.ts:Regression test" \
  --deliverable "research:docs/postmortems/bug-YYYY-MM-DD.md:Root cause analysis" \
  --validation "npm test"
```

### Pattern: Research with Summary

```bash
brainfile add -c todo --with-contract \
  --title "Research: Topic" \
  --assignee gemini \
  --deliverable "research:docs/research/topic.md:Findings and recommendations"
```

### Pattern: Refactoring with Safety Checks

```bash
brainfile add -c todo --with-contract \
  --title "Refactor: Module Name" \
  --deliverable "file:src/refactored.ts:Refactored code" \
  --validation "npm test" \
  --validation "npm run build" \
  --validation "npm run lint" \
  --constraint "Must pass all existing tests" \
  --constraint "No breaking API changes"
```

## Tips for Effective Contracts

1. **Deliverable paths are relative to project root**
   ```bash
   # Good
   --deliverable "file:src/api/users.ts:Implementation"

   # Bad
   --deliverable "file:/home/user/project/src/api/users.ts:Implementation"
   ```

2. **Validation commands should be specific**
   ```bash
   # Good - tests only relevant code
   --validation "npm test -- users"

   # Okay but slower
   --validation "npm test"
   ```

3. **Use constraints for non-negotiables**
   ```bash
   --constraint "Must handle errors gracefully"
   --constraint "Use existing authentication middleware"
   --constraint "Follow naming conventions in STYLE_GUIDE.md"
   ```

4. **Use outOfScope to prevent scope creep**
   ```yaml
   outOfScope:
     - "Admin UI - handle in separate task"
     - "Email notifications - not part of MVP"
   ```

5. **Reference related files in task description**
   ```bash
   --description "Extend user authentication. See existing implementation in src/auth/passport.ts and session handling in src/middleware/session.ts"
   ```

6. **Use tags for organization**
   ```bash
   --tags sprint-5,backend,api,critical
   # Later: brainfile list -t sprint-5 -t critical
   ```
