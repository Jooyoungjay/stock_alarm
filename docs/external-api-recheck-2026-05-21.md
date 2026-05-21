# 외부 API 실계정 재점검 기록

날짜: 2026-05-21

목적: 전수 테스트에서 남은 KIS 현재가, 공공데이터포털 주식시세정보, 텔레그램 실전송 항목을 한 번에 재점검할 수 있는 기준을 고정합니다.

## 추가한 점검 도구

```powershell
npm run check:external-apis
npm run check:external-apis -- --kis-symbol 33626L --kis-market all --publicdata-symbol 005930
npm run check:external-apis -- --send-telegram
npm run check:external-apis -- --json
```

기본 실행은 텔레그램 실전송을 생략합니다. 실제 메시지를 보내려면 `--send-telegram`을 명시해야 합니다.

점검 대상:

- 증권사 adapter 설정과 주문 차단 상태
- KIS 현재가 smoke test
- 공공데이터포털 주식시세정보 일봉 최고가 조회
- 텔레그램 봇 설정 또는 실제 테스트 메시지 전송

보안 기준:

- KIS 앱 키, 앱 시크릿, 접근 토큰은 출력하지 않습니다.
- 공공데이터포털 서비스 키와 텔레그램 토큰/채팅 ID도 출력하지 않습니다.
- JSON 출력에서도 감지된 비밀값은 `[REDACTED]`로 마스킹합니다.

## 현재 환경 실행 결과

실행 명령:

```powershell
npm run check:external-apis -- --publicdata-start 2026-05-01 --publicdata-end 2026-05-15
```

결과: `FAILED`

요약:

| 항목 | 결과 | 내용 |
|---|---|---|
| 증권사 adapter 설정 | WARN | `BROKER_QUOTE_PROVIDER=none`, 주문 기능은 꺼져 있음 |
| KIS 현재가 실계정 | FAIL | `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ACCESS_TOKEN` 미설정 |
| 공공데이터 일봉 | FAIL | `HTTP 403 Forbidden` |
| 텔레그램 실전송 | SKIP | 봇 토큰과 채팅 ID는 설정되어 있으나 `--send-telegram` 없이 실행 |

이번 실패는 기능 코드 실패라기보다 실제 외부 계정/권한 확인이 남아 있는 상태입니다.

## 다음 조치

1. 한국투자증권 Open API에서 실제 앱 키와 앱 시크릿을 발급받아 `.env`에 `KIS_APP_KEY`, `KIS_APP_SECRET`을 설정합니다.
2. `npm run check:external-apis -- --kis-symbol 336260 --kis-market all`로 KRX/NXT/통합 현재가를 다시 확인합니다.
3. 공공데이터포털에서 `금융위원회_주식시세정보` 활용 신청이 승인됐는지 확인합니다. 배당정보 API 승인과 주식시세정보 API 승인은 별도일 수 있습니다.
4. 공공데이터 권한을 확인한 뒤 `npm run check:external-apis -- --publicdata-symbol 005930`을 다시 실행합니다.
5. 실제 텔레그램 메시지 수신까지 확인할 때만 `npm run check:external-apis -- --send-telegram`을 실행합니다.

## 판정 기준

- `READY`: KIS, 공공데이터, 텔레그램 실전송이 모두 통과하고 경고/스킵이 없음
- `PARTIAL`: 실패는 없지만 경고 또는 스킵이 있음
- `FAILED`: 하나 이상의 필수 외부 API 점검 실패

현재 상태는 `FAILED`입니다. 다음 개발 순서는 외부 API 키 발급 대기가 아니라 모바일 실기기 E2E 테스트로 진행합니다.
