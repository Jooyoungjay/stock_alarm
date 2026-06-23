# 개인 PC 주간 회귀 운영 루틴

날짜 기준: 2026-06-22 (WBS 14.4)

이 문서는 Stock Alarm을 **개인 PC에서 매주** 점검하는 고정 절차입니다. 코드를 바꾸지 않은 주에도 서버·텔레그램·백업·회귀가 정상인지 확인합니다.

관련 문서:

- [개인 실사용 백로그](personal-backlog.md) — BL-M01~03 모니터링
- [개인 PC 로컬 실행 가이드](personal-local-execution-guide.md)
- [개인 PC 백업·복구 정책](personal-backup-policy.md)
- [개인 텔레그램 원격 운영](personal-telegram-operations.md)
- [개인용 회귀 테스트 시나리오](full-regression-test-scenarios.md)

## 권장 일정

| 요일 | 내용 | 소요 |
|---|---|---|
| **월** (또는 서버 재시작 직후) | 자동 회귀 + smoke | 약 5분 |
| **금** (또는 주말 전) | 백업·텔레그램·백로그 점검 | 약 10분 |
| **장중 1회** (선택) | 실제 종목 live-session | 약 5분 |

한 주에 **최소 1회**는 월요일 체크리스트, **최소 1회**는 금요일 체크리스트를 수행합니다.

## 사전 준비

1. `start-local.bat` 또는 `npm run local:start`로 서버 실행
2. `status-local.bat`으로 포트 확인 (3000이 아닐 수 있음)
3. `.env`에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 설정 확인
4. 중요 데이터 변경 전 `/backup` 또는 관리자 `백업 생성`

## 월요일 — 자동 회귀 (필수)

| # | 항목 | 명령/동작 | 합격 기준 |
|---|---|---|---|
| W-01 | 전체 자동 테스트 | `npm test` | **251개** 전부 통과 |
| W-02 | 서버 문법 | `node --check src/server.js` | 오류 없음 |
| W-03 | 로컬 smoke | `npm run check:observation -- --base-url http://127.0.0.1:PORT` | READY (manual 항목은 장중 분리) |
| W-04 | 헬스 | `Invoke-RestMethod http://127.0.0.1:PORT/api/health` | `ok=true`, `telegramConfigured` 확인 |

`ADMIN_TOKEN` 사용 시:

```powershell
npm run check:observation -- --base-url http://127.0.0.1:3000 --admin-token "TOKEN"
```

점검 결과를 남기려면:

```powershell
npm run check:observation -- --base-url http://127.0.0.1:3000 --save-history
```

관리자 화면 **점검 실행/저장** 버튼으로 동일 흐름을 실행할 수 있습니다.

## 금요일 — 백업·텔레그램·백로그 (필수)

| # | 항목 | 명령/동작 | 합격 기준 |
|---|---|---|---|
| W-05 | 수동 백업 | 텔레그램 `/backup` 또는 관리자 백업 생성 | 백업 파일 생성 메시지 |
| W-06 | 자동 백업 상태 | `/api/health`의 `autoBackupEnabled`, `lastAutoBackup` | 설정과 마지막 실행 시각이 기대와 일치 |
| W-07 | 텔레그램 연결 | `/status` | 응답 수신, `lastTelegramCommandPoll` 갱신 |
| W-08 | 즉시 확인 | `/check` | 전체 확인 결과 요약 수신 |
| W-09 | 배당 진단 샘플 | `/dividend-status` (실패 종목 있으면 1종목 추가) | provider 실패 사유가 읽을 수 있음 |
| W-10 | 백로그 triage | [personal-backlog.md](personal-backlog.md) 열린 BL-* 확인 | P1/P2 없음 또는 WBS 승격 여부 결정 |

## 장중 — live-session (선택, BL-M01~03)

장이 열려 있고 실제 감시 종목이 있을 때:

```powershell
npm run check:observation -- --base-url http://127.0.0.1:PORT --live-session --save-history
```

| # | 항목 | 합격 기준 |
|---|---|---|
| W-11 | 시세 최신성 | 활성 종목 시세가 장중 기준 이내 또는 실패 사유 표시 |
| W-12 | 배당 진단 | 최근 배당 갱신·provider 상태 확인 |
| W-13 | 알림 준비 | 알림 OFF/쉬기/매도 제외 종목이 의도와 일치 |

`manual` 항목이 있으면 관리자 점검 히스토리에 조치 메모를 남깁니다.

## 월 1회 — 추가 (권장)

| # | 항목 | 명령/동작 |
|---|---|---|
| W-14 | 시각 회귀 | `npm run check:visual` (환경에 따라) |
| W-15 | 외부 API 점검 | `npm run check:external-apis` (키 설정 시) |
| W-16 | 백업 보관 | `data/backups/` 오래된 파일 정리 또는 외부 복사 |
| W-17 | 점검 히스토리 정리 | 관리자 화면에서 오래된 observation 파일 prune |

## 실패 시 대응

| 증상 | 먼저 할 일 | 문서 |
|---|---|---|
| `npm test` 실패 | 실패 테스트 파일만 재실행 후 수정 | [회귀 시나리오](full-regression-test-scenarios.md) |
| `check:observation` NOT READY | 출력의 failed 항목 evidence 확인 | [로컬 실행 가이드](personal-local-execution-guide.md) |
| 텔레그램 무응답 | 서버 재시작, `TELEGRAM_*` env | [텔레그램 운영](personal-telegram-operations.md) |
| `Failed to fetch` | `status-local.bat`, 연결 배너 | [로컬 실행 가이드](personal-local-execution-guide.md) |
| P1/P2 백로그 | [personal-backlog.md](personal-backlog.md)에 기록 후 @pm WBS 승격 | — |

## 주간 체크리스트 (복사용)

```text
[ ] W-01 npm test (251 pass)
[ ] W-02 node --check src/server.js
[ ] W-03 check:observation READY
[ ] W-04 /api/health ok
[ ] W-05 /backup 또는 관리자 백업
[ ] W-06 lastAutoBackup 확인
[ ] W-07 /status 응답
[ ] W-08 /check 응답
[ ] W-09 /dividend-status (필요 시)
[ ] W-10 personal-backlog BL-* 확인
[ ] W-11~13 live-session (장중, 선택)
```

## 14.4 완료 기준

| 항목 | 결과 |
|---|---|
| 주간 절차 문서화 | 이 문서 |
| BL-05 (루틴 문서 없음) | 해결 |
| 다음 WBS | 14.6 배당 실패 다음 조치 통일 |
