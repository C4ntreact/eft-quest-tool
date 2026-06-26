# AGENTS.md

## Project identity

This repository contains a local-first Escape from Tarkov quest and Kappa progression tracker.

The primary user goal is not to build a generic task app. The goal is a practical EFT quest tool with correct quest dependencies, Kappa tracking, alternative quest handling, and simple manual progress tracking.

## Language and communication

- User-facing UI text may be German or English, but keep code, types, comments, and commit messages in English.
- Prefer simple, explicit names over clever abstractions.
- Keep generated explanations concise and practical.

## Technical direction

Use:

- React
- TypeScript
- Vite
- Plain CSS or CSS modules unless a dependency is clearly justified
- Static JSON data files
- `localStorage` for v1 progress persistence

Do not add in v1:

- Supabase
- Firebase
- Next.js
- backend APIs
- authentication
- scraping tools
- browser extensions
- automatic EFT account/game sync
- server-side databases

## Data model expectations

Use stable IDs for quests. A quest should include at least:

```ts
export type QuestStatus = 'not_started' | 'active' | 'completed' | 'blocked' | 'skipped';

export interface Quest {
  id: string;
  title: string;
  trader: string;
  kappaRequired: boolean;
  requiredLevel?: number | null;
  prerequisites: string[];
  alternatives: string[];
  map?: string | null;
  wikiUrl?: string | null;
}
```

Progress should be stored separately from quest data:

```ts
export interface QuestProgress {
  [questId: string]: QuestStatus;
}
```

Do not mutate imported quest data directly.

## Validation rules

Implement validation as pure functions where possible.

Minimum validation checks:

1. A quest marked `completed` while one or more prerequisites are not `completed`.
2. A quest marked `active` while one or more prerequisites are not `completed`.
3. Multiple quests in the same mutually exclusive alternative group marked `completed`.
4. Unknown quest IDs in imported progress.

Validation should return structured results, not only strings.

Example:

```ts
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  questId?: string;
  message: string;
  relatedQuestIds?: string[];
}
```

## Progress rules

- Store progress under a versioned localStorage key, for example `eftQuestTool.progress.v1`.
- Import/export should include a schema version.
- Invalid imported status values should not crash the app.
- If imported data contains unknown quest IDs, report them in validation or import feedback.

## UI priorities

Correctness first, polish later.

Initial UI should include:

- Dashboard with total quests and Kappa progress
- Filters: search, trader, status, Kappa-only
- Quest list/tree ordered by prerequisites
- Status select or buttons per quest
- Completed quests visibly faded and crossed out
- Validation panel
- Import/export buttons

A full visual graph/mindmap can be added later. The first version may use indentation/tree levels instead of React Flow.

## Testing expectations

When logic becomes non-trivial, add small unit tests for:

- prerequisite validation
- alternative quest validation
- import/export parsing
- quest ordering / graph building

If no test framework exists yet, keep validation and graph logic pure and easy to test.

## Coding style

- Prefer type-safe code.
- Avoid `any` unless absolutely necessary.
- Keep components small.
- Keep utility functions pure.
- Avoid hardcoded status labels spread across the app; centralize them.
- Do not silently swallow import errors; show a user-readable message.

## Important EFT-specific notes

- Some quests are mutually exclusive alternatives, for example Chemical hand-ins or Sanitar-related choices.
- Some quests may appear odd by name/part order but are not necessarily invalid unless the data says they depend on each other.
- Kappa requirement can change between wipes/patches, so treat it as data, not hardcoded UI logic.
- Collector items should be tracked separately later; do not force them into the quest status model.

## Definition of done for v1

A v1 implementation is acceptable when:

- The app builds successfully.
- The user can change quest statuses.
- Progress persists after refresh.
- Progress can be exported and imported.
- Kappa progress is calculated from data.
- Validation detects missing prerequisites and mutually exclusive completions.
- The app works fully without a backend.
