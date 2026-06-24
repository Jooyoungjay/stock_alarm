# KIS/Naver 자동 비교 알림 운영

날짜 기준: 2026-06-22 (WBS 14.7)

개인 PC에서 KIS/Naver 자동 가격 비교 알림을 **노이즈 없이** 운영하는 절차입니다.

관련 문서:

- [개인 텔레그램 원격 운영](personal-telegram-operations.md)
- [주간 회귀 운영 루틴](personal-weekly-routine.md)
- [증권사 API adapter 검토](broker-api-adapter-review.md)

## 언제 켜나

| 조건 | 권장 |
|---|---|
| KIS 키·Naver 시세가 안정적으로 붙음 | ON 검토 |
| 장중 provider 실패가 잦음 | OFF 유지, 수동 비교만 |
| 알림이 같은 이슈로 반복됨 | ON + 이슈 **확인/보류** 처리 |

`.env`:

```env
KIS_NAVER_AUTO_COMPARE_ENABLED=true
KIS_NAVER_AUTO_COMPARE_ALERT_ENABLED=true
KIS_NAVER_AUTO_COMPARE_ALERT_COOLDOWN_MINUTES=360
KIS_NAVER_AUTO_COMPARE_RESOLVED_REOPEN_COOLDOWN_MINUTES=1440
```

## 알림 정책 (WBS 14.7)

| 정책 | 동작 |
|---|---|
| **안정 이슈 키** | 종목·시장 기준으로 묶어 오류 문구·주의/경고 등급 변화만으로는 새 알림을 만들지 않음 |
| **중복 억제** | 같은 알림 가능 이슈 조합은 한 번 전송 후 이슈가 바뀔 때까지 재전송하지 않음 |
| **쿨다운** | `KIS_NAVER_AUTO_COMPARE_ALERT_COOLDOWN_MINUTES` 동안 같은 이슈 재시도 제한 |
| **확인·보류** | 처리한 이슈는 같은 내용이 반복되어도 텔레그램에서 제외 |
| **해결 재감지** | 다시 감지되면 **열림**으로 되돌림. 재알림은 해결 후 `RESOLVED_REOPEN_COOLDOWN` 이후 |

## 관리자 화면 처리

`/admin` → KIS/Naver 가격 비교 → **가격 비교 이슈**

| 버튼 | 용도 |
|---|---|
| **확인** | 봤지만 계속 관찰 — **알림 제외** (장기 반복 이슈에 적합) |
| **보류** | 당분간 무시 — **알림 제외** |
| **해결** | 조치 완료 — 재감지 시 열림, **쿨다운 후** 재알림 |
| **다시 열기** | 확인·보류·해결 취소 |

기본 목록은 **열린 이슈만** 표시합니다. `처리됨 포함`으로 확인·보류·해결 이력을 볼 수 있습니다.

## 주간 점검 (BL-M03 연계)

| # | 항목 | 확인 |
|---|---|---|
| KA-01 | 자동 비교 실행 | 관리자 `자동 점검 실행` 또는 스케줄 `lastKisNaverAutoCompare` |
| KA-02 | 알림 상태 | `중복 생략` / `처리·쿨다운으로 생략` / `전송됨` |
| KA-03 | 열린 이슈 | 미처리 0 또는 확인·보류 처리 |
| KA-04 | 텔레그램 | `/status` 또는 최근 `[Stock Alarm] KIS/Naver 자동 점검 알림` |

## 문제별 다음 조치

| 증상 | 조치 |
|---|---|
| 같은 종목 알림 반복 | 관리자에서 **확인** 또는 **보류** |
| 해결했는데 또 옴 | 정상 — 쿨다운(기본 24h) 후 재알림. 당장 끄려면 **보류** |
| provider 실패만 반복 | KIS 키·시장 설정 점검, 자동 비교 OFF 후 수동 비교 |
| 알림 자체가 너무 많음 | `KIS_NAVER_AUTO_COMPARE_ALERT_ENABLED=false` 또는 쿨다운·LIMIT 조정 |
