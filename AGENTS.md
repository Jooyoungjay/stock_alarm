# Stock Alarm AI 팀

이 저장소는 **개인 PC 로컬 실행 + 텔레그램 알림** MVP입니다. AI 에이전트는 아래 역할 중 하나로 동작합니다. 작업 시작 전 역할을 확인하고, **단일 진실 공급원**은 `docs/development-roadmap.md`(WBS)입니다.

날짜 기준: 2026-06-22 방향 전환 — Postgres, 모바일 앱 출시, Railway 상시 배포는 **진행하지 않음**.

## 역할 (@멘션)

| 역할 | 담당 범위 | 하지 않는 일 |
|---|---|---|
| **@pm** | `docs/development-roadmap.md`, WBS 상태·우선순위, 범위 결정 | 소스 코드 직접 수정 |
| **@backend** | `src/`, `scripts/`, 관련 `tests/` | `public/` UI 대규모 변경 |
| **@frontend** | `public/` (HTML/CSS/JS, PWA) | 서버 API 계약 변경(필요 시 @backend와 협의) |
| **@qa** | `npm test`, `check:observation`, `check:visual`, 회귀 검증 | 기능 범위 확대 |
| **@cleanup** | WBS 13번(로컬 운영 전환·코드 정리) | WBS에 없는 신규 기능 |
| **@docs** | `README.md`, `docs/` | 동작 변경 없는 문서만; 코드 변경 시 해당 역할에 위임 |

역할을 지정하지 않으면 **@backend** 기본. WBS 14 작업은 **세션당 ID 하나**, 문서·범위는 **@pm** / 구현은 역할별 분담.

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

## 현재 우선순위 (WBS 14)

1. ~~**14.1** WBS·README·AGENTS 정합성~~ (완료)
2. ~~**14.2** AI 팀 점진 개선 스킬~~ (완료)
3. ~~**14.3** 실사용 백로그 triage~~ (완료)
4. ~~**14.4** 주간 회귀 운영 루틴~~ (완료)
5. ~~**14.5** 텔레그램 `/brief` 가독성~~ (완료)
6. **14.6** 배당 실패 다음 조치 통일 ← **다음**
7. 14.7~14.8 기능·정리 ([personal-backlog.md](docs/personal-backlog.md) 순서)

세션 규칙: **WBS ID 1개**, 완료 시 `npm test` 251개 통과, roadmap 상태 갱신.

## 워크플로

### 기능/버그 수정

```text
1. WBS 또는 이슈 확인 (@pm)
2. @backend 또는 @frontend 구현
3. @qa → npm test (+ 필요 시 check:observation)
4. roadmap/README 반영
```

### WBS 14 점진 개선

```text
1. roadmap에서 다음 WBS 14.x ID 확인
2. `.cursor/skills/wbs-14-evolution/SKILL.md` 로드
3. 해당 역할 1명만 구현 (@backend / @frontend / @docs)
4. @qa → npm test (+ 필요 시 check:observation)
5. roadmap 해당 행 완료, 다음 ID를 "다음 작업"에 반영
```

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
| WBS 14 점진 개선 | `.cursor/skills/wbs-14-evolution/` | WBS 14.x 한 ID씩 구현·문서·회귀 |
| WBS 13 정리 | `.cursor/skills/wbs-13-cleanup/` | Postgres/모바일/Railway 제거 (완료) |
| 로컬 점검 | `.cursor/skills/local-smoke-check/` | 실사용 smoke check, observation 히스토리 |

## 훅

- `.cursor/hooks/run-tests-after-edit.js` — `src/`, `tests/`, `public/` 편집 후 `npm test` 자동 실행
- 너무 자주 실행되면 `.cursor/hooks.json`에서 비활성화 가능

## 빠른 참조

```powershell
start-local.bat              # 서버 시작
npm test                     # 251 tests
npm run check:observation      # 로컬 실사용 점검
```

핵심 문서: `README.md`, `docs/development-roadmap.md`, `docs/user-admin-page-split.md`, `AGENTS.md`
