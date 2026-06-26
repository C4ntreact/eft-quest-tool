import type { ProgressExport, ProgressImportResult, ProgressState, Quest, QuestStatus } from "../types";

export const STORAGE_KEY = "eftQuestTool.progress.v1";

export const QUEST_STATUSES: readonly QuestStatus[] = [
  "not_started",
  "active",
  "completed",
  "blocked",
  "skipped",
];

const statusSet = new Set<string>(QUEST_STATUSES);

export function createInitialProgress(quests: readonly Quest[]): ProgressState {
  return Object.fromEntries(quests.map((quest) => [quest.id, "not_started" satisfies QuestStatus]));
}

export function normalizeProgress(quests: readonly Quest[], progress: ProgressState): ProgressState {
  const normalized = createInitialProgress(quests);

  for (const quest of quests) {
    const status = progress[quest.id];
    if (statusSet.has(status)) {
      normalized[quest.id] = status;
    }
  }

  return normalized;
}

export function loadProgress(quests: readonly Quest[], storage: Storage = window.localStorage): ProgressState {
  const fallback = createInitialProgress(quests);
  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isProgressRecord(parsed)) {
      return fallback;
    }

    return normalizeProgress(quests, parsed);
  } catch {
    return fallback;
  }
}

export function saveProgress(progress: ProgressState, storage: Storage = window.localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress, null, 2));
}

export function createProgressExport(progress: ProgressState): ProgressExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    progress,
  };
}

export function parseProgressImport(raw: string, quests: readonly Quest[]): ProgressImportResult {
  try {
    const parsed = JSON.parse(raw);
    const progressRecord = getImportProgressRecord(parsed);

    if (!progressRecord) {
      return {
        ok: false,
        progress: createInitialProgress(quests),
        errors: ["Import must be a progress object or an export with schemaVersion and progress."],
      };
    }

    const knownQuestIds = new Set(quests.map((quest) => quest.id));
    const errors: string[] = [];

    for (const [questId, status] of Object.entries(progressRecord)) {
      if (!knownQuestIds.has(questId)) {
        errors.push(`Unknown quest ID: ${questId}`);
      }

      if (!statusSet.has(status)) {
        errors.push(`Invalid status for ${questId}: ${status}`);
      }
    }

    return {
      ok: errors.length === 0,
      progress: normalizeProgress(quests, progressRecord),
      errors,
    };
  } catch (error) {
    return {
      ok: false,
      progress: createInitialProgress(quests),
      errors: [error instanceof Error ? error.message : "Import JSON could not be parsed."],
    };
  }
}

function isProgressRecord(value: unknown): value is ProgressState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((status) => typeof status === "string");
}

function getImportProgressRecord(value: unknown): ProgressState | null {
  if (isProgressRecord(value)) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const exportLike = value as { progress?: unknown; schemaVersion?: unknown };

  if (exportLike.schemaVersion !== 1 || !isProgressRecord(exportLike.progress)) {
    return null;
  }

  return exportLike.progress;
}
