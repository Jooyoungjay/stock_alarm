---
name: wbs-18-evolution
description: Executes Stock Alarm WBS 18 market-hours alert and observation feedback loop — one WBS ID per session. Use for 18.x, BL-23~27, /check today summary, observation failed today panel.
---

# WBS 18 Evolution

## WBS 18 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 18.1 | WBS·README·AGENTS | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 18.2 | WBS 18 스킬 | @backend | `.cursor/skills/wbs-18-evolution/` |
| 18.3 | 백로그 triage 5차 | @pm / @docs | `docs/personal-backlog.md` |
| 18.4 | `/check` 오늘 할 일 | @backend | `src/telegramCommands.js`, `src/systemTodayActions.js` |
| 18.5 | 점검 실패→오늘 할 일 | @frontend | `public/app.js` |
| 18.6 | 시각 회귀 배너 | @qa | `src/visualRegressionCheck.js` |
| 18.7 | 주간 루틴 게이트 | @docs | `docs/personal-weekly-routine.md` |
| 18.8 | todayAction 우선순위 | @cleanup | `src/todayActionPriority.js` |

Status: trust `docs/development-roadmap.md` §18.

## Session workflow

1. Pick one 18.x ID
2. Implement scope only
3. `npm test` full suite
4. Update roadmap row `완료`

## Hard constraints

Same as WBS 17 — JsonStore, Telegram-only, no new npm deps, schemaVersion 2.
