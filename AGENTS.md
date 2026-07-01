# Stock Alarm AI 팀

이 저장소는 **개인 PC 로컬 실행 + 텔레그램 알림** MVP입니다. AI 에이전트는 아래 역할 중 하나로 동작합니다. 작업 시작 전 역할을 확인하고, **단일 진실 공급원**은 `docs/development-roadmap.md`(WBS)입니다.

날짜 기준: 2026-06-24 — WBS 19 완료. WBS 20 진행 중.

## 역할 (@멘션)

| 역할 | 담당 범위 | 하지 않는 일 |
|---|---|---|
| **@pm** | `docs/development-roadmap.md`, WBS 상태·우선순위, 범위 결정 | 소스 코드 직접 수정 |
| **@backend** | `src/`, `scripts/`, 관련 `tests/` | `public/` UI 대규모 변경 |
| **@frontend** | `public/` (HTML/CSS/JS, PWA) | 서버 API 계약 변경(필요 시 @backend와 협의) |
| **@qa** | `npm test`, `check:observation`, `check:visual`, 회귀 검증 | 기능 범위 확대 |
| **@cleanup** | WBS 13번(로컬 운영 전환·코드 정리) | WBS에 없는 신규 기능 |
| **@docs** | `README.md`, `docs/` | 동작 변경 없는 문서만; 코드 변경 시 해당 역할에 위임 |

역할을 지정하지 않으면 **@backend** 기본. WBS 20 작업은 **세션당 ID 하나**, 문서·범위는 **@pm** / 구현은 역할별 분담.

## 파일 소유권

```text
src/server.js          → @backend (API 라우팅·폴링 허브)
src/alertEngine.js     → @backend
src/storage*.js        → @backend (@cleanup for Postgres removal)
src/telegram*.js       → @backend
public/app.js          → @frontend
public/styles.css      → @frontend
docs/development-roadmap.md → @pm
data/                  → 런타임 전용, Git 커밋 금지
docs/archive/          → 제거된 Postgres·모바일 설계 보관
```

## 완료 조건 (모든 역할 공통)

1. 요청 범위만 수정 (무관한 리팩터 금지)
2. `npm test` 전부 통과
3. WBS 항목 작업 시 해당 ID 상태를 roadmap에 반영 (@pm 또는 작업 에이전트가 문서 갱신)
4. `.env`, `data/`, 비밀키 파일 커밋 금지
5. 사용자가 명시적으로 요청하지 않으면 git commit/push 하지 않음

## 하드 제약

- 루트 `package.json`에 **새 npm 의존성 추가 금지**
- 저장소는 **JsonStore(JSON 파일)** 만 사용
- `data/store.json` 스키마 버전 무단 변경 금지
- 모바일/스토어/Railway **신규 기능 추가 금지** — 정리(제거)만 허용
- Node.js 20+, ESM (`import`/`export`) 유지

## 현재 우선순위

WBS 13~**19**은 완료했습니다. **WBS 20 개인 운영 회귀·문서 정합 3차** — 20.1~20.3 완료, **20.4**부터 구현 (`docs/development-roadmap.md` §20).

다음 구현은 `docs/personal-backlog.md` BL-34~38. 세션 규칙: **WBS ID 1개**, 완료 시 `npm test` 전부 통과.

### WBS 20 (착수)

| ID | 작업 | 역할 |
|---|---|---|
| ~~20.1~~ | ~~WBS·README·AGENTS 정합성~~ | @docs |
| ~~20.2~~ | ~~AI 팀 WBS 20 스킬~~ | @backend |
| ~~20.3~~ | ~~실사용 백로그 triage 7차~~ | @pm / @docs |
| 20.4 | 회귀·테스트 수 문서 정합 (BL-34) | @docs |
| 20.5 | digest 주간 루틴 W-18 (BL-35) | @docs |
| 20.6 | env 분류 digest 반영 (BL-36) | @docs |
| 20.7 | todayAction parity 테스트 (BL-37) | @qa |
| 20.8 | 시각 회귀 todayAction 확장 (BL-38) | @qa |

### WBS 19 (완료)

| ID | 작업 | 역할 |
|---|---|---|
| ~~19.1~~ | ~~WBS·README·AGENTS 정합성~~ | @docs |
| ~~19.2~~ | ~~AI 팀 WBS 19 스킬~~ | @backend |
| ~~19.3~~ | ~~실사용 백로그 triage 6차~~ | @pm / @docs |
| ~~19.4~~ | ~~KIS/Naver 이슈→오늘 할 일 (BL-28)~~ | @backend |
| ~~19.5~~ | ~~장중 critical today digest (BL-29)~~ | @backend |
| ~~19.6~~ | ~~observation-manual 점프 (BL-30)~~ | @frontend |
| ~~19.7~~ | ~~헬스 todayActionsSummary (BL-31)~~ | @backend |
| ~~19.8~~ | ~~todayAction 타입·계약 (BL-32~33)~~ | @qa / @cleanup |

