---
id: task-21
title: "Editors: detection across macOS, Windows and Linux, and terminal editors without Ghostty"
column: todo
position: 4
tags:
  - desktop
  - editor
createdAt: "2026-10-12T18:47:59.710Z"
updatedAt: "2026-10-12T23:39:50.930Z"
assignee: codex
---

## Description
Editor links in replies only find apps in /Applications, and terminal editors only appear with Ghostty.

- Find editors in layers: CLI on PATH (which/where), each OS's install locations (macOS by bundle ID via Spotlight; Windows %LOCALAPPDATA%\\Programs; Linux snap, flatpak, JetBrains Toolbox), then the editor's URL scheme (vscode://, cursor://, jetbrains://) via the OS.
- Terminal editors in the person's terminal: macOS Ghostty, WezTerm, Kitty, iTerm2, Alacritty, else Terminal.app; Linux x-terminal-emulator and friends; Windows wt.
- A 'Your $EDITOR' option read from the login shell.
- Unset, open in the editor that is running, then the first found (launch-editor's idea).
- Install Zed on this Mac to check it (already in the table).
