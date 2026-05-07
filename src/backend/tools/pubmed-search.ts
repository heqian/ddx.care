import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON as baseFetchJSON } from "./utils/fetch";
import type { ToolResult } from "./utils/types";
import { isRetriableError } from "../utils/errors";

interface NcbiAuthor {
  name?: string;
}

interface NcbiArticleSummary {
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  authors?: NcbiAuthor[];
  elocationid?: string;
  doctype?: string;
}

interface NcbiAbstractText {
  "#text"?: string;
}

interface NcbiPubmedArticle {
  MedlineCitation?: {
    PMID?: string | { "#text"?: string };
    Article?: {
      Abstract?: {
        AbstractText?: string | NcbiAbstractText[];
      };
    };
  };
}

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

async function fetchJSON(url: string) {
  return baseFetchJSON(url, { errorPrefix: "NCBI E-utilities" });
}

const errorResultSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  retriable: z.boolean(),
});

/**
 * Classify a caught error and return a ToolResult failure object.
 */
function toErrorResult(error: unknown): ToolResult<never> {
  const message =
    error instanceof Error ? error.message : "Unknown NCBI E-utilities error";
  return {
    ok: false as const,
    error: `NCBI E-utilities error: ${message}`,
    retriable: isRetriableError(error),
  };
}

