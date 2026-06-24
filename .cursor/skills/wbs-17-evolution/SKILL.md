---
name: wbs-17-evolution
description: Executes Stock Alarm WBS 17 market-hours and remote-operation trust deepening — one WBS ID per session, role assignment (@pm/@backend/@frontend/@docs/@qa/@cleanup), npm test and roadmap updates. Use when the user or WBS mentions 17.x, BL-17~22, /today, observation marker drift, or post-WBS-16 trust work.
---

# WBS 17 Evolution

## Before starting

1. Read `docs/development-roadmap.md` §17 and `AGENTS.md`.
2. Confirm the **single** WBS ID for this session (e.g. only `17.6`) — **세션당 WBS ID 하나**.
3. Run `npm test` before and after; all tests must pass.
4. Do not start the next ID in the same session unless the user explicitly asks.

## WBS 17 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 17.1 | WBS·README·AGENTS 정합성 | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 17.2 | AI 팀 WBS 17 스킬 | @backend | `.cursor/skills/wbs-17-evolution/` |
| 17.3 | 실사용 백로그 triage 4차 | @pm / @docs | `docs/personal-backlog.md` |
| 17.4 | 운영 문서 2차 정합 | @docs | `personal-weekly-routine.md`, `personal-telegram-operations.md` |
| 17.5 | observation 마커 drift 방지 | @qa | `tests/localObservationStaticMarkers.test.js`, `src/localObservationStaticMarkers.js` |
| 17.6 | 텔레그램 `/today`·헬스 신선도 | @backend | `src/systemTodayActions.js`, `src/telegramCommands.js`, `src/server.js` |
| 17.7 | 오늘 할 일 원클릭 점프 | @frontend | `public/app.js` |
| 17.8 | observation·freshness 정리 | @cleanup | `public/quoteFreshness.js`, `src/localObservationStaticMarkers.js`, `docs/json-legacy-fields-deprecation.md` |

Status and priority: always trust `docs/development-roadmap.md` over this table.

## Session workflow

```text
1. Read roadmap "다음 작업" → pick one 17.x ID
2. @mention one role (default @backend if unclear)
3. Implement only that ID's scope
4. npm test (full suite)
5. If UX/server/connectivity touched → check:observation (@qa or implementer)
6. Mark WBS row 완료; update "다음 작업" to next 17.x
7. Report remaining 17.x items to the user
```

## Role pick guide

| Change type | Role |
|---|---|
| WBS priority, new 17.x rows, backlog order | @pm |
| `src/`, `scripts/`, API, alerts, telegram, storage | @backend |
| `public/` UI only | @frontend |
| README, `docs/` without behavior change | @docs |
| Regression only, smoke check fixes | @qa |
| Remove dead code, observation constants, contract alignment | @cleanup |

## Per-ID checklist (after implementation)

- [ ] Scope matches exactly one WBS 17.x row
- [ ] `npm test` — count matches `docs/full-regression-test-scenarios.md` (update docs if tests added)
- [ ] `docs/development-roadmap.md`: row `완료`, §17 상태 문단, 추천 순서, `## 다음 작업`
- [ ] If user-facing: `README.md` 다음 개발 후보 (when next task changes)
- [ ] If AI workflow changed: `AGENTS.md` §현재 우선순위
- [ ] `tests/roadmap.test.js` if `nextTask.title` or 17.x status changed
- [ ] `tests/documentation.test.js` if new doc contracts added
- [ ] No `.env`, `data/`, secrets committed
- [ ] No new root `package.json` dependencies

## When to run observation smoke

| Touched area | Command |
|---|---|
| `public/app.js` UX | `npm run check:observation -- --base-url http://127.0.0.1:PORT` |
| `localObservationStaticMarkers.js` | re-run full observation; marker contract tests must pass |
| `telegramCommands.js` `/today` | `npm test` telegram suite + manual `/today` if server running |

See [local-smoke-check](../local-smoke-check/SKILL.md).

## Test count sync

If you add or remove tests:

1. Run `npm test` and note `# tests N` from output
2. Update `docs/full-regression-test-scenarios.md` (A-17, 최종 합격 기준)
3. Update `AGENTS.md`, `README.md`, `docs/scripts-and-env-classification.md`, `public/app.js` `WEEKLY_ROUTINE_TEST_COUNT`
4. Update `tests/documentation.test.js` regression count assertion

## Hard constraints (WBS 17)

- JsonStore only — no Postgres
- Telegram-only alerts — no mobile push
- schemaVersion **2** — do not bump without explicit WBS row
- No mobile app, store, or Railway **new** work
- No new npm dependencies in root `package.json`

## Related skills

| Skill | Use when |
|---|---|
| [wbs-16-evolution](../wbs-16-evolution/SKILL.md) | Reference — WBS 16 complete |
| [wbs-15-evolution](../wbs-15-evolution/SKILL.md) | Reference — WBS 15 complete |
| [local-smoke-check](../local-smoke-check/SKILL.md) | After UX or observation marker changes |

## Do not

- Combine multiple 17.x IDs in one session without user request
- Expand scope into unrelated refactors
- Skip roadmap status update after completing an ID
- Force-push or commit without user request
