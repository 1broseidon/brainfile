---
id: task-57
title: "Mobile: final polish with native iOS glass, cards and buttons, keeping desktop's look"
column: review
position: 3
priority: medium
tags:
  - mobile
  - ios
  - polish
  - parity
parentId: epic-3
dependsOn:
  - task-54
  - task-55
  - task-56
decisions:
  - decision-10
  - decision-7
  - decision-9
createdAt: "2026-10-14T01:44:12.943Z"
updatedAt: "2026-10-14T02:45:36.532Z"
---

## Description
The last step of epic-3, after task-54, task-55 and task-56. Use the native iOS surface wherever iOS has one: Liquid Glass on bars, toolbars, sheets and floating controls; native buttons, menus, context menus and sheets; inset cards for grouped content such as settings and a task's details. Keep what makes the phone read as the desktop: IBM Plex Sans and Mono, desktop's tokens for planes, ink and accent, the status boxes, the row signals, the calm list and plain copy (decision-10). Where the two disagree, native wins for chrome (bars, sheets, buttons, menus) and desktop wins for content (rows, type, ink and signals). Check every screen on the simulator against desktop/design.md, then build and install on the iPhone over WiFi with npm run phone.

## Log
- 2026-10-14T02:45:35.503Z: [claude] Done on brainfile-mobile branch epic-3 (uncommitted); expo-glass-effect and @expo/ui added (SDK 57's own), native rebuild. Chrome is iOS 26's, content the desktop's. NATIVE: bars transparent over what scrolls with the scroll-edge glass, Projects iOS's large title (Plex); the List/Decisions control iOS's segmented control; keys are SwiftUI glass buttons with Plex labels, prominent accent glass for the one action, red for danger; sheet tops have a glass close key; the board's chat key floats in glass; the composer's send key is accent glass only when there is something to send. Native menus (components/NativeMenu.tsx, fixed order, checkmarks, second lines): the chat's agent and model › effort picks, a task's status and priority, New task's column, kind and priority (chips removed), Hand to… with each agent's note under its name; a followed board's long press is a context menu with Remove from iPhone. Rows take the press with their fill and no give; cards 18pt, concentric with iOS 26's sheet corner. CHAT is now a screen of its own (asked mid-epic): pushed over the board under iOS's bar, title, back, New chat as a bar button; a task's chat key closes its sheets and opens it with the task as context. TRADE-OFFS: the task sheet has one height, as the chat and New task had: with two detents iOS 26 gives the sheet interactive glass and SwiftUI controls inside it never get their taps (react-native-screens #4605); confirmed by test. Native controls use the system font inside (segmented control, menu items); our words keep Plex wherever we draw them. VERIFIED on the iPhone 18 Pro simulator, iOS 27, with a UI-test driver that taps by accessibility label (scratchpad only, not in the repo): every menu opens and acts, a row's tap still opens it under its context menu, keys answer, chat sends and shows its run. Checks: 125/125 phone tests, tsc and prettier clean; desktop 161/161, typecheck clean.
- 2026-10-14T02:52:08.888Z: [claude] Validation (task-58): PASS on code; simulator/device claims are from this task's log, not re-run in this validation. The native-for-chrome / desktop-for-content rule holds in the tree: chrome is iOS's (glass.tsx SwiftUI Liquid Glass IconKey/CloseKey/FloatKey/SendKey, Segmented is the native Picker segmented control, NativeMenu with fixed order/checkmarks/second lines/Effort submenu, createNativeStackNavigator, Chat as its own pushed screen, kit Key in glass with prominent accent only for the one action and destructive red for danger), while content stays the desktop's (Plex faces, theme tokens, StatusBox, calm rows/signals, plain copy per decision-10); rows press with fill and no give (Touch GIVE row=1). Documented trade-offs stand: single-detent sheets (two detents break SwiftUI taps under iOS 26 interactive glass, react-native-screens #4605) and system font inside native controls. expo-glass-effect/@expo/ui were added, so a native rebuild (npm run phone) is required — the log records it built and installed over WiFi and every menu/key/chat path was exercised with a UI-test driver on the iPhone 18 Pro simulator; treat that as logged evidence. Phone 125/125 + tsc re-run green here.
