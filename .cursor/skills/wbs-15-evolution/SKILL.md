---
name: wbs-15-evolution
description: Executes Stock Alarm WBS 15 personal-operation stabilization — one WBS ID per session, role assignment (@pm/@backend/@frontend/@docs/@qa/@cleanup), npm test and roadmap updates. Use when the user or WBS mentions 15.x, BL-M monitoring, legacy cleanup phase 3-4, or post-WBS-14 stabilization.
---

# WBS 15 Evolution

## Before starting

1. Read `docs/development-roadmap.md` §15 and `AGENTS.md`.
2. Confirm the **single** WBS ID for this session (e.g. only `15.4`) — **세션당 WBS ID 하나**.
3. Run `npm test` before and after; all tests must pass.
4. Do not start the next ID in the same session unless the user explicitly asks.

## WBS 15 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 15.1 | WBS·README·AGENTS 정합성 | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 15.2 | AI 팀 WBS 15 스킬 | @backend | `.cursor/skills/wbs-15-evolution/` |
| 15.3 | 실사용 백로그 triage 2차 | @pm / @docs | `docs/personal-backlog.md` |
| 15.4 | 장중 시세 신선도 가시성 | @frontend | `public/quoteFreshness.js`, `public/app.js` |
| 15.5 | 텔레그램 폴링·무응답 진단 | @backend | `src/telegramPollHealth.js`, `src/server.js` |
| 15.6 | 점검 히스토리 manual 요약 | @frontend | `public/app.js`, `src/localObservationCheck.js` |
| 15.7 | JSON 레거시 선택적 정리 | @backend | `src/legacyStoreCleanup.js`, `src/storage.js` |
| 15.8 | JSON 레거시 코드·contract 제거 | @cleanup | `src/dataModel.js`, `src/storageContract.js`, schema v2 |

Status and priority: always trust `docs/development-roadmap.md` over this table.

## Session workflow

```text
1. Read roadmap "다음 작업" → pick one 15.x ID
2. @mention one role (default @backend if unclear)
3. Implement only that ID's scope
4. npm test (full suite)
5. If UX/server/connectivity touched → check:observation (@qa or implementer)
6. Mark WBS row 완료; update "다음 작업" to next 15.x
7. Report remaining 15.x items to the user
```

## Hard constraints (WBS 15)

- JsonStore only — no Postgres
- Telegram-only alerts — no mobile push
- schemaVersion 2 only after **15.8** (15.7 uses optional strip on export)
- No new npm dependencies in root `package.json`

## Related skills

| Skill | Use when |
|---|---|
| [wbs-14-evolution](../wbs-14-evolution/SKILL.md) | Reference — WBS 14 complete |
| [local-smoke-check](../local-smoke-check/SKILL.md) | After UX or `--live-session` changes |
| [personal-weekly-routine](../../docs/personal-weekly-routine.md) | Weekly ops (W-01~W-17) |
