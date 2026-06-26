# Data Sources

Quest data should be handled as static project data.

The application should not contain Kappa logic hardcoded in UI components. Quest requirements, alternatives, and Kappa flags belong into data files and normalization utilities.

## Candidate source files

A useful public dataset is the `quests.json` file from `TarkovTracker/tarkovdata`.

Fields that are useful for this project:

- quest id
- title
- required quests
- required level
- alternative quests
- Kappa exclusion flag
- wiki URL
- objectives

## Runtime rule

Version 1 should run without a backend. Once quest data is included in the repository, the app should be usable offline.

## Future normalization script

A later script can transform raw quest data into the app format:

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

The first prototype may use a small sample dataset. The UI and validation logic should be written so a full generated dataset can replace the sample later without changing the components.
