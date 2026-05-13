# NXT 시세 API 검토

날짜 기준: 2026-05-13

## 결론

현재 Stock Alarm MVP에는 NXT 전용 시세 provider를 바로 추가하지 않습니다.

검토 결과 NXT 공식 웹사이트에는 시장 개요와 거래현황 화면이 있지만, 로컬 앱에서 안정적으로 호출할 수 있는 공개 REST API 문서는 확인하지 못했습니다. 화면 데이터를 긁어서 provider를 만드는 방식은 약관, 구조 변경, 장애 대응 리스크가 커서 지금 단계의 알림 앱에는 적합하지 않습니다.

따라서 현재 한국 주식 시세는 기존처럼 Naver provider를 사용하고, 화면과 문서에는 이 시세가 NXT 분리 시세가 아니라는 점을 명확히 표시하는 방향으로 갑니다. NXT 가격을 분리해서 쓰려면 공식 또는 계약 기반 시세 API가 확인된 뒤에 provider를 추가합니다.

## 현재 앱의 시세 구조

현재 provider 순서는 아래와 같습니다.

```text
naver,stooq,alphavantage,yahoo
```

- 한국 종목 현재가: Naver Finance 비공식 조회 경로
- 한국 종목 일봉: Naver 일봉 차트
- 미국 종목 현재가: Stooq, Alpha Vantage, Yahoo fallback
- 최고가 기준: 구매일 이후 일봉 고가와 매수가 중 큰 값

주의할 점은 `naver` provider가 앱 내부 provider 이름일 뿐, 공식 KRX API 또는 공식 NXT API가 아니라는 점입니다. 네이버페이 증권 화면에는 KRX와 NXT 시세가 함께 표시되는 것으로 알려져 있지만, 현재 앱이 사용하는 조회 경로가 거래소별 시세를 안정적으로 분리해 제공한다고 보기는 어렵습니다.

## 확인한 공식/준공식 경로

### NXT 공식 웹사이트

NXT 공식 사이트는 NXT가 한국거래소와 함께 운영되는 주식 거래 장소이며, 오전 8시부터 오후 8시까지 확장 거래시간을 제공한다고 설명합니다.

공식 사이트에는 아래 정보가 있습니다.

- 시장 개요
- 거래 활동
- 일별 거래현황
- 거래 대상 종목
- 시장 구조와 주문 유형

하지만 API 인증, endpoint, 응답 스키마, rate limit, 라이선스 조건이 정리된 공개 개발자 문서는 찾지 못했습니다.

### KRX Open API

KRX Open API는 인증키 신청, API 활용 신청, 관리자 승인 뒤 사용하는 흐름이 문서화되어 있습니다. 서비스 목록에는 주식 일별매매정보, 종목기본정보 등이 포함되어 있습니다.

다만 이 경로는 KRX 데이터 중심입니다. NXT 거래소별 현재가 분리 조회를 해결하는 경로로 확정할 수는 없습니다.

### 코스콤 Open API

코스콤 Open API는 주식 실시간 시세류 API를 제공합니다. 문서상 시세 서비스는 라이선스 계약이 필요하다고 안내되어 있습니다.

운영 서비스로 확장할 때 가장 현실적인 공식 후보 중 하나지만, 무료 로컬 MVP에 바로 넣기는 어렵습니다. 비용, 라이선스, 개인 사용 가능 여부를 별도 확인해야 합니다.

### ICE Developer Portal

ICE Developer Portal에는 NexTrade ATS 데이터 상품이 올라와 있습니다. NXT 관련 스트리밍 및 히스토리 데이터가 데이터 상품 형태로 제공되는 것으로 보입니다.

이 역시 개인 무료 API라기보다 계약형 데이터 상품에 가까워 보이므로, 앱에 바로 붙일 수 있는 무료 provider로 판단하지 않습니다.

## 구현 판단

| 항목 | 판단 |
|---|---|
| NXT 공식 공개 REST API | 확인 못함 |
| NXT 공식 웹 화면 scraping | 구현하지 않음 |
| 네이버 화면 기반 NXT 분리 시세 | 안정 API 확인 전 보류 |
| KRX Open API | 일별/기본정보 후보, 인증과 승인 필요 |
| 코스콤 Open API | 실시간 시세 후보, 라이선스 계약 필요 |
| ICE 데이터 상품 | 유료/계약형 후보로 분류 |

## 앱에 반영할 방향

단기 작업:

- README에 현재 한국 시세는 Naver provider 기준이라고 명시합니다.
- NXT 분리 시세는 아직 공식 provider가 없으므로 구현 보류로 표시합니다.
- 다음 개발건을 공식 또는 유료 시세 API 후보 비교로 넘깁니다.

후속 개발 후보:

- provider별 실패율 기록
- 시세 출처 라벨 개선
- `provider`와 `venue`를 분리하는 데이터 구조 설계
- KRX, NXT, 통합 시세를 분리 제공하는 공식 API 확인 시 provider 추가

추천 데이터 구조:

```js
{
  provider: 'naver',
  providerLabel: 'Naver Finance',
  venue: 'unknown',
  delayed: null,
  regularMarketTime: null
}
```

`provider`는 데이터를 가져온 기술적 출처이고, `venue`는 실제 가격이 어느 시장 기준인지 나타냅니다. 현재는 venue를 확정할 수 없으므로 `unknown`으로 보는 것이 안전합니다.

## 참고 자료

- NXT 공식 시장 개요: https://www.nextrade.co.kr/en/marketOverview/content.do
- NXT 공식 거래 활동 화면: https://www.nextrade.co.kr/menu/en/transactionStatusMain/menuList.do
- KRX Open API 이용방법: https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO003.jsp
- KRX Open API 서비스 목록: https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd
- 코스콤 Open API 서비스: https://koscom.gitbook.io/open-api/api
- ICE NexTrade ATS 데이터 상품: https://developer.ice.com/fixed-income-data-services/catalog/nextrade-ats
