const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 20000;

export interface TavilySearchResultItem {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

export interface TavilySearchResponse {
  answer?: string;
  query?: string;
  results?: TavilySearchResultItem[];
}

export const searchWebWithTavily = async ({
  apiKey,
  query,
}: {
  apiKey: string;
  query: string;
}) => {
  const cleanedApiKey = apiKey.trim();
  const cleanedQuery = query.trim();

  if (!cleanedApiKey || !cleanedQuery) {
    throw new Error("Missing Tavily API key or query.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: cleanedApiKey,
        query: cleanedQuery,
        search_depth: "basic",
        include_answer: true,
      }),
    });

    if (!response.ok) {
      let details = `Tavily request failed (${response.status})`;
      try {
        const payload = (await response.json()) as { detail?: string; error?: string };
        details = payload.detail || payload.error || details;
      } catch {
        // no-op
      }
      throw new Error(details);
    }

    return (await response.json()) as TavilySearchResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tavily request timed out.");
    }
    throw error instanceof Error ? error : new Error("Tavily request failed.");
  } finally {
    window.clearTimeout(timeout);
  }
};
