---
id: decision-15
title: An epic is run by a lead that orchestrates its children and writes no code, inside rules the app enforces
type: decision
status: current
claimKey: desktop.dispatch.lead
kind: decision
stance: requires
subject: a lead agent per epic, scoped desk, app-enforced rules
tags:
  - desktop
  - dispatch
  - agents
createdAt: "2026-10-14T18:47:48.087Z"
---

## Description
An epic is run by a lead: an agent that orchestrates the epic's children and never writes code, inside rules the app enforces

Handing off an epic (or any parent) starts a lead rather than a worker. The lead has no worktree and changes no code, as the board chat does (decision-14): it reads the epic and its tree, plans, and dispatches. It gets the desk scoped to its own tree: dispatch, runs and stop reach only the epic's descendants, and the board comes from its token, never the caller. Only a lead dispatches; a worker never does, and one lead runs a tree at a time.

The lead's judgment: which ready child goes next, and with which agent, model and effort; splitting a child that proves too large into new children with draft contracts; reading a failed validation and re-dispatching with a better brief or a rewritten contract; sending a conflict back to its child's agent (decision-12); stopping and leaving a note on the epic when the plan is wrong. A child the lead creates waits as a draft for the person to make ready, unless the epic was handed off until done on a repository whose permission policy is bypass: ready is the person's yes, and a lead does not approve its own new work.

The app's rules, which the lead cannot bend: a child is not dispatched before its dependsOn have landed; at most N run at once per repository; retries stop at the contract's maxRetries and the child parks in Review; landings stay serial by compare-and-swap (decision-12).

The lead is woken, it does not poll: idle between events, it gets a new turn when a child lands, fails validation, conflicts or asks. It reads status from the board, not the workers' transcripts, so its context stays small across a long epic. The board is its memory: the plan, its choices and progress go in notes on the epic and a dispatch record on each child, so a lead lost to an app restart is replaced by one that reads the board and continues.

This replaces spec-16's mechanical queue (waves by dependsOn) with a lead inside these rules, and it does not need landing first: before task-62 a child ends in Review, the person merges, and the lead is woken. Why: an epic's order is more than its dependency graph (size, risk, which agent suits which child, what a failure means), and an agent judging inside fixed rules beats a fixed queue, while the board as the lead's memory makes the run survive the session, the restart and the machine.
