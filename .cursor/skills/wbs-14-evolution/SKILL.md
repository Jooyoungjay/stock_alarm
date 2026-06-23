---
name: wbs-14-evolution
description: Executes Stock Alarm WBS 14 incremental personal-operation improvements — one WBS ID per session, role assignment (@pm/@backend/@frontend/@docs/@qa), npm test and roadmap updates. Use when the user or WBS mentions 14.x, incremental improvement, AI team workflow, or post-cleanup evolution.
---

# WBS 14 Evolution

## Before starting

1. Read `docs/development-roadmap.md` §14 and `AGENTS.md`.
2. Confirm the **single** WBS ID for this session (e.g. only `14.5`) — **세션당 WBS ID 하나**.
3. Run `npm test` before and after; all tests must pass.
4. Do not start the next ID in the same session unless the user explicitly asks.

## WBS 14 backlog

| ID | Task | Typical role | Key paths |
|---|---|---|---|
| 14.1 | WBS·README·AGENTS 정합성 | @docs | `README.md`, `AGENTS.md`, `docs/development-roadmap.md` |
| 14.2 | AI 팀 점진 개선 스킬 | @backend | `.cursor/skills/wbs-14-evolution/` |
| 14.3 | 실사용 백로그 triage | @pm / @docs | `docs/personal-backlog.md`, `docs/local-webapp-observation-2026-05-21.md` |
| 14.4 | 주간 회귀 운영 루틴 | @docs | `docs/personal-weekly-routine.md` |
| 14.5 | 텔레그램 `/brief` 가독성 | @backend | `src/telegramCommands.js`, `src/portfolioBriefing.js` |
| 14.6 | 배당 실패 다음 조치 통일 | @backend / @frontend | `src/dividendProvider.js`, `public/app.js`, `telegramCommands.js` |
| 14.7 | KIS/Naver 자동 비교 알림 노이즈 | @backend | `src/kisNaverAutoCompare.js`, `README.md` env |
| 14.8 | JSON 레거시 필드 정리 계획 | @cleanup / @docs | `src/storage.js`, `docs/` deprecation note |

Status and priority: always trust `docs/development-roadmap.md` over this table.

## Session workflow

```text
1. Read roadmap "다음 작업" → pick one 14.x ID
2. @mention one role (default @backend if unclear)
3. Implement only that ID's scope
4. npm test (full suite)
5. If UX/server/connectivity touched → check:observation (@qa or implementer)
6. Mark WBS row 완료; update "다음 작업" to next 14.x
7. Report remaining 14.x items to the user
```

## Role pick guide

| Change type | Role |
|---|---|
| WBS priority, new 14.x rows, backlog order | @pm |
| `src/`, `scripts/`, API, alerts, telegram, storage | @backend |
| `public/` UI only | @frontend |
| README, `docs/` without behavior change | @docs |
| Regression only, no code edits | @qa |
| Remove legacy code/docs (14.8+) | @cleanup |

## Per-ID checklist (after implementation)

- [ ] Scope matches exactly one WBS 14.x row
- [ ] `npm test` — count matches `docs/full-regression-test-scenarios.md` (update docs if tests added)
- [ ] `docs/development-roadmap.md`: row `완료`, §14 상태 문단, 추천 순서, `## 다음 작업`
- [ ] If user-facing: `README.md` 다음 개발 후보 (when next task changes)
- [ ] If AI workflow changed: `AGENTS.md` §현재 우선순위
- [ ] `tests/roadmap.test.js` if `nextTask.title` or 14.x status changed
- [ ] `tests/documentation.test.js` if new doc contracts added
- [ ] No `.env`, `data/`, secrets committed
- [ ] No new root `package.json` dependencies

## When to run observation smoke

| Touched area | Command |
|---|---|
| `public/app.js` connection UX | `npm run check:observation -- --base-url http://127.0.0.1:PORT` |
| Admin observation UI | add `--admin-token` if `ADMIN_TOKEN` set |
| Alert toggle / snooze persistence | `--run-state-check` (uses test stock; backup first) |
| Live holdings during market | `--live-session` (optional `--save-history`) |

See [local-smoke-check](../local-smoke-check/SKILL.md).

## Test count sync

If you add or remove tests:

1. Run `npm test` and note `# tests N` from output
2. Update `docs/full-regression-test-scenarios.md` (A-17, 최종 합격 기준)
3. Update `AGENTS.md`, `README.md`, `docs/scripts-and-env-classification.md`
4. Update `tests/documentation.test.js` regression count assertion

## Hard constraints (WBS 14)

- JsonStore only — no Postgres
- Telegram-only alerts — no mobile push
- No mobile app, store, or Railway **new** work
- No new npm dependencies in root `package.json`
- `data/store.json` schema version unchanged unless the WBS row explicitly allows it

## Related skills

| Skill | Use when |
|---|---|
| [personal-weekly-routine](../../docs/personal-weekly-routine.md) | Weekly ops checklist (W-01~W-17) |
| [local-smoke-check](../local-smoke-check/SKILL.md) | After UX or local-server changes |
| [wbs-13-cleanup](../wbs-13-cleanup/SKILL.md) | Reference only — WBS 13 complete |

## Do not

- Combine multiple 14.x IDs in one session without user request
- Expand scope into unrelated refactors
- Skip roadmap status update after completing an ID
- Force-push or commit without user request
