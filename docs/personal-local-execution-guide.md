# 개인 PC 로컬 실행 가이드

날짜 기준: 2026-06-22 (WBS 13.8)

이 문서는 **개인 PC에서 Stock Alarm을 매일 실행·확인·종료**할 때 쓰는 절차입니다. 모바일 앱, Railway, Postgres는 사용하지 않습니다.

## 핵심 명령

| 목적 | Windows | npm 스크립트 | 내부 스크립트 |
|---|---|---|---|
| 시작 | `start-local.bat` | `npm run local:start` | `node scripts/local-server.js start` |
| 상태 확인 | `status-local.bat` | `npm run local:status` | `node scripts/local-server.js status` |
| 안전 종료 | `stop-local.bat` | `npm run stop` | `node scripts/stop-server.js` |

`start-local.bat`과 `status-local.bat`은 프로젝트 루트에서 `node scripts/local-server.js`를 호출합니다. `stop-local.bat`은 안전 종료 후 상태를 한 번 더 출력합니다.

## 시작 흐름

1. `.env` 또는 `.env.local`에 텔레그램·시세 키가 있는지 확인합니다.
2. `start-local.bat`을 실행합니다.
3. 터미널에 표시된 **PC 접속 주소**(`http://127.0.0.1:<port>`)로 브라우저를 엽니다.
4. 포트가 3000이 아니면 반드시 터미널/`status-local.bat` 주소를 따릅니다.

이미 실행 중이면 새 프로세스를 띄우지 않고 기존 PID·포트·접속 주소를 보여줍니다. `data/server.json`이 남았지만 프로세스가 없으면 오래된 실행 정보를 정리한 뒤 새로 시작합니다.

## 상태 확인 (`/api/health`)

개인 운영에서 자주 보는 필드:

| 필드 | 의미 |
|---|---|
| `ok` | 서버 응답 정상 |
| `appName`, `pid`, `port` | 이 프로젝트 서버인지 식별 |
| `runtimeVerified` | `data/server.json`과 PID 일치 여부 |
| `safeStop` | `stop-local.bat`이 종료할 수 있는 조건 설명 |
| `telegramConfigured` | 텔레그램 원격 명령 사용 가능 여부 |
| `autoBackupEnabled`, `lastAutoBackup` | 자동 백업 설정·마지막 실행 |
| `quoteProviders`, `lastCheck` | 시세 확인 경로·마지막 확인 시각 |
| `lastTelegramCommandPoll` | 텔레그램 명령 폴링 시각 |

예시:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

`ADMIN_TOKEN`을 쓰는 경우:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health -Headers @{ "x-admin-token" = "설정한_ADMIN_TOKEN" }
```

## 안전 종료

`stop-local.bat`과 `node scripts/stop-server.js`는 아래가 모두 맞을 때만 종료합니다.

- `data/server.json`의 앱 이름·루트 경로가 현재 프로젝트와 같음
- `/api/health`의 `pid`가 runtime 파일과 같음

다른 Node 프로세스를 잘못 끄지 않기 위한 정책입니다. 종료 후 `status-local.bat`으로 미실행을 확인합니다.

## `Failed to fetch` 대응

브라우저에 원문 `Failed to fetch` 대신 **연결 안내 배너**와 안내형 메시지가 표시됩니다.

확인 순서:

1. `status-local.bat`으로 서버 실행 여부와 포트를 확인합니다.
2. 브라우저 주소가 상태 확인 결과와 같은지 봅니다.
3. 서버가 꺼져 있으면 `start-local.bat`으로 다시 시작합니다.
4. 화면 상단 **다시 연결**을 누릅니다.
5. 계속되면 **캐시 초기화** 후 새로고침합니다.

자동 점검: `npm run check:observation`의 `connection-failure`, `safe-stop` 항목이 위 흐름을 검증합니다.

## 로그 위치

| 파일 | 내용 |
|---|---|
| `data/local-server.out.log` | 서버 표준 출력 |
| `data/local-server.err.log` | 서버 오류 로그 |
| `data/server.json` | 실행 중 PID·포트·시작 시각 |

## 점검 체크리스트 (13.8 재점검 결과)

| 항목 | 결과 |
|---|---|
| `start-local.bat` / `status-local.bat` / `stop-local.bat` 존재 | 통과 |
| 중복 시작 방지·stale runtime 정리 | 통과 |
| `/api/health`에 `safeStop`, `runtimeVerified` 노출 | 통과 |
| 연결 실패 시 배너·다시 연결·캐시 초기화 | 통과 |
| `getDisplayErrorMessage`가 `Failed to fetch`를 안내 문구로 변환 | 통과 |

관련 문서: [개인용 회귀 테스트 시나리오](full-regression-test-scenarios.md) S-01~S-06, U-15
