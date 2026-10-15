---
kind: Changed
---
- Core: starting and talking to ACP agents moves out of the desktop into the
  node-only subpath `@brainfile/core/dispatch` (decision-18), which takes
  `@agentclientprotocol/sdk` as a dependency: the agents Brainfile knows and
  how each starts, custom agents and the ACP registry, the dispatch settings
  and model cache, sessions, permissions and a hand-off's brief. It reads the
  same data folder as the desktop (`BRAINFILE_DATA_DIR`, else the platform's),
  so nothing moves. Internal: the desktop behaves as before, and nothing in
  the browser or main entry loads it.
