# Stock Alarm

Stock Alarm은 매수한 종목의 가격을 주기적으로 확인하고, 사용자가 정한 매도 기준에 도달하면 텔레그램과 모바일 푸시로 반복 알림을 보내는 MVP입니다.

현재 단계는 **로컬 웹앱 + 텔레그램 봇 + 모바일 앱 기반 MVP**입니다. 당장은 사용자가 자신의 PC에서 실행하는 방식을 기준으로 개발하고, 이후 App Store와 Play Store 앱으로 확장할 수 있도록 모바일 API와 푸시 알림 기초를 함께 준비하고 있습니다.

## 빠른 시작

처음 받은 개발자는 아래 순서대로 진행하면 됩니다.

필수 준비물:

- Node.js 20 이상
- Git
- 텔레그램 계정
- BotFather로 만든 텔레그램 봇

버전 확인:

```powershell
node -v
git --version
```

프로젝트 받기:

```powershell
git clone https://github.com/Jooyoungjay/stock_alarm.git
cd stock_alarm
Copy-Item .env.example .env
```

이미 프로젝트 폴더가 있다면:

```powershell
cd "C:\My Web Sites\stock_alarm"
```

환경변수 파일 열기:

```powershell
notepad .env
```

최소 필수 값:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

가장 쉬운 실행:

```text
start-local.bat
```

실행 상태 확인:

```text
status-local.bat
```

브라우저에서 접속:

```text
http://127.0.0.1:3000
```

가장 쉬운 종료:

```text
stop-local.bat
```

이 프로젝트는 현재 외부 npm 패키지를 사용하지 않습니다. `npm install` 없이 바로 실행할 수 있습니다.

## 현재 구현된 기능

- 웹 대시보드에서 팝업형 종목 등록, 편집, 알림 켜기/끄기, 삭제
- 종목명/종목코드 자동완성, 우선주/등록 종목 표시
- 종목별 매수 이유, 투자 목표가, 매도 조건, 실적 체크일 카드 표시
- 매수일 입력 시 매수일 이후 최고가 자동 계산
- 매수일 미입력 시 등록 이후 감시 최고가 기준 계산
- 이후 새 최고가 자동 추적
- 알림 기준 4종 지원, 추천 기준/빠른 추천값/기준별 예상 결과 비교
- 기준가 이하 진입, 반복 알림, 회복 상태 추적
- 텔레그램 알림 전송
- 텔레그램 명령어로 종목 관리
- 알림 기준까지 남은 거리 기준 위험도 순위와 일일 브리핑 알림
- 보유 수량 기반 평가금액, 평가손익, 수익률 표시
- 주당 연 배당금 기반 예상 연 배당금, 배당수익률 표시
- 종목 카드, 포트폴리오 요약, 일일 브리핑에서 예상 배당 포함 손익과 수익률 표시
- 배당 주기와 지급월 기반 월별 예상 배당 현금흐름 표시
- 공공데이터포털, OpenDART, Alpha Vantage, Yahoo provider 체인 기반 배당 데이터 보조 갱신
- 배당 provider별 성공/실패 진단 화면과 마지막 갱신 로그
- 텔레그램 `/dividend-status` 명령으로 배당 provider 진단 상태 확인
- 시세 provider별 성공/실패율, 스킵 사유, 평균 응답 시간 진단 화면
- 시세/배당 조회 실패 종목의 실패 사유 패널, 종목별 재시도 버튼, 결과 메시지
- 종목 카드와 기준 미리 확인에서 시세 출처, 데이터 성격, 시장 구분, 시세 시각 표시
- 종목별 KIS 시장 기준 선택: 서버 기본값, KRX, NXT, 통합
- 공공데이터포털 주식시세정보 기반 공식 일봉 provider 실험 옵션
- 배당락일, 지급일, 최근 1주 배당금, 배당 변경 내역 표시
- 배당 변경 이력 기반 종목별/포트폴리오 배당 성장률 표시
- 향후 6개월 배당 캘린더, 확정/예상/배당락 필터, 월별 합계 표시
- 배당락일과 지급일 기준 텔레그램/모바일 푸시 알림
- 이익금 반납률 기준을 이해할 수 있도록 최대 수익금과 반납 금액 표시
- 포트폴리오 요약에서 계좌 총 최대 수익금, 총 반납 금액, 총 반납률 표시
- 종목 카드에서 추가매수 후 새 평단가, 손익분기점, 필요 매수금액, 알림 기준 변화 계산
- 사용자 첫 화면을 포트폴리오와 감시 종목 중심의 `내 계좌 상황`으로 구성
- 개발 WBS와 다음 개발 순서를 웹 대시보드에서 표시, WBS 상태를 예정/진행중/완료/보류로 표준화
- 사용자 화면(`/`)과 관리자 화면(`/admin`) 라우팅 분리
- 사용자 화면에서는 관리자 링크를 기본 노출하지 않고 `/admin` 직접 진입으로 정리
- 웹 대시보드와 텔레그램 명령어 기반 백업/복구/삭제
- 서버 시작과 종목 변경 시 자동 백업
- 브라우저에서 앱처럼 실행할 수 있는 PWA 기본 설정
- 같은 Wi-Fi 휴대폰 접속용 주소와 QR 코드 표시
- 계정 없는 모바일 앱용 익명 기기 API 기초
- 기기별 종목 격리와 푸시 토큰 저장, 가격 알림 발생 시 모바일 푸시 전송
- Expo SDK 55 기반 모바일 앱 초기 프로젝트와 서버 연결 화면
- 모바일 앱 내 종목 등록, 편집, 알림 ON/OFF, 삭제, 푸시 토큰 등록과 테스트
- 앱스토어/플레이스토어 심사용 개인정보 처리방침 초안, 스토어 메타데이터, 제출 체크리스트, 스크린샷 제작 가이드
- 로컬 JSON 파일 기반 데이터 저장, 스키마 버전, 데이터 모델 요약 API
- PostgresStore JSONB 쿼리 어댑터와 저장소 계약 검증
- JSON -> Postgres dry-run 마이그레이션 검증 스크립트
- 실제 Postgres 연결용 통합 테스트 데이터셋
- 저장소별 백업 스냅샷 export/import 계약 검증
- Postgres 연결 리허설 CLI
- 안전한 로컬 서버 종료 스크립트

지원하는 알림 기준:

- `최고가 대비 하락률`: 매수일 이후 최고가 또는 감시 최고가에서 몇 % 하락하면 알림
- `이익금 반납률`: 평단가 대비 최고 이익금 중 몇 %를 반납하면 알림
- `매수가 대비 손절률`: 매수가에서 몇 % 하락하면 알림
- `직접 기준가`: 사용자가 입력한 가격 이하가 되면 알림

## 추가매수 계산기

매수가와 보유 수량이 있는 종목 카드에는 `추가매수 계산기`가 표시됩니다.

입력값:

- `추가 매수가`: 추가로 살 가격. 기본값은 현재가입니다.
- `추가 수량`: 추가로 살 수량입니다.
- `목표 평단가`: 선택 입력입니다. 원하는 평단가까지 필요한 추가 수량과 금액을 계산합니다.

계산 결과:

- 추가 매수금액
- 새 평단가와 기존 평단가 대비 변화
- 새 보유 수량
- 손익분기점
- 현재가 기준 손익 변화
- 이익금 반납률/손절률 기준을 쓰는 경우 알림 기준가 변화
- 목표 평단가를 입력한 경우 필요한 추가 수량과 추가 금액

`보유 정보 반영`을 누르면 확인창이 뜨고, 확인 후 종목의 매수가와 보유 수량을 새 평단가와 새 수량으로 업데이트합니다. 실제 추가매수를 완료한 뒤에만 반영하세요.

## 프로젝트 구조

