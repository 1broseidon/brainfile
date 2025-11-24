---
# Type discriminator - identifies this as a checklist brainfile
type: checklist

# Schema URL for validation - points to checklist-specific schema
schema: https://brainfile.md/v1/checklist.json

# Title of the checklist
title: Production Release Checklist

# Protocol version this file conforms to
protocolVersion: 0.5.0

# Reusable flag - if true, checklist can be reset for repeated use
# Common for procedures that run regularly (releases, deployments, etc.)
reusable: true

# Instructions for AI agents interacting with this checklist
agent:
  instructions:
    - Check off items as they are completed in order
    - Do not skip required items
    - Document any deviations or issues in notes
    - Reset checklist after each release cycle if reusable
  llmNotes: This is a production release checklist ensuring all steps are completed before deploying

# Rules that apply to this checklist
rules:
  always:
    - id: 1
      rule: complete all required items before proceeding to deployment
    - id: 2
      rule: document any issues or blockers encountered
  never:
    - id: 1
      rule: skip security scanning or testing steps
    - id: 2
      rule: deploy if any critical items are incomplete
  prefer:
    - id: 1
      rule: deploy during low-traffic hours (after 10pm PT)
  context:
    - id: 1
      rule: this checklist applies to production releases only
    - id: 2
      rule: hotfixes follow a separate expedited checklist