### WBS 18 (완료)

| ID | 작업 | 역할 |
|---|---|---|
| ~~18.1~~ | ~~WBS·README·AGENTS 정합성~~ | @docs |
| ~~18.2~~ | ~~AI 팀 WBS 18 스킬~~ | @backend |
| ~~18.3~~ | ~~실사용 백로그 triage 5차~~ | @pm / @docs |
| ~~18.4~~ | ~~`/check` 오늘 할 일 요약 (BL-23)~~ | @backend |
| ~~18.5~~ | ~~점검 실패→오늘 할 일 (BL-24)~~ | @frontend |
| ~~18.6~~ | ~~시각 회귀 신선도 배너 (BL-25)~~ | @qa |
| ~~18.7~~ | ~~주간 루틴 visual·live 게이트 (BL-26)~~ | @docs |
| ~~18.8~~ | ~~todayAction 우선순위 공유 (BL-27)~~ | @cleanup |

### WBS 17 (완료)

| ID | 작업 | 역할 |
|---|---|---|
| ~~17.1~~ | ~~WBS·README·AGENTS 정합성~~ | @docs |
| ~~17.2~~ | ~~AI 팀 WBS 17 스킬~~ | @backend |
| ~~17.3~~ | ~~실사용 백로그 triage 4차~~ | @pm / @docs |
| ~~17.4~~ | ~~운영 문서 2차 정합 (BL-17~18)~~ | @docs |
| ~~17.5~~ | ~~observation 마커 drift 방지 (BL-19)~~ | @qa |
| ~~17.6~~ | ~~텔레그램 `/today`·헬스 신선도 (BL-20)~~ | @backend |
| ~~17.7~~ | ~~오늘 할 일 원클릭 점프 (BL-21)~~ | @frontend |
| ~~17.8~~ | ~~observation·freshness 정리 (BL-22)~~ | @cleanup |

## 워크플로

### 기능/버그 수정

```text
1. WBS 또는 이슈 확인 (@pm)
2. @backend 또는 @frontend 구현
3. @qa → npm test (+ 필요 시 check:observation)
4. roadmap/README 반영
```

### WBS 17 신뢰도 심화 (완료)

```text
1. roadmap §17 또는 `personal-backlog.md`에서 다음 작업 확인 (WBS 17 완료)
2. `.cursor/skills/wbs-17-evolution/SKILL.md` 로드 (17.2 완료)
3. 해당 역할 1명만 구현 (@docs / @qa / @backend / @frontend / @cleanup)
4. @qa → npm test (+ 필요 시 check:observation)
5. roadmap 해당 행 완료, "다음 작업" 갱신
```

### WBS 16 편의성 개선 (완료)

### WBS 15 안정화·레거시 2차 (완료)

WBS 15 전체 완료 — `.cursor/skills/wbs-15-evolution/SKILL.md` 참고용.

### WBS 13 정리 (완료)

```text
1. @cleanup + wbs-13-cleanup 스킬 로드
2. 한 WBS ID만 처리 (예: 13.3만)
3. npm test 통과 확인
4. roadmap 해당 행 상태 갱신
```

## 스킬

| 스킬 | 경로 | 사용 시점 |
|---|---|---|
| WBS 20 회귀·문서 정합 | `.cursor/skills/wbs-20-evolution/` | WBS 20 진행 중 — 20.4부터 |
| WBS 19 today·알림 연동 | `.cursor/skills/wbs-19-evolution/` | WBS 19 완료 — 참고용 |
| WBS 18 피드백 루프 | `.cursor/skills/wbs-18-evolution/` | WBS 18 완료 — 참고용 |
| WBS 17 신뢰도 심화 | `.cursor/skills/wbs-17-evolution/` | WBS 17 완료 — 참고용 |
| WBS 16 편의성 | `.cursor/skills/wbs-16-evolution/` | WBS 16 완료 — 참고용 |
| WBS 15 안정화·레거시 | `.cursor/skills/wbs-15-evolution/` | WBS 15 완료 — 참고용 |
| WBS 14 점진 개선 | `.cursor/skills/wbs-14-evolution/` | WBS 14 완료 — 참고용 |
| WBS 13 정리 | `.cursor/skills/wbs-13-cleanup/` | Postgres/모바일/Railway 제거 (완료) |
| 로컬 점검 | `.cursor/skills/local-smoke-check/` | 실사용 smoke check, observation 히스토리 |

## 훅

- `.cursor/hooks/run-tests-after-edit.js` — `src/`, `tests/`, `public/` 편집 후 `npm test` 자동 실행
- 너무 자주 실행되면 `.cursor/hooks.json`에서 비활성화 가능

## 빠른 참조

```powershell
start-local.bat              # 서버 시작
npm test                     # 298 tests
npm run check:observation      # 로컬 실사용 점검
```

핵심 문서: `README.md`, `docs/development-roadmap.md`, `docs/personal-backlog.md`, `AGENTS.md`
