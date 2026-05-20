# 증권사 API adapter 검토

검토일: 2026-05-20

## 결론

Stock Alarm은 매도 주문 앱이 아니라 매도 시점 알림 앱입니다. 그래서 증권사 API를 붙이더라도 1차 범위는 `현재가 조회 전용`으로 제한합니다. 주문, 정정, 취소, 자동매매 기능은 구현하지 않습니다.

추천 순서는 아래와 같습니다.

1. 한국투자증권 Open API
2. 키움 REST API

한국투자증권은 REST와 WebSocket 방식을 공식 포털에서 안내하고, 공식 GitHub 샘플 저장소가 있어 먼저 붙이기 좋습니다. 키움은 REST API, OAuth 토큰 발급, 국내주식 시세/실시간시세 문서가 있어 두 번째 후보로 둡니다.

## 이번 개발 산출물

1차 검토 단계에서는 adapter를 붙이기 전에 필요한 설정과 위험한 설정을 점검하는 CLI를 추가했습니다.

```powershell
npm run check:broker-api
npm run check:broker-api -- --json
npm run check:broker-api -- --provider kis
npm run check:broker-api -- --provider kiwoom
npm run check:broker-api -- --fail-on-warn
```

기본값은 `BROKER_QUOTE_PROVIDER=none`입니다. 이 상태에서는 기존 무료 시세 provider 체인인 `naver,stooq,alphavantage,yahoo`가 그대로 유지됩니다.

`BROKER_TRADING_ENABLED=true`로 설정하면 점검이 실패합니다. 이 프로젝트의 현재 범위는 알림 앱이므로 주문 기능을 실수로 켜지 못하게 막기 위한 가드입니다.

이후 KIS 현재가 provider를 구현했습니다. 실제 키와 접근 토큰을 확보한 경우 아래처럼 시세 체인 앞에 둘 수 있습니다.

```text
QUOTE_PROVIDERS=kis,naver,stooq,alphavantage,yahoo
KIS_API_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=한국투자증권_앱키
KIS_APP_SECRET=한국투자증권_앱시크릿
KIS_TOKEN_AUTO_REFRESH=true
KIS_MARKET_DIV_CODE=J
```

`KIS_ACCESS_TOKEN`을 직접 넣어도 되지만, 기본값은 앱키/시크릿으로 접근 토큰을 발급받아 `data/kis-token.json`에 캐시하는 방식입니다. 토큰 원문은 CLI 출력에 표시하지 않습니다.

```powershell
npm run kis:token
npm run kis:token -- --json
npm run kis:token -- --force
```

실제 키로 현재가 호출까지 확인하는 smoke test CLI도 추가했습니다. 기본 종목은 `336260`이고, `--market all`을 쓰면 KRX, NXT, 통합을 순서대로 확인합니다.

```powershell
npm run check:kis-quote
npm run check:kis-quote -- --symbol 336260 --market J
npm run check:kis-quote -- --symbol 33626L --market all
npm run check:kis-quote -- --symbol 005930 --market UN --json
```

관리자 화면에서도 같은 점검을 실행할 수 있습니다. `/admin`의 `KIS 현재가 점검` 카드에서 종목코드와 `KRX`, `NXT`, `통합`, `전체` 시장을 선택하면 `POST /api/kis/quote-smoke-test`가 실행되고, 토큰 출처와 시장별 성공/실패가 표시됩니다.

`/admin`의 `KIS/Naver 가격 비교` 카드에서는 `POST /api/kis/naver-compare`로 같은 종목의 Naver 기준가와 KIS KRX/NXT/통합 가격을 나란히 조회합니다. 결과에는 시장별 가격 차이, 차이율, 추천 시장, 가격 차이 이상치 주의/경고, 실패 사유, provider 진단 시도가 표시되며 관리자 API 보호 대상입니다. 비교 결과와 이상치 판정은 최근 이력으로 저장되고, 저장된 이력은 시장별 평균/최대/최근 괴리율과 반복 이상치 추세로 관리자 화면에서 확인할 수 있습니다. 저장된 추세 기반 추천은 현재 1회 비교 추천과 비교해 적용 가능, 추가 확인, 관찰 필요로 판단합니다. 등록된 같은 종목이 있으면 `POST /api/kis/naver-compare/apply`로 해당 시장을 종목의 KIS 기준에 바로 적용할 수 있습니다.

사용자 종목에는 `kisMarketDivCode`를 저장할 수 있습니다. 비어 있으면 `KIS_MARKET_DIV_CODE` 기본값을 사용하고, 값이 있으면 자동 가격 확인과 실패 종목 재시도에서 해당 종목의 KRX/NXT/통합 기준을 우선 적용합니다.

키가 없거나 해외 종목이면 `kis` provider는 스킵되고 다음 provider로 넘어갑니다.

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
| `KIS_MARKET_DIV_CODE` | `J` | 한국투자증권 현재가 시장 구분. `J` KRX, `NX` NXT, `UN` 통합 |
| `KIS_CUST_TYPE` | `P` | 한국투자증권 고객 구분. 기본값 `P` 개인 |
| `KIS_TOKEN_AUTO_REFRESH` | `true` | 접근 토큰 자동 발급/갱신 여부 |
| `KIS_TOKEN_CACHE_PATH` | `data/kis-token.json` | 선택. 접근 토큰 캐시 파일 경로. 기본 경로는 Git 제외 |
| `KIS_SMOKE_SYMBOL` | `336260` | 선택. `npm run check:kis-quote` 기본 점검 종목 |
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
- 공식 샘플의 `주식현재가 시세` endpoint는 `/uapi/domestic-stock/v1/quotations/inquire-price`이고, 시장 구분 코드는 `J: KRX`, `NX: NXT`, `UN: 통합`을 사용합니다.

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

KIS 접근 토큰 자동 발급/갱신, 현재가 smoke test CLI, 관리자 화면 점검 버튼, 종목별 KIS 시장 설정, KIS/Naver 가격 비교 진단, 비교 결과 기반 시장 적용, 가격 차이 이상치 모니터링, 가격 비교 이력 저장, 가격 비교 추세 시각화, 추세 기반 시장 추천은 구현했습니다. 다음 단계는 관심 종목의 KIS/Naver 가격 비교를 주기적으로 실행해 추세 추천 데이터가 오래되지 않게 만드는 자동 점검 기능입니다.

실제 운영 전에 확인할 항목:

- 사용자가 한국투자증권 API 신청을 완료
- 앱 키와 시크릿을 `.env`에 준비
- `npm run check:kis-quote -- --symbol 336260 --market J` 또는 관리자 화면 점검 버튼으로 현재가 조회 호출 제한과 오류 메시지를 실제 계정으로 확인
- 주문 API를 호출하지 않는다는 제품 범위 유지

## 참고 링크

- [한국투자증권 Open API 개발자센터](https://apiportal.koreainvestment.com/)
- [한국투자증권 Open API 공식 GitHub 샘플](https://github.com/koreainvestment/open-trading-api)
- [키움 REST API 가이드](https://openapi.kiwoom.com/guide/apiguide)
