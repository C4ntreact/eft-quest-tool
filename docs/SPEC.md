# EFT Quest Tool v1 Specification

## Purpose

Build a local-first Escape from Tarkov quest progression tool that helps the user track quest completion and Kappa progress manually.

The app should prioritize correct quest logic over visual polish.

## Main user flows

### 1. Track quest status

The user can set each quest to one of:

- Not Started
- Active
- Completed
- Blocked
- Skipped

Completed quests should be visually crossed out and faded.

### 2. Filter quests

The user can filter the quest list by:

- quest title search
- trader
- status
- Kappa required only

### 3. Understand quest order

The user should be able to see which quests unlock later quests.

For v1, a tree-like list with indentation is enough. A full node graph/mindmap can come later.

### 4. Detect bad progress states

The app should detect obvious impossible/suspicious states:

- Quest is active/completed but one or more prerequisites are not completed.
- Two or more mutually exclusive alternatives are completed at the same time.
- Imported progress references unknown quest IDs.
- Imported progress contains invalid status values.

### 5. Backup and restore progress

The user can export progress to JSON and import it again.

The exported JSON should include a schema version.

Example:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-26T00:00:00.000Z",
  "progress": {
    "debut": "completed"
  }
}
```

## Data model

### Quest

```ts
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

### QuestStatus

```ts
export type QuestStatus =
  | 'not_started'
  | 'active'
  | 'completed'
  | 'blocked'
  | 'skipped';
```

### QuestProgress

```ts
export type QuestProgress = Record<string, QuestStatus>;
```

### ValidationIssue

```ts
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  questId?: string;
  message: string;
  relatedQuestIds?: string[];
}
```

## UI layout v1

Suggested layout:

```text
+-----------------------------------------------------------+
| EFT Quest Tool                                            |
| Kappa progress: 123 / 257                                 |
+-----------------------+-----------------------------------+
| Filters               | Validation panel                  |
| - Search              | - Missing prerequisites           |
| - Trader              | - Alternative conflicts           |
| - Status              |                                   |
| - Kappa only          |                                   |
+-----------------------+-----------------------------------+
| Quest tree/list                                           |
|   [Prapor] Debut                         [Completed]      |
|     [Prapor] Checking                    [Active]         |
|       ...                                                 |
+-----------------------------------------------------------+
```

## Functional requirements

### Status persistence

- Use localStorage key: `eftQuestTool.progress.v1`
- Save after every status change
- Load automatically on app start
- If localStorage data is invalid, reset safely and show a warning if possible

### Quest ordering

Use quest prerequisites to generate a stable ordered list.

When there are multiple root quests, sort by:

1. trader
2. required level
3. title

When cycles or bad data occur, do not crash. Show the affected quests at the end and produce a validation issue.

### Kappa progress

Kappa progress should be calculated from quests where `kappaRequired === true`.

Do not hardcode total Kappa quest counts into UI logic. The count must come from data.

### Alternatives

If a quest has alternatives, and more than one quest in the same group is marked completed, create an error.

If one alternative is completed, the UI may suggest setting the others to blocked, but v1 should not automatically mutate progress unless the user explicitly clicks a control.

## Non-goals

- No automatic reading from EFT account or game files
- No backend
- No accounts/login
- No cloud sync
- No paid APIs
- No browser extension

## Later versions

Possible v2+ features:

- React Flow visual graph/mindmap
- Collector item tracker
- Map grouping
- Recommended next quests
- Import from the existing Excel tracker
- GitHub Pages deployment
- Data generation script from TarkovTracker/tarkovdata
- Item requirements tracking
- Mobile layout improvements
