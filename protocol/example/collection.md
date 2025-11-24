---
# Type discriminator - identifies this as a collection brainfile
type: collection

# Schema URL for validation - points to collection-specific schema
schema: https://brainfile.md/v1/collection.json

# Title of the collection
title: Software Architecture Reading List

# Protocol version this file conforms to
protocolVersion: 0.5.0

# Instructions for AI agents interacting with this collection
agent:
  instructions:
    - Add new items to the "to-read" category by default
    - Move items between categories as reading progresses
    - Preserve item IDs and metadata when moving
    - Update lastVisited timestamp when referencing items
  llmNotes: This is a curated collection of software architecture resources including books, articles, and videos

# Rules that apply to this collection
rules:
  always:
    - id: 1
      rule: include a brief note about why each resource is valuable
    - id: 2
      rule: tag resources by relevant topics for easy filtering
  prefer:
    - id: 1
      rule: authoritative sources over blog posts for fundamentals
    - id: 2
      rule: practical examples over pure theory
  context:
    - id: 1
      rule: this collection focuses on distributed systems and scalability

# Categories organize the collection into logical groups
categories:
  # Each category has a unique ID, title, and optional description
  - id: to-read
    title: To Read
    description: Resources I plan to read or watch
    items:
      # Each item represents a single resource (book, article, video, etc.)
      - id: item-1
        # Title of the resource
        title: "Designing Data-Intensive Applications"
        # URL where the resource can be accessed
        url: https://dataintensive.net/
        # Type of resource: book, article, video, paper, course, podcast
        source: book
        # Author(s) of the resource
        author: "Martin Kleppmann"
        # Tags for filtering and categorization
        tags:
          - databases
          - distributed-systems
          - architecture
        # Current status: unread, reading, read, archived
        status: unread
        # When this item was added to the collection (ISO 8601)
        addedAt: "2025-11-20T10:00:00Z"
        # Personal notes about the resource
        notes: "Recommended by @alex. Covers fundamental patterns in data systems."
        # Priority level for reading order
        priority: high
        # Estimated time to complete (optional)
        estimatedTime: "20 hours"
      
      - id: item-2
        title: "The Log: What every software engineer should know about real-time data"
        url: https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying
        source: article
        author: "Jay Kreps"
        tags:
          - distributed-systems
          - kafka
          - event-streaming
        status: unread
        addedAt: "2025-11-21T14:30:00Z"
        notes: "Foundational article on logs as a central abstraction in distributed systems. Quick read."
        priority: high
        estimatedTime: "45 minutes"
      
      - id: item-3
        title: "Building Microservices"
        url: https://samnewman.io/books/building_microservices_2nd_edition/
        source: book
        author: "Sam Newman"
        tags:
          - microservices
          - architecture
          - devops
        status: unread
        addedAt: "2025-11-22T09:15:00Z"
        notes: "Second edition with updated patterns. Good for our migration to microservices."
        priority: medium
      
      - id: item-4
        title: "Raft Consensus Algorithm Visualization"
        url: https://raft.github.io/
        source: video
        author: "Diego Ongaro"
        tags:
          - consensus
          - distributed-systems
          - raft
        status: unread
        addedAt: "2025-11-23T11:20:00Z"
        notes: "Interactive visualization to understand Raft before reading the paper."
        priority: medium
        estimatedTime: "30 minutes"

  - id: reading
    title: Currently Reading
    description: Resources I'm actively working through
    items:
      - id: item-5
        title: "Release It! Design and Deploy Production-Ready Software"
        url: https://pragprog.com/titles/mnee2/release-it-second-edition/
        source: book
        author: "Michael T. Nygard"
        tags:
          - production
          - reliability
          - architecture
        status: reading
        addedAt: "2025-11-15T10:00:00Z"
        # When reading started
        startedAt: "2025-11-18T09:00:00Z"
        # Current progress (percentage or page number)
        progress: 45
        progressUnit: percent
        notes: "Great patterns for production resilience. Chapter on circuit breakers is excellent."
        priority: high
        # Last time this resource was accessed
        lastVisited: "2025-11-24T10:30:00Z"
      
      - id: item-6
        title: "Fallacies of Distributed Computing Explained"
        url: https://arnon.me/wp-content/uploads/Files/fallacies.pdf
        source: paper
        author: "Arnon Rotem-Gal-Oz"
        tags:
          - distributed-systems
          - networking
          - architecture
        status: reading
        addedAt: "2025-11-20T14:00:00Z"
        startedAt: "2025-11-23T16:00:00Z"
        progress: 60
        progressUnit: percent
        notes: "Classic paper. Taking notes on each fallacy and how we've encountered them."
        priority: high
        lastVisited: "2025-11-24T08:15:00Z"

  - id: completed
    title: Completed
    description: Resources I've finished and can reference
    items:
      - id: item-7
        title: "The Twelve-Factor App"
        url: https://12factor.net/
        source: article
        author: "Adam Wiggins"
        tags:
          - cloud-native
          - best-practices
          - deployment
        status: read
        addedAt: "2025-11-10T10:00:00Z"
        startedAt: "2025-11-10T10:15:00Z"
        # When reading was completed
        completedAt: "2025-11-10T12:00:00Z"
        progress: 100
        progressUnit: percent
        notes: "Applied these principles to our deployment pipeline. Particularly relevant: config in env vars and stateless processes."
        priority: high
        # Personal rating (1-5 stars)
        rating: 5
        # Key takeaways or summary
        takeaways: |
          - Store config in environment variables
          - Treat backing services as attached resources
          - Keep development/production parity
          - Execute app as stateless processes
        # Related files or projects where this was applied
        relatedFiles:
          - infrastructure/docker-compose.yml
          - docs/deployment-guide.md
      
      - id: item-8
        title: "CAP Theorem: You Can't Have It All"
        url: https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/
        source: article
        author: "Eric Brewer"
        tags:
          - distributed-systems
          - theory
          - consistency
        status: read
        addedAt: "2025-11-12T14:00:00Z"
        startedAt: "2025-11-12T14:15:00Z"
        completedAt: "2025-11-12T15:30:00Z"
        progress: 100
        progressUnit: percent
        notes: "Classic CAP theorem article. Helped clarify our eventual consistency strategy."
        rating: 5
        takeaways: |
          - CAP is about partitions, not normal operation
          - Most systems choose AP or CP for partition scenarios
          - Eventual consistency is often acceptable
      
      - id: item-9
        title: "Building Resilient Systems with Netflix's Hystrix"
        url: https://netflixtechblog.com/making-the-netflix-api-more-resilient-a8ec62159c2d
        source: article
        author: "Netflix Tech Blog"
        tags:
          - resilience
          - circuit-breaker
          - microservices
        status: read
        addedAt: "2025-11-14T10:00:00Z"
        startedAt: "2025-11-14T10:30:00Z"
        completedAt: "2025-11-14T11:45:00Z"
        progress: 100
        progressUnit: percent
        notes: "Circuit breaker pattern explained well. Inspired our retry/timeout strategy."
        rating: 4
        relatedFiles:
          - src/resilience/circuit-breaker.ts
      
      - id: item-10
        title: "Event Sourcing Pattern - Martin Fowler"
        url: https://martinfowler.com/eaaDev/EventSourcing.html
        source: article
        author: "Martin Fowler"
        tags:
          - event-sourcing
          - patterns
          - architecture
        status: read
        addedAt: "2025-11-16T09:00:00Z"
        startedAt: "2025-11-16T09:30:00Z"
        completedAt: "2025-11-16T11:00:00Z"
        progress: 100
        progressUnit: percent
        notes: "Clear explanation of event sourcing vs CRUD. Considering for audit trail feature."
        rating: 5
        takeaways: |
          - Store events instead of current state
          - Rebuild state by replaying events
          - Natural audit trail
          - Time travel debugging
          - CQRS pairs well with event sourcing

  - id: reference
    title: Quick Reference
    description: Tools, cheat sheets, and resources for quick lookup
    items:
      - id: item-11
        title: "System Design Primer"
        url: https://github.com/donnemartin/system-design-primer
        source: article
        author: "Donne Martin"
        tags:
          - system-design
          - reference
          - interview-prep
        status: read
        addedAt: "2025-11-08T10:00:00Z"
        notes: "Comprehensive GitHub repo with system design patterns. Great for team onboarding."
        rating: 5
        # Number of times this resource has been referenced
        visits: 12
        lastVisited: "2025-11-24T09:00:00Z"
      
      - id: item-12
        title: "AWS Architecture Icons"
        url: https://aws.amazon.com/architecture/icons/
        source: article
        author: "Amazon Web Services"
        tags:
          - aws
          - diagrams
          - reference
        status: read
        addedAt: "2025-11-05T14:00:00Z"
        notes: "Official AWS icons for architecture diagrams. Updated quarterly."
        rating: 4
        visits: 8
        lastVisited: "2025-11-23T16:30:00Z"
      
      - id: item-13
        title: "Latency Numbers Every Programmer Should Know"
        url: https://gist.github.com/jboner/2841832
        source: article
        author: "Jonas Bonér"
        tags:
          - performance
          - reference
          - latency
        status: read
        addedAt: "2025-11-01T10:00:00Z"
        notes: "Classic reference for understanding system performance. Keep this handy during design reviews."
        rating: 5
        visits: 15
        lastVisited: "2025-11-24T11:20:00Z"

