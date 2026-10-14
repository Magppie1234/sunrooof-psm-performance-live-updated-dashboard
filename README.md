# SUNROOOF Agent Productivity

Dashboard: https://sunrooof-productivity-live.vercel.app/

## Repository scope

This repository contains the productivity dashboard frontend, its Vercel API
aggregator, and tests. It uses two separately deployed Ozonetel gateway services.
Those services and their credentials are not included here and must remain
available. Cloning this repository alone does not recreate the upstream services.

## Configuration and local development

Use Node.js 22 or later and the Vercel CLI.

```powershell
Copy-Item .env.example .env.local
npx vercel dev
```

Do not overwrite an existing `.env.local`. The four exact supported settings and
current endpoint values are in `.env.example`. They are server-side URL settings;
no Ozonetel, Zoho, or WhatsApp API key is read by this repository. Ozonetel
credentials belong to the upstream gateway services. Direct Ozonetel integration
would require additional code, not just an API key in this file. The API currently
sends no authentication header to its gateways.

The configured URLs must serve the existing gateway JSON contracts. They cannot
be replaced with raw Ozonetel API endpoints without adapting the aggregator.
GitHub and Vercel login credentials are deployment tooling credentials, not app
configuration. Never commit real secrets, `.env.local`, or `.vercel`.

## Deploy

Import this repository into Vercel as an Other project, with the repository root
as Root Directory and no build command. Alternatively run `npx vercel` from the
repository root and follow its linking prompts, then `npx vercel --prod`.
The existing project is `sunrooof-productivity-live` in team
`magppiesilverstonepvtltd`. Set overrides from `.env.example` in Vercel Environment
Variables if needed, then redeploy. Default URLs work without overrides while the
upstream services remain available.

The existing deployment uses Vercel team authentication. Authentication is a
Vercel project setting, not supplied by this source repository. Configure
appropriate Deployment Protection when importing into a new project, since call
drill-downs include customer phone numbers.

## Behavior and calculations

- Single or multiple agents and dates can be selected.
- Total productivity is talk + wrap + total ring time.
- Talk and wrap come from daily summaries, overridden by available call records.
- Ring total is summed call ringing duration. Average ring is total ring duration
  divided by recorded calls, including zero-ring calls. Overall ring averages
  are weighted by call count. Despite the UI label "before agent cuts", the
  current calculation includes all recorded calls, not only agent hangups.
- Other summary averages are per agent with available data.
- Idle is the upstream state-summary idle duration; it is not proof of a system
  error. Missing source values remain unknown rather than being fabricated.
- WhatsApp values are deterministic layout placeholders, not live WhatsApp data.
- Table time values expand into call records, named breaks, or supporting detail.
  Summary cards are not clickable. Recording URLs and agent phones are excluded.
- The page refreshes every minute while visible; API caching is 60 seconds.

Break totals use `/api/today-breaks?date=YYYY-MM-DD` for dates from September 26,
2026 onward, and `/api/breaks` snapshots for earlier dates. Named breaks replace
summary pause totals. `SIP disconnected` and `changeMode` entries are excluded
from break totals. Stored durations take precedence; otherwise duration is end
minus start, with today's open breaks calculated through fetch time. Open breaks
on completed dates remain unknown. Historical availability depends on upstream
retention and saved snapshots.

## Validation

```powershell
npm test
```

Tests cover report aggregation, break handling, ring calculations, and multi-date
merging. No dependency installation is required for these Node.js tests.