```text
stock_alarm/
├─ public/                  # 로컬 웹앱 HTML/CSS/JS/PWA 파일
│  ├─ index.html
│  ├─ app.js
│  ├─ averagingCalculator.js
│  ├─ styles.css
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  └─ icons/
├─ mobile/                  # Expo 모바일 앱 초기 프로젝트
│  ├─ App.js
│  ├─ app.json
│  ├─ package.json
│  ├─ store-listing.ko.json
│  ├─ assets/
│  └─ src/
│     ├─ api.js
│     ├─ deviceStorage.js
│     ├─ pushNotifications.js
│     ├─ stockForm.js
│     └─ format.js
├─ src/
│  ├─ server.js             # HTTP 서버와 API
│  ├─ alertEngine.js        # 알림 기준 계산, 상태 추적, 알림 전송 흐름
│  ├─ pushNotifications.js  # Expo Push 전송
│  ├─ priceProvider.js      # Naver/Stooq/Alpha Vantage/Yahoo 시세 조회
│  ├─ dividendCalendar.js   # 향후 배당 지급월/지급일 캘린더 생성
│  ├─ dividendEventAlerts.js # 배당락일/지급일 전후 알림
│  ├─ dividendGrowth.js     # 배당 변경 이력 기반 성장률 계산
│  ├─ dividendProvider.js   # 배당 provider 조회와 응답 파싱
│  ├─ dividendRefresh.js    # 배당 데이터 자동/수동 갱신
│  ├─ dataModel.js          # 저장 데이터 모델과 스키마 버전
│  ├─ storage.js            # 로컬 JSON 저장소
│  ├─ postgresStore.js      # Postgres JSONB 저장소 쿼리 어댑터
│  ├─ postgresMigrationDryRun.js # JSON -> Postgres dry-run 변환/검증
│  ├─ storageContract.js    # 저장소 공통 계약
│  ├─ storageFactory.js     # 저장소 엔진 선택
│  ├─ telegram.js           # 텔레그램 API 호출
│  ├─ telegramCommands.js   # 텔레그램 명령어 처리
│  ├─ backups.js            # 데이터 백업/복구/삭제
│  ├─ accessUrls.js         # 로컬/휴대폰 접속 주소 계산
│  ├─ qrCode.js             # 접속 주소 QR 코드 생성
│  ├─ roadmap.js            # 개발 WBS 문서 파싱과 API 응답 생성
│  ├─ runtimeInfo.js        # 실행 중 서버 식별 정보
│  └─ symbols.js            # 종목 검색/정규화
├─ scripts/
│  ├─ local-server.js       # 로컬 서버 시작/상태 확인 스크립트
│  ├─ stop-server.js        # 안전 종료 스크립트
│  ├─ check-demo-server.js  # 앱 심사용 HTTPS 데모 서버 준비 점검
│  ├─ check-publicdata-price.js # 공공데이터포털 일봉 provider 실험
│  ├─ json-to-postgres-dry-run.js # JSON -> Postgres dry-run CLI
│  ├─ postgres-connection-rehearsal.js # Postgres 연결 리허설 CLI
│  └─ check-railway-config.js
├─ docs/
│  ├─ development-roadmap.md       # 개발 WBS와 다음 작업 순서
│  ├─ json-to-db-migration.md      # JSON -> DB 이전 전략
│  ├─ user-admin-page-split.md     # 사용자/관리자 화면 분리 전략
│  ├─ market-data-api-candidates.md # 공식/유료 시세 API 후보 검토
│  ├─ nxt-market-data-review.md    # NXT 시세 API 검토
│  ├─ broker-api-adapter-review.md # 증권사 API adapter 검토
│  ├─ app-store-review-prep.md     # 앱 심사 준비 체크리스트
│  ├─ https-demo-server.md         # HTTPS 데모 서버 준비와 점검 절차
│  ├─ store-screenshots.md         # 스토어 스크린샷 화면/문구/대체 텍스트 가이드
│  ├─ store-submission-assets.md   # 스토어 제출 자산 최종 점검
│  ├─ privacy-policy-ko.md         # 개인정보 처리방침 초안
│  └─ railway-deploy.md            # Railway 배포 가이드
├─ tests/                   # Node.js 테스트
│  ├─ helpers/storageSnapshotContract.js # 저장소별 백업 스냅샷 계약 검증 헬퍼
│  └─ fixtures/postgres-migration/ # DB 이전 검증용 표준 스냅샷과 기대 결과
├─ data/                    # 로컬 실행 데이터, Git 제외
│  ├─ store.json            # 실제 앱 데이터
│  ├─ server.json           # 실행 중 서버 PID/포트 정보
│  └─ backups/              # 자동/수동 백업 파일
├─ .env.example             # 로컬 환경변수 예시
├─ .env.railway.example     # Railway 환경변수 예시
├─ railway.json             # Railway Config as Code
├─ start-local.bat          # PC 전용 로컬 서버 시작
├─ start-phone.bat          # 같은 Wi-Fi 휴대폰 테스트용 서버 시작
├─ status-local.bat         # 실행 상태와 접속 주소 확인
├─ stop-local.bat           # 안전 종료
├─ package.json
└─ README.md
```

## 환경 설정

로컬 개발은 `.env.example`을 복사한 `.env` 파일을 사용합니다.

```powershell
Copy-Item .env.example .env
notepad .env
```

전체 설정 예시:

```text
HOST=127.0.0.1
PORT=3000
DATA_DIR=
POLL_INTERVAL_SECONDS=60
TELEGRAM_COMMAND_POLL_SECONDS=5
DIVIDEND_REFRESH_INTERVAL_SECONDS=86400
DAILY_BRIEFING_ENABLED=true
DAILY_BRIEFING_TIME=16:10
DAILY_BRIEFING_CHECK_INTERVAL_SECONDS=60
DAILY_BRIEFING_WARNING_DISTANCE_PERCENT=5
DAILY_BRIEFING_TOP_LIMIT=5
DIVIDEND_EVENT_ALERT_ENABLED=true
DIVIDEND_EVENT_ALERT_CHECK_INTERVAL_SECONDS=3600
DIVIDEND_EVENT_ALERT_EX_DATE_OFFSETS=3,1,0,-1
DIVIDEND_EVENT_ALERT_PAYMENT_DATE_OFFSETS=1,0
BACKUP_RETENTION=30
DEFAULT_ALERT_COOLDOWN_MINUTES=30
QUOTE_TIMEOUT_MS=10000
QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
HISTORICAL_QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
DIVIDEND_PROVIDERS=publicdata,opendart,alphavantage,yahoo
STORAGE_ENGINE=json
DATABASE_URL=
ADMIN_TOKEN=
DATA_GO_KR_SERVICE_KEY=
OPENDART_API_KEY=
ALPHA_VANTAGE_API_KEY=
NXT_QUOTE_ENDPOINT_TEMPLATE=
NXT_API_KEY=
NXT_API_KEY_HEADER=Authorization
NXT_API_KEY_SCHEME=Bearer
BROKER_QUOTE_PROVIDER=none
BROKER_TRADING_ENABLED=false
KIS_API_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCESS_TOKEN=
KIS_ACCOUNT_NUMBER=
KIS_MARKET_DIV_CODE=J
KIS_CUST_TYPE=P
KIS_TOKEN_AUTO_REFRESH=true
KIS_TOKEN_CACHE_PATH=
KIS_SMOKE_SYMBOL=336260
KIWOOM_API_BASE_URL=https://api.kiwoom.com
KIWOOM_APP_KEY=
KIWOOM_SECRET_KEY=
KIWOOM_ACCESS_TOKEN=
KIWOOM_ACCOUNT_NUMBER=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MOBILE_PUSH_ENABLED=true
EXPO_PUSH_ENDPOINT=https://exp.host/--/api/v2/push/send
```

주요 환경변수:

