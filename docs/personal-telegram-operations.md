# 개인 텔레그램 원격 운영 가이드

날짜 기준: 2026-06-22 (WBS 13.9)

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
| 전체 요약 | `/status` | 감시 종목 수, 알림 ON/OFF, 최근 확인 시각 요약 |
| 종목 상세 | `/status 336260` | 현재가, 기준가, 여유, 시세 품질, 알림 상태 |
| 계좌 구분 | `/status 336260@isa` | 같은 종목이 여러 계좌에 있을 때 해당 계좌만 |

### `/brief` (별칭: `/briefing`, `/risk`)

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 일일 브리핑 | `/brief` | 위험 종목·이익금 반납·배당·평가 구역 요약 (`/briefing`, `/risk` 별칭 동일) |

자동 일일 브리핑(`DAILY_BRIEFING_*`)과 별도로, **수동 요청** 시 즉시 같은 형식의 요약을 받습니다.

### `/dividend-status [종목코드]`

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 전체 진단 | `/dividend-status` | provider별 성공/실패, 최근 갱신 시각 |
| 종목별 | `/dividend-status 336260` | 해당 종목 배당 provider 체인, 실패 사유, **다음 조치** |

### `/check`

| 시나리오 | 입력 | 기대 결과 |
|---|---|---|
| 즉시 전체 확인 | `/check` | 등록 종목 시세·알림 조건을 지금 실행하고 결과 요약 |

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

## 문제 해결

| 증상 | 확인 |
|---|---|
| 명령 무응답 | 서버 실행 여부, `TELEGRAM_BOT_TOKEN`/`CHAT_ID`, 서버 재시작 |
| 다른 채팅에서 무응답 | `chat.id` 불일치 — 봇에게 보낸 채팅 ID와 `.env` 비교 |
| `/check` 후 알림 없음 | 종목 `pause`/`snooze`/`sold` 상태, 시세 조회 실패 사유 |

헬스 체크:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

`telegramConfigured: true`, `lastTelegramCommandPoll` 시각이 갱신되는지 확인합니다.

## 13.9 재점검 체크리스트

| ID | 명령 | 자동 테스트 | 수동 확인 |
|---|---|---|---|
| TG-01 | `/status` | `telegramCommands.test.js` | 종목 상세·계좌 구분 |
| TG-02 | `/brief` | 동일 | 위험 종목·이익금 반납·배당·평가 요약 |
| TG-03 | `/dividend-status` | 동일 | provider 실패 사유 |
| TG-04 | `/check` | `alertEngine` 연동 | 즉시 확인 결과 메시지 |
| TG-05 | `/snooze` | `storage.test.js` 일시정지 | 60분·today·clear |
| TG-06 | `/pause`, `/resume` | 동일 | 웹 토글 일치 |

관련 문서: [개인용 회귀 테스트 시나리오](full-regression-test-scenarios.md) T-01~T-10
