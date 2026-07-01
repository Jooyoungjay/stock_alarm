---
name: wbs-20-evolution
description: Executes Stock Alarm WBS 20 personal operations regression and documentation alignment 3rd pass — one WBS ID per session. Use for 20.x, BL-34~38, test count docs, digest weekly routine, todayAction parity, visual regression.
---

# WBS 20 Evolution

## Before starting

1. Read `docs/development-roadmap.md` §20 and `AGENTS.md`.
2. Confirm the **single** WBS ID for this session (e.g. only `20.4`) — **세션당 WBS ID 하나**.
3. Run `npm test` before and after; all tests must pass.
4. Do not start the next ID in the same session unless the user explicitly asks.

## WBS 20 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 20.1 | WBS·README·AGENTS 정합성 | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 20.2 | AI 팀 WBS 20 스킬 | @backend | `.cursor/skills/wbs-20-evolution/` |
| 20.3 | 실사용 백로그 triage 7차 | @pm / @docs | `docs/personal-backlog.md` |
| 20.4 | 회귀·테스트 수 문서 정합 | @docs | `docs/full-regression-test-scenarios.md`, `README.md` |
| 20.5 | digest 주간 루틴 W-18 | @docs | `docs/personal-weekly-routine.md` |
| 20.6 | env 분류 digest 반영 | @docs | `docs/scripts-and-env-classification.md` |
| 20.7 | todayAction parity 테스트 | @qa | `tests/`, `src/systemTodayActions.js` |
| 20.8 | 시각 회귀 todayAction 확장 | @qa | `src/visualRegressionCheck.js` |

Status: WBS 20 complete — **운영 유지 모드**. Trust `docs/development-roadmap.md` §운영 유지 모드.

## Session workflow

```text
1. Read roadmap "다음 작업" → pick one 20.x ID
2. @mention one role (default @docs if unclear)
3. Implement only that ID's scope
4. npm test (full suite)
5. Mark WBS row 완료; update "다음 작업" to next 20.x
```

## Hard constraints

Same as WBS 19 — JsonStore, Telegram-only, no new npm deps, schemaVersion 2.
