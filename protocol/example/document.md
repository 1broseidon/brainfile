---
# Type discriminator - identifies this as a document brainfile
type: document

# Schema URL for validation - points to document-specific schema
schema: https://brainfile.md/v1/document.json

# Title of the document
title: "RFC-001: Multi-Tenant Authentication Architecture"

# Protocol version this file conforms to
protocolVersion: 0.5.0

# Document lifecycle status: draft, review, approved, rejected, implemented, deprecated
status: draft

# Authors who wrote this document
authors:
  - alice
  - bob

# Reviewers assigned to review this document
reviewers:
  - carol
  - david
  - eve

# When this document was created
createdAt: "2025-11-20T10:00:00Z"

# When this document was last updated
updatedAt: "2025-11-24T14:30:00Z"

# Target version this will be implemented in
targetVersion: "v2.0.0"

# Tags for categorization
tags:
  - architecture
  - authentication
  - multi-tenant
  - security
  - rfc

# Document-specific metadata
metadata:
  # RFC number (for tracking)
  rfcNumber: "001"
  # Category of RFC: architecture, api, process, standard
  category: architecture
  # Priority/urgency: low, medium, high, critical
  priority: high
  # Estimated effort: small, medium, large
  effort: large
  # Stakeholders who should be aware
  stakeholders:
    - product-team
    - security-team
    - backend-team
    - devops-team
  # Related RFCs or documents
  related:
    - RFC-002: API Gateway Design
    - ADR-015: JWT Token Strategy

# Instructions for AI agents interacting with this document
agent:
  instructions:
    - Preserve the RFC structure when editing
    - Update the "updatedAt" timestamp when making changes
    - Keep the "Summary" section under 3 paragraphs
    - Add review comments to the "Review Comments" section
    - Move status to "review" when ready for team review
  llmNotes: This is an RFC (Request for Comments) document proposing a multi-tenant authentication architecture

# Rules for maintaining this document
rules:
  always:
    - id: 1
      rule: update status as the RFC progresses through stages
    - id: 2
      rule: document all review feedback and resolutions
  prefer:
    - id: 1
      rule: diagrams and examples over lengthy prose
    - id: 2
      rule: concrete implementation details over abstract concepts
  context:
    - id: 1
      rule: this RFC addresses authentication for our SaaS platform
    - id: 2
      rule: current system is single-tenant with basic auth

# Section structure defines the document outline
# Each section has metadata tracked in frontmatter
sections:
  - id: summary
    title: Summary
    required: true
    order: 1
    wordCount: 156
    lastUpdated: "2025-11-24T14:30:00Z"
  
  - id: motivation
    title: Motivation
    required: true
    order: 2
    wordCount: 342
    lastUpdated: "2025-11-22T10:15:00Z"
  
  - id: goals
    title: Goals and Non-Goals
    required: true
    order: 3
    wordCount: 228
    lastUpdated: "2025-11-22T11:00:00Z"
  
  - id: proposal
    title: Proposed Solution
    required: true
    order: 4
    wordCount: 856
    lastUpdated: "2025-11-23T15:45:00Z"
  
  - id: api
    title: API Design
    required: true
    order: 5
    wordCount: 445
    lastUpdated: "2025-11-24T09:30:00Z"
  
  - id: database
    title: Database Schema
    required: true
    order: 6
    wordCount: 312
    lastUpdated: "2025-11-23T16:20:00Z"
  
  - id: security
    title: Security Considerations
    required: true
    order: 7
    wordCount: 523
    lastUpdated: "2025-11-24T11:00:00Z"
  
  - id: alternatives
    title: Alternatives Considered
    required: true
    order: 8
    wordCount: 387
    lastUpdated: "2025-11-22T14:00:00Z"
  
  - id: migration
    title: Migration Plan
    required: true
    order: 9
    wordCount: 267
    lastUpdated: "2025-11-24T13:15:00Z"
  
  - id: testing
    title: Testing Strategy
    required: false
    order: 10
    wordCount: 198
    lastUpdated: "2025-11-24T14:00:00Z"
  
  - id: timeline
    title: Implementation Timeline
    required: false
    order: 11
    wordCount: 145
    lastUpdated: "2025-11-24T14:30:00Z"

# Review comments and feedback
# Track reviewer feedback inline with the document
reviewComments:
  - id: comment-1
    reviewer: carol
    section: proposal
    timestamp: "2025-11-23T10:00:00Z"
    status: open
    priority: high
    comment: "Consider using OAuth2 instead of custom JWT implementation for better ecosystem compatibility."
    response: "Good point. Will add OAuth2 comparison to alternatives section."
  
  - id: comment-2
    reviewer: david
    section: database
    timestamp: "2025-11-23T14:30:00Z"
    status: resolved
    priority: medium
    comment: "Should we partition tables by tenant for better isolation and performance?"
    response: "Added section on database partitioning strategy. Will use schema-per-tenant approach."
    resolvedAt: "2025-11-24T09:00:00Z"
  
  - id: comment-3
    reviewer: eve
    section: security
    timestamp: "2025-11-24T08:00:00Z"
    status: open
    priority: high
    comment: "What's the strategy for handling tenant-to-tenant data leakage? Need stronger guarantees."
    response: "Will add detailed section on tenant isolation mechanisms and audit logging."

