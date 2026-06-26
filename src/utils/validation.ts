import type { ProgressState, Quest, ValidationIssue } from "../types";

export function validateQuestData(quests: readonly Quest[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const questIds = new Set(quests.map((quest) => quest.id));
  const seenIds = new Set<string>();

  for (const quest of quests) {
    if (seenIds.has(quest.id)) {
      issues.push({
        id: `duplicate-id-${quest.id}`,
        severity: "error",
        message: `Duplicate quest ID: ${quest.id}`,
        questIds: [quest.id],
      });
    }

    seenIds.add(quest.id);

    for (const prerequisiteId of quest.prerequisites) {
      if (!questIds.has(prerequisiteId)) {
        issues.push({
          id: `missing-prerequisite-${quest.id}-${prerequisiteId}`,
          severity: "error",
          message: `${quest.title} references missing prerequisite ${prerequisiteId}.`,
          questIds: [quest.id, prerequisiteId],
        });
      }
    }

    for (const group of quest.prerequisiteGroups ?? []) {
      for (const prerequisiteId of group) {
        if (!questIds.has(prerequisiteId)) {
          issues.push({
            id: `missing-prerequisite-group-${quest.id}-${prerequisiteId}`,
            severity: "error",
            message: `${quest.title} references missing prerequisite group quest ${prerequisiteId}.`,
            questIds: [quest.id, prerequisiteId],
          });
        }
      }
    }

    for (const alternativeId of quest.alternatives) {
      if (!questIds.has(alternativeId)) {
        issues.push({
          id: `missing-alternative-${quest.id}-${alternativeId}`,
          severity: "error",
          message: `${quest.title} references missing mutually exclusive quest ${alternativeId}.`,
          questIds: [quest.id, alternativeId],
        });
      }
    }
  }

  return issues;
}

export function validateProgress(quests: readonly Quest[], progress: ProgressState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const reportedAlternativePairs = new Set<string>();

  for (const quest of quests) {
    if (progress[quest.id] !== "completed" && progress[quest.id] !== "active") {
      for (const alternativeId of quest.alternatives) {
        addAlternativeIssue(quest.id, alternativeId);
      }

      continue;
    }

    const incompletePrerequisiteGroups = getIncompletePrerequisiteGroups(quest, progress, questById);

    if (incompletePrerequisiteGroups.length > 0) {
      const incompletePrerequisites = Array.from(new Set(incompletePrerequisiteGroups.flat()));
      issues.push({
        id: `missing-prerequisites-${quest.id}`,
        severity: "warning",
        message: `${quest.title} is ${progress[quest.id]} but has incomplete prerequisite group(s): ${incompletePrerequisiteGroups
          .map((group) => group.map((id) => questById.get(id)?.title ?? id).join(" or "))
          .join(", ")}.`,
        questIds: [quest.id, ...incompletePrerequisites],
      });
    }

    for (const alternativeId of quest.alternatives) {
      addAlternativeIssue(quest.id, alternativeId);
    }
  }

  return issues;

  function addAlternativeIssue(questId: string, alternativeId: string): void {
    if (progress[questId] !== "completed" || progress[alternativeId] !== "completed") {
      return;
    }

    const pairKey = [questId, alternativeId].sort().join("::");
    if (reportedAlternativePairs.has(pairKey)) {
      return;
    }

    reportedAlternativePairs.add(pairKey);
    issues.push({
      id: `mutually-exclusive-completed-${pairKey}`,
      severity: "warning",
      message: `${questById.get(questId)?.title ?? questId} and ${
        questById.get(alternativeId)?.title ?? alternativeId
      } are mutually exclusive but both completed.`,
      questIds: [questId, alternativeId],
    });
  }
}

function getIncompletePrerequisiteGroups(
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
