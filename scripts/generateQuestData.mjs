import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MIN_EXPECTED_QUESTS = 400;
const MIN_EXPECTED_KAPPA_QUESTS = 150;
const OUTPUT_PATH = path.resolve("src/data/quests.json");
const TARKOVTRACKER_QUESTS_URL = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/quests.json";
const TARKOV_DEV_GRAPHQL_URL = "https://api.tarkov.dev/graphql";
const DEFAULT_SOURCE = "tarkov-dev";
const TARKOVTRACKER_TRADERS = new Map([
  [0, "Prapor"],
  [1, "Therapist"],
  [2, "Skier"],
  [3, "Peacekeeper"],
  [4, "Mechanic"],
  [5, "Ragman"],
  [6, "Jaeger"],
  [7, "Fence"],
]);

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate");
const allowLowCounts = args.includes("--allow-low-counts");
const source = getArgValue("--source") ?? DEFAULT_SOURCE;
const inputPath = getArgValue("--input");

const result = await loadSourceData(source, inputPath);
const { quests, issues, metrics } = result;

printMetrics(metrics, issues);
validateGeneratedQuests(quests);
validateSanityCounts(metrics, allowLowCounts);

if (validateOnly) {
  console.log(`Validated ${quests.length} generated quests.`);
} else {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(quests, null, 2)}\n`, "utf8");
  console.log(`Generated ${quests.length} quests at ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function loadSourceData(sourceName, sourceInputPath) {
  if (sourceName === "tarkov-dev") {
    return loadTarkovDevData(sourceInputPath);
  }

  if (sourceName === "tarkovtracker") {
    return loadTarkovTrackerData(sourceInputPath);
  }

  throw new Error(`Unknown source "${sourceName}". Use "tarkov-dev" or "tarkovtracker".`);
}

async function loadTarkovDevData(sourceInputPath) {
  const fetchedAt = new Date().toISOString();
  const rawTasks = sourceInputPath ? JSON.parse(await readFile(path.resolve(sourceInputPath), "utf8")) : await fetchTarkovDevTasks();
  const trackerQuests = await fetchTarkovTrackerQuests();
  const result = normalizeTarkovDevTasks(rawTasks, trackerQuests);

  return {
    ...result,
    metrics: {
      sourceName: "tarkov.dev GraphQL tasks",
      sourceUrl: TARKOV_DEV_GRAPHQL_URL,
      fetchedAt,
      rawQuestCount: rawTasks.length,
      generatedQuestCount: result.quests.length,
      kappaRequiredQuestCount: result.quests.filter((quest) => quest.kappaRequired).length,
      collectorTitle: result.collector?.title ?? null,
      collectorRequiredLevel: result.collector?.requiredLevel ?? null,
      collectorPrerequisiteCount: result.collector?.taskRequirementCount ?? 0,
    },
  };
}

async function fetchTarkovDevTasks() {
// Discovered via GraphQL introspection on 2026-06-26. Task exposes: id,
// tarkovDataId, name, trader.name, map.name, wikiLink, minPlayerLevel,
// kappaRequired, factionName, and taskRequirements { task { id, tarkovDataId, name }, status }.
  const query = `{
    tasks {
      id
      tarkovDataId
      name
      trader { name }
      map { name }
      wikiLink
      minPlayerLevel
      kappaRequired
      factionName
      taskRequirements {
        task { id tarkovDataId name factionName }
        status
      }
    }
  }`;

  const response = await fetch(TARKOV_DEV_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tarkov.dev tasks: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`tarkov.dev GraphQL error: ${JSON.stringify(body.errors)}`);
  }

  if (!Array.isArray(body.data?.tasks)) {
    throw new Error("tarkov.dev response did not include a tasks array.");
  }

  return body.data.tasks;
}

