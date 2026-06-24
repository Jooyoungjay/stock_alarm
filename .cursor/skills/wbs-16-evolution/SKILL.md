---
name: wbs-16-evolution
description: Executes Stock Alarm WBS 16 personal-operation convenience improvements — one WBS ID per session, role assignment (@pm/@backend/@frontend/@docs/@qa/@cleanup), npm test and roadmap updates. Use when the user or WBS mentions 16.x, BL-08~15, observation drift, telegram quote freshness, or post-WBS-15 convenience work.
---

# WBS 16 Evolution

## Before starting

1. Read `docs/development-roadmap.md` §16 and `AGENTS.md`.
2. Confirm the **single** WBS ID for this session (e.g. only `16.6`) — **세션당 WBS ID 하나**.
3. Run `npm test` before and after; all tests must pass.
4. Do not start the next ID in the same session unless the user explicitly asks.

## WBS 16 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 16.1 | WBS·README·AGENTS 정합성 | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 16.2 | AI 팀 WBS 16 스킬 | @backend | `.cursor/skills/wbs-16-evolution/` |
| 16.3 | 실사용 백로그 triage 3차 | @pm / @docs | `docs/personal-backlog.md` |
| 16.4 | 운영 문서 정합 | @docs | `personal-weekly-routine.md`, `personal-telegram-operations.md`, `json-legacy-fields-deprecation.md`, `local-webapp-observation-2026-05-21.md` |
| 16.5 | observation smoke drift 수정 | @qa | `src/localObservationCheck.js`, `public/dividendFailureGuidance.js` |
| 16.6 | 텔레그램 원격 점검 강화 | @backend | `src/telegramCommands.js`, `src/quoteFreshness.js`, `src/telegramPollHealth.js` |
| 16.7 | 웹 시세 배너·오늘 할 일 | @frontend | `public/app.js`, `public/quoteFreshness.js` |
| 16.8 | 백업·점검 UX 편의 | @frontend | `public/app.js`, `public/index.html` |
| 16.9 | dead code·observation 상수화 | @cleanup | `src/storage.js`, `src/localObservationCheck.js` |

Status and priority: always trust `docs/development-roadmap.md` over this table.

## Session workflow

```text
1. Read roadmap "다음 작업" → pick one 16.x ID
2. @mention one role (default @backend if unclear)
3. Implement only that ID's scope
4. npm test (full suite)
5. If UX/server/connectivity touched → check:observation (@qa or implementer)
6. Mark WBS row 완료; update "다음 작업" to next 16.x
7. Report remaining 16.x items to the user
```

## Role pick guide

| Change type | Role |
|---|---|
| WBS priority, new 16.x rows, backlog order | @pm |
| `src/`, `scripts/`, API, alerts, telegram, storage | @backend |
| `public/` UI only | @frontend |
| README, `docs/` without behavior change | @docs |
| Regression only, smoke check fixes | @qa |
| Remove dead code, observation constants | @cleanup |

## Per-ID checklist (after implementation)

- [ ] Scope matches exactly one WBS 16.x row
- [ ] `npm test` — count matches `docs/full-regression-test-scenarios.md` (update docs if tests added)
- [ ] `docs/development-roadmap.md`: row `완료`, §16 상태 문단, 추천 순서, `## 다음 작업`
- [ ] If user-facing: `README.md` 다음 개발 후보 (when next task changes)
- [ ] If AI workflow changed: `AGENTS.md` §현재 우선순위
- [ ] `tests/roadmap.test.js` if `nextTask.title` or 16.x status changed
- [ ] `tests/documentation.test.js` if new doc contracts added
- [ ] No `.env`, `data/`, secrets committed
- [ ] No new root `package.json` dependencies

## When to run observation smoke

| Touched area | Command |
|---|---|
| `public/app.js` UX | `npm run check:observation -- --base-url http://127.0.0.1:PORT` |
| Admin observation UI | add `--admin-token` if `ADMIN_TOKEN` set |
| Alert toggle / snooze persistence | `--run-state-check` (uses test stock; backup first) |
| Live holdings during market | `--live-session` (optional `--save-history`) |
| `localObservationCheck.js` | re-run full observation; expect dividend dashboard **passed** after 16.5 |

See [local-smoke-check](../local-smoke-check/SKILL.md).

## Test count sync

If you add or remove tests:

1. Run `npm test` and note `# tests N` from output
2. Update `docs/full-regression-test-scenarios.md` (A-17, 최종 합격 기준)
3. Update `AGENTS.md`, `README.md`, `docs/scripts-and-env-classification.md`
4. Update `tests/documentation.test.js` regression count assertion

## Hard constraints (WBS 16)

- JsonStore only — no Postgres
- Telegram-only alerts — no mobile push
- schemaVersion **2** — do not bump without explicit WBS row
- No mobile app, store, or Railway **new** work
- No new npm dependencies in root `package.json`

## Related skills

| Skill | Use when |
|---|---|
| [wbs-15-evolution](../wbs-15-evolution/SKILL.md) | Reference — WBS 15 complete |
| [wbs-14-evolution](../wbs-14-evolution/SKILL.md) | Reference — WBS 14 complete |
| [local-smoke-check](../local-smoke-check/SKILL.md) | After UX or `--live-session` changes |
| [personal-weekly-routine](../../docs/personal-weekly-routine.md) | Weekly ops (W-01~W-17) |

## Do not

- Combine multiple 16.x IDs in one session without user request
- Expand scope into unrelated refactors
- Skip roadmap status update after completing an ID
- Force-push or commit without user request