| 이름 | 기본값 | 설명 |
|---|---:|---|
| `HOST` | `127.0.0.1` | 로컬 PC만 접속하려면 기본값 사용. 휴대폰 테스트는 `0.0.0.0` 사용 |
| `PORT` | `3000` | 서버 포트. 사용 중이면 로컬 시작 스크립트가 다음 포트를 찾음 |
| `DATA_DIR` | `data` | 데이터 저장 폴더. 비우면 프로젝트의 `data/` 사용 |
| `STORAGE_ENGINE` | `json` | 저장소 엔진. 기본 실행은 `json`; `postgres` 쿼리 어댑터는 구현됐지만 일반 서버 전환은 아직 보호 차단 |
| `DATABASE_URL` | 빈 값 | Postgres 저장소용 연결 문자열. 테스트에서는 fake client를 쓰고, 실제 연결은 `pg` 설치 후 사용 |
| `ADMIN_TOKEN` | 빈 값 | `/admin` 화면과 운영 API 보호용 토큰. 비우면 관리자 보호가 꺼짐 |
| `REVIEW_DEMO_URL` | 빈 값 | 앱 심사용 공개 HTTPS 데모 서버 URL |
| `PRIVACY_POLICY_URL` | 빈 값 | 앱 심사용 공개 HTTPS 개인정보 처리방침 URL |
| `SUPPORT_URL` | 빈 값 | 앱 심사용 공개 HTTPS 지원/문의 URL |
| `REVIEW_NOTES_URL` | 빈 값 | 선택. 리뷰어 안내 문서 URL |
| `STORE_SCREENSHOT_DIR` | `mobile/store-assets/screenshots` | 스토어 제출용 실제 스크린샷 PNG/JPEG 폴더 |
| `POLL_INTERVAL_SECONDS` | `60` | 시세 자동 확인 주기 |
| `TELEGRAM_COMMAND_POLL_SECONDS` | `5` | 텔레그램 명령어 확인 주기 |
| `DIVIDEND_REFRESH_INTERVAL_SECONDS` | `86400` | 배당 데이터 자동 보조 갱신 주기. 기본값은 하루 1회 |
| `DAILY_BRIEFING_ENABLED` | `true` | 텔레그램 일일 브리핑 자동 전송 여부 |
| `DAILY_BRIEFING_TIME` | `16:10` | 일일 브리핑 전송 기준 시각. 로컬 PC 시간 기준 |
| `DAILY_BRIEFING_CHECK_INTERVAL_SECONDS` | `60` | 브리핑 전송 여부를 확인하는 주기 |
| `DAILY_BRIEFING_WARNING_DISTANCE_PERCENT` | `5` | 알림 기준가까지 남은 거리가 이 값 이하이면 주의로 분류 |
| `DAILY_BRIEFING_TOP_LIMIT` | `5` | 브리핑에 표시할 위험도 상위 종목 수 |
| `DIVIDEND_EVENT_ALERT_ENABLED` | `true` | 배당락일/지급일 전후 알림 사용 여부 |
| `DIVIDEND_EVENT_ALERT_CHECK_INTERVAL_SECONDS` | `3600` | 배당 일정 알림 확인 주기 |
| `DIVIDEND_EVENT_ALERT_EX_DATE_OFFSETS` | `3,1,0,-1` | 배당락일 기준 알림 날짜. 3은 3일 전, 0은 당일, -1은 1일 후 |
| `DIVIDEND_EVENT_ALERT_PAYMENT_DATE_OFFSETS` | `1,0` | 지급일 기준 알림 날짜. 1은 1일 전, 0은 당일 |
| `BACKUP_RETENTION` | `30` | 보관할 백업 개수 |
| `DEFAULT_ALERT_COOLDOWN_MINUTES` | `30` | 반복 알림 기본 간격 |
| `QUOTE_TIMEOUT_MS` | `10000` | provider 조회 타임아웃 |
| `QUOTE_PROVIDERS` | `naver,stooq,alphavantage,yahoo` | 시세 provider 순서 |
| `HISTORICAL_QUOTE_PROVIDERS` | `QUOTE_PROVIDERS` 값 | 구매일 이후 최고가 계산용 일봉 provider 순서 |
| `DIVIDEND_PROVIDERS` | `publicdata,opendart,alphavantage,yahoo` | 배당 provider 순서 |
| `DATA_GO_KR_SERVICE_KEY` | 빈 값 | 공공데이터포털 주식시세정보/주식배당정보 API 키 |
| `OPENDART_API_KEY` | 빈 값 | OpenDART API 키 |
| `ALPHA_VANTAGE_API_KEY` | 빈 값 | Alpha Vantage API 키 |
| `NXT_QUOTE_ENDPOINT_TEMPLATE` | 빈 값 | 선택. `QUOTE_PROVIDERS`에 `nxt`를 넣을 때 쓰는 공식/계약 API endpoint 템플릿. 예: `https://example.com/quotes/{symbol}` |
| `NXT_API_KEY` | 빈 값 | 선택. NXT 계약 API 인증 키 |
| `NXT_API_KEY_HEADER` | `Authorization` | 선택. NXT API 키를 보낼 헤더 이름 |
| `NXT_API_KEY_SCHEME` | `Bearer` | 선택. `Authorization` 헤더 사용 시 키 앞에 붙일 scheme |
| `BROKER_QUOTE_PROVIDER` | `none` | 선택. 증권사 API adapter 점검 대상. `none`, `kis`, `kiwoom` 중 하나 |
| `BROKER_TRADING_ENABLED` | `false` | 주문 기능 사용 여부. 이 앱은 알림 전용이므로 `false`만 허용 |
| `KIS_API_BASE_URL` | `https://openapi.koreainvestment.com:9443` | 한국투자증권 Open API URL |
| `KIS_APP_KEY` | 빈 값 | 한국투자증권 앱 키 |
| `KIS_APP_SECRET` | 빈 값 | 한국투자증권 앱 시크릿 |
| `KIS_ACCESS_TOKEN` | 빈 값 | 한국투자증권 접근 토큰 |
| `KIS_ACCOUNT_NUMBER` | 빈 값 | 선택. 향후 계좌 기반 기능 점검용 |
| `KIS_MARKET_DIV_CODE` | `J` | 한국투자증권 현재가 시장 구분 기본값. 종목별 설정이 비어 있으면 이 값을 사용. `J` KRX, `NX` NXT, `UN` 통합 |
| `KIS_CUST_TYPE` | `P` | 한국투자증권 고객 구분. 기본값 `P` 개인 |
| `KIS_TOKEN_AUTO_REFRESH` | `true` | `KIS_ACCESS_TOKEN`이 없거나 캐시가 만료되면 앱 키/시크릿으로 접근 토큰 자동 발급 |
| `KIS_TOKEN_CACHE_PATH` | `data/kis-token.json` | 선택. KIS 접근 토큰 캐시 파일 경로. 기본 경로는 Git 제외 |
| `KIS_SMOKE_SYMBOL` | `336260` | 선택. `npm run check:kis-quote` 기본 점검 종목 |
| `KIWOOM_API_BASE_URL` | `https://api.kiwoom.com` | 키움 REST API URL |
| `KIWOOM_APP_KEY` | 빈 값 | 키움 앱 키 |
| `KIWOOM_SECRET_KEY` | 빈 값 | 키움 시크릿 키 |
| `KIWOOM_ACCESS_TOKEN` | 빈 값 | 키움 접근 토큰 |
| `KIWOOM_ACCOUNT_NUMBER` | 빈 값 | 선택. 향후 계좌 기반 기능 점검용 |
| `TELEGRAM_BOT_TOKEN` | 빈 값 | 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 빈 값 | 알림을 받을 텔레그램 채팅 ID |
| `MOBILE_PUSH_ENABLED` | `true` | 모바일 Expo Push 전송 여부 |
| `EXPO_PUSH_ENDPOINT` | Expo 기본 endpoint | Expo Push API endpoint. 일반 로컬 실행은 기본값 유지 |

주의:

- `.env`는 GitHub에 올리면 안 됩니다.
- 봇 토큰과 API 키는 비밀번호처럼 취급하세요.
- 환경변수를 바꾼 뒤에는 서버를 재시작해야 반영됩니다.

## 텔레그램 봇 설정

1. 텔레그램에서 `BotFather`를 엽니다.
2. `/newbot`으로 봇을 생성합니다.
3. 발급된 봇 토큰을 `.env`의 `TELEGRAM_BOT_TOKEN`에 넣습니다.
4. 만든 봇에게 `/start` 메시지를 보냅니다.
5. 브라우저에서 아래 주소를 엽니다.

```text
https://api.telegram.org/bot<봇토큰>/getUpdates
```

예시:

```text
https://api.telegram.org/bot123456:ABCDEF/getUpdates
```

6. 응답 JSON에서 `message.chat.id` 값을 찾습니다.
7. 그 값을 `.env`의 `TELEGRAM_CHAT_ID`에 넣습니다.
8. 서버를 재시작합니다.

서버는 `.env`에 저장된 `TELEGRAM_CHAT_ID`의 채팅만 명령어로 처리합니다.

## 서버 실행과 종료

### 더블클릭 실행

PC에서만 사용할 때:

```text
start-local.bat
```

같은 Wi-Fi의 휴대폰에서 테스트할 때:

```text
start-phone.bat
```

실행 상태와 접속 주소 확인:

```text
status-local.bat
```

안전 종료:

```text
stop-local.bat
```

### 명령어 실행

로컬 PC 전용 실행:

```powershell
node scripts/local-server.js start
```

휴대폰 접속 허용 실행:

```powershell
node scripts/local-server.js start-lan
```

상태 확인:

```powershell
node scripts/local-server.js status
```

npm 스크립트:

```powershell
npm start
npm run dev
npm run stop
npm run local:start
npm run local:phone
npm run local:status
npm run migrate:postgres:dry-run
npm run mobile:install
npm run mobile:start
npm run check:store-assets
npm run check:broker-api
npm run check:kis-quote
npm run kis:token
```

가장 단순한 실행:

```powershell
node src/server.js
```

터미널에서 직접 실행 중인 서버는 `Ctrl + C`로 종료할 수 있습니다.

### 포트와 접속 주소

기본 주소:

```text
http://127.0.0.1:3000
```

3000 포트가 이미 사용 중이면 로컬 시작 스크립트가 3001, 3002처럼 다음 포트를 찾습니다. 반드시 터미널 로그나 `status-local.bat`에 표시된 주소로 접속하세요.

실행 로그 예시:

```text
Stock Alarm is running at http://127.0.0.1:3000
Runtime info: C:\My Web Sites\stock_alarm\data\server.json
Polling every 60 seconds
```

### 안전 종료 방식

`stop-local.bat`, `npm run stop`, `node scripts/stop-server.js`는 `data/server.json`과 서버의 `/api/health` 응답을 비교해서 아래 값이 모두 맞을 때만 종료합니다.

- 앱 이름: `stock_alarm`
- PID
- 포트
- 서버 시작 시각
- 프로젝트 경로

즉, 회사 PC에서 다른 서비스가 같은 포트나 Node 프로세스를 사용 중이어도 Stock Alarm으로 확인되지 않으면 종료하지 않습니다.

수동 확인이 필요한 경우:

```powershell
netstat -ano | Select-String -Pattern ':3000'
netstat -ano | Select-String -Pattern ':3001'
Get-Process node
```

PID만 보고 강제 종료하는 명령은 마지막 수단입니다.

```powershell
Stop-Process -Id <PID> -Force
```

## 휴대폰에서 로컬 웹앱 테스트

같은 Wi-Fi에 있는 휴대폰에서 테스트하려면 `start-phone.bat`을 사용합니다.

이 모드는 서버를 `HOST=0.0.0.0`으로 실행해서 같은 네트워크의 휴대폰 접속을 허용합니다. Windows 방화벽이 Node.js 접근 허용을 물어보면 개발 테스트를 위해 허용해야 합니다.

직접 설정하려면 `.env`를 아래처럼 바꿉니다.

```text
HOST=0.0.0.0
PORT=3000
```

PC의 내부 IP 확인:

```powershell
ipconfig
```

휴대폰 브라우저에서 접속:

```text
http://<PC의 IPv4 주소>:3000
```

예시:

```text
http://192.168.0.15:3000
```

웹앱의 `서버 상태` 영역에서 휴대폰 접속 주소와 QR 코드도 확인할 수 있습니다.

주의:

- 휴대폰과 PC가 같은 Wi-Fi에 있어야 합니다.
- 로컬 네트워크 접속은 개발용으로만 사용하세요.
- 휴대폰 홈 화면 설치까지 완전하게 테스트하려면 HTTPS가 필요할 수 있습니다. 배포 전에는 브라우저 접속 테스트를 우선합니다.

