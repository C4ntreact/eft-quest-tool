import type { ProgressState, Quest, QuestStatus } from "../types";
import { QUEST_STATUSES } from "./progress";

export type ImportMatchConfidence =
  | "exact_id"
  | "exact_title_trader"
  | "exact_title"
  | "ambiguous"
  | "unmatched";

export interface ImportCandidate {
  rowNumber: number;
  raw: unknown;
  rawId?: string;
  rawTitle?: string;
  rawTrader?: string;
  rawStatus?: string;
  status?: QuestStatus;
  questId?: string;
  questTitle?: string;
  confidence: ImportMatchConfidence;
  reason?: string;
  matches?: string[];
}

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

type ImportRow = {
  rowNumber: number;
  raw: unknown;
  rawId?: string;
  rawTitle?: string;
  rawTrader?: string;
  rawStatus?: string;
  reason?: string;
};

const statusMap = new Map<string, QuestStatus>([
  ["completed", "completed"],
  ["complete", "completed"],
  ["done", "completed"],
  ["erledigt", "completed"],
  ["abgeschlossen", "completed"],
  ["fertig", "completed"],
  ["active", "active"],
  ["aktiv", "active"],
  ["in progress", "active"],
  ["started", "active"],
  ["angefangen", "active"],
  ["not_started", "not_started"],
  ["not started", "not_started"],
  ["nicht angefangen", "not_started"],
  ["offen", "not_started"],
  ["todo", "not_started"],
  ["to do", "not_started"],
  ["blocked", "blocked"],
  ["blockiert", "blocked"],
  ["locked", "blocked"],
  ["gesperrt", "blocked"],
  ["skipped", "skipped"],
  ["überspringen", "skipped"],
  ["Ã¼berspringen", "skipped"],
  ["ueberspringen", "skipped"],
  ["skip", "skipped"],
]);

const questStatuses = new Set<string>(QUEST_STATUSES);

export function parseImportPreviewJson(rawJson: string, quests: readonly Quest[]): ImportPreview {
  if (!rawJson.trim()) {
    return createPreviewFromCandidates([
      {
        rowNumber: 1,
        raw: rawJson,
        confidence: "unmatched",
        reason: "Import file is empty.",
      },
    ]);
  }

  try {
    return createImportPreview(JSON.parse(rawJson), quests);
  } catch (error) {
    return createPreviewFromCandidates([
      {
        rowNumber: 1,
        raw: rawJson,
        confidence: "unmatched",
        reason: error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON.",
      },
    ]);
  }
}

export function createImportPreview(input: unknown, quests: readonly Quest[]): ImportPreview {
  const rows = extractImportRows(input);
  const questIndex = createQuestIndex(quests);
  const candidates = rows.map((row) => mapImportRow(row, questIndex));

  return createPreviewFromCandidates(candidates);
}

export function applyImportPreview(progress: ProgressState, preview: ImportPreview): ProgressState {
  const nextProgress = { ...progress };

  for (const candidate of preview.appliedCandidates) {
    if (candidate.questId && candidate.status) {
      nextProgress[candidate.questId] = candidate.status;
    }
  }

  return nextProgress;
}

export function normalizeQuestTitle(title: string): string {
  let normalized = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\bpt\.?\s+([ivx]+|\d+)\b/g, (_match, part: string) => `part ${normalizePartNumber(part)}`)
    .replace(/\bpart\s+([ivx]+|\d+)\b/g, (_match, part: string) => `part ${normalizePartNumber(part)}`)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  normalized = normalized.replace(/\bpart\s+([ivx]+)\b/g, (_match, part: string) => `part ${normalizePartNumber(part)}`);

  return normalized;
}

function extractImportRows(input: unknown): ImportRow[] {
  if (Array.isArray(input)) {
    return input.map((row, index) => rowToImportRow(row, index + 1));
  }

  if (!isRecord(input)) {
    return [
      {
        rowNumber: 1,
        raw: input,
        reason: "Import must be a JSON object or an array of quest rows.",
      },
    ];
  }

  const rowContainer = input.quests ?? input.rows ?? input.progressRows;
  if (Array.isArray(rowContainer)) {
    return rowContainer.map((row, index) => rowToImportRow(row, index + 1));
  }

  if (isRecord(input.progress)) {
    return progressRecordToRows(input.progress);
  }

  if (looksLikeProgressRecord(input)) {
    return progressRecordToRows(input);
  }

  return [
    {
      rowNumber: 1,
      raw: input,
      reason: "Import object did not contain progress, quests, rows, or progressRows.",
    },
  ];
}

function progressRecordToRows(progressRecord: Record<string, unknown>): ImportRow[] {
  return Object.entries(progressRecord).map(([rawId, rawStatus], index) => ({
    rowNumber: index + 1,
    raw: { id: rawId, status: rawStatus },
    rawId,
    rawStatus: stringifyValue(rawStatus),
  }));
}

function rowToImportRow(row: unknown, rowNumber: number): ImportRow {
  if (!isRecord(row)) {
    return {
      rowNumber,
      raw: row,
    };
  }

  return {
    rowNumber,
    raw: row,
    rawId: firstString(getField(row, "id", "questId", "quest_id", "key")),
    rawTitle: firstString(getField(row, "title", "questTitle", "quest", "name")),
    rawTrader: firstString(getField(row, "trader", "traderName")),
    rawStatus: firstString(getField(row, "status", "state", "progress")),
  };
}

