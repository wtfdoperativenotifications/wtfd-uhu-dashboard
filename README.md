# WTFD UHU Dashboard

Standalone Cloudflare Workers + D1 dashboard for Washington Township Fire Department Unit Hour Utilization.

## What it shows

- Daily UHU for the most recently completed 07:00–07:00 operational shift
- YTD UHU through the selected shift date
- Daily and YTD response counts and committed hours
- 30-day UHU trend by resource
- Cross-staffed Station 43 and Station 44 resources

## Display mapping

The database uses `R43` and `R44` as shared staffing resources so cross-staffed time is calculated correctly.

The dashboard displays:

- `R43` as **E43**
- `R44` as **E44**

M43/E43 and M44/E44 remain separate in the raw apparatus data, but the resource-level UHU uses merged commitment intervals.

## Required D1 tables

This dashboard expects the existing `wtfd-fleet` D1 database to contain:

- `resource_uhu_daily`
- `uhu_resources`
- `uhu_resource_units`

`resource_uhu_daily` should contain one row per resource per operational shift, including zero-call days.

## Cloudflare configuration

`wrangler.jsonc` is already configured to use the existing D1 database:

- Binding: `DB`
- Database: `wtfd-fleet`
- Database ID: `ebd9c7d6-9089-4ead-bb53-f609e977f03f`

## Deploy

1. Create a new GitHub repository named `wtfd-uhu-dashboard`.
2. Upload the contents of this project to the repository root.
3. In Cloudflare, create/import a Worker from that GitHub repository.
4. Confirm the D1 binding in the deployment is `DB` and points to `wtfd-fleet`.
5. Deploy.

For local development:

```bash
npm install
npm run dev
```

For direct Wrangler deployment:

```bash
npm install
npx wrangler deploy
```

## API

### `GET /api/uhu`

Returns the most recently completed shift plus YTD through that shift.

Optional:

`GET /api/uhu?date=2026-09-27`

Returns Daily and YTD data through the specified completed shift date.

### `GET /api/health`

Checks the D1 binding and reports the number of rows in `resource_uhu_daily`.

## UHU definitions

Dedicated resource:

`committed seconds / 86,400`

Cross-staffed resource:

Merged unique committed seconds across either apparatus in the pair / 86,400.

System UHU:

Total committed hours across the nine staffed resources / total available hours across those same resources.
