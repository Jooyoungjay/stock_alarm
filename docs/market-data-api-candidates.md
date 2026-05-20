# 공식/유료 시세 API 후보 검토

자료 확인일: 2026-05-20

## 목적

Stock Alarm은 현재 로컬 웹앱 MVP 단계이며, 무료/공개 provider 체인으로 현재가와 일봉을 조회합니다. 이 문서는 향후 한국 주식 시세 안정화, KRX/NXT 가격 구분, 모바일 앱 확장을 고려해 어떤 시세 API를 붙일지 판단하기 위한 후보 비교입니다.

## 결론

당장 시세 provider를 교체하지 않습니다.

현재 단계에서는 먼저 `현재 provider 실패율 기록`을 개발해서 실제 실패 빈도와 실패 사유를 저장해야 합니다. 그 다음 시세 출처, 지연 여부, KRX/NXT 구분 여부를 화면에 표시하고, 필요성이 분명해졌을 때 증권사 API 또는 계약형 데이터 API를 붙이는 순서가 안전합니다.

진행 상태:

1. 현재 provider 실패율 기록: 완료
2. 시세 출처와 지연 여부 표시: 완료
3. 공식 일봉 provider 실험: 완료
4. NXT 계약 API adapter 골격: 완료
5. 증권사 API adapter 검토: 완료

남은 추천 순서:

6. KIS quote provider 구현(실제 키 확보 시)
7. NXT 실계약 endpoint 확보 시 운영 검증

## 후보 비교

| 후보 | 성격 | 현재가/실시간 | 일봉/과거 고가 | KRX/NXT 분리 | 로컬 무료 적합성 | 판단 |
|---|---|---|---|---|---|---|
| 현재 체인: Naver, Stooq, Alpha Vantage, Yahoo | 무료/비공식 혼합 | 가능하지만 안정성/약관 리스크 있음 | 현재 MVP에서 사용 중 | 보장 안 됨 | 높음 | MVP 유지. 실패율 기록부터 필요 |
| 공공데이터포털 금융위원회 주식시세정보 | 공공 데이터 | 포털 표기는 실시간이나 상세 안내는 일별 갱신 성격 | 특정 기준일 OHLCV 조회 가능 | KRX 기반, NXT 분리 안 됨 | 높음 | 실시간 매도 알림보다 공식 일봉 보강용 |
| KRX Open API | 거래소 공식 API | 서비스 목록은 주로 일별 매매정보 | 2010년 이후 일별 데이터 제공 | KRX 데이터 중심 | 중간 | 일봉/종목기본정보 보강 후보 |
| 한국투자증권 Open API | 증권사 API | REST와 WebSocket 방식 제공 | 국내주식/해외주식 API 문서 제공 | 문서 확인 필요 | 계좌와 키 필요 | 개인 로컬 실시간 후보 1순위 |
| 키움 REST API | 증권사 API | 시세 정보와 WebSocket 실시간 조회 가이드 제공 | 차트 정보 제공 | 문서 확인 필요 | 계좌와 신청 필요 | 개인 로컬 실시간 후보 |
| 코스콤 오픈API플랫폼 | 계약형 시세 API | 주식실시간/실시간종가 서비스 제공 | 라이선스별 서비스 | 계약 범위에 따라 가능 | 낮음 | 운영 서비스 후보. 비용/계약 필요 |
| ICE NexTrade ATS | NXT 관련 데이터 상품 | NexTrade ATS native data feed와 실시간 market data 상품 제공 | 히스토리 상품 별도 | 가능성이 가장 높음 | 낮음 | NXT 분리 시세는 계약 확인 후 진행 |
| NXT 계약 API adapter | 앱 내부 연결 골격 | 계약 endpoint 템플릿 설정 시 호출 가능 | 미지원 | endpoint가 NXT 데이터를 주면 가능 | 계약 필요 | `nxt` provider 추가 완료, 기본값에서는 스킵 |

## 세부 판단

### 1. 현재 무료 provider 체인

현재 앱의 `QUOTE_PROVIDERS` 기본값은 아래 순서입니다.

```text
naver,stooq,alphavantage,yahoo
```

