import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import questsData from "./data/quests.json";
import type { ProgressState, Quest, QuestNode, QuestStatus, ValidationIssue } from "./types";
import { buildQuestTree, getAvailableTraders } from "./utils/questGraph";
import {
  QUEST_STATUSES,
  createProgressExport,
  createInitialProgress,
  loadProgress,
  normalizeProgress,
  parseProgressImport,
  saveProgress,
} from "./utils/progress";
import { validateProgress, validateQuestData } from "./utils/validation";

const quests = questsData as Quest[];

type StatusFilter = QuestStatus | "all";

interface Filters {
  search: string;
  trader: string;
  status: StatusFilter;
  kappaOnly: boolean;
}

const initialFilters: Filters = {
  search: "",
  trader: "all",
  status: "all",
  kappaOnly: false,
};

const statusLabels: Record<QuestStatus, string> = {
  not_started: "Not started",
  active: "Active",
  completed: "Completed",
  blocked: "Blocked",
  skipped: "Skipped",
};

function App() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress(quests));
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [importMessage, setImportMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveProgress(normalizeProgress(quests, progress));
  }, [progress]);

  const questTree = useMemo(() => buildQuestTree(quests, progress), [progress]);
  const traders = useMemo(() => getAvailableTraders(quests), []);
  const visibleQuests = useMemo(() => filterQuests(questTree, filters), [filters, questTree]);
  const validationIssues = useMemo(
    () => [...validateQuestData(quests), ...validateProgress(quests, progress)],
    [progress],
  );
  const stats = useMemo(() => getStats(quests, progress), [progress]);

  function updateStatus(questId: string, status: QuestStatus) {
    setProgress((current) => ({
      ...current,
      [questId]: status,
    }));
  }

  function exportProgress() {
    const exportData = createProgressExport(normalizeProgress(quests, progress));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "eft-quest-progress.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importProgress(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const result = parseProgressImport(await file.text(), quests);
    setImportMessage(result.ok ? "Progress imported." : `Import completed with issues: ${result.errors.join(" ")}`);
    setProgress(result.progress);
    event.target.value = "";
  }

  function resetProgress() {
    setProgress(createInitialProgress(quests));
    setImportMessage("Progress reset.");
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Escape from Tarkov</p>
          <h1>Quest Progression Tool</h1>
        </div>
        <div className="actions">
          <button type="button" onClick={exportProgress}>
            Export JSON
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <button type="button" className="secondary" onClick={resetProgress}>
            Reset
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json"
            onChange={importProgress}
          />
        </div>
      </header>

      {importMessage && <p className="notice">{importMessage}</p>}

      <section className="dashboard" aria-label="Quest dashboard">
        <StatCard label="Total quests" value={stats.total} />
        <StatCard label="Completed quests" value={stats.completed} />
        <StatCard label="Kappa quests" value={stats.kappaTotal} />
        <StatCard label="Completed Kappa" value={stats.kappaCompleted} />
      </section>

      <section className="controls" aria-label="Quest filters">
        <label>
          Search
          <input
            type="search"
            value={filters.search}
            placeholder="Quest or trader"
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </label>

        <label>
          Trader
          <select
            value={filters.trader}
            onChange={(event) => setFilters((current) => ({ ...current, trader: event.target.value }))}
          >
            <option value="all">All traders</option>
            {traders.map((trader) => (
              <option key={trader} value={trader}>
                {trader}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value as StatusFilter }))
            }
          >
            <option value="all">All statuses</option>
            {QUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={filters.kappaOnly}
            onChange={(event) => setFilters((current) => ({ ...current, kappaOnly: event.target.checked }))}
          />
          Kappa only
        </label>
      </section>

      <section className="content-grid">
        <section className="quest-panel" aria-labelledby="quest-list-heading">
          <div className="section-heading">
            <h2 id="quest-list-heading">Quest list</h2>
            <span>{visibleQuests.length} shown</span>
          </div>

          <div className="quest-list">
            {visibleQuests.map((quest) => (
              <QuestRow key={quest.id} quest={quest} onStatusChange={updateStatus} />
            ))}
          </div>
        </section>

        <ValidationPanel issues={validationIssues} />
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function QuestRow({
  quest,
  onStatusChange,
}: {
  quest: QuestNode;
  onStatusChange: (questId: string, status: QuestStatus) => void;
}) {
  const blockedByPrerequisites = quest.missingPrerequisites.length > 0 && quest.status !== "completed";

  return (
    <article
      className={`quest-row status-${quest.status}`}
      style={{ "--quest-depth": quest.depth } as React.CSSProperties}
    >
      <div className="quest-main">
        <div>
          <h3>{quest.title}</h3>
          <p>
            {quest.trader}
            {quest.kappaRequired ? " | Kappa" : ""}
            {blockedByPrerequisites ? ` | Missing ${quest.missingPrerequisites.length} prerequisite(s)` : ""}
          </p>
        </div>
        <select value={quest.status} onChange={(event) => onStatusChange(quest.id, event.target.value as QuestStatus)}>
          {QUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  return (
    <aside className="validation-panel" aria-labelledby="validation-heading">
      <div className="section-heading">
        <h2 id="validation-heading">Validation</h2>
        <span>{issues.length} issue(s)</span>
      </div>

      {issues.length === 0 ? (
        <p className="empty-state">No missing prerequisites or conflicting completed alternatives.</p>
      ) : (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.id} className={`issue ${issue.severity}`}>
              <strong>{issue.severity}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function filterQuests(quests: readonly QuestNode[], filters: Filters): QuestNode[] {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase();

  return quests.filter((quest) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      quest.title.toLocaleLowerCase().includes(normalizedSearch) ||
      quest.trader.toLocaleLowerCase().includes(normalizedSearch);
    const matchesTrader = filters.trader === "all" || quest.trader === filters.trader;
    const matchesStatus = filters.status === "all" || quest.status === filters.status;
    const matchesKappa = !filters.kappaOnly || quest.kappaRequired;

    return matchesSearch && matchesTrader && matchesStatus && matchesKappa;
  });
}

function getStats(quests: readonly Quest[], progress: ProgressState) {
  const completed = quests.filter((quest) => progress[quest.id] === "completed").length;
  const kappaQuests = quests.filter((quest) => quest.kappaRequired);
  const kappaCompleted = kappaQuests.filter((quest) => progress[quest.id] === "completed").length;

  return {
    total: quests.length,
    completed,
    kappaTotal: kappaQuests.length,
    kappaCompleted,
  };
}

export default App;