## 웹 대시보드 사용법

사용자 화면 주소:

- PC: `http://127.0.0.1:3000/`
- 휴대폰: 서버 상태에 표시되는 같은 Wi-Fi 접속 주소 사용

사용자 화면에서 할 수 있는 일:

- `종목 등록` 버튼으로 한 화면 팝업 등록
- 기준 미리 확인
- 종목별 KIS 시장 기준 선택
- 감시 종목 조회
- 수동 가격 테스트
- 시세/배당 실패 종목 재시도
- 알림 기준 편집
- 종목별 알림 켜기/끄기 토글
- 최고가 재계산
- 종목 삭제
- 알림 기록 확인
- 배당 캘린더 확인: 전체/확정/예상/배당락 일정 필터와 월별 합계

관리자 화면 주소:

- PC: `http://127.0.0.1:3000/admin`
- 사용자 화면 헤더에는 관리자 링크를 기본 노출하지 않습니다. 관리자 기능은 `/admin` 주소로 직접 접속합니다.

관리자 화면에서 할 수 있는 일:

- 서버 상태 확인
- 접속 주소와 QR 코드 확인
- 시세 provider 진단 확인
- KIS 현재가 점검 실행: 종목코드와 KRX/NXT/통합 시장을 선택해 한국투자증권 Open API 현재가와 토큰 상태 확인
- 배당 provider 진단 확인
- 개발 로드맵과 다음 개발 순서 확인
- 배당 새로고침
- 데이터 백업 생성
- 백업 목록 확인
- 선택한 백업으로 복구
- 선택한 백업 삭제

관리자 보호:

- `.env`의 `ADMIN_TOKEN`이 비어 있으면 관리자 화면은 보호 없이 열립니다.
- `ADMIN_TOKEN`을 설정하고 서버를 재시작하면 `/admin` 화면에서 토큰 입력 카드가 나타납니다.
- 토큰이 맞으면 현재 브라우저 세션에만 저장되고, 운영 API 요청에 `x-admin-token` 헤더로 전송됩니다.
- 보호 대상 운영 API는 `/api/health`, `/api/data-model`, `/api/roadmap`, `/api/backups`, `/api/check-now`, `/api/dividends/refresh`, `/api/dividend-alerts/check`, `/api/briefing/send`, `/api/telegram/test`입니다.

화면 분리 현황:

- `/` 또는 `/app`은 사용자 화면입니다.
- `/admin`은 관리자 화면입니다.
- 사용자 화면에는 종목 등록, 감시 종목, 알림 기록, 배당 캘린더, 포트폴리오 요약을 남겼습니다.
- 관리자 화면에는 서버 상태, 데이터 모델, provider 진단, 백업/복구/삭제, 개발 WBS를 옮겼습니다.
- 상세 기준은 [사용자/관리자 페이지 분리 설계](docs/user-admin-page-split.md)에 정리되어 있습니다.

종목 등록 흐름:

`종목 등록` 버튼을 누르면 팝업이 열리고, 한 화면에서 아래 내용을 입력합니다.

1. 종목 검색 또는 종목 코드 입력, 필요하면 KIS 시장 기준 선택
2. 매수가, 보유 수량, 매수일 선택 입력
3. 필요하면 주당 연 배당금, 배당 주기, 지급월 입력
4. 알림 기준과 반복 알림 주기 설정
5. `기준 미리 확인`으로 현재가, 최고가, 기준가, 예상 배당금, 기준별 예상 결과 확인
6. 등록

주요 입력 필드:

| 필드 | 설명 |
|---|---|
| `종목 코드` | 예: `336260`, `33626L`, `005930`, `AAPL` |
| `표시 이름` | 예: `두산퓨얼셀` |
| `KIS 시장 기준` | 선택 입력. `kis` provider 사용 시 서버 기본값, KRX, NXT, 통합 중 종목별 기준을 적용 |
| `매수가` | 실제 매수가 |
| `보유 수량` | 선택 입력. 입력하면 평가금액과 평가손익을 계산 |
| `매수일 선택` | 선택 입력. 입력하면 매수일 이후 최고가, 비우면 등록 이후 감시 최고가 기준 |
| `알림 기준` | 최고가 대비 하락률, 이익금 반납률, 매수가 대비 손절률, 직접 기준가 |
| `하락률/반납률/손절률 %` | 알림 기준이 비율일 때 사용 |
| `직접 기준가` | 알림 기준이 직접 기준가일 때 사용 |
| `반복 분` | 기준가 이하에 머무를 때 반복 알림 간격 |
| `투자 목표가` | 선택 입력. 알림 기준가와 별개로 투자 계획 카드에 표시 |
| `매수 이유` | 선택 입력. 왜 보유하는지 기록 |
| `매도 조건` | 선택 입력. 어떤 상황이면 팔지 기록 |
| `실적 체크일` | 선택 입력. 다음 실적/뉴스 확인일 기록 |
| `주당 연 배당금` | 선택 입력. 예상 연 배당금과 배당수익률 계산 |
| `배당 주기` | 월배당, 분기배당, 반기배당, 연배당, 직접 입력 |
| `배당 지급월` | 예: `3,6,9,12`. 비우면 주기에 따른 기본 지급월 사용 |
| `메모` | 매수 이유, 목표가 등 |

등록 화면의 `빠른 추천값`에서 `이익 10%`, `이익 15%`, `고점 -5%`, `손절 -5%`를 바로 적용할 수 있습니다. `기준 미리 확인` 결과에는 선택한 기준뿐 아니라 다른 기준을 썼을 때의 예상 기준가와 알림 여유도 함께 표시됩니다.

매수 이유, 투자 목표가, 매도 조건, 실적 체크일 중 하나라도 입력하면 감시 종목 카드에 `매수 이유 / 매도 조건` 영역이 표시됩니다. 모두 비어 있으면 화면에는 표시하지 않습니다.

## 종목 코드 입력 예시

미국 주식:

```text
AAPL
TSLA
NVDA
```

한국 주식:

```text
005930
000660
035720
336260
33626L
```

한국 접미사도 허용됩니다.

```text
005930.KS
035720.KQ
33626L.KS
```

코드와 이름을 같이 입력해도 6자리 한국 종목 코드가 자동 추출됩니다. 우선주처럼 마지막 자리에 영문이 들어간 코드도 허용됩니다.

```text
336260 두산퓨얼셀
33626L 두산퓨얼셀우선주
```

## 시세 조회와 최고가 기준

기본 시세 provider 순서:

```text
naver,stooq,alphavantage,yahoo
```

provider 역할:

- `naver`: 한국 6자리 종목코드, 영문 포함 우선주 코드, `.KS`, `.KQ` 조회
- `nxt`: 공식/계약 API endpoint를 직접 설정했을 때만 사용하는 NXT 시세 adapter
- `publicdata`: 공공데이터포털 금융위원회 주식시세정보. 현재가는 지원하지 않고 일봉 최고가 계산 실험용
- `stooq`: 미국 종목 조회
- `alphavantage`: Alpha Vantage API 키가 있을 때 사용
- `yahoo`: 마지막 fallback

화면에 표시하는 시세 출처 구분:

| provider | 화면 표시 | 데이터 성격 | 시장 구분 | 비고 |
|---|---|---|---|---|
| `naver` | Naver Finance | 실시간 추정 | KRX 추정 | 무료/비공식 경로. NXT 분리 가격은 보장하지 않음 |
| `nxt` | NexTrade ATS | 계약 실시간 | NXT | 공식/계약 API endpoint 필요. 미설정 시 `missing_nxt_quote_endpoint`로 스킵 |
| `publicdata` | 공공데이터포털 주식시세 | 일봉 | KRX 추정 | 공식 일봉 보강용. 현재가 알림용 아님 |
| `stooq` | Stooq | 지연 또는 일봉 | 미국 | 무료 공개 데이터 |
| `alphavantage` | Alpha Vantage | 지연 | 미국 | API 키가 있을 때 사용 |
| `yahoo` | Yahoo Finance | 지연 또는 일봉 | 미국 | fallback |
| `manual` | 수동 테스트 | 수동 | 수동 | 가격 테스트 입력값 |

종목 등록 시 `매수가`와 `매수일`을 입력하면 앱은 매수일부터 오늘까지의 일봉 데이터를 조회해서 아래 둘 중 큰 값을 `구매일 이후 최고가`로 저장합니다.

- 구매일 이후 일봉 고가 중 최고값
- 사용자가 입력한 매수가

매수일을 비우면 일봉 과거 데이터를 조회하지 않고 등록 시점의 현재가와 매수가 중 큰 값을 `감시 최고가`로 저장합니다. 이후 주기적으로 현재가를 확인하면서 현재가가 기존 최고가보다 높으면 최고가를 새로 갱신합니다.

`이익금 반납률` 기준은 최고가 전체가 아니라 최고가에서 매수가를 뺀 이익금만 기준으로 계산합니다.

```text
기준가 = 최고가 - ((최고가 - 매수가) * 반납률 / 100)
```

예를 들어 매수가가 10,000원, 최고가가 15,000원, 반납률이 10%이면 기준가는 14,500원입니다. 아직 최고가가 매수가보다 높아진 적이 없으면 이익금이 없으므로 이 기준은 알림을 보내지 않습니다.

현재 일봉 provider:

- 한국 종목: Naver 일봉 차트
- 한국 종목 실험 옵션: 공공데이터포털 금융위원회 주식시세정보
- 미국 종목: Stooq 일봉 CSV, Yahoo chart fallback

