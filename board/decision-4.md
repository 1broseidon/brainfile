---
id: decision-4
title: A task made from an issue keeps the issue's URL as `source:`
type: decision
status: current
claimKey: desktop.issues.link
kind: decision
stance: requires
subject: source frontmatter field for issue links
recheck: If core gains a first-class field for external links, or closing a task should close its issue
tags:
  - desktop
  - github
  - integration
createdAt: "2026-10-12T23:47:19.781Z"
---

## Description
A task made from an issue keeps the issue's URL as `source:`

A task created from a forge issue records the issue's web URL as a plain string in a top-level `source:` frontmatter field (e.g. `source: https://github.com/o/r/issues/12`), written in the same write as the task through addTaskFile's `fields`. An issue counts as already on the board when any task, open or completed in logs/, carries its URL (trailing slash ignored); the desktop host refuses to make a second. A plain URL rather than a GitHub-specific object keeps it forge-neutral (GitLab or Linear URLs fit the same field) and readable by people and agents.
