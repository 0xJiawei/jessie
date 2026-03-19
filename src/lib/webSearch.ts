export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface DuckDuckGoResponse {
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Topics?: Array<{
      Text?: string;
      FirstURL?: string;
    }>;
  }>;
}

const toResult = (text: string, url: string): WebSearchResult => {
  const parts = text.split(" - ");
  if (parts.length > 1) {
    return {
      title: parts[0].trim(),
      snippet: parts.slice(1).join(" - ").trim(),
      url,
    };
  }

  return {
    title: text.trim(),
    snippet: text.trim(),
    url,
  };
};

export const searchWeb = async (query: string): Promise<WebSearchResult[]> => {
  const cleaned = query.trim();
  if (!cleaned) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(cleaned)}&format=json&no_html=1&skip_disambig=1`,
      { method: "GET" }
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as DuckDuckGoResponse;
    const results: WebSearchResult[] = [];

    for (const item of data.RelatedTopics ?? []) {
      if (item.Text && item.FirstURL) {
        results.push(toResult(item.Text, item.FirstURL));
      }

      if (item.Topics) {
        for (const nested of item.Topics) {
          if (nested.Text && nested.FirstURL) {
            results.push(toResult(nested.Text, nested.FirstURL));
          }
        }
      }

      if (results.length >= 5) {
        break;
      }
    }

    return results.slice(0, 5);
  } catch {
    return [];
  }
};

export const formatWebSearchContext = (results: WebSearchResult[]) => {
  if (results.length === 0) {
    return "No search results were found.";
  }

  return results
    .map((result, index) => `${index + 1}. ${result.title}\n${result.snippet}\n${result.url}`)
    .join("\n\n");
};