# Statistics configuration (optional)
stats:
  # Total items across all categories
  totalItems: 13
  # Items by status
  byStatus:
    unread: 4
    reading: 2
    read: 7
  # Items by source type
  bySource:
    book: 3
    article: 8
    video: 1
    paper: 1
---

# Software Architecture Reading List

This collection tracks technical resources related to software architecture, distributed systems, and scalability patterns.

## Purpose

- **Learning Path**: Curated resources for deepening architecture knowledge
- **Team Reference**: Shared knowledge base for the engineering team
- **Decision Support**: Research materials for architecture decisions

## Categories

### 📚 To Read
Resources queued for future reading. Prioritized by relevance to current projects.

### 📖 Currently Reading
Active learning in progress. Updated with progress and notes.

### ✅ Completed
Finished resources with key takeaways and ratings. Reference these for patterns we've learned.

### 🔍 Quick Reference
Cheat sheets, tools, and resources for frequent lookup.

## How to Use This Collection

1. **Add Resources**: New items go to "To Read" by default
2. **Track Progress**: Move to "Currently Reading" and update progress %
3. **Capture Takeaways**: Write notes and key learnings in "Completed"
4. **Tag Generously**: Use tags for easy filtering by topic

## Related Collections

- [DevOps Tools Collection](./devops-tools.md)
- [Frontend Resources](./frontend-learning.md)

## Team Reading Goals

- **Q4 2025**: Everyone reads at least one distributed systems book
- **Monthly**: Share one article in team learning session