# Items represent individual checklist steps
# Unlike board tasks, checklist items are flat (no subtasks) and sequential
items:
  # === Pre-Release Phase ===
  
  - id: step-1
    # Title/description of the step
    title: Create release branch from main
    # Completion status - boolean flag
    completed: false
    # Required flag - if true, this step must be completed
    required: true
    # Category for grouping related steps
    category: pre-release
    # Who is responsible for this step (optional)
    assignee: release-manager
    # Estimated time to complete
    estimatedTime: "5 minutes"
    # Detailed instructions or checklist within the item
    notes: |
      - Branch name: `release/vX.Y.Z`
      - Update version numbers in package.json
      - Create release PR to main
  
  - id: step-2
    title: Run full test suite
    completed: false
    required: true
    category: pre-release
    assignee: qa-lead
    estimatedTime: "15 minutes"
    notes: |
      Run: `npm run test:all`
      - Unit tests (>95% coverage)
      - Integration tests
      - E2E tests
      All tests must pass before proceeding.
    # Link to related documentation
    url: https://docs.example.com/testing
  
  - id: step-3
    title: Run security scan
    completed: false
    required: true
    category: pre-release
    assignee: security-team
    estimatedTime: "10 minutes"
    notes: |
      Run: `npm audit --audit-level=moderate`
      - Check for vulnerable dependencies
      - Review and fix any HIGH or CRITICAL issues
      - Document any accepted risks in SECURITY.md
  
  - id: step-4
    title: Update CHANGELOG.md
    completed: false
    required: true
    category: pre-release
    assignee: release-manager
    estimatedTime: "20 minutes"
    notes: |
      Add section for new version:
      - Features added
      - Bugs fixed
      - Breaking changes (if any)
      - Migration guide (if needed)
  
  - id: step-5
    title: Review database migrations
    completed: false
    required: true
    category: pre-release
    assignee: backend-lead
    estimatedTime: "15 minutes"
    notes: |
      - Verify all migrations are idempotent
      - Test rollback procedures
      - Document any required manual steps
      - Check migration order and dependencies
  
  - id: step-6
    title: Build and tag Docker images
    completed: false
    required: true
    category: pre-release
    assignee: devops
    estimatedTime: "10 minutes"
    notes: |
      Run: `./scripts/build-release.sh vX.Y.Z`
      - Build production images
      - Tag with version number
      - Push to container registry
      - Verify image sizes are reasonable
  
  # === Staging Deployment ===
  
  - id: step-7
    title: Deploy to staging environment
    completed: false
    required: true
    category: staging
    assignee: devops
    estimatedTime: "5 minutes"
    notes: |
      Run: `./scripts/deploy-staging.sh vX.Y.Z`
      - Deploy new version to staging
      - Monitor deployment logs for errors
      - Verify all services start successfully
  
  - id: step-8
    title: Run smoke tests on staging
    completed: false
    required: true
    category: staging
    assignee: qa-lead
    estimatedTime: "20 minutes"
    notes: |
      Run: `npm run test:smoke -- --env=staging`
      - Test critical user flows
      - Verify API endpoints
      - Check authentication
      - Test database connections
  
  - id: step-9
    title: Performance testing on staging
    completed: false
    required: true
    category: staging
    assignee: qa-lead
    estimatedTime: "30 minutes"
    notes: |
      Run load tests:
      - P95 latency under load
      - Memory usage stable
      - No connection leaks
      Target: <200ms P95 for API calls
  
  - id: step-10
    title: UAT (User Acceptance Testing) on staging
    completed: false
    required: false
    category: staging
    assignee: product-team
    estimatedTime: "60 minutes"
    notes: |
      Optional but recommended for major releases:
      - Product team validates new features
      - Test with production-like data
      - Verify UI/UX changes
  
  # === Pre-Production Verification ===
  
  - id: step-11
    title: Review deployment plan
    completed: false
    required: true
    category: production-prep
    assignee: release-manager
    estimatedTime: "15 minutes"
    notes: |
      Verify:
      - Deployment window scheduled
      - Rollback plan documented
      - Team availability confirmed
      - Customer notification sent (if needed)
  
  - id: step-12
    title: Create database backup
    completed: false
    required: true
    category: production-prep
    assignee: devops
    estimatedTime: "10 minutes"
    notes: |
      Run: `./scripts/backup-production.sh`
      - Full database backup
      - Verify backup integrity
      - Store in secure location
      - Document restore procedure
  
  - id: step-13
    title: Enable maintenance mode (optional)
    completed: false
    required: false
    category: production-prep
    assignee: devops
    estimatedTime: "2 minutes"
    notes: |
      Optional for breaking changes:
      - Enable maintenance page
      - Notify users via status page
      - Disable background jobs
  
  # === Production Deployment ===
  
  - id: step-14
    title: Deploy to production
    completed: false
    required: true
    category: production
    assignee: devops
    estimatedTime: "10 minutes"
    notes: |
      Run: `./scripts/deploy-production.sh vX.Y.Z`
      - Deploy using blue-green strategy
      - Monitor deployment progress
      - Watch error rates in real-time
    # Blockers - dependencies on other steps
    dependsOn:
      - step-1
      - step-2
      - step-3
      - step-11
      - step-12
  
  - id: step-15
    title: Run database migrations
    completed: false
    required: true
    category: production
    assignee: backend-lead
    estimatedTime: "5 minutes"
    notes: |
      Run: `npm run migrate:production`
      - Execute migrations in order
      - Monitor migration logs
      - Verify schema changes
      DO NOT proceed if migrations fail
  
  - id: step-16
    title: Verify production health
    completed: false
    required: true
    category: production
    assignee: devops
    estimatedTime: "15 minutes"
    notes: |
      Check all monitoring dashboards:
      - Application logs (no errors)
      - HTTP status codes (200s dominant)
      - Response times (within SLA)
      - Database connections stable
      - Queue lengths normal
  
  - id: step-17
    title: Run production smoke tests
    completed: false
    required: true
    category: production
    assignee: qa-lead
    estimatedTime: "10 minutes"
    notes: |
      Run: `npm run test:smoke -- --env=production`
      - Test critical paths
      - Verify new features work
      - Check integrations (Stripe, SendGrid, etc.)
  
  - id: step-18
    title: Monitor error rates for 30 minutes
    completed: false
    required: true
    category: production
    assignee: on-call-engineer
    estimatedTime: "30 minutes"
    notes: |
      Watch Datadog/Sentry dashboards:
      - Error rate should be stable
      - No new error types
      - Customer support tickets normal
      If errors spike, initiate rollback
  
  # === Post-Deployment ===
  
  - id: step-19
    title: Disable maintenance mode (if enabled)
    completed: false
    required: false
    category: post-deployment
    assignee: devops
    estimatedTime: "2 minutes"
    notes: |
      If maintenance mode was enabled:
      - Remove maintenance page
      - Re-enable background jobs
      - Update status page
  
  - id: step-20
    title: Tag release in GitHub
    completed: false
    required: true
    category: post-deployment
    assignee: release-manager
    estimatedTime: "5 minutes"
    notes: |
      Create GitHub release:
      - Tag: vX.Y.Z
      - Title: "Version X.Y.Z"
      - Copy changelog content
      - Mark as latest release
  
  - id: step-21
    title: Update documentation
    completed: false
    required: true
    category: post-deployment
    assignee: tech-writer
    estimatedTime: "30 minutes"
    notes: |
      Update docs.example.com:
      - API documentation
      - Feature guides
      - Migration guides
      - Version compatibility matrix
  
  - id: step-22
    title: Notify stakeholders
    completed: false
    required: true
    category: post-deployment
    assignee: product-manager
    estimatedTime: "10 minutes"
    notes: |
      Send notifications:
      - Internal team announcement (Slack)
      - Customer email (if major release)
      - Social media post (if applicable)
      - Update status page
  
  - id: step-23
    title: Post-mortem (if issues occurred)
    completed: false
    required: false
    category: post-deployment
    assignee: release-manager
    estimatedTime: "60 minutes"
    notes: |
      If any issues during deployment:
      - Document what went wrong
      - Timeline of events
      - Root cause analysis
      - Action items to prevent recurrence
      - Share with team
  
  - id: step-24
    title: Schedule next release
    completed: false
    required: false
    category: post-deployment
    assignee: product-manager
    estimatedTime: "10 minutes"
    notes: |
      Plan next release:
      - Set target date
      - Create release milestone
      - Prioritize features
      - Update roadmap

