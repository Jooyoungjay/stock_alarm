# Stock Alarm

Stock Alarm은 매수한 종목의 가격을 주기적으로 확인하고, 사용자가 정한 매도 기준에 도달하면 텔레그램으로 반복 알림을 보내는 MVP입니다.

현재 단계는 **로컬 웹앱 + 텔레그램 봇 기반 MVP**입니다. 당장은 사용자가 자신의 PC에서 실행하는 방식을 기준으로 개발하고, 이후 App Store와 Play Store 앱으로 확장할 수 있도록 모바일 API 기초를 함께 준비하고 있습니다.

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

- 웹 대시보드에서 종목 등록, 편집, 중지, 재개, 삭제
- 종목명/종목코드 자동완성
- 구매일 이후 최고가 자동 계산
- 이후 새 최고가 자동 추적
- 알림 기준 4종 지원
- 기준가 이하 진입, 반복 알림, 회복 상태 추적
- 텔레그램 알림 전송
- 텔레그램 명령어로 종목 관리
- 알림 기준까지 남은 거리 기준 위험도 순위와 일일 브리핑 알림
- 보유 수량 기반 평가금액, 평가손익, 수익률 표시
- 주당 연 배당금 기반 예상 연 배당금, 배당수익률 표시
- 배당 주기와 지급월 기반 월별 예상 배당 현금흐름 표시
- 공공데이터포털, OpenDART, Alpha Vantage, Yahoo provider 체인 기반 배당 데이터 보조 갱신
- 배당 provider별 성공/실패 진단 화면과 마지막 갱신 로그
- 시세 provider별 성공/실패율, 스킵 사유, 평균 응답 시간 진단 화면
- 종목 카드와 기준 미리 확인에서 시세 출처, 데이터 성격, 시장 구분, 시세 시각 표시
- 배당락일, 지급일, 최근 1주 배당금, 배당 변경 내역 표시
- 웹 대시보드와 텔레그램 명령어 기반 백업/복구/삭제
- 서버 시작과 종목 변경 시 자동 백업
- 브라우저에서 앱처럼 실행할 수 있는 PWA 기본 설정
- 같은 Wi-Fi 휴대폰 접속용 주소와 QR 코드 표시
- 계정 없는 모바일 앱용 익명 기기 API 기초
- 기기별 종목 격리와 푸시 토큰 저장
- 로컬 JSON 파일 기반 데이터 저장
- 안전한 로컬 서버 종료 스크립트

지원하는 알림 기준:

- `최고가 대비 하락률`: 구매일 이후 최고가에서 몇 % 하락하면 알림
- `이익금 반납률`: 구매일 이후 최고 이익금 중 몇 %를 반납하면 알림
- `매수가 대비 손절률`: 매수가에서 몇 % 하락하면 알림
- `직접 기준가`: 사용자가 입력한 가격 이하가 되면 알림

## 프로젝트 구조