# Decision log for major choices made
decisions:
  - id: decision-1
    date: "2025-11-21T10:00:00Z"
    decision: "Use JWT tokens with tenant claim"
    rationale: "Stateless, scalable, works with our existing infrastructure. Tenant claim ensures context is always available."
    alternatives:
      - "Session-based auth (rejected: requires sticky sessions)"
      - "OAuth2 only (rejected: too complex for our use case)"
  
  - id: decision-2
    date: "2025-11-22T14:00:00Z"
    decision: "Schema-per-tenant database isolation"
    rationale: "Strong isolation, easier backups per tenant, supports tenant-specific migrations. Trade-off: more complex connection pooling."
    alternatives:
      - "Shared schema with tenant_id column (rejected: data leakage risk)"
      - "Database-per-tenant (rejected: too many databases to manage)"
  
  - id: decision-3
    date: "2025-11-23T11:00:00Z"
    decision: "Tenant subdomain routing (tenant.app.example.com)"
    rationale: "Clear tenant context, supports custom domains later, no path-based confusion."
    alternatives:
      - "Path-based (/tenant/app) (rejected: uglier URLs, CORS complexity)"
      - "Custom domain only (rejected: requires DNS setup for new tenants)"

# Open questions that need resolution
openQuestions:
  - id: question-1
    question: "How do we handle cross-tenant features like shared reports?"
    askedBy: alice
    askedAt: "2025-11-23T10:00:00Z"
    priority: medium
    status: open
  
  - id: question-2
    question: "What's the max number of tenants we need to support?"
    askedBy: bob
    askedAt: "2025-11-23T11:00:00Z"
    priority: high
    status: answered
    answer: "Target 10K tenants in year 1, 100K in year 3. Design for horizontal scalability."
    answeredBy: product-manager
    answeredAt: "2025-11-23T16:00:00Z"
  
  - id: question-3
    question: "Do we need SAML/SSO support for enterprise tenants?"
    askedBy: carol
    askedAt: "2025-11-24T09:00:00Z"
    priority: high
    status: open

# Approvals tracking
approvals:
  - approver: carol
    role: Security Lead
    approved: false
    requiredFor: implementation
  
  - approver: david
    role: Backend Lead  
    approved: false
    requiredFor: implementation
  
  - approver: eve
    role: DevOps Lead
    approved: false
    requiredFor: implementation
  
  - approver: product-manager
    role: Product Manager
    approved: true
    approvedAt: "2025-11-23T17:00:00Z"
    requiredFor: scheduling

# Implementation tracking
implementation:
  # Is this RFC implemented?
  implemented: false
  # Target sprint/milestone
  targetMilestone: "2025-Q1"
  # Estimated effort in story points
  estimatedEffort: 21
  # Related tickets/tasks
  relatedIssues:
    - PROJ-123: Implement tenant model
    - PROJ-124: Add JWT tenant claim
    - PROJ-125: Database schema migration
    - PROJ-126: Update auth middleware
    - PROJ-127: Subdomain routing
  # Implementation status
  progress: 0
  progressNotes: "Blocked on RFC approval. Backend team ready to start."
---

# RFC-001: Multi-Tenant Authentication Architecture

**Status:** Draft  
**Authors:** alice, bob  
**Reviewers:** carol (Security), david (Backend), eve (DevOps)  
**Created:** 2025-11-20  
**Last Updated:** 2025-11-24

---

## Summary

This RFC proposes a comprehensive multi-tenant authentication architecture to support our transition from a single-tenant SaaS application to a multi-tenant platform. The solution uses **JWT tokens with tenant claims**, **schema-per-tenant database isolation**, and **subdomain-based routing** to provide secure, scalable tenant separation.

**Key Benefits:**
- Strong tenant data isolation at the database level
- Stateless authentication for horizontal scalability  
- Clear tenant context in every request
- Support for future features (custom domains, SSO, tenant-specific configs)

**Target:** v2.0.0 (Q1 2025)

---

## Motivation

### Current State

Our application currently supports only single-tenant deployments:
- Each customer requires a separate deployment
- Manual infrastructure provisioning (2-3 days per customer)
- High operational overhead (25+ deployments to maintain)
- No resource sharing or cost efficiency
- Difficult to roll out updates consistently

### Problems

