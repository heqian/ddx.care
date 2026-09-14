import { Database, type Statement } from "bun:sqlite";
import { logger } from "./utils/logger";
import { ToolError } from "./utils/errors";

const ORPHADATA_API_BASE = "https://api.orphadata.com";
const FETCH_TIMEOUT_MS = 60_000;

interface OrphadataDisease {
  ORPHAcode: number;
  "Preferred term": string;
}

interface OrphadataGeneAssoc {
  Gene: {
    Symbol: string;
    name: string;
    ExternalReference?: Array<{ Source: string; Reference: string }>;
  };
  DisorderGeneAssociationType: string;
}

interface OrphadataPhenotypeAssoc {
  HPO: {
    HPOId: string;
    HPOTerm: string;
  };
  HPOFrequency: string;
}

const getDbPath = () => process.env.ORPHADATA_DB_PATH || "orphadata.sqlite";

let db: Database;
let searchDiseasesStmt: Statement;
let insertDiseaseStmt: Statement;
let getGenesStmt: Statement;
let insertGeneStmt: Statement;
let getPhenotypesStmt: Statement;
let insertPhenotypeStmt: Statement;

function initTables() {
  db = new Database(getDbPath(), { create: true });
  db.exec("PRAGMA journal_mode=WAL;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS orphadata_diseases (
      orphacode INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_diseases_name ON orphadata_diseases (name);

    CREATE TABLE IF NOT EXISTS orphadata_genes (
      orphacode INTEGER NOT NULL,
      gene_symbol TEXT NOT NULL,
      gene_name TEXT NOT NULL,
      association_type TEXT NOT NULL,
      source TEXT,
      PRIMARY KEY (orphacode, gene_symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_genes_orphacode ON orphadata_genes (orphacode);

    CREATE TABLE IF NOT EXISTS orphadata_phenotypes (
      orphacode INTEGER NOT NULL,
      hpo_id TEXT NOT NULL,
      phenotype_name TEXT NOT NULL,
      frequency TEXT,
      PRIMARY KEY (orphacode, hpo_id)
    );
    CREATE INDEX IF NOT EXISTS idx_phenotypes_orphacode ON orphadata_phenotypes (orphacode);
  `);

  searchDiseasesStmt = db.prepare(
    `SELECT orphacode, name FROM orphadata_diseases WHERE name LIKE ? ESCAPE '\\' LIMIT ?`,
  );
  insertDiseaseStmt = db.prepare(
    `INSERT OR REPLACE INTO orphadata_diseases (orphacode, name) VALUES (?, ?)`,
  );
  getGenesStmt = db.prepare(
    `SELECT gene_symbol, gene_name, association_type, source FROM orphadata_genes WHERE orphacode = ?`,
  );
  insertGeneStmt = db.prepare(
    `INSERT OR REPLACE INTO orphadata_genes (orphacode, gene_symbol, gene_name, association_type, source) VALUES (?, ?, ?, ?, ?)`,
  );
  getPhenotypesStmt = db.prepare(
    `SELECT hpo_id, phenotype_name, frequency FROM orphadata_phenotypes WHERE orphacode = ?`,
  );
  insertPhenotypeStmt = db.prepare(
    `INSERT OR REPLACE INTO orphadata_phenotypes (orphacode, hpo_id, phenotype_name, frequency) VALUES (?, ?, ?, ?)`,
  );
}

async function fetchOrphadata(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${ORPHADATA_API_BASE}${path}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Orphadata API error: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Orphadata API timeout after ${FETCH_TIMEOUT_MS}ms for ${path}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDiseases(): Promise<number> {
  const data = (await fetchOrphadata(
    "/rd-cross-referencing/orphacodes?lang=en",
  )) as {
    data: { results: OrphadataDisease[] };
  };

  const diseases = data.data.results;
  const insertMany = db.transaction((items: OrphadataDisease[]) => {
    for (const d of items) {
      insertDiseaseStmt.run(d.ORPHAcode, d["Preferred term"]);
    }
  });
  insertMany(diseases);
  return diseases.length;
}

// Sentinel marker row caching a confirmed "no data" answer so repeated
// lookups of a disease without genes/phenotypes don't re-hit the API.
// Invariant: real API results always carry a non-empty gene_symbol/hpo_id,
// so the empty string is unambiguous as the "queried, empty" sentinel. That
// invariant is enforced defensively at insert time (guards below) — an empty
// real symbol would otherwise collide with the sentinel and corrupt the
// negative-cache signal.
const NEGATIVE_CACHE_MARKER = "";

function mapGeneRows(
  rows: Array<{
    gene_symbol: string;
    gene_name: string;
    association_type: string;
    source: string | null;
  }>,
) {
  return rows
    .filter((r) => r.gene_symbol !== NEGATIVE_CACHE_MARKER)
    .map((r) => ({
      geneSymbol: r.gene_symbol,
      geneName: r.gene_name,
      associationType: r.association_type,
      source: r.source,
    }));
}

async function fetchAndCacheGenes(orphacode: number): Promise<number> {
  const data = (await fetchOrphadata(
    `/rd-associated-genes/orphacodes/${orphacode}?lang=en`,
  )) as {
    data?: {
      results?: {
        DisorderGeneAssociation?: OrphadataGeneAssoc[];
      };
    };
    error?: unknown;
  };

  const associations = data?.data?.results?.DisorderGeneAssociation;
  if (!associations || associations.length === 0) {
    // Negative cache: an empty result is still a result.
    insertGeneStmt.run(orphacode, NEGATIVE_CACHE_MARKER, "", "", null);
    return 0;
  }

  const insertMany = db.transaction(
    (
      items: Array<{
        orphacode: number;
        symbol: string;
        name: string;
        type: string;
        source: string | null;
      }>,
    ) => {
      for (const item of items) {
        // Never write an empty real symbol — it would collide with the
        // NEGATIVE_CACHE_MARKER sentinel and corrupt the "queried, empty" signal.
        if (!item.symbol) continue;
        insertGeneStmt.run(
          item.orphacode,
          item.symbol,
          item.name,
          item.type,
          item.source,
        );
      }
    },
  );

  const rows = associations.map((a) => ({
    orphacode,
    symbol: a.Gene.Symbol,
    name: a.Gene.name,
    type: a.DisorderGeneAssociationType,
    source:
      a.Gene.ExternalReference?.find((r) => r.Source === "HGNC")?.Reference ??
      null,
  }));
  insertMany(rows);
  return rows.length;
}

async function fetchAndCachePhenotypes(orphacode: number): Promise<number> {
  const data = (await fetchOrphadata(
    `/rd-phenotypes/orphacodes/${orphacode}?lang=en`,
  )) as {
    data?: {
      results?: {
        Disorder?: {
          HPODisorderAssociation?: OrphadataPhenotypeAssoc[];
        };
      };
    };
    error?: unknown;
  };

  const associations = data?.data?.results?.Disorder?.HPODisorderAssociation;
  if (!associations || associations.length === 0) {
    // Negative cache: an empty result is still a result.
    insertPhenotypeStmt.run(orphacode, NEGATIVE_CACHE_MARKER, "", null);
    return 0;
  }

  const insertMany = db.transaction(
    (
      items: Array<{
        orphacode: number;
        hpoId: string;
        name: string;
        frequency: string | null;
      }>,
    ) => {
      for (const item of items) {
        // Never write an empty real hpo_id — it would collide with the
        // NEGATIVE_CACHE_MARKER sentinel and corrupt the "queried, empty" signal.
        if (!item.hpoId) continue;
        insertPhenotypeStmt.run(
          item.orphacode,
          item.hpoId,
          item.name,
          item.frequency,
        );
      }
    },
  );

  const rows = associations.map((a) => ({
    orphacode,
    hpoId: a.HPO.HPOId,
    name: a.HPO.HPOTerm,
    frequency: a.HPOFrequency ?? null,
  }));
  insertMany(rows);
  return rows.length;
}

export async function initializeOrphadataCache(): Promise<void> {
  initTables();
  try {
    logger.info("orphadata_cache_start");
    const count = await fetchDiseases();
    logger.info("orphadata_cache_complete", { diseaseCount: count });
  } catch (error: unknown) {
    logger.warn("orphadata_cache_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Throws a typed error (not a TypeError) when the cache was never initialized. */
function ensureReady(): void {
  if (!db) {
    throw new ToolError(
      "orphadata",
      "Orphadata cache is not initialized — the Orphadata API may be unreachable",
    );
  }
}

/** Escape SQL LIKE metacharacters so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function searchDiseases(
  query: string,
  maxResults: number,
): Array<{ orphacode: number; name: string }> {
  ensureReady();
  const rows = searchDiseasesStmt.all(
    `%${escapeLike(query)}%`,
    maxResults,
  ) as Array<{
    orphacode: number;
    name: string;
  }>;
  return rows;
}

export async function getDiseaseGenes(orphacode: number): Promise<
  Array<{
    geneSymbol: string;
    geneName: string;
    associationType: string;
    source: string | null;
  }>
> {
  ensureReady();
  const readGenes = () =>
    getGenesStmt.all(orphacode) as Array<{
      gene_symbol: string;
      gene_name: string;
      association_type: string;
      source: string | null;
    }>;

  // Single read on the cached path: the raw row count (including a sentinel
  // marker row) is the "already fetched" signal, and the filtered rows are
  // the answer — both derived from one query.
  const cached = readGenes();
  if (cached.length > 0) {
    return mapGeneRows(cached);
  }

  try {
    await fetchAndCacheGenes(orphacode);
  } catch {
    return [];
  }

  // Only after a miss do we re-read to pick up freshly inserted rows.
  return mapGeneRows(readGenes());
}

export async function getDiseasePhenotypes(orphacode: number): Promise<
  Array<{
    hpoId: string;
    phenotypeName: string;
    frequency: string | null;
  }>
> {
  ensureReady();

  interface PhenotypeRow {
    hpo_id: string;
    phenotype_name: string;
    frequency: string | null;
  }
  const toDtos = (rows: PhenotypeRow[]) =>
    rows
      .filter((r) => r.hpo_id !== NEGATIVE_CACHE_MARKER)
      .map((r) => ({
        hpoId: r.hpo_id,
        phenotypeName: r.phenotype_name,
        frequency: r.frequency,
      }));
  const readAll = () => getPhenotypesStmt.all(orphacode) as PhenotypeRow[];

  // Single read on the cached path: any row (including the sentinel marker)
  // means "already fetched"; the answer is that same array filtered.
  const cached = readAll();
  if (cached.length > 0) {
    return toDtos(cached);
  }

  try {
    await fetchAndCachePhenotypes(orphacode);
  } catch {
    return [];
  }

  // Only after a miss do we re-read to pick up freshly inserted rows.
  return toDtos(readAll());
}
