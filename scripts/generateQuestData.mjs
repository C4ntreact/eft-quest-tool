import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/quests.json";
const OUTPUT_PATH = path.resolve("src/data/quests.json");
const TRADERS = new Map([
  [0, "Prapor"],
  [1, "Therapist"],
  [2, "Skier"],
  [3, "Peacekeeper"],
  [4, "Mechanic"],
  [5, "Ragman"],
  [6, "Jaeger"],
  [7, "Fence"],
]);

const args = new Set(process.argv.slice(2));
const validateOnly = args.has("--validate");
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));

const rawQuests = await loadRawQuests(inputArg?.slice("--input=".length));
const { quests, issues } = normalizeQuests(rawQuests);

if (issues.length > 0) {
  for (const issue of issues) {
    console.warn(issue);
  }
}

if (validateOnly) {
  validateGeneratedQuests(quests);
  console.log(`Validated ${quests.length} generated quests.`);
} else {
  validateGeneratedQuests(quests);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(quests, null, 2)}\n`, "utf8");
  console.log(`Generated ${quests.length} quests at ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
}

async function loadRawQuests(inputPath) {
  if (inputPath) {
    return JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  }

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch quests.json: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function normalizeQuests(rawQuestsValue) {
  if (!Array.isArray(rawQuestsValue)) {
    throw new Error("Expected raw quest data to be an array.");
  }

  const rawQuests = rawQuestsValue.filter((quest) => quest && typeof quest === "object");
  const idBySourceId = new Map(rawQuests.map((quest) => [String(quest.id), createQuestId(quest)]));
  const collector = rawQuests.find((quest) => String(quest.title).toLowerCase() === "collector");
  const collectorRequiredSourceIds = new Set(collectSourceIds(collector?.require?.quests));
  const issues = [];

  if (!collector) {
    issues.push("Collector quest was not found; all kappaRequired flags will be false.");
  }

  const quests = rawQuests
    .map((quest) => {
      const prerequisiteGroups = normalizeQuestGroups(quest.require?.quests, idBySourceId);
      const prerequisites = unique(prerequisiteGroups.flat());
      const alternatives = normalizeQuestIds(quest.alternatives, idBySourceId);
      const sourceId = quest.id;

      return {
        id: createQuestId(quest),
        title: String(quest.locales?.en ?? quest.title ?? `Quest ${sourceId}`),
        trader: getTraderName(quest.giver),
        kappaRequired: collectorRequiredSourceIds.has(String(sourceId)),
        requiredLevel: typeof quest.require?.level === "number" ? quest.require.level : null,
        prerequisites,
        prerequisiteGroups,
        alternatives,
        map: null,
        wikiUrl: typeof quest.wiki === "string" ? quest.wiki : null,
        sourceId,
      };
    })
    .sort(compareQuests);

  return { quests, issues };
}

function createQuestId(quest) {
  return `q-${String(quest.id)}-${slugify(String(quest.locales?.en ?? quest.title ?? "quest"))}`;
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

function getTraderName(rawTraderId) {
  return TRADERS.get(rawTraderId) ?? `Trader ${String(rawTraderId)}`;
}

function normalizeQuestGroups(value, idBySourceId) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeQuestIds(Array.isArray(entry) ? entry : [entry], idBySourceId))
    .filter((group) => group.length > 0);
}

function normalizeQuestIds(value, idBySourceId) {
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

function validateGeneratedQuests(quests) {
  const ids = new Set();
  const errors = [];

  for (const quest of quests) {
    if (ids.has(quest.id)) {
      errors.push(`Duplicate generated quest ID: ${quest.id}`);
    }
    ids.add(quest.id);

    if (!quest.title || !quest.trader) {
      errors.push(`Quest ${quest.id} is missing title or trader.`);
    }

    for (const prerequisiteId of quest.prerequisites) {
      if (!ids.has(prerequisiteId) && !quests.some((candidate) => candidate.id === prerequisiteId)) {
        errors.push(`${quest.id} references missing prerequisite ${prerequisiteId}.`);
      }
    }

    for (const group of quest.prerequisiteGroups ?? []) {
      if (!Array.isArray(group) || group.length === 0) {
        errors.push(`${quest.id} has an empty prerequisite group.`);
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
