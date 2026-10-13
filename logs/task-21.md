---
id: task-21
title: "Editors: detection across macOS, Windows and Linux, and terminal editors without Ghostty"
tags:
  - desktop
  - editor
createdAt: "2026-10-12T18:47:59.710Z"
updatedAt: "2026-10-13T19:57:33.160Z"
assignee: codex
completedAt: "2026-10-13T19:57:33.160Z"
---

## Description
Editor links in replies only find apps in /Applications, and terminal editors only appear with Ghostty.

- Find editors in layers: CLI on PATH (which/where), each OS's install locations (macOS by bundle ID via Spotlight; Windows %LOCALAPPDATA%\\Programs; Linux snap, flatpak, JetBrains Toolbox), then the editor's URL scheme (vscode://, cursor://, jetbrains://) via the OS.
- Terminal editors in the person's terminal: macOS Ghostty, WezTerm, Kitty, iTerm2, Alacritty, else Terminal.app; Linux x-terminal-emulator and friends; Windows wt.
- A 'Your $EDITOR' option read from the login shell.
- Unset, open in the editor that is running, then the first found (launch-editor's idea).
- Install Zed on this Mac to check it (already in the table).

## Log
- 2026-10-12T23:44:00.615Z: [codex-task-21] Implemented layered editor discovery and terminal launch plans; Zed installed via Homebrew. Adding platform fixtures and validating quoting, running-editor preference and login-shell EDITOR before committing.
- 2026-10-12T23:50:41.769Z: [codex-task-21] Implemented layered PATH/OS-install/URL editor discovery, terminal launchers across macOS/Linux/Windows, login-shell Your $EDITOR, and running-editor-first Automatic. Committed as 86c2a69 on dispatch/task-21; worktree clean. Desktop build/typecheck and tests pass (14 editor regression cases); Windows/Linux checked with fixtures. Installed Zed 1.23.3 and verified detection plus file:line launch via Electron; Terminal.app AppleScript compiles.
