---
name: wbs-13-cleanup
description: Executes Stock Alarm WBS 13 local-operation cleanup — env/scripts classification, Postgres removal, mobile/Expo Push removal, store/Railway doc archival, Telegram-only alerts, regression test redefinition. Use when the user or WBS mentions 13.2–13.10, cleanup, archive, remove Postgres, remove mobile, or local-operation transition.
---

# WBS 13 Cleanup

## Before starting

1. Read `docs/development-roadmap.md` §13 and `AGENTS.md`.
2. Pick **one** WBS ID per session (e.g. only 13.3).
3. Run `npm test` before and after; all tests must pass.

## Order (do not skip)

| ID | Task | Key paths |
|---|---|---|
| 13.2 | Classify env/scripts | `.env.example`, `package.json`, README env table |
| 13.3 | Remove Postgres | `src/postgres*.js`, `scripts/json-to-postgres*`, `scripts/postgres-connection-rehearsal.js`, `tests/postgres*`, `tests/fixtures/postgres-migration/`, `storageFactory.js` postgres branch |
| 13.4 | Remove mobile | `mobile/`, `/api/mobile/*`, `/api/devices`, `src/pushNotifications.js`, `MOBILE_PUSH_*`, related tests/scripts |
| 13.5 | Archive store/Railway docs | `docs/app-store*`, `docs/railway*`, `docs/store-*`, `docs/https-demo*`, `railway.json`, `.env.railway.example`, `check:demo`, `check:store-assets`, `check:mobile-e2e` |
| 13.6 | Telegram-only alerts | `alertEngine.js`, `dividendEventAlerts.js` — remove Expo Push branches |
| 13.7 | Backup policy review | `src/backups.js`, README backup section |
| 13.8 | Local UX recheck | `start-local.bat`, `stop-local.bat`, `scripts/local-server.js` |
| 13.9 | Telegram commands recheck | `src/telegramCommands.js`, manual scenario list in roadmap |
| 13.10 | Redefine regression tests | Remove mobile/postgres/store tests; update `npm test` count in rules |

Full file inventory: [files-inventory.md](files-inventory.md)

## 13.2 checklist

- [ ] Tag scripts in `package.json` as **keep** vs **remove/archive**
- [ ] Trim `.env.example` — mark removed vars with comment or delete
- [ ] README: demote mobile/Railway sections (do not delete until 13.4/13.5)
- [ ] No behavior change in this step unless unavoidable

## 13.3 checklist

- [ ] Remove Postgres store + migration modules and tests
- [ ] `storageFactory.js`: JSON only
- [ ] `storageContract.js`: drop `postgres` engine if unused
- [ ] `dataModel.js` / README: remove Postgres migration promises
- [ ] `npm test` green

## 13.4 checklist

- [ ] Remove `mobile/` directory (or move to `docs/archive/mobile-snapshot/` if user wants history)
- [ ] Remove mobile API routes from `server.js`
- [ ] Remove device/push token fields from store only if no migration needed — prefer soft deprecate first
- [ ] Remove `mobile:*`, `check:mobile-e2e` scripts
- [ ] Update tests that import mobile modules

## 13.5 checklist

- [ ] Create `docs/archive/` if missing
- [ ] Move store/Railway/mobile-e2e docs + `railway.json` references
- [ ] README: link archive, remove from quick start
- [ ] Keep `docs/privacy-policy-ko.md` in archive if only for store

## 13.6 checklist

- [ ] `sendPushNotification*` calls removed from alert paths
- [ ] `MOBILE_PUSH_ENABLED` removed from config
- [ ] Dividend event alerts: Telegram only
- [ ] Tests updated

## After each ID

1. `npm test`
2. Update WBS row status in `docs/development-roadmap.md`
3. Update `tests/roadmap.test.js` if roadmap assertions change

## Do not

- Add new features while cleaning
- Break `data/store.json` read/write for existing users
- Remove Telegram, backup, or core alert flows
