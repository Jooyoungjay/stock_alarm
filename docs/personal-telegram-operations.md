# 개인 텔레그램 원격 운영 가이드

날짜 기준: 2026-06-24 (WBS 13.9·17.4·19.5)

PC 앞에 없을 때 **텔레그램 봇**으로 상태 확인·즉시 점검·알림 제어를 합니다. 가격·배당 알림은 텔레그램 단일 채널입니다.

## 사전 조건

| 항목 | 확인 |
|---|---|
| `TELEGRAM_BOT_TOKEN` | `.env`에 설정 |
| `TELEGRAM_CHAT_ID` | 본인 채팅 ID와 일치 |
| 서버 실행 | `start-local.bat`으로 로컬 서버가 떠 있어야 명령 폴링 동작 |
| 권한 | 설정한 `chat.id`에서 온 메시지만 처리 |

서버가 꺼져 있으면 명령은 처리되지 않습니다. 원격에서 복구하려면 PC에서 서버를 다시 시작해야 합니다.

## 핵심 점검 명령 (13.9 재점검 대상)

### `/status [종목코드]`

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 전체 요약 | `/status` | 감시 종목 목록 + **시세 신선도 요약**(정상·오래됨·오류·미확인) |
| 종목 상세 | `/status 336260` | 현재가, **시세 신선도**(장중 오래됨·조회 실패 시 다음 조치), 알림 상태 |
| 계좌 구분 | `/status 336260@isa` | 같은 종목이 여러 계좌에 있을 때 해당 계좌만 |

### `/brief` (별칭: `/briefing`, `/risk`)

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 일일 브리핑 | `/brief` | 위험 종목·이익금 반납·배당·평가 구역 요약 + **텔레그램 폴링 상태** (`/briefing`, `/risk` 별칭 동일) |

자동 일일 브리핑(`DAILY_BRIEFING_*`)과 별도로, **수동 `/brief` 요청** 시 즉시 같은 형식의 요약을 받습니다.

### `/today` (별칭: `/today-actions`)

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 오늘 할 일 | `/today` | 웹 **오늘 확인할 일**과 유사한 우선 항목 — poll health, 시세 신선도, 알림 도달, 배당 실패 등 최대 5건 |
| 장중 점검 | `/today` 후 `/status` | `/today`에서 안내한 종목을 `/status <코드>`로 상세 확인 |

### 장중 critical digest (WBS 19.5)

서버가 켜져 있고 `TODAY_ACTION_DIGEST_ENABLED=true`이면 **한국 장중(평일 09:00~15:30 KST)** 에 `critical` 오늘 할 일이 있을 때 텔레그램으로 요약을 보냅니다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `TODAY_ACTION_DIGEST_ENABLED` | `true` | 장중 digest 자동 전송 |
| `TODAY_ACTION_DIGEST_COOLDOWN_MINUTES` | `60` | 동일 항목 조합 재전송 대기 |
| `TODAY_ACTION_DIGEST_CHECK_INTERVAL_SECONDS` | `300` | digest 판단 주기(초) |

`/today`·`/check` 요약과 동일한 우선순위 엔진을 쓰며, **확인 필요(`critical`)** 항목만 포함합니다. 메시지 끝에 `/today 로 전체 보기` 힌트가 붙습니다. `/api/health`의 `lastTodayActionDigest`로 마지막 전송·쿨다운 상태를 확인할 수 있습니다.

### 헬스 `todayActionsSummary` (WBS 19.7)

`/api/health` 응답의 `todayActionsSummary`는 `/today`·웹 **오늘 확인할 일**과 같은 엔진으로 집계한 요약입니다. 주간 루틴 W-04에서 `quoteFreshnessSummary.needsAttention`과 함께 보면 장중 확인 우선순위를 한 번에 파악할 수 있습니다.

| 필드 | 의미 |
|---|---|
| `total` | 우선순위 정렬 전 전체 today action 수 |
| `displayed` | `/today`에 노출되는 상위 건수(최대 5) |
| `critical` / `warning` / `info` | 우선순위별 건수 |
| `needsAttention` | `critical + warning` |
| `byType` | 타입별 건수 (`threshold-alert`, `observation-failed` 등) |
| `top` | `/today` 상위 항목 요약 (`type`, `priority`, `title`, `symbol`) |

```powershell
$h = Invoke-RestMethod http://127.0.0.1:3000/api/health
$h.todayActionsSummary.needsAttention
$h.todayActionsSummary.critical
$h.todayActionsSummary.top
$h.quoteFreshnessSummary.needsAttention
```

### `/dividend-status [종목코드]`

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 전체 진단 | `/dividend-status` | provider별 성공/실패, 최근 갱신 시각 |
| 종목별 | `/dividend-status 336260` | 해당 종목 배당 provider 체인, 실패 사유, **다음 조치** |

