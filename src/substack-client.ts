// The Recommendations UI examples use limit=10; larger values are rejected by the API.
const DEFAULT_PAGE_SIZE = 10;
const PAGE_DELAY_MS = 1000;
const MAX_GET_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SubstackClient {
  constructor(private readonly baseUrl: string, private readonly cookie: string) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    let response: Response | undefined;
    let text = "";
    for (let attempt = 0; attempt <= MAX_GET_RETRIES; attempt++) {
      response = await fetch(url, {
        ...init,
        headers: {
        Accept: "application/json",
        Cookie: this.cookie,
        Referer: new URL("/publish/recommendations", this.baseUrl).toString(),
        Origin: new URL(this.baseUrl).origin,
        "User-Agent": "substack-reciprocal-recommendations/1.0",
        ...(init.headers ?? {}),
        },
      });
      text = await response.text();
      if (response.ok || init.method === "DELETE" || ![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_GET_RETRIES) break;
      await sleep(1000 * 2 ** attempt);
    }
    if (!response) throw new Error(`No response received from ${url}`);
    let body: unknown = undefined;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!response.ok) {
      const detail = typeof body === "string" ? body : JSON.stringify(body) ?? "(empty response)";
      throw new Error(`${init.method ?? "GET"} ${url} failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    return body;
  }

  async all(path: string): Promise<unknown[]> {
    const allItems: unknown[] = [];
    const seenPages = new Set<string>();
    for (let offset = 0; ; offset += DEFAULT_PAGE_SIZE) {
      if (offset > 0) await sleep(PAGE_DELAY_MS);
      const query = new URLSearchParams({ offset: String(offset), limit: String(DEFAULT_PAGE_SIZE), order_by: "xp_signups", order_direction: "desc" });
      const body = await this.request(`${path}?${query}`);
      const page = extractPage(body);
      if (page.items.length === 0 || page.hasMore === false) return allItems;
      const fingerprint = JSON.stringify(page.items);
      if (seenPages.has(fingerprint)) throw new Error(`Pagination for ${path} repeated a page; refusing to continue or delete.`);
      seenPages.add(fingerprint);
      allItems.push(...page.items);
      if (seenPages.size > 1000) throw new Error(`Pagination for ${path} exceeded 1000 pages.`);
    }
  }

  async incoming(): Promise<unknown[]> { return this.all("/api/v1/recommendations/stats/to"); }
  async outgoing(): Promise<unknown[]> { return this.all("/api/v1/recommendations/stats/from"); }

  async remove(recommendingPublicationId: string, recommendedPublicationId: string): Promise<void> {
    await this.request("/api/v1/recommendations/", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommending_publication_id: recommendingPublicationId,
        recommended_publication_id: recommendedPublicationId,
        source: "recommendation-stats",
      }),
    });
  }
}

function extractPage(body: unknown): { items: unknown[]; hasMore?: boolean } {
  if (Array.isArray(body)) return { items: body };
  if (!body || typeof body !== "object") throw new Error("Unexpected recommendations response: expected an array or object envelope");
  const object = body as Record<string, unknown>;
  for (const key of ["data", "rows", "results", "recommendations", "items"]) {
    if (Array.isArray(object[key])) return { items: object[key], hasMore: typeof object.has_more === "boolean" ? object.has_more : typeof object.hasMore === "boolean" ? object.hasMore : undefined };
  }
  throw new Error("Unexpected recommendations response: no data array found");
}