공공데이터포털 주식시세정보를 구매일 이후 최고가 계산에 실험 적용하려면 `.env`에 아래처럼 설정합니다.

```text
HISTORICAL_QUOTE_PROVIDERS=publicdata,naver,stooq,yahoo
DATA_GO_KR_SERVICE_KEY=공공데이터포털_인증키
```

실제 키로 단일 종목 일봉 최고가만 먼저 확인하려면 아래 명령을 사용할 수 있습니다.

```powershell
npm run check:publicdata-price -- 005930 2026-05-01 2026-05-15
```

이 명령이 `HTTP 403: Forbidden`을 반환하면 코드 문제가 아니라 공공데이터포털에서 `금융위원회_주식시세정보` API 활용신청이 아직 승인되지 않았거나, 현재 `.env`의 키가 해당 API에 연결되지 않았을 가능성이 큽니다. 배당정보 API 키를 이미 받아도 주식시세정보 API는 별도 활용신청이 필요할 수 있습니다.

`publicdata`는 현재가 provider가 아니므로 `QUOTE_PROVIDERS`에는 기본적으로 넣지 않습니다. `QUOTE_PROVIDERS`에 넣으면 현재가 조회에서는 `일봉 전용 provider`로 스킵됩니다.

일봉 조회가 실패해도 종목은 등록됩니다. 이 경우 화면의 상태와 오류 메시지로 실패 이유를 확인하고 `최고가 재계산`을 눌러 다시 시도할 수 있습니다.

현재 MVP는 무료/공개 시세 조회 경로를 사용합니다. 종목 카드와 `기준 미리 확인` 화면에는 provider 이름, 실시간/지연/일봉 여부, KRX 추정/미국/수동 같은 시장 구분, provider가 내려준 시세 시각을 함께 표시합니다. 실제 운영 서비스로 확장할 때는 약관과 안정성을 확인한 유료 또는 공식 시세 API로 교체하는 것이 좋습니다.

관리자 화면의 `시세 provider 진단` 영역에서는 provider별 누적 성공 횟수, 실패 횟수, 실패율, 스킵 횟수, 평균 응답 시간, 마지막 실패 사유를 확인할 수 있습니다. 이 값은 자동 확인, 즉시 확인, 기준 미리 확인에서 실제 provider 호출이 일어날 때 `data/store.json`의 meta 영역에 저장됩니다.

### NXT 시세 검토 현황

2026-05-20 기준으로 NXT 전용 무료 공개 REST API는 확인하지 못했습니다. 현재 한국 종목 시세는 기본적으로 `naver` provider 기준이며, 화면에는 `KRX 추정`으로 표시합니다. KRX와 NXT 가격을 분리해서 보장하는 공식 provider가 아닙니다.

NEXTRADE 데이터 포털과 ICE Developer Portal에는 NXT 실시간/마감 데이터, ICE Consolidated Feed/History 같은 계약형 경로가 있습니다. 화면 scraping 방식은 안정성과 약관 리스크가 있어 구현하지 않습니다.

공식/계약 API endpoint를 확보한 경우에는 아래처럼 연결할 수 있습니다.

```text
QUOTE_PROVIDERS=nxt,naver,stooq,alphavantage,yahoo
NXT_QUOTE_ENDPOINT_TEMPLATE=https://계약_API_주소/quotes/{symbol}
NXT_API_KEY=계약_API_키
```

`nxt` provider는 `{symbol}`, `{code}`, `{nxtSymbol}` 자리에는 한국 6자리/영문 포함 종목코드를 넣고, `{rawSymbol}` 자리에는 사용자가 입력한 원본 심볼을 넣습니다. endpoint가 없으면 자동 확인 경로에서 호출하지 않고 `missing_nxt_quote_endpoint`로 스킵합니다.

상세 검토 내용은 [NXT 시세 API 검토](docs/nxt-market-data-review.md)에 정리했습니다.

### 증권사 API adapter 검토 현황

2026-05-20 기준으로 한국투자증권 Open API와 키움 REST API를 개인 로컬용 시세 provider 후보로 검토했습니다. 먼저 증권사 API 사용 전에 필요한 환경변수와 주문 기능 차단 조건을 점검하는 CLI를 추가했고, 이후 한국투자증권 현재가 provider를 시세 체인에 연결했습니다.

```powershell
npm run check:broker-api
npm run check:broker-api -- --provider kis
npm run check:broker-api -- --provider kiwoom
npm run check:broker-api -- --json
```

기본값은 `BROKER_QUOTE_PROVIDER=none`입니다. 이 상태에서는 기존 무료 시세 provider 체인을 그대로 사용합니다. `BROKER_TRADING_ENABLED=true`는 알림 앱 범위를 벗어나므로 점검 실패로 처리합니다.

상세 검토 내용은 [증권사 API adapter 검토](docs/broker-api-adapter-review.md)에 정리했습니다.

한국투자증권 Open API 키와 접근 토큰을 확보한 경우에는 KIS 현재가 provider를 아래처럼 시세 체인 앞에 둘 수 있습니다.

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

실제 키가 들어간 뒤 현재가 호출까지 확인하려면 아래 smoke test를 실행합니다. 토큰 원문과 앱 시크릿은 출력하지 않고, 토큰 출처와 시장별 성공/실패만 보여줍니다.

```powershell
npm run check:kis-quote
npm run check:kis-quote -- --symbol 336260 --market J
npm run check:kis-quote -- --symbol 33626L --market all
npm run check:kis-quote -- --symbol 005930 --market UN --json
```

같은 점검은 관리자 화면에서도 실행할 수 있습니다. `/admin`의 `KIS 현재가 점검` 카드에서 종목코드와 시장 구분을 선택하고 `점검 실행`을 누르면 토큰 출처, 만료 시각, 캐시 경로, 시장별 현재가 결과가 표시됩니다. 이 관리자 API는 `ADMIN_TOKEN`을 설정한 경우 관리자 토큰 없이는 호출할 수 없습니다.

`kis` provider는 국내 종목에만 적용됩니다. 키가 없거나 해외 종목이면 스킵하고 다음 provider로 넘어갑니다. 시장 구분은 한국투자증권 샘플 기준으로 `J`는 KRX, `NX`는 NXT, `UN`은 통합입니다.

종목 등록/편집 화면의 `KIS 시장 기준`에서 종목별로 KRX, NXT, 통합을 선택할 수 있습니다. 비워 두면 `.env`의 `KIS_MARKET_DIV_CODE` 기본값을 사용합니다. 이 값은 기준 미리 확인, 등록 직후 감시 최고가 초기화, 자동 가격 확인, 실패 종목 시세 재시도에 함께 적용됩니다.

### 공식/유료 시세 API 검토 현황

2026-05-20 기준으로 KRX Open API, 공공데이터포털 주식시세정보, 한국투자증권 Open API, 키움 REST API, 코스콤 오픈API플랫폼, ICE NexTrade ATS를 비교했습니다.

결론은 당장 provider를 교체하지 않고, 먼저 현재 무료 provider의 실패율과 실패 사유를 기록하는 것입니다. 공공데이터포털과 KRX Open API는 공식 일봉/기준일 데이터 보강에는 유용하지만, 장중 60초 매도 알림용 실시간 시세 provider로는 부족합니다. 실시간 안정성이 필요해지면 한국투자증권/키움 같은 증권사 API를 개인 로컬용 후보로 붙이되, 주문 기능은 제외합니다. NXT 분리 시세는 코스콤/ICE 같은 계약형 데이터 확인 뒤 진행합니다.

상세 비교는 [공식/유료 시세 API 후보 검토](docs/market-data-api-candidates.md)에 정리했습니다.

## 알림 상태 로직

알림 기준가 이하로 내려가면:

- 종목 상태가 `triggered`로 저장됩니다.
- 텔레그램 알림이 전송됩니다.
- 반복 알림 회차가 증가합니다.

기준가 이하에 계속 머물면:

- 종목별 반복 간격이 지난 뒤 다시 알림을 보냅니다.
- 같은 하락 구간에서 몇 번째 알림인지 기록합니다.

기준가 위로 회복하면:

- 종목 상태가 `clear`로 초기화됩니다.
- 회복 시각이 저장됩니다.
- 다음 하락은 새로운 알림 구간으로 처리됩니다.

## 배당주 기능

현재 구현된 배당주 기능:

- 주당 연 배당금 수동 입력
- 보유 수량 기반 예상 연 배당금 계산
- 총 매수금액 대비 배당수익률 계산
- 주가 평가손익에 예상 연 배당금을 더한 배당 포함 손익과 수익률 계산
- 배당 주기와 지급월 기반 1회 예상 배당금 계산
- 포트폴리오 요약에서 월별 예상 배당 현금흐름 표시
- 감시 종목 카드와 전체 포트폴리오 요약에 배당 정보 표시
- 공공데이터포털, OpenDART, Alpha Vantage, Yahoo provider 체인으로 배당 데이터 자동 보조 갱신
- provider별 성공/실패 사유와 적용된 배당금 출처를 웹 대시보드에 표시
- 국내 종목 배당 조회 시 종목코드, 회사명, 공백/보통주 표기 차이 보정
- provider가 제공하는 배당락일, 지급일, 최근 1주 배당금을 종목 카드에 표시
- 배당금, 최근 1주 배당, 배당락일, 지급일이 바뀌면 최근 변경 내역 저장
- 웹앱 `배당 캘린더`에서 향후 6개월 예상 배당 지급월, 지급일, 월별 합계를 표시
- 배당락일 3일 전/1일 전/당일/1일 후, 지급일 1일 전/당일 알림 전송
- 같은 종목의 같은 배당 이벤트와 같은 기준일 알림은 중복 전송 방지
- 웹앱 `배당 새로고침` 버튼으로 즉시 수동 갱신
- 텔레그램 `/edit <종목코드> dividend <주당연배당금>` 수정 지원
- 텔레그램 `/edit <종목코드> dividendfreq <주기>`와 `/edit <종목코드> dividendmonths <월목록>` 수정 지원
- 텔레그램 `/dividend-status`로 전체 배당 API 진단 요약 확인
- 텔레그램 `/dividend-status <종목코드>`로 특정 종목의 provider별 성공/실패 사유 확인
- 종목 카드의 `배당 재시도` 버튼으로 실패한 종목만 다시 조회