1. **Scaling Issues**: Cannot support 100+ customers with current model
2. **Cost**: Infrastructure costs 3x higher than multi-tenant equivalent
3. **Time to Market**: 2-3 day setup time prevents fast customer onboarding
4. **Feature Velocity**: Rolling out features across 25+ deployments takes weeks
5. **Data Silos**: No way to provide aggregate analytics or benchmarking

### Opportunity

Multi-tenant architecture enables:
- Instant customer onboarding (minutes vs. days)
- 70% reduction in infrastructure costs
- Single deployment for all updates
- Shared services (analytics, billing, support)
- Foundation for new features (marketplace, integrations)

---

## Goals and Non-Goals

### Goals

✅ **Tenant Isolation**: Guarantee zero data leakage between tenants  
✅ **Performance**: No performance regression vs. single-tenant (< 5ms auth overhead)  
✅ **Scalability**: Support 10K tenants in year 1, 100K in year 3  
✅ **Developer Experience**: Simple, fail-safe APIs for tenant context  
✅ **Migration**: Zero-downtime migration from existing single-tenant customers  
✅ **Compliance**: Maintain SOC2, GDPR compliance in multi-tenant model

### Non-Goals

❌ **Multi-tenancy for every service**: Start with core app, expand incrementally  
❌ **Custom domains**: Planned for v2.1, not part of this RFC  
❌ **SSO/SAML**: Enterprise feature for future RFC  
❌ **Tenant-specific compute**: Shared infrastructure initially, dedicated later if needed  
❌ **Real-time tenant provisioning**: Initial version requires admin approval

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Request                         │
│         https://acme.app.example.com/api/widgets            │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Ingress / Load Balancer                   │
│  - Extract tenant from subdomain                             │
│  - Route to application servers                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Authentication Middleware                  │
│  - Verify JWT token                                          │
│  - Extract tenant claim from token                           │
│  - Validate tenant is active                                 │
│  - Attach tenant context to request                          │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  - Access tenant via request context                         │
│  - All queries automatically scoped to tenant                │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                            │
│  - Schema per tenant: tenant_123, tenant_456                 │
│  - Connection pool manages per-tenant connections            │
│  - Audit log tracks all tenant access                        │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Tenant Model

```typescript
interface Tenant {
  id: string;              // UUID
  slug: string;            // URL-safe name (e.g., "acme")
  name: string;            // Display name (e.g., "Acme Corp")
  domain: string;          // Subdomain (e.g., "acme.app.example.com")
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2. JWT Token Structure

```json
{
  "sub": "user_uuid",
  "email": "alice@acme.com",
  "tenant": {
    "id": "tenant_uuid",
    "slug": "acme",
    "role": "admin"
  },
  "exp": 1735689600,
  "iat": 1735603200
}
```

#### 3. Request Flow

1. User authenticates: `POST /auth/login` with tenant subdomain
2. Server validates credentials, looks up tenant
3. Server issues JWT with tenant claim
4. Client sends JWT in `Authorization: Bearer <token>` header
5. Middleware verifies JWT, extracts tenant, validates status
6. Request context populated with tenant info
7. All database queries automatically use tenant schema

---

## API Design

### Authentication Endpoints

```typescript
// Login - returns JWT with tenant claim
POST https://acme.app.example.com/auth/login
Request:
{
  "email": "alice@acme.com",
  "password": "********"
}

Response:
{
  "token": "eyJhbGci...",
  "refreshToken": "refresh_...",
  "user": {
    "id": "user_uuid",
    "email": "alice@acme.com",
    "name": "Alice Smith",
    "role": "admin"
  },
  "tenant": {
    "id": "tenant_uuid",
    "name": "Acme Corp",
    "slug": "acme"
  }
}

// Refresh token - maintains tenant context
POST /auth/refresh
Request:
{
  "refreshToken": "refresh_..."
}

Response:
{
  "token": "eyJhbGci...",
  "expiresIn": 3600
}

// Logout - invalidate refresh token
POST /auth/logout
Request:
{
  "refreshToken": "refresh_..."
}
```

### Tenant Management API (Admin Only)

```typescript
// Create tenant
POST /admin/tenants
Request:
{
  "name": "Acme Corp",
  "slug": "acme",
  "plan": "pro",
  "adminEmail": "admin@acme.com"
}

// Get tenant details
GET /admin/tenants/:tenantId

// Update tenant
PATCH /admin/tenants/:tenantId

// Suspend/activate tenant
POST /admin/tenants/:tenantId/suspend
POST /admin/tenants/:tenantId/activate
```

---

## Database Schema

### Tenant Isolation Strategy

**Schema-per-tenant** approach:
- Each tenant gets its own PostgreSQL schema
- Schema name: `tenant_{tenant_id}`
- Shared `public` schema for global data (tenants table, audit logs)

```sql
-- Public schema (shared)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- Per-tenant schema (example: tenant_abc123)
CREATE SCHEMA tenant_abc123;

