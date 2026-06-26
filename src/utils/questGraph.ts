import type { ProgressState, Quest, QuestNode, QuestWithStatus } from "../types";

export function attachQuestStatuses(quests: readonly Quest[], progress: ProgressState): QuestWithStatus[] {
  return quests.map((quest) => ({
    ...quest,
    status: progress[quest.id] ?? "not_started",
  }));
}

export function buildQuestTree(quests: readonly Quest[], progress: ProgressState): QuestNode[] {
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const childrenById = new Map<string, Quest[]>();
  const roots: Quest[] = [];

  for (const quest of quests) {
    const validPrerequisites = quest.prerequisites.filter((id) => questById.has(id));

    if (validPrerequisites.length === 0) {
      roots.push(quest);
    }

    for (const prerequisiteId of validPrerequisites) {
      childrenById.set(prerequisiteId, [...(childrenById.get(prerequisiteId) ?? []), quest]);
    }
  }

  const ordered: QuestNode[] = [];
  const visited = new Set<string>();
  const sortedRoots = sortQuests(roots);

  for (const root of sortedRoots) {
    visit(root, 0);
  }

  for (const quest of sortQuests(quests)) {
    if (!visited.has(quest.id)) {
      visit(quest, 0);
    }
  }

  return ordered;

  function visit(quest: Quest, depth: number): void {
    if (visited.has(quest.id)) {
      return;
    }

    visited.add(quest.id);
    ordered.push(toNode(quest, depth, progress, questById));

    for (const child of sortQuests(childrenById.get(quest.id) ?? [])) {
      visit(child, depth + 1);
    }
  }
}

export function getAvailableTraders(quests: readonly Quest[]): string[] {
  return Array.from(new Set(quests.map((quest) => quest.trader))).sort((a, b) => a.localeCompare(b));
}

function toNode(
  quest: Quest,
  depth: number,
  progress: ProgressState,
  questById: ReadonlyMap<string, Quest>,
): QuestNode {
  return {
    ...quest,
    depth,
    status: progress[quest.id] ?? "not_started",
    missingPrerequisiteGroups: getMissingPrerequisiteGroups(quest, progress, questById),
    missingPrerequisites: getMissingPrerequisiteGroups(quest, progress, questById).flat(),
  };
}

function getMissingPrerequisiteGroups(
  quest: Quest,
  progress: ProgressState,
  questById: ReadonlyMap<string, Quest>,
): string[][] {
  const groups = quest.prerequisiteGroups?.length
    ? quest.prerequisiteGroups
    : quest.prerequisites.map((prerequisiteId) => [prerequisiteId]);

  return groups
    .map((group) => group.filter((prerequisiteId) => questById.has(prerequisiteId)))
    .filter((group) => group.length > 0 && !group.some((prerequisiteId) => progress[prerequisiteId] === "completed"));
}

function sortQuests(quests: readonly Quest[]): Quest[] {
  return [...quests].sort((a, b) => {
    const traderCompare = a.trader.localeCompare(b.trader);
    if (traderCompare !== 0) {
      return traderCompare;
    }

    const levelCompare = (a.requiredLevel ?? 0) - (b.requiredLevel ?? 0);
    if (levelCompare !== 0) {
      return levelCompare;
    }

    return a.title.localeCompare(b.title);
  });
}
