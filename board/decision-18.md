---
id: decision-18
title: ACP dispatch lives in core as the node-only subpath @brainfile/core/dispatch, with @agentclientprotocol/sdk as core's dependency
type: decision
status: current
claimKey: core.dispatch.package
kind: decision
stance: prefers
subject: "@brainfile/core/dispatch subpath"
recheck: If the SDK grows native or heavy dependencies, or a consumer wants core without ACP
createdAt: "2026-10-15T17:11:59.602Z"
---

## Description
ACP dispatch lives in core as the node-only subpath @brainfile/core/dispatch, with @agentclientprotocol/sdk as core's dependency

It sits beside ./repo and is never imported from the browser entry (core/src/browser.ts). A separate workspace package was the other choice; a subpath keeps one package for the CLI and the desktop to depend on, one version and one build, and the boundary that matters (no node-only code in the browser entry) is already enforced by browser-entry.test.ts. This is the first runtime dependency core takes besides js-yaml (2026-08-11 boundary spec); the SDK is small and has no native code.