CREATE TABLE tenant_abc123.users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50),
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE tenant_abc123.widgets (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES tenant_abc123.users(id),
  created_at TIMESTAMP NOT NULL
);
```

### Connection Pooling

```typescript
// Get connection for tenant
async function getTenantConnection(tenantId: string) {
  const pool = getPool();
  const client = await pool.connect();
  
  // Set search_path to tenant schema
  await client.query(`SET search_path TO tenant_${tenantId}, public`);
  
  return client;
}
```

---

## Security Considerations

### 1. Tenant Isolation

**Database Level:**
- PostgreSQL RLS (Row Level Security) as defense-in-depth
- Schema-level isolation prevents cross-tenant queries
- Audit logging of all tenant access

**Application Level:**
- Middleware validates tenant on every request
- Fail-closed: reject requests without valid tenant
- Rate limiting per tenant

### 2. Token Security

- JWT signed with RS256 (asymmetric keys)
- Short-lived access tokens (1 hour)
- Refresh tokens stored in secure HTTP-only cookies
- Token revocation support via Redis blacklist

### 3. Subdomain Security

- HTTPS only (redirect HTTP to HTTPS)
- HSTS headers enabled
- Wildcard SSL certificate for `*.app.example.com`
- Subdomain validation (alphanumeric + hyphens only)

### 4. Audit Trail

- All API requests logged with tenant context
- Database queries logged (pgAudit extension)
- Failed auth attempts tracked and alerted
- Tenant data access audit report available

---

## Alternatives Considered

### Alternative 1: Shared Tables with tenant_id Column

**Approach:** Single schema, every table has `tenant_id` foreign key.

**Pros:**
- Simpler database management
- Easier to add cross-tenant features

**Cons:**
- ❌ High risk of data leakage (one missing WHERE clause = disaster)
- ❌ Complex queries with every table join requiring tenant check
- ❌ Difficult to isolate tenant data for backups/exports
- ❌ No strong database-level isolation

**Decision:** Rejected due to security concerns.

---

### Alternative 2: Database-per-Tenant

**Approach:** Each tenant gets separate PostgreSQL database.

**Pros:**
- Maximum isolation
- Easy to backup/restore individual tenants

**Cons:**
- ❌ PostgreSQL limit: ~1000 databases practical max
- ❌ Cannot scale beyond 1K tenants
- ❌ High connection overhead
- ❌ Complex connection pool management

**Decision:** Rejected due to scalability limits.

---

### Alternative 3: OAuth2-Only (No Custom JWT)

**Approach:** Use third-party OAuth2 provider (Auth0, Okta).

**Pros:**
- Don't build auth infrastructure
- Enterprise SSO easier

**Cons:**
- ❌ Vendor lock-in
- ❌ Higher cost at scale
- ❌ Less control over token structure
- ❌ Still need tenant management layer

**Decision:** Deferred. May add OAuth2 as option in future RFC.

---

## Migration Plan

### Phase 1: Infrastructure Setup (Week 1-2)

- Provision shared infrastructure
- Set up wildcard DNS and SSL certificates
- Deploy authentication service
- Create admin tools for tenant management

### Phase 2: Pilot Customers (Week 3-4)

- Migrate 3 pilot customers
- Test tenant isolation
- Validate performance
- Gather feedback

### Phase 3: Bulk Migration (Week 5-8)

- Automated migration script
- Migrate 5 customers per day
- Monitor error rates
- Rollback plan ready

### Phase 4: New Customer Onboarding (Week 9+)

- All new customers on multi-tenant platform
- Single-tenant deployments deprecated
- Documentation and training updated

---

## Testing Strategy

### Unit Tests

- Tenant extraction from subdomain
- JWT token generation and validation
- Tenant context attachment to requests

### Integration Tests

- Full auth flow with tenant
- Database schema switching
- Cross-tenant isolation verification

### Security Tests

- Penetration testing for tenant leakage
- Token manipulation attempts
- SQL injection with tenant context

---

## Implementation Timeline

**Phase 1:** Infrastructure (2 weeks)  
**Phase 2:** Pilot Migration (2 weeks)  
**Phase 3:** Bulk Migration (4 weeks)  
**Phase 4:** Stabilization (2 weeks)

**Total:** 10 weeks

**Start Date:** January 2, 2025  
**Target Launch:** March 15, 2025

---

## Appendix

### Related Documents

- [ADR-015: JWT Token Strategy](./adr-015.md)
- [RFC-002: API Gateway Design](./rfc-002.md)
- [Security Compliance Guide](./security-compliance.md)

### References

- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Multi-Tenant Architecture Patterns](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)

---

**Last Updated:** 2025-11-24 by alice  
**Next Review:** 2025-11-27 (team review meeting)



