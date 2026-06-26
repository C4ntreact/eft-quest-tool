# EFT Quest Tool

A local-first Escape from Tarkov quest and Kappa progression tracker.

The goal is to build a clean manual tracker for quests, Kappa requirements, Collector items, quest prerequisites, and mutually exclusive quest branches.

## Product goal

This project should become a practical quest tool for tracking an EFT wipe without relying on a backend, a database, account scraping, or game-file access.

Core ideas:

- Track every quest with a clear status.
- Show quest dependencies in a tree-like order.
- Highlight Kappa-required quests.
- Mark completed quests as crossed out or visually faded.
- Detect impossible or suspicious progress states.
- Support import/export so progress can be backed up and moved between browsers/devices.

## Planned v1 scope

Version 1 should focus on correctness before visual polish.

Required v1 features:

- React + TypeScript + Vite
- Local-only app, no backend
- Quest data loaded from static JSON files
- Progress stored in `localStorage`
- Status options:
  - `not_started`
  - `active`
  - `completed`
  - `blocked`
  - `skipped`
- Search by quest title
- Filter by trader
- Filter by status
- Kappa-only filter
- Quest card/list entry showing:
  - title
  - trader
  - Kappa requirement
  - status
  - prerequisites
  - alternative/conflicting quests
- Validation panel for:
  - completed quest with missing prerequisite
  - active quest with missing prerequisite
  - multiple mutually exclusive alternatives completed at once
- Import/export progress as JSON

## Out of scope for now

Do not add these in v1:

- Supabase
- Firebase
- user accounts
- authentication
- a backend server
- scraping the EFT client, logs, memory, or account data
- browser extensions
- automatic game/account synchronization

This is a manual tracker.

## Suggested project structure

```text
src/
  App.tsx
  main.tsx
  types.ts
  data/
    quests.json
  utils/
    progress.ts
    questGraph.ts
    validation.ts
```

## Data notes

Quest data should eventually be generated from reliable public data sources such as TarkovTracker/tarkovdata or tarkov.dev, but the app should still run offline after data is included in the repository.

## Development commands

These are expected after the React/Vite scaffold exists:

```bash
npm install
npm run dev
npm run build
```

## Current state

Repository initialized with project docs and Codex guidance. The React app still needs to be scaffolded.