/**
 * Search PubMed for biomedical literature.
 * Returns article titles, authors, journals, and abstracts.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const pubmedSearchTool = createTool({
  id: "pubmed-search",
  description:
    "Search PubMed for biomedical literature. Returns article titles, authors, journals, PMIDs, and abstracts for evidence-based clinical decision making. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query (e.g. 'acute coronary syndrome treatment', 'sepsis biomarkers')",
      ),
    maxResults: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum number of results to return"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            pmid: z.string(),
            title: z.string(),
            authors: z.array(z.string()),
            journal: z.string(),
            pubDate: z.string(),
            abstract: z.string().optional(),
            doi: z.string().optional(),
          }),
        ),
        totalResults: z.number(),
      }),
    }),
    errorResultSchema,
  ]),
  execute: async ({
    query,
    maxResults,
  }): Promise<
    ToolResult<{
      results: Array<{
        pmid: string;
        title: string;
        authors: string[];
        journal: string;
        pubDate: string;
        abstract?: string;
        doi?: string;
      }>;
      totalResults: number;
    }>
  > => {
    try {
      // Step 1: Search for PMIDs
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
      const searchResult = await fetchJSON(searchUrl);
      const ids: string[] = searchResult?.esearchresult?.idlist ?? [];

      if (ids.length === 0) {
        return { ok: true as const, data: { results: [], totalResults: 0 } };
      }

      const totalResults = parseInt(
        searchResult?.esearchresult?.count ?? "0",
        10,
      );

      // Step 2 & 3: Fetch summaries and abstracts in parallel
      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
      const abstractUrl = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=json`;

      const [summaryResult, abstractResult] = await Promise.all([
        fetchJSON(summaryUrl).catch(() => ({})),
        fetchJSON(abstractUrl).catch(() => null),
      ]);

      const articles: Record<string, NcbiArticleSummary> =
        (summaryResult?.result as Record<string, NcbiArticleSummary>) ?? {};

      const abstracts: Record<string, string> = {};
      if (abstractResult) {
        try {
          // Parse abstracts from the XML-like JSON structure
          const fetchedAbstracts: NcbiPubmedArticle[] =
            abstractResult?.PubmedArticle ?? [];
          for (const article of Array.isArray(fetchedAbstracts)
            ? fetchedAbstracts
            : [fetchedAbstracts]) {
            const rawPmid = article?.MedlineCitation?.PMID;
            const pmid =
              typeof rawPmid === "object" ? rawPmid?.["#text"] : rawPmid;
            const abstractTexts =
              article?.MedlineCitation?.Article?.Abstract?.AbstractText;
            if (pmid && abstractTexts) {
              const texts = Array.isArray(abstractTexts)
                ? abstractTexts
                : [abstractTexts];
              abstracts[String(pmid)] = texts
                .map((t: string | NcbiAbstractText) =>
                  typeof t === "string" ? t : (t["#text"] ?? ""),
                )
                .join(" ");
            }
          }
        } catch {
          // Abstracts are optional, continue without them
        }
      }

      const results = ids.map((id) => {
        const article = articles[id] ?? {};
        return {
          pmid: id,
          title: article.title ?? "",
          authors: (article.authors ?? [])
            .map((a: NcbiAuthor) => a.name ?? "")
            .filter(Boolean),
          journal: article.fulljournalname ?? article.source ?? "",
          pubDate: article.pubdate ?? "",
          abstract: abstracts[id],
          doi: article.elocationid ?? article.doctype ?? undefined,
        };
      });

      return { ok: true as const, data: { results, totalResults } };
    } catch (error: unknown) {
      return toErrorResult(error);
    }
  },
});

/**
 * Search for related articles given a PMID.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const relatedArticlesTool = createTool({
  id: "related-articles",
  description:
    "Find articles related to a given PubMed article by PMID. Useful for exploring the evidence base around a specific paper. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    pmid: z
      .string()
      .describe("The PubMed ID (PMID) to find related articles for"),
    maxResults: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum number of related articles"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            pmid: z.string(),
            title: z.string(),
            authors: z.array(z.string()),
            journal: z.string(),
            pubDate: z.string(),
          }),
        ),
      }),
    }),
    errorResultSchema,
  ]),
  execute: async ({
    pmid,
    maxResults,
  }): Promise<
    ToolResult<{
      results: Array<{
        pmid: string;
        title: string;
        authors: string[];
        journal: string;
        pubDate: string;
      }>;
    }>
  > => {
    try {
      const linkUrl = `${EUTILS_BASE}/elink.fcgi?dbfrom=pubmed&db=pubmed&id=${pmid}&retmode=json`;
      const linkResult = await fetchJSON(linkUrl);

      const linkSets = linkResult?.linksets ?? [];
      const relatedIds: string[] = [];
      for (const ls of linkSets) {
        const linkSetDbs = ls?.linksetdbs ?? [];
        for (const lsd of linkSetDbs) {
          if (lsd?.links) {
            relatedIds.push(...lsd.links.map(String));
          }
        }
      }

      const limitedIds = relatedIds.slice(0, maxResults);
      if (limitedIds.length === 0) {
        return { ok: true as const, data: { results: [] } };
      }

      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${limitedIds.join(",")}&retmode=json`;
      const summaryResult = await fetchJSON(summaryUrl);
      const articles: Record<string, NcbiArticleSummary> =
        (summaryResult?.result as Record<string, NcbiArticleSummary>) ?? {};

      const results = limitedIds.map((id) => ({
        pmid: id,
        title: articles[id]?.title ?? "",
        authors: (articles[id]?.authors ?? [])
          .map((a: NcbiAuthor) => a.name ?? "")
          .filter(Boolean),
        journal: articles[id]?.fulljournalname ?? articles[id]?.source ?? "",
        pubDate: articles[id]?.pubdate ?? "",
      }));

      return { ok: true as const, data: { results } };
    } catch (error: unknown) {
      return toErrorResult(error);
    }
  },
});

/**
 * Search OMIM (genetic conditions) via NCBI.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const omimSearchTool = createTool({
  id: "omim-search",
  description:
    "Search OMIM (Online Mendelian Inheritance in Man) for genetic conditions, inheritance patterns, and clinical descriptions. Returns OMIM IDs and summaries. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query (e.g. 'Marfan syndrome', 'BRCA1', 'cystic fibrosis')",
      ),
    maxResults: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Maximum number of results"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            omimId: z.string(),
            title: z.string(),
            summary: z.string().optional(),
          }),
        ),
        totalResults: z.number(),
      }),
    }),
    errorResultSchema,
  ]),
  execute: async ({
    query,
    maxResults,
  }): Promise<
    ToolResult<{
      results: Array<{ omimId: string; title: string; summary?: string }>;
      totalResults: number;
    }>
  > => {
    try {
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=omim&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
      const searchResult = await fetchJSON(searchUrl);
      const ids: string[] = searchResult?.esearchresult?.idlist ?? [];
      const totalResults = parseInt(
        searchResult?.esearchresult?.count ?? "0",
        10,
      );

      if (ids.length === 0) {
        return { ok: true as const, data: { results: [], totalResults: 0 } };
      }

      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=omim&id=${ids.join(",")}&retmode=json`;
      const summaryResult = await fetchJSON(summaryUrl);
      const entries = summaryResult?.result ?? {};

      const results = ids.map((id) => ({
        omimId: id,
        title: entries[id]?.title ?? "",
        summary: entries[id]?.summary ?? entries[id]?.text ?? undefined,
      }));

      return { ok: true as const, data: { results, totalResults } };
    } catch (error: unknown) {
      return toErrorResult(error);
    }
  },
});

/**
 * Search GeneReviews (clinical genetic reviews) via NCBI Bookshelf.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const geneReviewsSearchTool = createTool({
  id: "gene-reviews-search",
  description:
    "Search GeneReviews for comprehensive clinical genetic condition reviews. These are peer-reviewed, up-to-date articles on genetic diagnoses, management, and genetic counseling. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query (e.g. 'Huntington disease', 'hereditary cancer')",
      ),
    maxResults: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Maximum number of results"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            bookId: z.string(),
            title: z.string(),
            authors: z.string().optional(),
            pubDate: z.string().optional(),
          }),
        ),
        totalResults: z.number(),
      }),
    }),
    errorResultSchema,
  ]),
  execute: async ({
    query,
    maxResults,
  }): Promise<
    ToolResult<{
      results: Array<{
        bookId: string;
        title: string;
        authors?: string;
        pubDate?: string;
      }>;
      totalResults: number;
    }>
  > => {
    try {
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=books&term=${encodeURIComponent(query + " GeneReviews")}&retmax=${maxResults}&retmode=json`;
      const searchResult = await fetchJSON(searchUrl);
      const ids: string[] = searchResult?.esearchresult?.idlist ?? [];
      const totalResults = parseInt(
        searchResult?.esearchresult?.count ?? "0",
        10,
      );

      if (ids.length === 0) {
        return { ok: true as const, data: { results: [], totalResults: 0 } };
      }

      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=books&id=${ids.join(",")}&retmode=json`;
      const summaryResult = await fetchJSON(summaryUrl);
      const entries = summaryResult?.result ?? {};

      const results = ids.map((id) => ({
        bookId: id,
        title: entries[id]?.title ?? "",
        authors:
          entries[id]?.authors?.map((a: NcbiAuthor) => a.name).join(", ") ??
          undefined,
        pubDate: entries[id]?.pubdate ?? undefined,
      }));

      return { ok: true as const, data: { results, totalResults } };
    } catch (error: unknown) {
      return toErrorResult(error);
    }
  },
});

/**
 * Search ClinVar for genetic variant clinical significance.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const clinVarSearchTool = createTool({
  id: "clinvar-search",
  description:
    "Search ClinVar for genetic variant clinical significance and pathogenicity assessments. Useful for interpreting genetic test results. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Search query (e.g. 'BRCA1 pathogenic', 'CFTR delta F508')"),
    maxResults: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Maximum number of results"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            summary: z.string().optional(),
          }),
        ),
        totalResults: z.number(),
      }),
    }),
    errorResultSchema,
  ]),
  execute: async ({
    query,
    maxResults,
  }): Promise<
    ToolResult<{
      results: Array<{ id: string; title: string; summary?: string }>;
      totalResults: number;
    }>
  > => {
    try {
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=clinvar&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
      const searchResult = await fetchJSON(searchUrl);
      const ids: string[] = searchResult?.esearchresult?.idlist ?? [];
      const totalResults = parseInt(
        searchResult?.esearchresult?.count ?? "0",
        10,
      );

      if (ids.length === 0) {
        return { ok: true as const, data: { results: [], totalResults: 0 } };
      }

      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=clinvar&id=${ids.join(",")}&retmode=json`;
      const summaryResult = await fetchJSON(summaryUrl);
      const entries = summaryResult?.result ?? {};

      const results = ids.map((id) => ({
        id,
        title:
          entries[id]?.title ?? entries[id]?.variation_set?.[0]?.name ?? "",
        summary: entries[id]?.clinical_significance?.description ?? undefined,
      }));

      return { ok: true as const, data: { results, totalResults } };
    } catch (error: unknown) {
      return toErrorResult(error);
    }
  },
});