### `/check`

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 즉시 전체 확인 | `/check` | 등록 종목 시세·알림 조건 실행 + **오늘 할 일** 요약 (WBS 18.4) |

웹 관리자의 `지금 확인`과 동일한 엔진을 텔레그램에서 호출합니다.

## 알림 일시정지·상태 제어

| 명령 | 예시 | 효과 |
|---|---|---|
| `/pause <종목>` | `/pause 336260` | 알림 OFF (웹 토글과 동일) |
| `/resume <종목>` | `/resume 336260` | 알림 ON |
| `/snooze <종목> <분\|today\|clear>` | `/snooze 336260 60` | 60분간 알림 억제 |
| | `/snooze 336260 today` | 오늘 장 마감까지 억제 |
| | `/snooze 336260 clear` | 일시정지 해제 |
| `/sold <종목>` | `/sold 336260` | 매도 완료 — 알림·포트폴리오 합산 제외 |
| `/watch <종목>` | `/watch 336260` | 관심 종목 |
| `/holding <종목>` | `/holding 336260` | 보유 종목 |

웹 앱의 `1시간 쉬기`, `오늘 쉬기`, `해제`와 저장 상태가 일치해야 합니다.

## 백업 원격 제어

| 명령 | 용도 |
|---|---|
| `/backup` | 즉시 JSON 백업 생성 |
| `/backups` | 최근 백업 목록 |
| `/restore <번호\|파일명>` | 복구 (`before-restore` 자동 생성) |
| `/delete-backup <번호\|파일명>` | 백업 파일만 삭제 |

자세한 보관 정책은 [개인 PC 백업·복구 정책](personal-backup-policy.md)을 참고합니다.

## 폴링 건강 상태 (WBS 15.5·16.4)

`/api/health` 응답의 `telegramPollHealth`로 봇이 명령을 받을 준비가 됐는지 확인합니다. 관리자 **서버 상태** 카드에도 동일 정보가 표시됩니다.

| `status` | 의미 | 다음 조치 |
|---|---|---|
| `ok` | 마지막 폴링이 기준(기본 30초) 이내 | 없음 |
| `stale` | 폴링 지연·무응답 의심 | 서버 재시작, `TELEGRAM_*` env, PC 절전 여부 |
| `error` | 폴링 오류 | 서버 로그·토큰·네트워크 확인 |
| `missing` | `TELEGRAM_BOT_TOKEN`/`CHAT_ID` 미설정 | `.env` 설정 후 재시작 |

헬스 체크:

```powershell
$h = Invoke-RestMethod http://127.0.0.1:3000/api/health
$h.telegramConfigured
$h.lastTelegramCommandPoll
$h.telegramPollHealth.status
$h.telegramPollHealth.label
$h.telegramPollHealth.detail
$h.telegramPollHealth.nextAction
```

주간 루틴 W-04와 [personal-weekly-routine.md](personal-weekly-routine.md)를 함께 봅니다.

## 문제 해결 (요약)

| 증상 | 확인 |
|---|---|
| 명령 무응답 | 서버 실행 여부, `TELEGRAM_BOT_TOKEN`/`CHAT_ID`, 서버 재시작, **TG-07** |
| 다른 채팅에서 무응답 | `chat.id` 불일치 — 봇에게 보낸 채팅 ID와 `.env` 비교 |
| `/check` 후 알림 없음 | 종목 `pause`/`snooze`/`sold` 상태, 시세 조회 실패 사유 |
| 명령은 되는데 늦음 | `telegramPollHealth`가 `stale`/`무응답 의심` — 서버·네트워크 재확인 |

`telegramConfigured: true`와 `telegramPollHealth`는 위 **폴링 건강 상태** 절을 참고합니다.

## 13.9 재점검 체크리스트

| ID | 명령 | 자동 테스트 | 수동 확인 |
|---|---|---|---|
| TG-01 | `/status` | `telegramCommands.test.js` | 종목 상세·계좌 구분 |
| TG-02 | `/brief` | 동일 | 위험 종목·이익금 반납·배당·평가·폴링 상태 요약 |
| TG-03 | `/dividend-status` | 동일 | provider 실패 사유 |
| TG-04 | `/check` | `alertEngine` 연동 | 즉시 확인 결과 메시지 |
| TG-05 | `/snooze` | `storage.test.js` 일시정지 | 60분·today·clear |
| TG-06 | `/pause`, `/resume` | 동일 | 웹 토글 일치 |
| TG-07 | `/api/health` | `telegramPollHealth` 단위 테스트 | `telegramPollHealth.status`, `label`, `nextAction` |

관련 문서: [개인용 회귀 테스트 시나리오](full-regression-test-scenarios.md) T-01~T-10 · [주간 회귀 루틴](personal-weekly-routine.md) W-04