## 위험도 순위와 일일 브리핑

웹 대시보드는 종목별 알림 기준가와 현재가의 거리를 계산해서 위험도순으로 정렬합니다.

위험도 기준:

- `알림`: 현재가가 기준가 이하이거나 알림 상태가 이미 진입됨
- `주의`: 기준가까지 남은 거리가 `DAILY_BRIEFING_WARNING_DISTANCE_PERCENT` 이하
- `정상`: 아직 기준가까지 여유가 있음
- `조회 실패`: 최근 시세 조회가 실패함
- `확인 전`: 아직 현재가나 기준가 계산이 부족함
- `알림 꺼짐`: 종목별 알림 토글을 끈 상태

텔레그램 브리핑:

- 기본값은 매일 `16:10`에 1회 전송입니다.
- 서버가 꺼져 있으면 전송되지 않습니다.
- 같은 날짜에는 자동 브리핑을 중복 전송하지 않습니다.
- 웹앱의 `브리핑 전송` 버튼이나 텔레그램 `/brief` 명령으로 즉시 확인할 수 있습니다.
- 브리핑에는 위험도 상위 종목, 알림/주의/오류 개수, 보유 수량이 있는 경우 포트폴리오 평가손익, 예상 연 배당금, 배당 성장률이 포함됩니다.

배당 자동 갱신 설정:

```text
DIVIDEND_REFRESH_INTERVAL_SECONDS=86400
DIVIDEND_PROVIDERS=publicdata,opendart,alphavantage,yahoo
DATA_GO_KR_SERVICE_KEY=
OPENDART_API_KEY=
ALPHA_VANTAGE_API_KEY=
DIVIDEND_EVENT_ALERT_ENABLED=true
DIVIDEND_EVENT_ALERT_CHECK_INTERVAL_SECONDS=3600
DIVIDEND_EVENT_ALERT_EX_DATE_OFFSETS=3,1,0,-1
DIVIDEND_EVENT_ALERT_PAYMENT_DATE_OFFSETS=1,0
```

현재 배당금은 설정된 provider 순서대로 하루 1회 보조 갱신합니다. 국내 종목은 공공데이터포털과 OpenDART를 먼저 사용하고, 해외 종목은 Alpha Vantage를 먼저 사용한 뒤 Yahoo를 fallback으로 사용합니다.

API 조회가 실패해도 기존에 수동 입력한 주당 연 배당금은 지우지 않습니다. 배당 주기와 지급월은 종목별 차이가 커서 여전히 수동 입력을 기준으로 계산합니다.

배당 일정 알림은 `exDividendDate`와 `dividendDate`가 있는 종목만 대상으로 합니다. `DIVIDEND_EVENT_ALERT_EX_DATE_OFFSETS=3,1,0,-1`은 배당락일 3일 전, 1일 전, 당일, 1일 후를 의미하고 `DIVIDEND_EVENT_ALERT_PAYMENT_DATE_OFFSETS=1,0`은 지급일 1일 전과 당일을 의미합니다. 종목 카드의 알림 토글을 끄면 가격 알림과 배당 일정 알림 모두 쉬게 됩니다.

공공데이터포털 키 확인:

- 공공데이터포털에서 `금융위원회_주식배당정보` 활용 신청이 승인되어야 합니다.
- `DATA_GO_KR_SERVICE_KEY`에는 Encoding 키 또는 Decoding 키를 넣을 수 있습니다.
- 키를 새로 넣거나 바꾼 뒤에는 서버를 재시작해야 합니다.
- 국내 종목은 종목코드와 회사명 후보를 함께 사용해 `두산퓨얼셀`, `두산 퓨얼셀`, `두산퓨얼셀보통주` 같은 표기 차이를 보정합니다.
- 공공데이터 응답이 실패하면 OpenDART, Alpha Vantage, Yahoo 순서로 fallback을 시도합니다.

다음 개발 후보:

- 실제 Postgres 연결 전 통합 테스트 데이터셋 준비
- 저장소별 백업 스냅샷 export/import 검증 자동화

## 텔레그램 명령어

서버가 켜져 있으면 봇에게 아래 명령어를 보낼 수 있습니다.

| 명령어 | 설명 |
|---|---|
| `/help` | 명령어 도움말 |
| `/list` | 감시 종목 목록 |
| `/brief` | 위험도 순위와 일일 브리핑 |
| `/check` | 즉시 전체 종목 가격 확인 |
| `/dividend-status` | 전체 배당 API 진단 요약 |
| `/dividend-status <종목코드>` | 특정 종목 배당 provider 상세 진단 |
| `/pause <종목코드>` | 알림 끄기 |
| `/resume <종목코드>` | 알림 켜기 |
| `/edit <종목코드> <항목> <값>` | 알림 조건과 종목 정보 수정 |
| `/delete <종목코드>` | 종목 삭제 |
| `/backup` | 현재 데이터 수동 백업 |
| `/backups` | 최근 백업 목록 |
| `/restore <번호 또는 파일명>` | 백업 복구 |
| `/delete-backup <번호 또는 파일명>` | 백업 삭제 |

종목 등록 예시:

```text
/add 336260 두산퓨얼셀 88779 high 10
/add 336260 두산퓨얼셀 88779 profit 10
/add 336260 두산퓨얼셀 88779 2026-05-11 high 10
/add 336260 두산퓨얼셀 88779 target 93000
/add symbol=336260 name=두산퓨얼셀 price=88779 market=NX type=profit rate=10
```

등록 명령어 형식:

```text
/add <종목코드> <표시이름> <매수가> [매수일] <기준> <값>
```

기준 값:

- `high`: 매수일 이후 최고가 또는 감시 최고가 대비 하락률
- `profit`: 평단가 대비 최고 이익금 반납률
- `loss`: 매수가 대비 손절률
- `target`: 직접 기준가

종목 수정 예시:

```text
/edit 336260 high 8
/edit 336260 profit 10
/edit 336260 loss 5
/edit 336260 target 93000
/edit 336260 cooldown 60
/edit 336260 qty 10
/edit 336260 dividend 1200
/edit 336260 dividendfreq quarterly
/edit 336260 dividendmonths 3,6,9,12
/edit 336260 name 두산퓨얼셀
/edit 336260 price 88779
/edit 336260 date 2026-05-11
/edit 336260 notes 실적 발표 전까지 보유
/edit 336260 reason 수소 밸류체인 성장
/edit 336260 goal 120000
/edit 336260 sell 분기 적자 확대 시 매도
/edit 336260 review 2026-08-15
```

수정 항목:

- `high`: 최고가 대비 하락률로 변경
- `profit`: 이익금 반납률로 변경
- `loss`: 매수가 대비 손절률로 변경
- `target`: 직접 기준가로 변경
- `cooldown`: 반복 알림 간격 변경
- `name`: 표시 이름 변경
- `price`: 매수가 변경 후 최고가 재계산
- `qty`: 보유 수량 변경
- `dividend`: 주당 연 배당금 변경
- `dividendfreq`: 배당 주기 변경. 값은 `monthly`, `quarterly`, `semiannual`, `annual`, `custom`
- `dividendmonths`: 배당 지급월 변경. 예: `3,6,9,12`
- `date`: 매수일 변경 후 최고가 재계산
- `kis`: KIS 시장 기준 변경. 값은 `J`, `NX`, `UN`, `default`
- `notes`: 메모 변경
- `reason`: 매수 이유 변경
- `goal`: 투자 목표가 변경
- `sell`: 매도 조건 변경
- `review`: 실적 체크일 변경

백업 복구 예시:

```text
/backups
/restore 1
/restore store-20260511-082342-355-server-start-c6b8dcd7.json
/delete-backup 1
```

`/restore 1`은 `/backups` 목록의 1번 백업으로 복구합니다. 복구 전에는 현재 데이터가 `before-restore` 백업으로 자동 저장됩니다.

`/delete-backup 1`은 `/backups` 목록의 1번 백업 파일만 삭제합니다. 현재 감시 종목 데이터에는 영향이 없지만, 삭제한 백업 파일은 되돌릴 수 없습니다.

배당 진단 예시:

```text
/dividend-status
/dividend-status 005930
```

`/dividend-status`는 전체 종목의 배당 API 진단 요약을 보여줍니다. `/dividend-status <종목코드>`는 특정 종목의 적용값, 마지막 확인 시각, provider별 성공/실패 사유를 자세히 보여줍니다.

## 데이터 저장과 백업

실제 데이터는 아래 파일에 저장됩니다.

```text
data/store.json
```

현재 실행 중인 서버의 식별 정보는 아래 파일에 저장됩니다.

