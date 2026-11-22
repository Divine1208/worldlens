# WorldLens — Personal Intelligence Desk

A real-time, hour-by-hour IST news briefing with plain-English deep dives, a concept decoder, market-gap discovery, and a global opportunity engine with an application tracker. It is built with React, TypeScript, Tailwind and Vite, and it installs as a PWA.

> The brand name lives in `src/config.ts` (`BRAND`). Change it there to rebrand everything.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — includes the /api news proxy + AI routes
npm test             # 35 unit, integration and end-to-end journey tests
npm run build && npm run preview   # production build, self-hosted with the same /api routes
```

**Deploy to Vercel:** import the folder. `vercel.json` and `api/*.ts` are already set up. To keep keys on the server, add them as environment variables (see `.env.example`), then switch on **Vault → "Use server keys"**.

## Two modes

| | Option A — zero-install / browser | Option B — server / self-hosted |
|---|---|---|
| News feeds | Direct (APIs that allow CORS) → `/api/proxy` if present → public CORS relays | `/api/proxy` (allow-listed hosts, rate-limited, cached 5 min) |
| AI keys | Entered in the API Vault and stored only in this browser's localStorage | `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY` env vars; never sent to the client |
| Schedule | Polls every 15/30/60 min while the app is open | The same, plus you can put a cron job in front of `/api/proxy` if you want a warm cache |

The government RSS feeds (PIB, RBI, SEBI) and Google News RSS do not send CORS headers, so a plain static host has to fall back to the public relays. Running `npm run dev`, `npm run preview` or a Vercel deploy gives you the built-in proxy, which is more reliable.

## What works without any keys

* Live news from GDELT, PIB, RBI, SEBI, Google News (India, World, Markets, Startups, AI), The Hindu and Hacker News, plus live open hackathons from Devpost.
* The 4-part timestamp receipts, story clustering, the hourly IST feed, the midnight rollover into the Historical Archive, and read/unread tracking.
* The concept decoder (50 built-in terms), curated market models, 11 opportunity records checked by hand (21-point sheets), filters, the idea matcher, the tracker/CRM and JSON export.

**Add a free Gemini, Groq or OpenRouter key** to unlock the full deep-dive analysis, Ask AI, "Frame It My Way" drafts, AI market gaps from today's news, and business examples for terms. **Add Tavily or Serper** so every model reads today's web first, and to turn on the AI opportunity hunt. Its results are always labelled *Unverified lead*.

## How the honesty rules are enforced (in code, not just in the UI)

| Rule | Where |
|---|---|
| Missing, malformed, date-only, future (> now + 10 min) and stale (> 30 days) timestamps are rejected and logged. The app never substitutes today's date. | `src/lib/timestamps.ts`, Source Health → rejected log |
| Four separate timestamps: published (or *first seen* for GDELT), last updated, collected by the app, and event date | `src/types.ts` `NewsStory`, `TimestampReceipt` |
| URL dedupe (utm-stripped) and headline clustering (Jaccard ≥ 0.5, 72-hour window). The original publication date is never overwritten. | `src/lib/cluster.ts` |
| Hourly IST windows; quiet hours stay empty and say so | `src/lib/lifecycle.ts` `bucketByHour` |
| Midnight rollover computed with `Intl` (no hardcoded dates). An exact timer is set for the next local midnight. Nothing is deleted. | `lifecycle.ts`, `AppContext.tsx` |
| CLOSED opportunities are excluded from every list. Unpublished deadlines show "The official source has not published a deadline yet." | `src/lib/opportunities.ts` |
| Equity is never called a grant, and equity programs carry a ⚠ badge | data + `OppCard` |
| Gen Z banned-word sanitiser. It is grammar-aware and applies to all AI output and app copy. Publisher headlines are left verbatim because they are receipts. | `src/lib/genz.ts` |
| The AI may use only the supplied sources and search results. It labels FACT/CLAIM/ANALYSIS/UNCONFIRMED and stays politically neutral. | `src/ai/router.ts` prompts |

## Architecture

```
src/
  config.ts              brand, defaults, storage keys
  types.ts               NewsStory, Source, GlobalOpportunity (21 fields), MarketOpportunity, UserState…
  adapters/              SourceAdapter stack: GDELT, official RSS, Google News, The Hindu, HN, Guardian, NewsData, Devpost
    http.ts              timeout, retry, route fallback, short cache
  lib/                   timestamps, cluster, classify, lifecycle, opportunities, genz, time, storage (IndexedDB)
  ai/                    providers (Gemini w/ Search grounding, Groq, OpenRouter, Tavily, Serper) + router (fallback chain, ensemble cross-check, cache)
  data/                  concepts, curated opportunities (checked 2026-11-23), curated market models
  views/ components/     Feed (hourly/flat/archive), StoryReader, SideDrawer, MarketGaps, Opportunities (+21-pt Inspector), Knowledge, modals
server/handlers.ts       /api/proxy, /api/ai, /api/search (shared by Vite dev/preview and Vercel functions)
api/                     Vercel function wrappers
```

Pipeline: **ingest → normalise → validate timestamps → dedupe → cluster → classify → importance → concepts → store (IndexedDB)**. Deep analysis, opportunity extraction and reframing run on demand and are cached by content hash to keep AI calls (and costs) down.

Production backend: the localStorage/IndexedDB model mirrors the relational schema in the spec (NewsStory, Source, Concept, MarketOpportunity, GlobalOpportunity, UserState, IngestionHealthLog). To move to Postgres, put a Prisma schema behind `server/handlers.ts` with those same types.

## Keeping opportunity data fresh

`src/data/opportunities.ts` holds hand-checked records with a `lastChecked` date. Anything verified only from secondary listings is marked `verified: false` and shows **UNVERIFIED** in the UI. Re-check deadlines on the official page before applying. Devpost hackathons load live on every poll.

## Known limits

* Event dates are filled in only when the AI deep dive pulls one out of the sources. Otherwise the app says the event date isn't separately stated.
* Some publisher feeds change their URLs over time. A broken feed shows as DEGRADED in Source Health and can be turned off there.
* Smart notifications have preferences and hooks in `UserState.notificationPrefs`, but push delivery isn't wired up yet.
