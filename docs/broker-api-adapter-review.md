# 증권사 API adapter 검토

검토일: 2026-05-20

## 결론

Stock Alarm은 매도 주문 앱이 아니라 매도 시점 알림 앱입니다. 그래서 증권사 API를 붙이더라도 1차 범위는 `현재가 조회 전용`으로 제한합니다. 주문, 정정, 취소, 자동매매 기능은 구현하지 않습니다.

추천 순서는 아래와 같습니다.

1. 한국투자증권 Open API
2. 키움 REST API

한국투자증권은 REST와 WebSocket 방식을 공식 포털에서 안내하고, 공식 GitHub 샘플 저장소가 있어 먼저 붙이기 좋습니다. 키움은 REST API, OAuth 토큰 발급, 국내주식 시세/실시간시세 문서가 있어 두 번째 후보로 둡니다.

## 이번 개발 산출물

이번 단계에서는 실제 증권사 현재가 호출을 구현하지 않고, adapter를 붙이기 전에 필요한 설정과 위험한 설정을 점검하는 CLI를 추가했습니다.

```powershell
npm run check:broker-api
npm run check:broker-api -- --json
npm run check:broker-api -- --provider kis
npm run check:broker-api -- --provider kiwoom
npm run check:broker-api -- --fail-on-warn
```

기본값은 `BROKER_QUOTE_PROVIDER=none`입니다. 이 상태에서는 기존 무료 시세 provider 체인인 `naver,stooq,alphavantage,yahoo`가 그대로 유지됩니다.

`BROKER_TRADING_ENABLED=true`로 설정하면 점검이 실패합니다. 이 프로젝트의 현재 범위는 알림 앱이므로 주문 기능을 실수로 켜지 못하게 막기 위한 가드입니다.

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---:|---|
| `BROKER_QUOTE_PROVIDER` | `none` | `none`, `kis`, `kiwoom` 중 하나. 실제 provider 구현 전에는 `none` 유지 |
| `BROKER_TRADING_ENABLED` | `false` | 주문 기능 사용 여부. 이 앱은 `false`만 허용 |
| `KIS_API_BASE_URL` | `https://openapi.koreainvestment.com:9443` | 한국투자증권 Open API URL |
| `KIS_APP_KEY` | 빈 값 | 한국투자증권 앱 키 |
| `KIS_APP_SECRET` | 빈 값 | 한국투자증권 앱 시크릿 |
| `KIS_ACCESS_TOKEN` | 빈 값 | 한국투자증권 접근 토큰 |
| `KIS_ACCOUNT_NUMBER` | 빈 값 | 선택. 향후 계좌 기반 기능 점검용 |
| `KIWOOM_API_BASE_URL` | `https://api.kiwoom.com` | 키움 REST API URL |
| `KIWOOM_APP_KEY` | 빈 값 | 키움 앱 키 |
| `KIWOOM_SECRET_KEY` | 빈 값 | 키움 시크릿 키 |
| `KIWOOM_ACCESS_TOKEN` | 빈 값 | 키움 접근 토큰 |
| `KIWOOM_ACCOUNT_NUMBER` | 빈 값 | 선택. 향후 계좌 기반 기능 점검용 |

## 한국투자증권 Open API 후보

적합한 이유:

- 공식 포털에서 REST와 WebSocket 방식을 안내합니다.
- 계좌의 App key, App secret으로 토큰을 발급받아 REST API를 호출하는 구조입니다.
- 공식 GitHub 샘플 저장소가 있어 adapter 구현 전에 요청/응답 형태를 확인하기 좋습니다.

주의할 점:

- 실제 키와 토큰은 `.env`에만 저장하고 Git에 올리지 않습니다.
- 호출 제한과 토큰 만료 처리 방식은 실제 키로 검증해야 합니다.
- 이번 앱에서는 시세 조회만 사용하고 주문 API는 사용하지 않습니다.

## 키움 REST API 후보

적합한 이유:

- 공식 REST API 가이드에 OAuth 접근토큰 발급, 국내주식 시세, 실시간시세, 차트, 주문 범주가 분리되어 있습니다.
- 운영 도메인과 모의투자 도메인이 문서화되어 있어 로컬 검증 단계를 만들기 좋습니다.

주의할 점:

- 개인 계좌와 API 사용 신청이 필요합니다.
- 접근토큰, IP 제한, 호출 제한을 실제 계정 조건에 맞춰 검증해야 합니다.
- 주문 관련 API는 범위에서 제외합니다.

## 다음 구현 조건

실제 `kis` 또는 `kiwoom` quote provider 구현은 아래 조건이 충족된 뒤 진행합니다.

- 사용자가 해당 증권사 API 신청을 완료
- 앱 키, 시크릿, 접근 토큰을 `.env`에 준비
- 현재가 조회 endpoint와 호출 제한을 실제 계정으로 확인
- 주문 API를 호출하지 않는다는 제품 범위 유지

## 참고 링크

- [한국투자증권 Open API 개발자센터](https://apiportal.koreainvestment.com/)
- [한국투자증권 Open API 공식 GitHub 샘플](https://github.com/koreainvestment/open-trading-api)
- [키움 REST API 가이드](https://openapi.kiwoom.com/guide/apiguide)