function mapImportRow(
  row: ImportRow & { reason?: string },
  questIndex: ReturnType<typeof createQuestIndex>,
): ImportCandidate {
  const baseCandidate: ImportCandidate = {
    rowNumber: row.rowNumber,
    raw: row.raw,
    rawId: row.rawId,
    rawTitle: row.rawTitle,
    rawTrader: row.rawTrader,
    rawStatus: row.rawStatus,
    confidence: "unmatched",
    reason: row.reason,
  };

  const status = normalizeImportStatus(row.rawStatus);
  if (!status) {
    return {
      ...baseCandidate,
      reason: row.rawStatus ? `Unknown status: ${row.rawStatus}` : "Missing status.",
    };
  }

  if (row.rawId && questIndex.byId.has(row.rawId)) {
    const quest = questIndex.byId.get(row.rawId)!;
    return toMatchedCandidate(baseCandidate, quest, status, "exact_id");
  }

  if (row.rawTitle) {
    const normalizedTitle = normalizeQuestTitle(row.rawTitle);

    if (row.rawTrader) {
      const titleTraderMatches = questIndex.byTitleTrader.get(makeTitleTraderKey(normalizedTitle, row.rawTrader)) ?? [];
      if (titleTraderMatches.length === 1) {
        return toMatchedCandidate(baseCandidate, titleTraderMatches[0], status, "exact_title_trader");
      }

      if (titleTraderMatches.length > 1) {
        return toAmbiguousCandidate(baseCandidate, titleTraderMatches, status, "Multiple quests match title and trader.");
      }
    }

    const titleMatches = questIndex.byTitle.get(normalizedTitle) ?? [];
    if (titleMatches.length === 1) {
      return toMatchedCandidate(baseCandidate, titleMatches[0], status, "exact_title");
    }

    if (titleMatches.length > 1) {
      return toAmbiguousCandidate(baseCandidate, titleMatches, status, "Multiple quests match title.");
    }
  }

  return {
    ...baseCandidate,
    status,
    reason: row.rawId ? `No current quest matched ID ${row.rawId}.` : "No current quest matched this row.",
  };
}

function toMatchedCandidate(
  candidate: ImportCandidate,
  quest: Quest,
  status: QuestStatus,
  confidence: "exact_id" | "exact_title_trader" | "exact_title",
): ImportCandidate {
  return {
    ...candidate,
    status,
    questId: quest.id,
    questTitle: quest.title,
    confidence,
    reason: undefined,
  };
}

function toAmbiguousCandidate(
  candidate: ImportCandidate,
  matches: readonly Quest[],
  status: QuestStatus,
  reason: string,
): ImportCandidate {
  return {
    ...candidate,
    status,
    confidence: "ambiguous",
    reason,
    matches: matches.map((quest) => `${quest.title} (${quest.trader})`),
  };
}

function createQuestIndex(quests: readonly Quest[]) {
  const byId = new Map<string, Quest>();
  const byTitle = new Map<string, Quest[]>();
  const byTitleTrader = new Map<string, Quest[]>();

  for (const quest of quests) {
    const normalizedTitle = normalizeQuestTitle(quest.title);

    byId.set(quest.id, quest);
    byTitle.set(normalizedTitle, [...(byTitle.get(normalizedTitle) ?? []), quest]);
    byTitleTrader.set(makeTitleTraderKey(normalizedTitle, quest.trader), [
      ...(byTitleTrader.get(makeTitleTraderKey(normalizedTitle, quest.trader)) ?? []),
      quest,
    ]);
  }

  return {
    byId,
    byTitle,
    byTitleTrader,
  };
}

function createPreviewFromCandidates(candidates: ImportCandidate[]): ImportPreview {
  const invalid = candidates.filter((candidate) => !candidate.status);
  const ambiguous = candidates.filter((candidate) => candidate.status && candidate.confidence === "ambiguous");
  const unmatched = candidates.filter((candidate) => candidate.status && candidate.confidence === "unmatched");
  const appliedCandidates = candidates.filter(
    (candidate) =>
      candidate.status &&
      (candidate.confidence === "exact_id" ||
        candidate.confidence === "exact_title_trader" ||
        candidate.confidence === "exact_title"),
  );

  return {
    appliedCandidates,
    unmatched,
    ambiguous,
    invalid,
    summary: {
      totalRows: candidates.length,
      exactId: appliedCandidates.filter((candidate) => candidate.confidence === "exact_id").length,
      exactTitleTrader: appliedCandidates.filter((candidate) => candidate.confidence === "exact_title_trader").length,
      exactTitle: appliedCandidates.filter((candidate) => candidate.confidence === "exact_title").length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
      invalid: invalid.length,
    },
  };
}

function normalizeImportStatus(value: string | undefined): QuestStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—―_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (questStatuses.has(value)) {
    return value as QuestStatus;
  }

  return statusMap.get(normalized) ?? statusMap.get(value.trim().toLowerCase()) ?? null;
}

function makeTitleTraderKey(normalizedTitle: string, trader: string): string {
  return `${normalizedTitle}::${trader.trim().toLowerCase()}`;
}

function normalizePartNumber(part: string): string {
  const lowered = part.toLowerCase();
  const roman: Record<string, string> = {
    i: "1",
    ii: "2",
    iii: "3",
    iv: "4",
    v: "5",
    vi: "6",
    vii: "7",
    viii: "8",
    ix: "9",
    x: "10",
  };

  return roman[lowered] ?? lowered;
}

function looksLikeProgressRecord(value: Record<string, unknown>): boolean {
  return Object.values(value).every((status) => typeof status === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = stringifyValue(value);
    if (stringValue) {
      return stringValue;
    }
  }

  return undefined;
}

function getField(row: Record<string, unknown>, ...names: string[]): unknown {
  const lowerCaseNames = new Set(names.map((name) => name.toLowerCase()));

  for (const [key, value] of Object.entries(row)) {
    if (lowerCaseNames.has(key.toLowerCase())) {
      return value;
    }
  }

  return undefined;
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}
