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

  for (const quest of quests) {
    if (progress[quest.id] !== "completed" && progress[quest.id] !== "active") {
      continue;
    }

    const incompletePrerequisites = quest.prerequisites.filter(
      (prerequisiteId) => progress[prerequisiteId] !== "completed",
    );

    if (incompletePrerequisites.length > 0) {
      issues.push({
        id: `completed-without-prerequisites-${quest.id}`,
        severity: "warning",
        message: `${quest.title} is ${progress[quest.id]} but has incomplete prerequisites: ${incompletePrerequisites
          .map((id) => questById.get(id)?.title ?? id)
          .join(", ")}.`,
        questIds: [quest.id, ...incompletePrerequisites],
      });
    }

    for (const alternativeId of quest.alternatives) {
      if (progress[alternativeId] === "completed" && quest.id < alternativeId) {
        issues.push({
          id: `mutually-exclusive-completed-${quest.id}-${alternativeId}`,
          severity: "warning",
          message: `${quest.title} and ${questById.get(alternativeId)?.title ?? alternativeId} are mutually exclusive but both completed.`,
          questIds: [quest.id, alternativeId],
        });
      }
    }
  }

  return issues;
}
