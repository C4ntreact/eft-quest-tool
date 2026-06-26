# Codex Progress Import Prompt

Use this prompt for the next implementation pass.

```text
Work in the GitHub repository:

C4ntreact/eft-quest-tool

Start from the latest main branch. PR #1 and PR #2 are already merged.

Create a new branch:

codex/progress-import

Goal:
Add a robust progress import system so older tracker exports can be imported into the new tarkov.dev quest data structure, even when quest IDs do not match.

Important context:
- The current app stores progress by quest ID.
- The new generated quest data uses tarkov.dev IDs/slugs.
- Older trackers or Excel/JSON exports may use different quest IDs, but usually contain quest titles and status values.
- The app must stay local-first.
- Do not add a backend, database, auth, Supabase, Firebase, cloud sync, scraping, or account/game file reading.

Functional requirements:

1. Add a progress import mapper

Create utilities such as:

src/utils/progressImport.ts

The mapper should accept imported progress in several simple formats:

A. Native app export:

{
  "schemaVersion": 1,
  "progress": {
    "q-...": "completed"
  }
}

B. Plain ID-to-status object:

{
  "q-...": "completed",
  "some-old-id": "active"
}

C. Array of quest rows:

[
  {
    "title": "Debut",
    "trader": "Prapor",
    "status": "Erledigt"
  }
]

D. Object containing rows under one of these keys:

{
  "quests": [...]
}

or

{
  "rows": [...]
}

or

{
  "progressRows": [...]
}

2. Status normalization

Support both English and German status labels.

Map these to app statuses:

completed:
- completed
- complete
- done
- erledigt
- abgeschlossen
- fertig

active:
- active
- aktiv
- in progress
- started
- angefangen

not_started:
- not_started
- not started
- nicht angefangen
- offen
- todo
- to do

blocked:
- blocked
- blockiert
- locked
- gesperrt

skipped:
- skipped
- überspringen
- ueberspringen
- skip

Unknown statuses should be reported, not silently accepted.

3. Quest matching

For imports without current quest IDs, match by normalized title.

Implement a title normalizer that:
- lowercases
- trims whitespace
- removes punctuation
- replaces German/English dash variants
- treats multiple spaces as one
- normalizes common part markers:
  - Part 1
  - Part I
  - Pt. 1
  - - Part 1

For higher confidence matching, also use trader if provided.

Result types should include confidence:
- exact_id
- exact_title_trader
- exact_title
- ambiguous
- unmatched

Do not apply ambiguous matches automatically.

4. Import preview

Update the UI so importing a JSON file does not immediately overwrite progress blindly.

Add an import preview panel or modal with:
- matched rows count
- unmatched rows count
- ambiguous rows count
- invalid status count
- a list of unmatched/ambiguous entries
- buttons:
  - Apply matched import
  - Cancel

When applying:
- only apply exact ID and exact title matches
- do not apply ambiguous/unmatched rows
- merge into current progress instead of resetting everything
- show a message with how many statuses were applied

5. Keep existing native import/export working

Existing native export/import should still work exactly.

If a native export uses current quest IDs, it should import with exact_id matches.

6. Safety

- Never crash on malformed JSON.
- Never crash on unknown quest IDs.
- Never crash on empty files.
- Imported unknown IDs should be shown in preview as unmatched.
- Invalid statuses should be shown in preview and ignored when applying.

7. Tests or testable pure functions

Keep the parser/matcher as pure functions.

Add small unit tests if there is already a test setup. If no test setup exists, do not add a heavy test framework just for this. Instead, add a small Node script or keep the functions very easy to test manually.

At minimum add clear types:

export interface ImportPreview {
  appliedCandidates: ImportCandidate[];
  unmatched: ImportCandidate[];
  ambiguous: ImportCandidate[];
  invalid: ImportCandidate[];
  summary: {
    totalRows: number;
    exactId: number;
    exactTitleTrader: number;
    exactTitle: number;
    ambiguous: number;
    unmatched: number;
    invalid: number;
  };
}

8. UI details

The import UI can be simple.

Suggested behavior:
- User clicks Import JSON.
- File is parsed.
- Import preview appears above the quest list.
- User reviews summary.
- User clicks Apply matched import.
- Progress is merged and saved to localStorage.

9. Verification

Run:

npm install
npm run build

If you add a data generation dependency or change generated quest types, also run:

npm run data:validate

10. Commit and PR

Commit message:

Add progress import mapping

Open a pull request into main.

Pull request title:

Add progress import mapping

Pull request body:

## Summary
- Adds safe progress import mapping for old tracker exports
- Supports native ID imports and title/trader based matching
- Adds import preview with matched, ambiguous, unmatched, and invalid rows
- Keeps import local-only and merges matched progress into current progress

## Verification
- npm install
- npm run build

## Notes
This prepares the app for importing Adrian's old Excel/JSON tracker progress. Ambiguous and unmatched rows are intentionally not applied automatically.
```