이 체인은 MVP 속도와 로컬 사용성에는 좋지만, 서비스 운영 관점에서는 약관, 응답 변경, 장애 대응 리스크가 있습니다. 아직 실제 실패율 데이터가 없으므로 교체보다 진단 기능을 먼저 붙이는 것이 맞습니다.

### 2. 공공데이터포털 주식시세정보

공공데이터포털의 금융위원회 주식시세정보는 주식 가격, 시가, 고가, 저가, 거래량 등을 조회할 수 있고 무료입니다. 다만 상세 안내에 데이터가 매일 갱신되고 기준일 다음 영업일 오후 1시 이후 제공될 수 있다고 명시되어 있어, 60초 단위 매도 알림의 현재가 provider로 쓰기에는 맞지 않습니다.

적합한 용도:

- 구매일 이후 공식 일봉 고가 보강
- 과거 기준일 OHLCV 조회
- provider 실패 시 참고용 일봉 fallback

부적합한 용도:

- 장중 실시간 매도 알림
- KRX/NXT 가격 분리

구현 상태:

- `HISTORICAL_QUOTE_PROVIDERS=publicdata,naver,stooq,yahoo`로 구매일 이후 최고가 계산에 실험 적용 가능
- `DATA_GO_KR_SERVICE_KEY`가 없으면 `missing_data_go_kr_service_key`로 스킵
- `publicdata`는 현재가 provider가 아니라 일봉 전용 provider로 분리
- 단일 종목 검증 스크립트: `npm run check:publicdata-price -- 005930 2026-05-01 2026-05-15`

### 3. KRX Open API

KRX Open API는 인증키 신청과 활용 신청, 관리자 승인을 거쳐 사용하는 구조입니다. 서비스 목록 기준으로 주식 분야는 유가증권, 코스닥, 코넥스 일별 매매정보와 종목기본정보가 제공됩니다.

적합한 용도:

- 공식 일봉 매매정보
- 종목 기본정보 보강
- 무료 provider의 일봉 오류 보정

부적합한 용도:

- 장중 실시간 매도 알림
- NXT 분리 시세

### 4. 한국투자증권 Open API

한국투자증권 Open API는 REST 방식과 WebSocket 방식을 제공하며, 계좌의 App key와 App secret으로 토큰을 발급받아 API를 호출하는 구조입니다. 국내주식, 해외주식 API 문서와 샘플 코드가 제공됩니다.

적합한 용도:

- 사용자가 증권 계좌와 API 키를 보유한 로컬 실시간 조회
- 장중 현재가 조회
- 향후 자동매매가 아니라 알림 전용으로 제한한 개인 사용

주의할 점:

- 키와 계좌 정보는 절대 Git에 저장하면 안 됩니다.
- 앱스토어/플레이스토어 출시 형태라면 사용자별 인증과 약관 검토가 필요합니다.
- 호출 제한과 WebSocket 사용 조건을 실제 키로 검증해야 합니다.

### 5. 키움 REST API

키움 REST API는 API 사용신청 구조를 갖고 있으며, 시세 정보, 차트 정보, WebSocket 실시간 시세 조회 가이드를 제공합니다. 허용된 IP에서만 API 요청을 허용하는 보안 방식도 안내되어 있습니다.

적합한 용도:

- 키움 계좌 사용자의 로컬 실시간 시세 조회
- 국내 주식 차트/시세 보강

주의할 점:

- 개인 계좌와 API 신청이 필요합니다.
- IP 제한, 호출 제한, 인증 방식에 맞춘 설정 UI가 필요합니다.
- NXT 분리 시세 제공 여부는 별도 확인이 필요합니다.

### 6. 코스콤 오픈API플랫폼

코스콤 오픈API플랫폼은 주식실시간, 주식실시간종가 등 시세 서비스를 제공하지만 정보시세 라이선스 계약이 필요합니다. 개인 로컬 무료 앱에는 과하고, 향후 유료 서비스나 다중 사용자 운영으로 넘어갈 때 검토할 후보입니다.

적합한 용도:

- 운영 서비스의 안정적인 실시간 시세
- 계약 기반 데이터 사용

부적합한 용도:

- 무료 로컬 MVP
- 빠른 개인 테스트

### 7. ICE NexTrade ATS

ICE Developer Portal에는 NexTrade ATS native data feed와 ICE Consolidated Feed/History 상품이 공개되어 있습니다. NXT 분리 시세를 공식적으로 다루려면 이런 계약형 데이터 상품이 현실적인 후보입니다.

