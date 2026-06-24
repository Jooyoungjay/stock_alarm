---
name: wbs-19-evolution
description: Executes Stock Alarm WBS 19 market-hours today-action and alert integration deepening — one WBS ID per session. Use for 19.x, BL-28~33, KIS/Naver today actions, critical today digest, health todayActionsSummary.
---

# WBS 19 Evolution

## Before starting

1. Read `docs/development-roadmap.md` §19 and `AGENTS.md`.
2. Confirm the **single** WBS ID for this session (e.g. only `19.4`) — **세션당 WBS ID 하나**.
3. Run `npm test` before and after; all tests must pass.
4. Do not start the next ID in the same session unless the user explicitly asks.

## WBS 19 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 19.1 | WBS·README·AGENTS 정합성 | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 19.2 | AI 팀 WBS 19 스킬 | @backend | `.cursor/skills/wbs-19-evolution/` |
| 19.3 | 실사용 백로그 triage 6차 | @pm / @docs | `docs/personal-backlog.md` |
| 19.4 | KIS/Naver 이슈→오늘 할 일 | @backend | `src/systemTodayActions.js`, `src/kisNaverCompareIssues.js` |
| 19.5 | 장중 critical today digest | @backend | `src/alertEngine.js`, `src/systemTodayActions.js` |
| 19.6 | observation-manual 점프 | @frontend | `public/app.js` |
| 19.7 | 헬스 todayActionsSummary | @backend | `src/server.js`, `docs/personal-telegram-operations.md` |
| 19.8 | todayAction 타입·계약 | @qa / @cleanup | `src/localObservationStaticMarkers.js`, `tests/` |

Status: trust `docs/development-roadmap.md` §19.

## Session workflow

```text
1. Read roadmap "다음 작업" → pick one 19.x ID
2. @mention one role (default @backend if unclear)
3. Implement only that ID's scope
4. npm test (full suite)
5. Mark WBS row 완료; update "다음 작업" to next 19.x
```

## Hard constraints

Same as WBS 18 — JsonStore, Telegram-only, no new npm deps, schemaVersion 2.