function normalizeTarkovDevTasks(rawTasksValue, trackerQuestsValue) {
  if (!Array.isArray(rawTasksValue)) {
    throw new Error("Expected tarkov.dev task data to be an array.");
  }

  const rawTasks = rawTasksValue.filter((task) => task && typeof task === "object");
  const idBySourceKey = new Map(rawTasks.map((task) => [getTarkovDevSourceKey(task), createQuestId(task)]));
  const idByTarkovDataId = new Map(
    rawTasks
      .filter((task) => task.tarkovDataId !== null && task.tarkovDataId !== undefined)
      .map((task) => [String(task.tarkovDataId), createQuestId(task)]),
  );
  const supplementalAlternatives = buildTrackerAlternativeMap(trackerQuestsValue, idByTarkovDataId);
  const collectorTask = rawTasks.find((task) => String(task.name).toLowerCase() === "collector");
  const collectorFallbackRequiredIds = new Set(
    (collectorTask?.taskRequirements ?? []).map((requirement) => idBySourceKey.get(getTarkovDevSourceKey(requirement.task))).filter(Boolean),
  );
  const hasExplicitKappa = rawTasks.some((task) => typeof task.kappaRequired === "boolean");
  const issues = [];

  if (!collectorTask) {
    issues.push("Warning: Collector task was not found in tarkov.dev data.");
  }

  const quests = rawTasks
    .map((task) => {
      const prerequisiteGroups = normalizeTarkovDevPrerequisites(task.taskRequirements, idBySourceKey);
      const id = createQuestId(task);

      return {
        id,
        title: String(task.name ?? `Task ${getTarkovDevSourceKey(task)}`),
        trader: String(task.trader?.name ?? "Unknown"),
        kappaRequired: hasExplicitKappa ? task.kappaRequired === true : collectorFallbackRequiredIds.has(id),
        requiredLevel: typeof task.minPlayerLevel === "number" ? task.minPlayerLevel : null,
        prerequisites: unique(prerequisiteGroups.flat()),
        prerequisiteGroups,
        alternatives: supplementalAlternatives.get(id) ?? [],
        map: typeof task.map?.name === "string" ? task.map.name : null,
        wikiUrl: typeof task.wikiLink === "string" ? task.wikiLink : null,
        sourceId: getTarkovDevSourceKey(task),
      };
    })
    .sort(compareQuests);

  return {
    quests,
    issues,
    collector: collectorTask
      ? {
          title: collectorTask.name,
          requiredLevel: typeof collectorTask.minPlayerLevel === "number" ? collectorTask.minPlayerLevel : null,
          taskRequirementCount: Array.isArray(collectorTask.taskRequirements) ? collectorTask.taskRequirements.length : 0,
        }
      : null,
  };
}

function normalizeTarkovDevPrerequisites(requirements, idBySourceKey) {
  if (!Array.isArray(requirements)) {
    return [];
  }

  return requirements
    .filter((requirement) => Array.isArray(requirement.status) && requirement.status.includes("complete"))
    .map((requirement) => idBySourceKey.get(getTarkovDevSourceKey(requirement.task)))
    .filter(Boolean)
    .map((questId) => [questId]);
}

async function loadTarkovTrackerData(sourceInputPath) {
  const fetchedAt = new Date().toISOString();
  const rawQuests = sourceInputPath
    ? JSON.parse(await readFile(path.resolve(sourceInputPath), "utf8"))
    : await fetchTarkovTrackerQuests();
  const result = normalizeTarkovTrackerQuests(rawQuests);

  return {
    ...result,
    metrics: {
      sourceName: "TarkovTracker/tarkovdata quests.json",
      sourceUrl: sourceInputPath ? path.resolve(sourceInputPath) : TARKOVTRACKER_QUESTS_URL,
      fetchedAt,
      rawQuestCount: rawQuests.length,
      generatedQuestCount: result.quests.length,
      kappaRequiredQuestCount: result.quests.filter((quest) => quest.kappaRequired).length,
      collectorTitle: result.collector?.title ?? null,
      collectorRequiredLevel: result.collector?.requiredLevel ?? null,
      collectorPrerequisiteCount: result.collector?.taskRequirementCount ?? 0,
    },
  };
}

