/**
 * Raw provider calls. Pure fetch — runs in the browser (Option A, user keys from the vault)
 * and on the server (Option B, keys from environment variables via server/handlers.ts).
 */
export type LLMId = 'gemini' | 'groq' | 'openrouter';
export type SearchId = 'tavily' | 'serper';

export interface LLMRequest {
  system: string;
  prompt: string;
  json?: boolean;
  /** Use built-in web grounding when the provider supports it (Gemini Google Search). */
  grounded?: boolean;
  big?: boolean; // deep synthesis → bigger model; classification → small
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
  groundingUrls?: { title: string; url: string }[];
}

export const MODELS = {
  gemini: { small: 'gemini-2.5-flash', big: 'gemini-2.5-flash' },
  groq: { small: 'llama-3.1-8b-instant', big: 'llama-3.3-70b-versatile' },
  openrouter: { small: 'openrouter/free', big: 'openrouter/free' },
};

async function post(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

export async function callLLM(id: LLMId, key: string, req: LLMRequest): Promise<LLMResponse> {
  const model = MODELS[id][req.big ? 'big' : 'small'];
  if (id === 'gemini') {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { temperature: 0.2 },
    };
    if (req.grounded) body.tools = [{ google_search: {} }];
    else if (req.json) (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
    const data = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      body,
      {},
    );
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error('Gemini returned no text');
    const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
    const groundingUrls = chunks
      .map((c: { web?: { uri: string; title: string } }) => (c.web ? { title: c.web.title, url: c.web.uri } : null))
      .filter(Boolean);
    return { text, provider: 'Gemini', model, groundingUrls };
  }
  const url = id === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://worldlens.app';
    headers['X-Title'] = 'WorldLens';
  }
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
  };
  if (req.json && id === 'groq') body.response_format = { type: 'json_object' };
  const data = await post(url, body, headers);
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error(`${id} returned no text`);
  return { text, provider: id === 'groq' ? 'Groq' : 'OpenRouter', model: data.model ?? model };
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  source: string;
}

export async function callSearch(id: SearchId, key: string, query: string, news = true): Promise<SearchHit[]> {
  if (id === 'tavily') {
    const data = await post(
      'https://api.tavily.com/search',
      { query, topic: news ? 'news' : 'general', max_results: 8, search_depth: 'basic', days: news ? 3 : undefined },
      { Authorization: `Bearer ${key}` },
      30000,
    );
    return (data.results ?? []).map((r: { title: string; url: string; content: string; published_date?: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 600) ?? '',
      date: r.published_date,
      source: 'Tavily',
    }));
  }
  const data = await post(
    `https://google.serper.dev/${news ? 'news' : 'search'}`,
    { q: query, gl: 'in', num: 10 },
    { 'X-API-KEY': key },
    30000,
  );
  const arr = news ? data.news : data.organic;
  return (arr ?? []).map((r: { title: string; link: string; snippet: string; date?: string }) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet ?? '',
    date: r.date,
    source: 'Serper',
  }));
}