```text
data/server.json
```

저장되는 정보:

- 익명 기기 ID
- 기기별 푸시 토큰
- 등록 종목
- 매수가, 보유 수량, 주당 연 배당금, 배당 주기, 배당 지급월, 매수일
- 최고가
- 알림 기준
- 알림 상태
- 텔레그램 update offset
- 알림 기록

데이터 모델 기준:

- 현재 스키마 버전은 `1`입니다.
- 서버는 저장할 때 `meta.schemaVersion`, `meta.createdAt`, `meta.updatedAt`을 함께 관리합니다.
- 주요 엔터티는 `devices`, `push_tokens`, `stocks`, `alerts`, `dividend_events`, `quote_provider_stats`입니다.
- 관리자 화면의 서버 상태에서 스키마 버전과 종목/알림/기기 개수를 확인할 수 있습니다.
- 전체 데이터 모델은 `GET /api/data-model`에서 확인할 수 있습니다.
- DB 이전 전략은 [JSON -> DB 이전 설계](docs/json-to-db-migration.md)에 정리되어 있습니다.

향후 Postgres 이전 방향:

- 현재 로컬 JSON 실행은 유지합니다.
- 저장소 인터페이스는 `src/storageContract.js`에 고정되어 있습니다.
- 서버는 `src/storageFactory.js`를 통해 저장소를 생성합니다.
- `src/postgresStore.js`에 `JsonStore`와 같은 계약을 따르는 Postgres JSONB 쿼리 어댑터를 추가했습니다.
- `npm run migrate:postgres:dry-run`으로 현재 `data/store.json`을 Postgres 테이블 후보 행으로 변환하고 건수/샘플/주의 사항을 확인할 수 있습니다.
- `npm run migrate:postgres:rehearsal`로 실제 `DATABASE_URL`에 리허설 전용 JSONB 테이블을 만들고 스냅샷 import/export 건수를 검증할 수 있습니다.
- `tests/fixtures/postgres-migration/`에는 실제 DB 연결 전에 JSON API 응답과 dry-run 테이블 변환을 비교할 표준 데이터셋이 있습니다.
- `tests/storageSnapshotContract.test.js`는 JsonStore와 PostgresStore의 스냅샷 round-trip 계약을 함께 검증합니다.
- 백업/복구는 저장소 스냅샷 export/import 계약을 사용하므로, 향후 DB 저장소도 같은 관리자 화면과 텔레그램 명령을 재사용할 수 있습니다.
- 실제 이전 전에는 스냅샷 백업, dry-run, 건수 검증, API 응답 비교를 수행합니다.
- `STORAGE_ENGINE=postgres`는 쿼리 어댑터가 준비됐지만, 데이터 손실을 막기 위해 일반 서버 실행에서는 아직 명시 보호 옵션 뒤에 둡니다.

dry-run 상세 옵션:

```powershell
npm run migrate:postgres:dry-run
npm run migrate:postgres:dry-run -- --json --samples 5
npm run migrate:postgres:dry-run -- --store data/backups/<백업파일명>.json
```

Postgres 연결 리허설:

```powershell
$env:DATABASE_URL="postgres://user:password@host:5432/dbname"
npm run migrate:postgres:rehearsal
npm run migrate:postgres:rehearsal -- --store data/backups/<백업파일명>.json
npm run migrate:postgres:rehearsal -- --json
```

기본 리허설 테이블은 `stock_alarm_store_rehearsal`입니다. 운영용 `stock_alarm_store` 테이블을 바로 덮지 않도록 기본값을 분리했습니다.

백업 위치:

```text
data/backups/
```

자동 백업 시점:

- 서버 시작 시
- 종목 추가 전/후
- 종목 수정 전/후
- 종목 삭제 전/후
- 복구 직전

백업 보관 개수:

```text
BACKUP_RETENTION=30
```

`data/store.json`과 `data/backups/`는 GitHub에 올라가지 않습니다.

관리자 화면의 `데이터 백업` 영역에서 할 수 있는 일:

- `백업 생성`: 현재 `data/store.json`을 백업 파일로 저장
- `새로고침`: 최근 백업 목록 다시 조회
- `복구`: 선택한 백업으로 데이터 복구
- `삭제`: 선택한 백업 파일 삭제

복구를 실행하면 현재 저장소 상태가 먼저 `before-restore` 백업으로 저장된 뒤 선택한 백업이 적용됩니다.
서버와 텔레그램 명령은 저장소 메서드로 백업/복구를 수행하므로, 현재 JSON 저장소뿐 아니라 향후 DB 저장소도 같은 흐름을 사용할 수 있습니다.
삭제는 백업 파일만 제거하며 현재 데이터에는 영향을 주지 않습니다. 삭제한 백업은 되돌릴 수 없습니다.

## 모바일 앱용 익명 API

앱스토어/플레이스토어 출시 방향은 `계정 없는 앱 + 익명 기기 ID + 서버 감시`입니다. 사용자는 로그인하지 않고, 앱 설치 시 서버가 발급한 `device.id`와 `deviceSecret`을 앱 내부 안전 저장소에 보관합니다.

기기 등록:

```http
POST /api/devices
Content-Type: application/json
```

```json
{
  "label": "Joo iPhone",
  "platform": "ios"
}
```

응답의 `deviceSecret`은 처음 한 번만 앱에 내려주는 값입니다. 서버에는 해시만 저장됩니다.

모바일 API 인증 헤더:

```text
x-device-id: <device.id>
x-device-secret: <deviceSecret>
```

지원 API:

| API | 설명 |
|---|---|
| `GET /api/mobile/ping` | 모바일 앱 서버 연결 확인 |
| `GET /api/mobile/me` | 내 익명 기기 정보 확인 |
| `POST /api/mobile/push-token` | Expo Push 토큰 저장 |
| `POST /api/mobile/push-test` | 내 기기에 테스트 푸시 전송 |
| `GET /api/mobile/stocks` | 내 기기의 종목, 배당 캘린더, 알림 목록 조회 |
| `POST /api/mobile/stocks` | 내 기기에 종목 등록 |
| `PATCH /api/mobile/stocks/<stockId>` | 내 기기의 종목 수정 |
| `DELETE /api/mobile/stocks/<stockId>` | 내 기기의 종목 삭제 |

다른 기기의 `stockId`를 알아도 `deviceSecret`이 맞지 않으면 수정/삭제할 수 없습니다. 현재는 JSON 저장소 기반으로 동작하지만, 이 구조는 나중에 Postgres의 `devices`, `stocks`, `alerts`, `push_tokens` 테이블로 옮기기 쉽도록 맞춰둔 단계입니다.

## Expo 모바일 앱 초기 프로젝트

모바일 앱은 `mobile/` 디렉터리에 분리했습니다. 현재는 Expo SDK 55 기준 앱이며, 로컬 Stock Alarm 서버 주소를 입력하고 익명 기기를 연결한 뒤 내 종목을 등록, 편집, 삭제하고 Expo Push 토큰을 등록할 수 있는 단계입니다.

Expo SDK 55는 Node.js `20.19.0` 이상이 필요합니다. 현재 PC의 Node가 그보다 낮으면 기존 로컬 서버는 계속 실행할 수 있지만, 모바일 앱의 `npm install` 또는 `npm start` 전에 Node를 업그레이드해야 합니다.

처음 한 번 설치:

```powershell
npm run mobile:install
```

실행:

```powershell
npm run mobile:start
```

모바일 앱을 실제 휴대폰에서 테스트하려면 루트 서버를 휴대폰 접속 모드로 실행합니다.

```powershell
npm run local:phone
```

앱의 서버 주소 입력칸에는 실행 로그나 `status-local.bat`에 표시된 LAN 주소를 넣습니다.

| 환경 | 서버 주소 예시 |
|---|---|
| iOS 시뮬레이터 | `http://127.0.0.1:3001` |
| Android 에뮬레이터 | `http://10.0.2.2:3001` |
| 실제 휴대폰 | `npm run local:phone`에 표시된 `http://192.168.x.x:<포트>` 주소 |

현재 모바일 앱 범위:

- 서버 상태 확인
- `GET /api/mobile/ping`으로 모바일 서버 연결 확인
- `POST /api/devices`로 익명 기기 등록
- `expo-secure-store`로 `deviceId`, `deviceSecret` 저장
- `GET /api/mobile/stocks`로 내 기기의 종목, 배당 캘린더, 알림 목록 조회
- 모바일 앱 첫 화면에서 내 기기 기준 배당 캘린더와 알림 기록 상세 확인
- `POST /api/mobile/push-token`으로 Expo Push 토큰 등록
- `POST /api/mobile/push-test`로 테스트 푸시 전송
- `POST /api/mobile/stocks`로 내 기기의 종목 등록
- `PATCH /api/mobile/stocks/<stockId>`로 알림 기준, 매수가, 수량, 투자 계획, KIS 시장 기준, 알림 ON/OFF 수정
- `DELETE /api/mobile/stocks/<stockId>`로 내 기기의 종목 삭제

가격 알림이 발생하면 텔레그램 전송과 별도로 해당 종목의 `deviceId`에 저장된 Expo Push 토큰으로 모바일 푸시를 보냅니다. 실제 휴대폰 푸시는 기기 권한, Expo Push 토큰, 네트워크 접속이 모두 맞아야 하며 시뮬레이터/Expo Go 환경에서는 제한될 수 있습니다.

앱 심사 준비 문서:

