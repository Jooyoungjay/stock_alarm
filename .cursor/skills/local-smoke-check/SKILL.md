---
name: local-smoke-check
description: Runs Stock Alarm local webapp smoke checks via check:observation CLI and interprets READY/NOT READY results, observation history, and live-session flags. Use when verifying local server health, admin observation history, regression after UX changes, or when the user mentions smoke check, observation, or check:observation.
---

# Local Smoke Check

## Prerequisites

- Server running: `start-local.bat` or `node scripts/local-server.js start`
- Note actual port from `status-local.bat` (may be 3001+)
- If `ADMIN_TOKEN` set, pass `--admin-token` for admin routes

## Commands

```powershell
# Read-only smoke (default)
npm run check:observation -- --base-url http://127.0.0.1:3000

# With admin token
npm run check:observation -- --base-url http://127.0.0.1:3000 --admin-token "TOKEN"

# State-changing validation (creates/deletes test stock)
npm run check:observation -- --base-url http://127.0.0.1:3000 --run-state-check

# Live holdings during market hours
npm run check:observation -- --base-url http://127.0.0.1:3000 --live-session

# Save to data/observation-history/
npm run check:observation -- --base-url http://127.0.0.1:3000 --live-session --save-history
```

## Interpret results

| Outcome | Meaning |
|---|---|
| READY | All automated checks passed |
| NOT READY | At least one failed or manual item |
| manual | Needs human verification (often market-hours) |
| OBS-* | Cross-check `docs/local-webapp-observation-2026-05-21.md` |

## @qa workflow

1. `npm test` (unit/integration)
2. Start server if not running
3. `check:observation` read-only
4. After UX/server changes: `--run-state-check` or `--live-session` if appropriate
5. Report: pass/fail counts, failed item IDs, next actions from output

## Admin UI equivalent

`/admin` → 점검 히스토리 → `점검 실행/저장` calls `/api/observation-history/run` (no `--run-state-check` by default).

## Do not

- Run `--run-state-check` on production user data without backup
- Commit `data/observation-history/` to git
