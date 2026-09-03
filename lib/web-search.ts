/** Free web lookup — DuckDuckGo Instant Answer API (no API key). */
export async function searchWeb(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return `Web search unavailable (${res.status}).`;

    const data = (await res.json()) as {
      Abstract?: string;
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string }> }>;
    };

    const parts: string[] = [];
    if (data.AbstractText) {
      parts.push(data.Heading ? `${data.Heading}: ${data.AbstractText}` : data.AbstractText);
      if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
    }

    const topics = (data.RelatedTopics ?? []).flatMap((t) =>
      t.Topics ? t.Topics.map((x) => x.Text).filter(Boolean) : [t.Text].filter(Boolean)
    );
    topics.slice(0, 5).forEach((t) => parts.push(String(t)));

    if (!parts.length) {
      return `No instant results for "${query}". Answer from ReleaseDesk Everywhere application data when possible, or note that live web data was limited.`;
    }
    return parts.join("\n");
  } catch (err) {
    return `Web search failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}