- [앱 심사 준비 체크리스트](docs/app-store-review-prep.md)
- [HTTPS 데모 서버 준비](docs/https-demo-server.md)
- [스토어 스크린샷 제작 가이드](docs/store-screenshots.md)
- [스토어 제출 자산 최종 점검](docs/store-submission-assets.md)
- [개인정보 처리방침 초안](docs/privacy-policy-ko.md)
- [한국어 스토어 등록 정보 초안](mobile/store-listing.ko.json)

현재 심사 준비 문서는 제출 전 확인용입니다. 실제 App Store와 Play Store 제출 전에는 개인정보 처리방침을 HTTPS 공개 URL로 게시하고, 리뷰어가 접근할 수 있는 HTTPS 데모 서버 또는 내부 테스트 환경을 제공해야 합니다.

HTTPS 데모 서버 준비 점검:

```powershell
npm run check:demo
npm run check:demo -- --json
npm run check:demo -- --fail-on-warn
```

주요 점검 항목은 `REVIEW_DEMO_URL`, `PRIVACY_POLICY_URL`, `SUPPORT_URL`, `ADMIN_TOKEN`, 외부 서버용 `HOST=0.0.0.0`, 저장소 설정, 푸시/텔레그램 시연 설정입니다.

스토어 제출 자산 점검:

```powershell
npm run check:store-assets
npm run check:store-assets -- --json
npm run check:store-assets -- --screenshot-dir mobile/store-assets/screenshots
```

주요 점검 항목은 앱 아이콘, 스토어 메타데이터, 공개 개인정보/지원 URL, 심사 메모, Data safety 초안, 실제 PNG/JPEG 스크린샷 파일입니다. 기본 로컬 환경에서는 실제 캡처 파일과 공개 URL이 없으면 `NOT READY`가 정상입니다.

## Railway 배포 준비

현재 개발 방향은 로컬 PC 실행을 우선합니다. 다만 24시간 서버 운영이 필요해질 때를 대비해 Railway 설정 파일은 유지합니다.

포함된 설정:

```text
railway.json
.env.railway.example
docs/railway-deploy.md
```

Railway에서는 `PORT`를 직접 설정하지 않습니다. Railway가 자동으로 넣어주는 포트를 서버가 사용합니다.

현재 앱은 JSON 파일 저장소를 사용하므로 Railway에서 Volume이 필요합니다.

```text
Volume Mount Path: /app/data
DATA_DIR=/app/data
```

배포 전 설정 점검:

```powershell
$env:RAILWAY_ENVIRONMENT='production'
$env:HOST='0.0.0.0'
$env:PORT='3000'
$env:DATA_DIR='/app/data'
node scripts/check-railway-config.js
```

자세한 절차는 [Railway 배포 가이드](docs/railway-deploy.md)를 확인하세요.

## 테스트 실행

전체 테스트:

```powershell
npm test
```

또는:

```powershell
node --test
```

문법 확인:

```powershell
node --check src/server.js
node --check src/alertEngine.js
node --check src/telegramCommands.js
node --check scripts/local-server.js
```

현재 테스트 범위:

- 알림 기준 계산
- 매수일 이후 최고가와 감시 최고가 계산
- 알림 상태 진입/회복
- 텔레그램 명령어 파싱
- 백업 생성/목록/복구/삭제
- 서버 실행 정보 파일
- 로컬/휴대폰 접속 주소 계산
- 접속 주소 QR 코드 생성
- 시세 provider 파싱
- 배당 provider 파싱
- 배당 자동 갱신
- 시세/배당 실패 종목 단일 재시도
- 배당락일/지급일 전후 알림
- 배당 성장률 계산
- 종목 검색
- 모바일 익명 기기 API 저장소
- 모바일 Expo Push 전송 헬퍼와 알림 경로 연결
- 앱 심사 준비 문서, 스토어 메타데이터 초안, 스토어 제출 자산 점검 CLI

## 문제 해결

### 서버 주소가 안 열릴 때

터미널 로그나 `status-local.bat`에 표시된 주소를 확인하세요. 3000 포트가 사용 중이면 3001 이상으로 자동 변경될 수 있습니다.

```powershell
netstat -ano | Select-String -Pattern ':3000'
netstat -ano | Select-String -Pattern ':3001'
```

### 텔레그램 명령어가 반응하지 않을 때

확인할 것:

- `.env`에 `TELEGRAM_BOT_TOKEN`이 있는지
- `.env`에 `TELEGRAM_CHAT_ID`가 맞는지
- 서버를 재시작했는지
- 봇에게 메시지를 보낸 채팅의 `chat.id`와 `.env` 값이 같은지

헬스 체크:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

`ADMIN_TOKEN`을 설정한 경우:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health -Headers @{ "x-admin-token" = "설정한_ADMIN_TOKEN" }
```

서버가 3001에서 실행 중이면:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

### 종목 가격 조회가 실패할 때

가능한 원인:

- 잘못된 종목 코드
- provider 일시 장애
- 네트워크 문제
- 한국/미국 시장 구분 문제

해결 방법:

- 종목 자동완성 결과에서 선택
- 한국 종목은 숫자 6자리 또는 `33626L`처럼 영문이 포함된 6자리 코드 사용
- 미국 종목은 `AAPL`, `TSLA`처럼 티커 사용
- 해당 종목 카드의 `시세 재시도`, `즉시 확인`, 또는 텔레그램 `/check` 재시도

### 공공데이터포털 배당 조회가 실패할 때

확인할 것:

- `금융위원회_주식배당정보` API 활용 신청이 승인되었는지
- `.env`의 `DATA_GO_KR_SERVICE_KEY`에 키가 들어갔는지
- 키 앞뒤에 공백이나 따옴표가 섞이지 않았는지
- 키를 넣은 뒤 서버를 재시작했는지
- 종목이 국내 종목 코드인지

공공데이터포털 키는 Encoding 키와 Decoding 키를 모두 사용할 수 있습니다.

### 백업 복구가 실패할 때

확인할 것:

- `/backups` 목록에 있는 번호 또는 파일명을 사용했는지
- 파일명이 `.json`으로 끝나는지
- `data/backups/` 안의 파일인지
- 직접 수정한 백업 파일의 JSON 구조가 올바른지

복구 명령은 경로 조작을 막기 위해 파일명만 허용합니다.

## 운영 시 주의사항

- PC가 꺼지면 서버도 멈춥니다.
- 실제 24시간 알림 서비스로 쓰려면 서버 배포 또는 항상 켜진 PC가 필요합니다.
- 무료 시세 provider는 안정성과 약관 제한이 있을 수 있습니다.
- 배당 정보는 실시간 초 단위 데이터가 아니며 provider 업데이트 시점에 따라 달라질 수 있습니다.
- 텔레그램 봇 토큰과 API 키는 절대 공개 저장소에 올리면 안 됩니다.
- 복구 전에 자동 안전 백업이 생기지만, 중요한 변경 전에는 `/backup`을 한 번 실행하는 것이 좋습니다.

## 다음 개발 후보

상세 WBS와 예상 작업량은 [개발 WBS 및 로드맵](docs/development-roadmap.md)에서 관리합니다.

최근 완료 요약:

- 등록/사용자 UX: 종목 등록 팝업, 매수일 선택 입력, 알림 기준 추천값, 자동완성 배지, 기준별 예상 결과 비교, 매수 이유/매도 조건 카드, 추가매수 계산기
- 알림/포트폴리오: 이익금 반납률 알림, 최대 수익금/반납 금액, 계좌 총 반납률, 종목별 알림 토글
- 배당: 배당 API provider 진단, 텔레그램 배당 진단 명령, 국내 종목 매칭 보정, 배당락일/지급일/변경 이력, 배당 성장률, 배당 캘린더 필터/월별 합계, 배당락일/지급일 전후 알림
- 시세: provider 진단, 시세 출처/데이터 성격 표시, 공공데이터포털 일봉 provider 실험, NXT/공식 API 검토, NXT 계약 API adapter 골격
- 증권사 API: 한국투자증권/키움 quote-only adapter 점검 CLI, 주문 기능 차단 가드, KIS 현재가 provider, KIS 토큰 자동 발급/캐시, 실계정 현재가 smoke test CLI, 관리자 KIS 현재가 점검, 종목별 KIS 시장 기준, 환경변수 문서화
- 운영/관리: 사용자/관리자 화면 분리, 관리자 보호, 백업/복구/삭제, 백업 스냅샷 계약, 데이터 모델 정리, 저장소 계약, JSON -> DB 이전 설계, WBS 상태 표준화, HTTPS 데모 서버 점검
- 저장소: PostgresStore JSONB 쿼리 어댑터, DATABASE_URL 마스킹, 계약 테스트, JSON -> Postgres dry-run 마이그레이션 검증, 통합 테스트 데이터셋, 백업 스냅샷 계약 검증, Postgres 연결 리허설 CLI
- 안정화: 시세/배당 실패 사유 표시와 종목별 재시도 UX
- 모바일: Expo SDK 55 초기 앱, 서버 연결, 익명 기기 저장, 모바일 종목 조회/등록/편집/삭제, 배당 캘린더/알림 기록 상세, Expo Push 토큰 등록과 알림 전송, 앱 심사 준비 문서, HTTPS 데모 서버 준비, 스토어 메타데이터 초안, 스토어 스크린샷 화면/문구/대체 텍스트 가이드, 스토어 제출 자산 점검 CLI

우선순위가 높은 순서:

1. KIS/Naver 가격 비교 진단