```text
stock_alarm/
├─ public/                  # 로컬 웹앱 HTML/CSS/JS/PWA 파일
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  └─ icons/
├─ src/
│  ├─ server.js             # HTTP 서버와 API
│  ├─ alertEngine.js        # 알림 기준 계산, 상태 추적, 알림 전송 흐름
│  ├─ priceProvider.js      # Naver/Stooq/Alpha Vantage/Yahoo 시세 조회
│  ├─ dividendProvider.js   # 배당 provider 조회와 응답 파싱
│  ├─ dividendRefresh.js    # 배당 데이터 자동/수동 갱신
│  ├─ storage.js            # 로컬 JSON 저장소
│  ├─ telegram.js           # 텔레그램 API 호출
│  ├─ telegramCommands.js   # 텔레그램 명령어 처리
│  ├─ backups.js            # 데이터 백업/복구/삭제
│  ├─ accessUrls.js         # 로컬/휴대폰 접속 주소 계산
│  ├─ qrCode.js             # 접속 주소 QR 코드 생성
│  ├─ runtimeInfo.js        # 실행 중 서버 식별 정보
│  └─ symbols.js            # 종목 검색/정규화
├─ scripts/
│  ├─ local-server.js       # 로컬 서버 시작/상태 확인 스크립트
│  ├─ stop-server.js        # 안전 종료 스크립트
│  └─ check-railway-config.js
├─ docs/
│  ├─ development-roadmap.md       # 개발 WBS와 다음 작업 순서
│  ├─ market-data-api-candidates.md # 공식/유료 시세 API 후보 검토
│  ├─ nxt-market-data-review.md    # NXT 시세 API 검토
│  └─ railway-deploy.md            # Railway 배포 가이드
├─ tests/                   # Node.js 테스트
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
BACKUP_RETENTION=30
DEFAULT_ALERT_COOLDOWN_MINUTES=30
QUOTE_TIMEOUT_MS=10000
QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
DIVIDEND_PROVIDERS=publicdata,opendart,alphavantage,yahoo
DATA_GO_KR_SERVICE_KEY=
OPENDART_API_KEY=
ALPHA_VANTAGE_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

주요 환경변수:

| 이름 | 기본값 | 설명 |
|---|---:|---|
| `HOST` | `127.0.0.1` | 로컬 PC만 접속하려면 기본값 사용. 휴대폰 테스트는 `0.0.0.0` 사용 |
| `PORT` | `3000` | 서버 포트. 사용 중이면 로컬 시작 스크립트가 다음 포트를 찾음 |
| `DATA_DIR` | `data` | 데이터 저장 폴더. 비우면 프로젝트의 `data/` 사용 |
| `POLL_INTERVAL_SECONDS` | `60` | 시세 자동 확인 주기 |
| `TELEGRAM_COMMAND_POLL_SECONDS` | `5` | 텔레그램 명령어 확인 주기 |
| `DIVIDEND_REFRESH_INTERVAL_SECONDS` | `86400` | 배당 데이터 자동 보조 갱신 주기. 기본값은 하루 1회 |
| `DAILY_BRIEFING_ENABLED` | `true` | 텔레그램 일일 브리핑 자동 전송 여부 |
| `DAILY_BRIEFING_TIME` | `16:10` | 일일 브리핑 전송 기준 시각. 로컬 PC 시간 기준 |
| `DAILY_BRIEFING_CHECK_INTERVAL_SECONDS` | `60` | 브리핑 전송 여부를 확인하는 주기 |
| `DAILY_BRIEFING_WARNING_DISTANCE_PERCENT` | `5` | 알림 기준가까지 남은 거리가 이 값 이하이면 주의로 분류 |
| `DAILY_BRIEFING_TOP_LIMIT` | `5` | 브리핑에 표시할 위험도 상위 종목 수 |
| `BACKUP_RETENTION` | `30` | 보관할 백업 개수 |
| `DEFAULT_ALERT_COOLDOWN_MINUTES` | `30` | 반복 알림 기본 간격 |
| `QUOTE_TIMEOUT_MS` | `10000` | provider 조회 타임아웃 |
| `QUOTE_PROVIDERS` | `naver,stooq,alphavantage,yahoo` | 시세 provider 순서 |
| `DIVIDEND_PROVIDERS` | `publicdata,opendart,alphavantage,yahoo` | 배당 provider 순서 |
| `DATA_GO_KR_SERVICE_KEY` | 빈 값 | 공공데이터포털 주식배당정보 API 키 |
| `OPENDART_API_KEY` | 빈 값 | OpenDART API 키 |
| `ALPHA_VANTAGE_API_KEY` | 빈 값 | Alpha Vantage API 키 |
| `TELEGRAM_BOT_TOKEN` | 빈 값 | 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 빈 값 | 알림을 받을 텔레그램 채팅 ID |

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

웹 화면에서 할 수 있는 일:

- 종목 등록
- 기준 미리 확인
- 감시 종목 조회
- 수동 가격 테스트
- 알림 기준 편집
- 종목 일시 중지/재개
- 최고가 재계산
- 종목 삭제
- 알림 기록 확인
- 배당 새로고침
- 데이터 백업 생성
- 백업 목록 확인
- 선택한 백업으로 복구
- 선택한 백업 삭제

종목 등록 흐름:

1. 종목 검색 또는 종목 코드 입력
2. 매수가, 보유 수량, 구매일 입력
3. 필요하면 주당 연 배당금, 배당 주기, 지급월 입력
4. 알림 기준과 반복 알림 주기 설정
5. `기준 미리 확인`으로 현재가, 최고가, 기준가, 예상 배당금 확인
6. 등록

주요 입력 필드:

| 필드 | 설명 |
|---|---|
| `종목 코드` | 예: `336260`, `33626L`, `005930`, `AAPL` |
| `표시 이름` | 예: `두산퓨얼셀` |
| `매수가` | 실제 매수가 |
| `보유 수량` | 선택 입력. 입력하면 평가금액과 평가손익을 계산 |
| `구매일` | 매수한 날짜. 구매일 이후 최고가 계산 기준 |
| `알림 기준` | 최고가 대비 하락률, 이익금 반납률, 매수가 대비 손절률, 직접 기준가 |
| `하락률/반납률/손절률 %` | 알림 기준이 비율일 때 사용 |
| `직접 기준가` | 알림 기준이 직접 기준가일 때 사용 |
| `반복 분` | 기준가 이하에 머무를 때 반복 알림 간격 |
| `주당 연 배당금` | 선택 입력. 예상 연 배당금과 배당수익률 계산 |
| `배당 주기` | 월배당, 분기배당, 반기배당, 연배당, 직접 입력 |
| `배당 지급월` | 예: `3,6,9,12`. 비우면 주기에 따른 기본 지급월 사용 |
| `메모` | 매수 이유, 목표가 등 |

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
- `stooq`: 미국 종목 조회
- `alphavantage`: Alpha Vantage API 키가 있을 때 사용
- `yahoo`: 마지막 fallback

화면에 표시하는 시세 출처 구분:

| provider | 화면 표시 | 데이터 성격 | 시장 구분 | 비고 |
|---|---|---|---|---|
| `naver` | Naver Finance | 실시간 추정 | KRX 추정 | 무료/비공식 경로. NXT 분리 가격은 보장하지 않음 |
| `stooq` | Stooq | 지연 또는 일봉 | 미국 | 무료 공개 데이터 |
| `alphavantage` | Alpha Vantage | 지연 | 미국 | API 키가 있을 때 사용 |
| `yahoo` | Yahoo Finance | 지연 또는 일봉 | 미국 | fallback |
| `manual` | 수동 테스트 | 수동 | 수동 | 가격 테스트 입력값 |

종목 등록 시 `매수가`와 `구매일`을 입력하면 앱은 구매일부터 오늘까지의 일봉 데이터를 조회해서 아래 둘 중 큰 값을 `구매일 이후 최고가`로 저장합니다.

- 구매일 이후 일봉 고가 중 최고값
- 사용자가 입력한 매수가

이후 주기적으로 현재가를 확인하면서 현재가가 기존 최고가보다 높으면 최고가를 새로 갱신합니다.

`이익금 반납률` 기준은 최고가 전체가 아니라 최고가에서 매수가를 뺀 이익금만 기준으로 계산합니다.

```text
기준가 = 최고가 - ((최고가 - 매수가) * 반납률 / 100)
```

예를 들어 매수가가 10,000원, 구매일 이후 최고가가 15,000원, 반납률이 10%이면 기준가는 14,500원입니다. 아직 최고가가 매수가보다 높아진 적이 없으면 이익금이 없으므로 이 기준은 알림을 보내지 않습니다.

현재 일봉 provider:

- 한국 종목: Naver 일봉 차트
- 미국 종목: Stooq 일봉 CSV, Yahoo chart fallback

일봉 조회가 실패해도 종목은 등록됩니다. 이 경우 화면의 상태와 오류 메시지로 실패 이유를 확인하고 `최고가 재계산`을 눌러 다시 시도할 수 있습니다.

현재 MVP는 무료/공개 시세 조회 경로를 사용합니다. 종목 카드와 `기준 미리 확인` 화면에는 provider 이름, 실시간/지연/일봉 여부, KRX 추정/미국/수동 같은 시장 구분, provider가 내려준 시세 시각을 함께 표시합니다. 실제 운영 서비스로 확장할 때는 약관과 안정성을 확인한 유료 또는 공식 시세 API로 교체하는 것이 좋습니다.

웹 대시보드의 `시세 provider 진단` 영역에서는 provider별 누적 성공 횟수, 실패 횟수, 실패율, 스킵 횟수, 평균 응답 시간, 마지막 실패 사유를 확인할 수 있습니다. 이 값은 자동 확인, 즉시 확인, 기준 미리 확인에서 실제 provider 호출이 일어날 때 `data/store.json`의 meta 영역에 저장됩니다.

### NXT 시세 검토 현황

2026-05-13 기준으로 NXT 전용 공개 REST API는 확인하지 못했습니다. 현재 한국 종목 시세는 `naver` provider 기준이며, 화면에는 `KRX 추정`으로 표시합니다. KRX와 NXT 가격을 분리해서 보장하는 공식 provider가 아닙니다.

NXT 공식 웹사이트에는 시장 개요와 거래현황 화면이 있지만, 화면 scraping 방식은 안정성과 약관 리스크가 있어 구현하지 않습니다. NXT 분리 시세는 공식 또는 계약 기반 API가 확인된 뒤 provider를 추가하는 방향으로 보류합니다.

상세 검토 내용은 [NXT 시세 API 검토](docs/nxt-market-data-review.md)에 정리했습니다.

### 공식/유료 시세 API 검토 현황

2026-05-14 기준으로 KRX Open API, 공공데이터포털 주식시세정보, 한국투자증권 Open API, 키움 REST API, 코스콤 오픈API플랫폼, ICE NexTrade ATS를 비교했습니다.

결론은 당장 provider를 교체하지 않고, 먼저 현재 무료 provider의 실패율과 실패 사유를 기록하는 것입니다. 공공데이터포털과 KRX Open API는 공식 일봉/기준일 데이터 보강에는 유용하지만, 장중 60초 매도 알림용 실시간 시세 provider로는 부족합니다. 실시간 안정성이 필요해지면 한국투자증권/키움 같은 증권사 API를 개인 로컬용 후보로 검토하고, NXT 분리 시세는 코스콤/ICE 같은 계약형 데이터 확인 뒤 진행합니다.

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
- 배당 주기와 지급월 기반 1회 예상 배당금 계산
- 포트폴리오 요약에서 월별 예상 배당 현금흐름 표시
- 감시 종목 카드와 전체 포트폴리오 요약에 배당 정보 표시
- 공공데이터포털, OpenDART, Alpha Vantage, Yahoo provider 체인으로 배당 데이터 자동 보조 갱신
- provider별 성공/실패 사유와 적용된 배당금 출처를 웹 대시보드에 표시
- 국내 종목 배당 조회 시 종목코드, 회사명, 공백/보통주 표기 차이 보정
- provider가 제공하는 배당락일, 지급일, 최근 1주 배당금을 종목 카드에 표시
- 배당금, 최근 1주 배당, 배당락일, 지급일이 바뀌면 최근 변경 내역 저장
- 웹앱 `배당 새로고침` 버튼으로 즉시 수동 갱신
- 텔레그램 `/edit <종목코드> dividend <주당연배당금>` 수정 지원
- 텔레그램 `/edit <종목코드> dividendfreq <주기>`와 `/edit <종목코드> dividendmonths <월목록>` 수정 지원

## 위험도 순위와 일일 브리핑

웹 대시보드는 종목별 알림 기준가와 현재가의 거리를 계산해서 위험도순으로 정렬합니다.

위험도 기준:

- `알림`: 현재가가 기준가 이하이거나 알림 상태가 이미 진입됨
- `주의`: 기준가까지 남은 거리가 `DAILY_BRIEFING_WARNING_DISTANCE_PERCENT` 이하
- `정상`: 아직 기준가까지 여유가 있음
- `조회 실패`: 최근 시세 조회가 실패함
- `확인 전`: 아직 현재가나 기준가 계산이 부족함
- `비활성`: 감시 중지 상태

텔레그램 브리핑:

- 기본값은 매일 `16:10`에 1회 전송입니다.
- 서버가 꺼져 있으면 전송되지 않습니다.
- 같은 날짜에는 자동 브리핑을 중복 전송하지 않습니다.
- 웹앱의 `브리핑 전송` 버튼이나 텔레그램 `/brief` 명령으로 즉시 확인할 수 있습니다.
- 브리핑에는 위험도 상위 종목, 알림/주의/오류 개수, 보유 수량이 있는 경우 포트폴리오 평가손익과 예상 연 배당금이 포함됩니다.

배당 자동 갱신 설정:

```text
DIVIDEND_REFRESH_INTERVAL_SECONDS=86400
DIVIDEND_PROVIDERS=publicdata,opendart,alphavantage,yahoo
DATA_GO_KR_SERVICE_KEY=
OPENDART_API_KEY=
ALPHA_VANTAGE_API_KEY=
```

현재 배당금은 설정된 provider 순서대로 하루 1회 보조 갱신합니다. 국내 종목은 공공데이터포털과 OpenDART를 먼저 사용하고, 해외 종목은 Alpha Vantage를 먼저 사용한 뒤 Yahoo를 fallback으로 사용합니다.

API 조회가 실패해도 기존에 수동 입력한 주당 연 배당금은 지우지 않습니다. 배당 주기와 지급월은 종목별 차이가 커서 여전히 수동 입력을 기준으로 계산합니다.

공공데이터포털 키 확인:

- 공공데이터포털에서 `금융위원회_주식배당정보` 활용 신청이 승인되어야 합니다.
- `DATA_GO_KR_SERVICE_KEY`에는 Encoding 키 또는 Decoding 키를 넣을 수 있습니다.
- 키를 새로 넣거나 바꾼 뒤에는 서버를 재시작해야 합니다.
- 국내 종목은 종목코드와 회사명 후보를 함께 사용해 `두산퓨얼셀`, `두산 퓨얼셀`, `두산퓨얼셀보통주` 같은 표기 차이를 보정합니다.
- 공공데이터 응답이 실패하면 OpenDART, Alpha Vantage, Yahoo 순서로 fallback을 시도합니다.

추가 개발 후보:

- 배당락일 전후 알림
- 배당 성장률 표시
- 배당 캘린더 고도화

## 텔레그램 명령어

서버가 켜져 있으면 봇에게 아래 명령어를 보낼 수 있습니다.

| 명령어 | 설명 |
|---|---|
| `/help` | 명령어 도움말 |
| `/list` | 감시 종목 목록 |
| `/brief` | 위험도 순위와 일일 브리핑 |
| `/check` | 즉시 전체 종목 가격 확인 |
| `/pause <종목코드>` | 감시 중지 |
| `/resume <종목코드>` | 감시 재개 |
| `/edit <종목코드> <항목> <값>` | 알림 조건과 종목 정보 수정 |
| `/delete <종목코드>` | 종목 삭제 |
| `/backup` | 현재 데이터 수동 백업 |
| `/backups` | 최근 백업 목록 |
| `/restore <번호 또는 파일명>` | 백업 복구 |
| `/delete-backup <번호 또는 파일명>` | 백업 삭제 |

종목 등록 예시:

```text
/add 336260 두산퓨얼셀 88779 2026-05-11 high 10
/add 336260 두산퓨얼셀 88779 2026-05-11 profit 10
/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5
/add 336260 두산퓨얼셀 88779 2026-05-11 target 93000
```

등록 명령어 형식:

```text
/add <종목코드> <표시이름> <매수가> <구매일> <기준> <값>
```

기준 값:

- `high`: 구매일 이후 최고가 대비 하락률
- `profit`: 구매일 이후 최고 이익금 반납률
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
- `notes`: 메모 변경

백업 복구 예시:

```text
/backups
/restore 1
/restore store-20260511-082342-355-server-start-c6b8dcd7.json
/delete-backup 1
```

`/restore 1`은 `/backups` 목록의 1번 백업으로 복구합니다. 복구 전에는 현재 데이터가 `before-restore` 백업으로 자동 저장됩니다.

`/delete-backup 1`은 `/backups` 목록의 1번 백업 파일만 삭제합니다. 현재 감시 종목 데이터에는 영향이 없지만, 삭제한 백업 파일은 되돌릴 수 없습니다.

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
- 매수가, 보유 수량, 주당 연 배당금, 배당 주기, 배당 지급월, 구매일
- 최고가
- 알림 기준
- 알림 상태
- 텔레그램 update offset
- 알림 기록

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

웹 대시보드의 `데이터 백업` 영역에서 할 수 있는 일:

- `백업 생성`: 현재 `data/store.json`을 백업 파일로 저장
- `새로고침`: 최근 백업 목록 다시 조회
- `복구`: 선택한 백업으로 데이터 복구
- `삭제`: 선택한 백업 파일 삭제

복구를 실행하면 현재 데이터가 먼저 `before-restore` 백업으로 저장된 뒤 선택한 백업이 적용됩니다.
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
| `GET /api/mobile/me` | 내 익명 기기 정보 확인 |
| `POST /api/mobile/push-token` | Expo/FCM/APNs 푸시 토큰 저장 |
| `GET /api/mobile/stocks` | 내 기기의 종목과 알림 목록 조회 |
| `POST /api/mobile/stocks` | 내 기기에 종목 등록 |
| `PATCH /api/mobile/stocks/<stockId>` | 내 기기의 종목 수정 |
| `DELETE /api/mobile/stocks/<stockId>` | 내 기기의 종목 삭제 |

다른 기기의 `stockId`를 알아도 `deviceSecret`이 맞지 않으면 수정/삭제할 수 없습니다. 현재는 JSON 저장소 기반으로 동작하지만, 이 구조는 나중에 Postgres의 `devices`, `stocks`, `alerts`, `push_tokens` 테이블로 옮기기 쉽도록 맞춰둔 단계입니다.

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
- 구매일 이후 최고가 계산
- 알림 상태 진입/회복
- 텔레그램 명령어 파싱
- 백업 생성/목록/복구/삭제
- 서버 실행 정보 파일
- 로컬/휴대폰 접속 주소 계산
- 접속 주소 QR 코드 생성
- 시세 provider 파싱
- 배당 provider 파싱
- 배당 자동 갱신
- 종목 검색
- 모바일 익명 기기 API 저장소

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
- 잠시 뒤 `즉시 확인` 또는 `/check` 재시도

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

최근 완료:

- 배당 API provider별 성공/실패 진단 화면과 상세 로그
- 공공데이터포털/OpenDART 국내 종목 매칭 보정
- 위험도 순위와 일일 브리핑 알림
- 배당락일, 지급일, 배당 변경 내역 표시
- NXT 시세 API 가능성 검토 문서화
- 이익금 반납률 기준 매도 알림
- 공식/유료 시세 API 후보 검토
- 시세 provider 실패율 기록과 진단 화면
- 백업 삭제 기능
- 시세 출처, 데이터 성격, 시장 구분, 시세 시각 표시

우선순위가 높은 순서:

1. 공식 일봉 provider 실험 또는 설계
2. 개발 WBS/일정의 웹 대시보드 표시
3. 배당 캘린더 고도화
4. Postgres 저장소 설계와 JSON 데이터 이전 준비
5. Expo 모바일 앱 초기 프로젝트 생성
6. App Store / Play Store 출시 준비