다만 현재 앱 단계에서는 비용, 계약, 데이터 재배포 약관을 확인하기 전까지 구현하지 않습니다.

구현 상태:

- `QUOTE_PROVIDERS=nxt,naver,stooq,alphavantage,yahoo`로 provider 순서에 넣을 수 있습니다.
- `NXT_QUOTE_ENDPOINT_TEMPLATE`이 없으면 `missing_nxt_quote_endpoint`로 스킵합니다.
- endpoint 템플릿의 `{symbol}`, `{code}`, `{nxtSymbol}`은 한국 종목코드로 치환합니다.
- API 키가 필요하면 `NXT_API_KEY`, `NXT_API_KEY_HEADER`, `NXT_API_KEY_SCHEME`으로 헤더를 설정합니다.
- 공식 화면 scraping은 구현하지 않습니다.

## provider 메타데이터 설계 후보

다음 개발에서 시세 출처 표시를 할 때 아래 값을 price result에 포함하는 방향이 좋습니다.

```js
{
  provider: 'naver',
  providerLabel: 'Naver Finance',
  venue: 'unknown', // krx, nxt, integrated, unknown
  dataDelay: 'unknown', // realtime, delayed, eod, unknown
  licenseType: 'unofficial', // unofficial, public, broker, contract
  checkedAt: '2026-05-14T09:00:00.000Z'
}
```

이렇게 해두면 나중에 KRX, NXT, 증권사, 계약형 provider가 섞여도 사용자가 어떤 가격을 보고 있는지 알 수 있습니다.

## 증권사 API adapter 검토 결과

한국투자증권 Open API와 키움 REST API는 개인 로컬 환경에서 현재가 조회용 후보로 유지합니다. 다만 이번 앱은 알림 앱이므로 주문 기능은 제외합니다. 이를 위해 `npm run check:broker-api` 점검 CLI를 추가했고, `BROKER_TRADING_ENABLED=true`이면 실패하도록 했습니다.

기본 설정은 아래와 같습니다.

```text
BROKER_QUOTE_PROVIDER=none
BROKER_TRADING_ENABLED=false
```

`BROKER_QUOTE_PROVIDER=none`이면 현재 무료 provider 체인을 그대로 사용합니다. 실제 증권사 시세 호출은 한국투자증권 또는 키움 API 키, 시크릿, 접근 토큰을 확보한 뒤 별도 provider 구현으로 진행합니다.

상세 내용은 [증권사 API adapter 검토](broker-api-adapter-review.md)에 정리했습니다.

## 다음 개발로 넘길 항목

현재 provider 실패율 기록, 시세 출처 표시, 공식 일봉 provider 실험, NXT 계약 API adapter 골격, 증권사 API adapter 검토는 완료했습니다. 다음 구현 후보는 `KIS quote provider 구현(실제 키 확보 시)`입니다.

KIS quote provider를 진행할 때 먼저 저장할 값:

- provider 이름
- 요청 종목코드
- 성공/실패 여부
- 실패 사유
- 응답 시간
- 마지막 성공 시각
- provider별 누적 성공/실패 횟수
- 접근 토큰 만료/재발급 필요 여부

## 참고 링크

- [공공데이터포털 금융위원회 주식시세정보](https://www.data.go.kr/en/data/15094808/openapi.do)
- [KRX Open API 서비스 이용방법](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO003.jsp)
- [KRX Open API 서비스 목록](https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd)
- [한국투자증권 Open API 개발자센터](https://apiportal.koreainvestment.com/)
- [한국투자증권 Open API 공식 GitHub 샘플](https://github.com/koreainvestment/open-trading-api)
- [키움 REST API](https://openapi.kiwoom.com/main)
- [키움 REST API 가이드](https://openapi.kiwoom.com/guide/apiguide)
- [코스콤 오픈API플랫폼 API 서비스](https://koscom.gitbook.io/open-api/api)
- [ICE NexTrade ATS](https://developer.ice.com/fixed-income-data-services/catalog/nextrade-ats)
- [NXT 시세 API 검토](nxt-market-data-review.md)
- [증권사 API adapter 검토](broker-api-adapter-review.md)