async function fetchTarkovTrackerQuests() {
  const response = await fetch(TARKOVTRACKER_QUESTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch TarkovTracker quests.json: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function normalizeTarkovTrackerQuests(rawQuestsValue) {
  if (!Array.isArray(rawQuestsValue)) {
    throw new Error("Expected TarkovTracker quest data to be an array.");
  }

  const rawQuests = rawQuestsValue.filter((quest) => quest && typeof quest === "object");
  const idBySourceId = new Map(rawQuests.map((quest) => [String(quest.id), createQuestId(quest)]));
  const collectorQuest = rawQuests.find((quest) => String(quest.title).toLowerCase() === "collector");
  const collectorRequiredSourceIds = new Set(collectSourceIds(collectorQuest?.require?.quests));
  const issues = [];

  if (!collectorQuest) {
    issues.push("Warning: Collector quest was not found in TarkovTracker data.");
  }

  const quests = rawQuests
    .map((quest) => {
      const prerequisiteGroups = normalizeTrackerQuestGroups(quest.require?.quests, idBySourceId);
      const sourceId = quest.id;

      return {
        id: createQuestId(quest),
        title: String(quest.locales?.en ?? quest.title ?? `Quest ${sourceId}`),
        trader: getTrackerTraderName(quest.giver),
        kappaRequired: collectorRequiredSourceIds.has(String(sourceId)),
        requiredLevel: typeof quest.require?.level === "number" ? quest.require.level : null,
        prerequisites: unique(prerequisiteGroups.flat()),
        prerequisiteGroups,
        alternatives: normalizeTrackerQuestIds(quest.alternatives, idBySourceId),
        map: null,
        wikiUrl: typeof quest.wiki === "string" ? quest.wiki : null,
        sourceId,
      };
    })
    .sort(compareQuests);

  return {
    quests,
    issues,
    collector: collectorQuest
      ? {
          title: collectorQuest.title,
          requiredLevel: typeof collectorQuest.require?.level === "number" ? collectorQuest.require.level : null,
          taskRequirementCount: collectorRequiredSourceIds.size,
        }
      : null,
  };
}

function buildTrackerAlternativeMap(trackerQuestsValue, idByTarkovDataId) {
  const alternativesById = new Map();
  if (!Array.isArray(trackerQuestsValue)) {
    return alternativesById;
  }

  for (const trackerQuest of trackerQuestsValue) {
    const questId = idByTarkovDataId.get(String(trackerQuest.id));
    if (!questId || !Array.isArray(trackerQuest.alternatives)) {
      continue;
    }

    const alternatives = normalizeTrackerQuestIds(trackerQuest.alternatives, idByTarkovDataId);
    if (alternatives.length > 0) {
      alternativesById.set(questId, alternatives);
    }
  }

  return alternativesById;
}

function createQuestId(quest) {
  return `q-${getQuestIdKey(quest)}-${slugify(String(quest.locales?.en ?? quest.title ?? quest.name ?? "quest"))}`;
}

function getQuestIdKey(quest) {
  const factionSuffix =
    typeof quest.factionName === "string" && quest.factionName !== "Any" ? `-${slugify(quest.factionName)}` : "";

  if (quest.tarkovDataId !== null && quest.tarkovDataId !== undefined) {
    return `${String(quest.tarkovDataId)}${factionSuffix}`;
  }

  return String(quest.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getTarkovDevSourceKey(task) {
  return String(task?.id);
}

function slugify(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "quest";
}

function getTrackerTraderName(rawTraderId) {
  return TARKOVTRACKER_TRADERS.get(rawTraderId) ?? `Trader ${String(rawTraderId)}`;
}

function normalizeTrackerQuestGroups(value, idBySourceId) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeTrackerQuestIds(Array.isArray(entry) ? entry : [entry], idBySourceId))
    .filter((group) => group.length > 0);
}

function normalizeTrackerQuestIds(value, idBySourceId) {
  return unique(collectSourceIds(value).map((sourceId) => idBySourceId.get(sourceId)).filter(Boolean));
}

function collectSourceIds(value) {
  if (!Array.isArray(value)) {
    return isQuestSourceId(value) ? [String(value)] : [];
  }

  return value.flatMap((entry) => collectSourceIds(entry));
}

function isQuestSourceId(value) {
  return typeof value === "number" || (typeof value === "string" && value.length > 0);
}

function unique(values) {
  return Array.from(new Set(values));
}

function compareQuests(a, b) {
  const traderCompare = a.trader.localeCompare(b.trader);
  if (traderCompare !== 0) {
    return traderCompare;
  }

  const levelCompare = (a.requiredLevel ?? 0) - (b.requiredLevel ?? 0);
  if (levelCompare !== 0) {
    return levelCompare;
  }

  return a.title.localeCompare(b.title);
}

function printMetrics(metrics, issues) {
  console.log(`Source: ${metrics.sourceName}`);
  console.log(`Source URL: ${metrics.sourceUrl}`);
  console.log(`Fetch timestamp: ${metrics.fetchedAt}`);
  console.log(`Total raw quests: ${metrics.rawQuestCount}`);
  console.log(`Total generated quests: ${metrics.generatedQuestCount}`);
  console.log(`Total Kappa-required quests: ${metrics.kappaRequiredQuestCount}`);
  console.log(`Collector quest title: ${metrics.collectorTitle ?? "not found"}`);
  console.log(`Collector required level: ${metrics.collectorRequiredLevel ?? "unknown"}`);
  console.log(`Collector prerequisite count: ${metrics.collectorPrerequisiteCount}`);

  if (metrics.generatedQuestCount < MIN_EXPECTED_QUESTS) {
    console.warn(
      `Warning: generated quest count ${metrics.generatedQuestCount} is below sanity threshold ${MIN_EXPECTED_QUESTS}.`,
    );
  }

  if (metrics.kappaRequiredQuestCount < MIN_EXPECTED_KAPPA_QUESTS) {
    console.warn(
      `Warning: Kappa-required quest count ${metrics.kappaRequiredQuestCount} is below sanity threshold ${MIN_EXPECTED_KAPPA_QUESTS}.`,
    );
  }

  for (const issue of issues) {
    console.warn(issue);
  }
}

function validateSanityCounts(metrics, isAllowedLowCounts) {
  const lowQuestCount = metrics.generatedQuestCount < MIN_EXPECTED_QUESTS;
  const lowKappaCount = metrics.kappaRequiredQuestCount < MIN_EXPECTED_KAPPA_QUESTS;

  if ((lowQuestCount || lowKappaCount) && !isAllowedLowCounts) {
    throw new Error(
      `Generated data failed sanity thresholds. Use --allow-low-counts only when intentionally validating a fallback source.`,
    );
  }
}

function validateGeneratedQuests(quests) {
  const ids = new Set(quests.map((quest) => quest.id));
  const seenIds = new Set();
  const errors = [];

  for (const quest of quests) {
    if (seenIds.has(quest.id)) {
      errors.push(`Duplicate generated quest ID: ${quest.id}`);
    }
    seenIds.add(quest.id);

    if (!quest.title || !quest.trader) {
      errors.push(`Quest ${quest.id} is missing title or trader.`);
    }

    for (const prerequisiteId of quest.prerequisites) {
      if (!ids.has(prerequisiteId)) {
        errors.push(`${quest.id} references missing prerequisite ${prerequisiteId}.`);
      }
    }

    for (const group of quest.prerequisiteGroups ?? []) {
      if (!Array.isArray(group) || group.length === 0) {
        errors.push(`${quest.id} has an empty prerequisite group.`);
      }

      for (const prerequisiteId of group) {
        if (!ids.has(prerequisiteId)) {
          errors.push(`${quest.id} references missing grouped prerequisite ${prerequisiteId}.`);
        }
      }
    }

    for (const alternativeId of quest.alternatives ?? []) {
      if (!ids.has(alternativeId)) {
        errors.push(`${quest.id} references missing alternative ${alternativeId}.`);
      }
    }
  }

  if (!quests.some((quest) => quest.kappaRequired)) {
    errors.push("No Kappa-required quests were generated.");
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}