# Metadata about checklist execution
execution:
  # Last time this checklist was used
  lastRun: "2025-11-18T22:00:00Z"
  # Person who ran this checklist
  lastRunBy: alice
  # Version that was released
  lastRelease: "v1.5.0"
  # How long the release took
  duration: "2 hours 15 minutes"
  # Any issues encountered
  issues:
    - "Migration step-15 took longer than expected (15 min vs 5 min)"
    - "Staging smoke tests failed first run - fixed auth config"
  # Next scheduled run
  nextScheduled: "2025-12-02T22:00:00Z"

# Statistics about the checklist
stats:
  totalItems: 24
  required: 18
  optional: 6
  byCategory:
    pre-release: 6
    staging: 4
    production-prep: 3
    production: 5
    post-deployment: 6
  estimatedTotalTime: "5 hours 20 minutes"
  averageCompletionTime: "2 hours 30 minutes"
---

# Production Release Checklist

A comprehensive checklist for safely deploying new versions to production.

## Purpose

This checklist ensures:
- **Quality**: All testing and validation steps completed
- **Security**: Security scans and reviews performed
- **Reliability**: Proper monitoring and rollback plans
- **Communication**: Stakeholders informed at each stage

## How to Use

1. **Reset**: Reset all `completed: false` when starting a new release
2. **Sequential**: Complete items in order (some have dependencies)
3. **Required vs Optional**: All required items must be completed
4. **Document Issues**: Add notes if anything goes wrong
5. **Archive**: Save completed checklists for audit trail

## Categories

### 🔧 Pre-Release
Preparation work before any deployment. Includes code review, testing, and documentation.

### 🧪 Staging
Validation on staging environment. Must pass before production.

### 📋 Production Prep
Final checks before production deployment. Create backups and verify readiness.

### 🚀 Production
Actual production deployment. Monitor closely and be ready to rollback.

### ✅ Post-Deployment
Cleanup, documentation, and communication after successful deployment.

## Rollback Procedure

If issues are detected during production deployment:

1. **Stop**: Halt deployment immediately
2. **Assess**: Determine severity (minor bug vs. critical failure)
3. **Decide**: Fix forward or rollback?
4. **Execute**: Run `./scripts/rollback-production.sh` if rolling back
5. **Monitor**: Watch for stability after rollback
6. **Post-Mortem**: Document and learn from the incident

## SLA Targets

- **Deployment Window**: 10pm - 2am PT (low traffic)
- **Downtime**: < 5 minutes (blue-green deployment)
- **Rollback Time**: < 10 minutes if needed
- **Error Rate**: < 0.5% during deployment
- **Response Time**: P95 < 200ms after deployment

## Deployment Frequency

- **Major Releases**: Monthly (first Monday)
- **Minor Releases**: Bi-weekly (every other Monday)
- **Hotfixes**: As needed (expedited checklist)

## Related Checklists

- [Hotfix Deployment Checklist](./hotfix-checklist.md)
- [Staging Environment Setup](./staging-setup.md)
- [Incident Response Checklist](./incident-response.md)

## Version History

- **v1.0** (2025-10-01): Initial checklist
- **v1.1** (2025-10-15): Added security scan step
- **v1.2** (2025-11-01): Added performance testing
- **v1.3** (2025-11-24): Split into categories, added dependencies



