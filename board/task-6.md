---
id: task-6
title: "Deps: js-yaml 5 (byte-stable dump tests) + chalk 6 / open 11 / chokidar 5 / TS 7 evaluation"
column: todo
position: 6
tags:
  - deps
  - core
  - cli
relatedFiles:
  - core/src/frontmatter.ts
  - core/src/serializer.ts
createdAt: "2026-08-11T22:07:35.589Z"
description: "js-yaml 5 removed quotingType from DumpOptions (core/src/frontmatter.ts:65, core/src/serializer.ts:38). Needs a v5 equivalent for quote-style control plus golden-file tests proving dump output is byte-stable — board files must not churn on rewrite. Folded in from task-7 (closed 2026-09-21): the ESM question was settled by the esbuild bundle (ink 7 + react 19, commander 14 already landed); remaining ESM-only majors to evaluate under the bundle are chalk 4→6, open 10→11, chokidar 4→5, and TypeScript 7 (tsgo)."
updatedAt: "2026-09-21T18:10:46.258Z"
---

## Description
js-yaml 5 removed quotingType from DumpOptions (used in core/src/frontmatter.ts:65 and core/src/serializer.ts:38). Migration needs: find v5 equivalent for quote-style control, plus golden-file tests proving dump output is byte-stable across the upgrade — board files must not churn on rewrite.
