# Codex Start Prompt

Use this prompt for the first Codex implementation pass.

```text
Build the first working version of this Escape from Tarkov quest progression tool.

Read README.md, AGENTS.md, docs/SPEC.md, and docs/DATA_SOURCES.md first.

Implement a React + TypeScript + Vite app with no backend and no database.

Create or update these files:

- package.json
- index.html
- src/main.tsx
- src/App.tsx
- src/types.ts
- src/data/quests.json
- src/utils/progress.ts
- src/utils/validation.ts
- src/utils/questGraph.ts
- src/styles.css or equivalent CSS file

Functional requirements:

1. Use a small sample quest dataset in src/data/quests.json for now.
2. Every quest has a status: not_started, active, completed, blocked, skipped.
3. Store progress in localStorage under eftQuestTool.progress.v1.
4. Display a dashboard with total quests, completed quests, Kappa quest count, and completed Kappa quests.
5. Display a quest list/tree ordered by prerequisites.
6. Add filters for search, trader, status, and Kappa-only.
7. Completed quests must be visually faded and crossed out.
8. Add import/export buttons for progress JSON.
9. Add a validation panel for missing prerequisites and mutually exclusive completed alternatives.
10. Keep validation and graph-building functions pure and type-safe.

Do not add Supabase, Firebase, authentication, a backend server, scraping, browser extensions, or automatic game/account sync.

Prioritize correct logic and simple maintainable code over visual polish.

After implementation, make sure npm install and npm run build succeed.
```
