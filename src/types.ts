export type QuestStatus = "not_started" | "active" | "completed" | "blocked" | "skipped";

export type Trader =
  | "Prapor"
  | "Therapist"
  | "Skier"
  | "Peacekeeper"
  | "Mechanic"
  | "Ragman"
  | "Jaeger"
  | "Fence";

export interface Quest {
  id: string;
  title: string;
  trader: Trader | string;
  kappaRequired: boolean;
  requiredLevel?: number | null;
  prerequisites: string[];
  alternatives: string[];
  map?: string | null;
  wikiUrl?: string | null;
}

export type ProgressState = Record<string, QuestStatus>;

export interface QuestWithStatus extends Quest {
  status: QuestStatus;
}

export interface QuestNode extends QuestWithStatus {
  depth: number;
  missingPrerequisites: string[];
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  questIds: string[];
}

export interface ProgressImportResult {
  ok: boolean;
  progress: ProgressState;
  errors: string[];
}

export interface ProgressExport {
  schemaVersion: 1;
  exportedAt: string;
  progress: ProgressState;
}
