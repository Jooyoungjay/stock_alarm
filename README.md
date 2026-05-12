# Stock Alarm

Stock Alarm은 매수한 종목의 가격을 주기적으로 확인하고, 사용자가 정한 매도 기준에 도달하면 텔레그램으로 반복 알림을 보내는 MVP입니다.

현재 단계는 **로컬 웹앱 + 텔레그램 봇 기반 MVP**입니다. 나중에 App Store와 Play Store 앱으로 확장하는 것을 목표로 합니다.

## 오늘까지 구현된 기능

- 웹 대시보드에서 단계형 종목 등록, 편집, 중지, 삭제
- 감시 종목 요약, 위험도 필터, 정렬
- 보유 수량 기반 총 매수금액, 현재 평가금액, 평가손익, 수익률 표시
- 주당 연 배당금 수동 입력 기반 예상 연 배당금, 배당수익률 표시
- 배당 주기와 지급월 기반 월별 예상 배당 현금흐름 표시
- 브라우저에서 앱처럼 실행할 수 있는 PWA 기본 설정
- 더블클릭으로 로컬 서버 시작, 휴대폰 테스트, 상태 확인, 안전 종료
- 웹앱 안에서 서버 상태, 접속 주소, 휴대폰 QR 코드 확인
- 종목명/종목코드 자동완성
- 구매일 이후 최고가 자동 계산
- 이후 새 최고가 자동 추적
- 알림 기준 3종 지원
- 기준가 이하 진입/회복 상태 추적
- 반복 알림 회차 기록
- 텔레그램 알림 전송
- 텔레그램 명령어로 종목 관리
- 서버 시작과 종목 변경 시 자동 백업
- 웹 대시보드와 텔레그램 명령어로 수동 백업/복구
- 계정 없는 모바일 앱용 익명 기기 API 기초
- 기기별 종목 격리와 푸시 토큰 저장
- 로컬 JSON 파일 기반 데이터 저장
- 외부 패키지 없이 실행 가능한 Node.js 서버

지원하는 알림 기준:

- `최고가 대비 하락률`: 구매일 이후 최고가에서 몇 % 하락하면 알림
- `매수가 대비 손절률`: 매수가에서 몇 % 하락하면 알림
- `직접 기준가`: 사용자가 입력한 가격 이하가 되면 알림

## 프로젝트 구조

```text
stock_alarm/
├─ public/                 # 로컬 웹앱 HTML/CSS/JS/PWA 파일
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  └─ icons/
├─ src/
│  ├─ server.js            # HTTP 서버와 API
│  ├─ alertEngine.js       # 알림 기준 계산, 상태 추적, 알림 전송 흐름
│  ├─ priceProvider.js     # Naver/Stooq/Alpha Vantage/Yahoo 시세 조회
│  ├─ storage.js           # 로컬 JSON 저장소
│  ├─ telegram.js          # 텔레그램 API 호출
│  ├─ telegramCommands.js  # 텔레그램 명령어 처리
│  ├─ backups.js           # 데이터 백업/복구
│  ├─ accessUrls.js        # 로컬/휴대폰 접속 주소 계산
│  ├─ qrCode.js            # 접속 주소 QR 코드 생성
│  ├─ runtimeInfo.js       # 실행 중 서버 식별 정보
│  └─ symbols.js           # 종목 검색/정규화
├─ scripts/
│  ├─ local-server.js      # 로컬 서버 시작/상태 확인 스크립트
│  ├─ stop-server.js       # 안전 종료 스크립트
│  └─ check-railway-config.js # Railway 환경 점검
├─ docs/
│  └─ railway-deploy.md    # Railway 배포 가이드
├─ tests/                  # Node.js 테스트
├─ data/                   # 로컬 실행 데이터, Git 제외
│  ├─ store.json           # 실제 앱 데이터
│  ├─ server.json          # 실행 중 서버 PID/포트 정보
│  └─ backups/             # 자동/수동 백업 파일
├─ .env.example            # 환경변수 예시
├─ .env.railway.example    # Railway 환경변수 예시
├─ railway.json            # Railway Config as Code
├─ start-local.bat         # PC 전용 로컬 서버 시작
├─ start-phone.bat         # 같은 Wi-Fi 휴대폰 테스트용 서버 시작
├─ status-local.bat        # 실행 상태와 접속 주소 확인
├─ stop-local.bat          # 안전 종료
├─ package.json
└─ README.md
```

## 사전 준비

필수:

- Node.js 20 이상
- Git
- 텔레그램 계정
- BotFather로 만든 텔레그램 봇

버전 확인:

```powershell
node -v
git --version
```

이 프로젝트는 현재 외부 npm 패키지를 사용하지 않습니다. `npm install` 없이 바로 실행할 수 있습니다.

## 처음 서버 구축하기

처음 받는 개발자는 아래 순서대로 진행하면 됩니다.

```powershell
git clone https://github.com/Jooyoungjay/stock_alarm.git
cd stock_alarm
Copy-Item .env.example .env
```

이미 프로젝트 폴더가 있다면:

```powershell
cd "C:\My Web Sites\stock_alarm"
```

환경변수 파일을 열어서 수정합니다.

```powershell
notepad .env
```

최소 필수 값:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

전체 설정 예시:

```text
HOST=127.0.0.1
PORT=3000
DATA_DIR=
POLL_INTERVAL_SECONDS=60
TELEGRAM_COMMAND_POLL_SECONDS=5
BACKUP_RETENTION=30
DEFAULT_ALERT_COOLDOWN_MINUTES=30
QUOTE_TIMEOUT_MS=10000
QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
ALPHA_VANTAGE_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

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

주의:

- 봇 토큰은 비밀번호처럼 취급해야 합니다.
- `.env`는 GitHub에 올라가지 않도록 `.gitignore`에 포함되어 있습니다.
- 서버는 `.env`에 저장된 `TELEGRAM_CHAT_ID`의 채팅만 명령어로 처리합니다.

## 서버 실행

가장 쉬운 실행 방법은 프로젝트 폴더에서 아래 파일을 더블클릭하는 것입니다.

```text
start-local.bat
```

실행 후 `status-local.bat`을 더블클릭하면 현재 실행 상태, PC 접속 주소, 로그 위치를 확인할 수 있습니다.

같은 Wi-Fi에 있는 휴대폰에서 웹앱을 테스트하려면 아래 파일로 시작합니다.

```text
start-phone.bat
```

이 모드는 서버를 `HOST=0.0.0.0`으로 실행해서 같은 네트워크의 휴대폰 접속을 허용합니다. Windows 방화벽이 Node.js 접근 허용을 물어보면 개발 테스트를 위해 허용해야 합니다.

명령어로 실행하려면:

```powershell
node scripts/local-server.js start
node scripts/local-server.js start-lan
node scripts/local-server.js status
```

가장 단순한 실행:

```powershell
node src/server.js
```

npm 스크립트로 실행:

```powershell
npm start
```

개발용 실행:

```powershell
npm run dev
```

실행되면 터미널에 아래처럼 표시됩니다.

```text
Stock Alarm is running at http://127.0.0.1:3000
Runtime info: C:\My Web Sites\stock_alarm\data\server.json
Polling every 60 seconds
```

브라우저에서 표시된 주소를 엽니다.

```text
http://127.0.0.1:3000
```

3000 포트가 이미 사용 중이면 서버가 자동으로 3001, 3002처럼 다음 포트에서 실행됩니다. 반드시 터미널 로그에 표시된 주소를 기준으로 접속하세요.

## 로컬 웹앱으로 사용하기

현재 앱은 별도 앱스토어 설치 없이 브라우저에서 앱처럼 사용할 수 있는 PWA 기본 설정을 포함합니다.

PC에서 사용할 때:

```text
http://127.0.0.1:3000
```

Chrome 또는 Edge에서 주소창의 설치 아이콘이 보이면 설치해서 독립 창처럼 실행할 수 있습니다. 설치 아이콘이 보이지 않아도 브라우저 탭에서 모든 기능을 사용할 수 있습니다.

웹앱의 `서버 상태` 영역에서 확인할 수 있는 내용:

- 서버 정상 실행 여부
- PC 접속 주소
- 같은 Wi-Fi 휴대폰 접속 주소
- 휴대폰 접속용 QR 코드
- 텔레그램 연결 여부
- 마지막 시세 확인 시간
- 마지막 텔레그램 명령 확인 시간

종목 등록은 아래 흐름으로 진행됩니다.

1. 종목 검색/선택
2. 매수가, 보유 수량, 주당 연 배당금, 배당 주기, 지급월, 구매일 입력
3. 알림 기준과 반복 알림 주기 설정
4. 등록 전 요약과 기준 미리 확인

같은 Wi-Fi의 휴대폰에서 테스트하려면 `.env`의 `HOST`를 임시로 아래처럼 바꿉니다.

```text
HOST=0.0.0.0
PORT=3000
```

또는 `.env`를 바꾸지 않고 `start-phone.bat`으로 실행합니다.

그다음 PC의 내부 IP를 확인합니다.

```powershell
ipconfig
```

휴대폰 브라우저에서 아래 형식으로 접속합니다.

```text
http://<PC의 IPv4 주소>:3000
```

예시:

```text
http://192.168.0.15:3000
```

주의:

- 휴대폰과 PC가 같은 Wi-Fi에 있어야 합니다.
- Windows 방화벽이 Node.js 접근 허용을 물어볼 수 있습니다.
- 로컬 네트워크 접속은 개발용으로만 사용하세요.
- 휴대폰에서 홈 화면 설치까지 완전하게 테스트하려면 HTTPS가 필요할 수 있습니다. 배포 전에는 브라우저 접속 테스트를 우선합니다.

## Railway 배포 준비

Railway 배포용 설정 파일은 루트의 `railway.json`입니다.

```text
Start Command: node src/server.js
Healthcheck Path: /api/health
Restart Policy: ON_FAILURE
```

Railway 서비스 Variables에는 최소 아래 값을 설정합니다.

```text
HOST=0.0.0.0
DATA_DIR=/app/data
POLL_INTERVAL_SECONDS=60
TELEGRAM_COMMAND_POLL_SECONDS=5
BACKUP_RETENTION=30
DEFAULT_ALERT_COOLDOWN_MINUTES=30
QUOTE_TIMEOUT_MS=10000
QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`PORT`는 Railway가 자동으로 넣으므로 직접 설정하지 않습니다.

현재 앱은 JSON 파일 저장소를 사용하므로 Railway에서 Volume이 필요합니다.

```text
Volume Mount Path: /app/data
DATA_DIR=/app/data
```

로컬에서 배포 전 설정 점검:

```powershell
$env:RAILWAY_ENVIRONMENT='production'
$env:HOST='0.0.0.0'
$env:PORT='3000'
$env:DATA_DIR='/app/data'
node scripts/check-railway-config.js
```

자세한 절차는 [Railway 배포 가이드](docs/railway-deploy.md)를 확인하세요.

## 서버 종료

가장 쉬운 종료 방법은 프로젝트 폴더에서 아래 파일을 더블클릭하는 것입니다.

```text
stop-local.bat
```

현재 실행 여부와 접속 주소만 확인하려면:

```text
status-local.bat
```

터미널에서 직접 실행 중이면:

```text
Ctrl + C
```

백그라운드로 실행한 서버를 종료해야 한다면 아래 명령을 사용합니다.

```powershell
npm run stop
```

`npm` 명령이 PATH에 없다면 같은 종료 로직을 직접 실행할 수 있습니다.

```powershell
node scripts/stop-server.js
```

이 명령은 `data/server.json`과 `/api/health` 응답을 비교해서 아래 값이 모두 맞을 때만 종료합니다.

- 앱 이름: `stock_alarm`
- PID
- 포트
- 서버 시작 시각
- 프로젝트 경로

즉, 회사 PC에서 다른 서비스가 같은 포트나 Node 프로세스를 사용 중이어도 Stock Alarm으로 확인되지 않으면 종료하지 않습니다.

수동 확인이 필요하면 먼저 포트를 확인합니다.

```powershell
netstat -ano | Select-String -Pattern ':3001'
```

출력 끝의 PID를 확인한 뒤 종료합니다.

```powershell
Stop-Process -Id <PID> -Force
```

예시:

```powershell
Stop-Process -Id 12345 -Force
```

`Stop-Process`는 마지막 수단으로만 사용하세요. 포트와 PID만 보고 종료하면 다른 업무용 서버를 잘못 종료할 수 있습니다.

실행 중인 Node 프로세스 목록만 보고 싶다면:

```powershell
Get-Process node
```

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
- 데이터 백업 생성
- 백업 목록 확인
- 선택한 백업으로 복구

종목 등록 필드:

- `종목 코드`: 예: `336260`, `005930`, `AAPL`
- `표시 이름`: 예: `두산퓨얼셀`
- `매수가`: 실제 매수가
- `보유 수량`: 보유 주식 수. 선택 입력이며 입력하면 평가손익을 계산합니다.
- `주당 연 배당금`: 1주당 1년에 받을 것으로 예상되는 배당금입니다. 선택 입력이며 입력하면 예상 연 배당금과 배당수익률을 계산합니다.
- `배당 주기`: 월배당, 분기배당, 반기배당, 연배당, 직접 입력 중 선택합니다.
- `배당 지급월`: 직접 지정할 지급월입니다. 예: `3,6,9,12`. 비워두면 주기에 따라 기본 지급월을 사용합니다.
- `구매일`: 매수한 날짜
- `알림 기준`: 최고가 대비 하락률, 매수가 대비 손절률, 직접 기준가
- `하락률/손절률 %` 또는 `직접 기준가`
- `반복 분`: 알림 반복 간격
- `메모`: 매수 이유, 목표가 등

`기준 미리 확인`을 누르면 현재가, 구매일 이후 최고가, 알림 기준가, 현재 하락률, 보유 수량 기준 평가손익, 예상 연 배당금, 1회 예상 배당금을 저장 전에 확인할 수 있습니다.

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

## 텔레그램 명령어

서버가 켜져 있으면 봇에게 아래 명령어를 보낼 수 있습니다.

| 명령어 | 설명 |
|---|---|
| `/help` | 명령어 도움말 |
| `/list` | 감시 종목 목록 |
| `/check` | 즉시 전체 종목 가격 확인 |
| `/pause <종목코드>` | 감시 중지 |
| `/resume <종목코드>` | 감시 재개 |
| `/edit <종목코드> <항목> <값>` | 알림 조건과 종목 정보 수정 |
| `/delete <종목코드>` | 종목 삭제 |
| `/backup` | 현재 데이터 수동 백업 |
| `/backups` | 최근 백업 목록 |
| `/restore <번호 또는 파일명>` | 백업 복구 |

종목 등록 예시:

```text
/add 336260 두산퓨얼셀 88779 2026-05-11 high 10
/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5
/add 336260 두산퓨얼셀 88779 2026-05-11 target 93000
```

등록 명령어 형식:

```text
/add <종목코드> <표시이름> <매수가> <구매일> <기준> <값>
```

기준 값:

- `high`: 구매일 이후 최고가 대비 하락률
- `loss`: 매수가 대비 손절률
- `target`: 직접 기준가

종목 수정 예시:

```text
/edit 336260 high 8
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
```

`/restore 1`은 `/backups` 목록의 1번 백업으로 복구합니다. 복구 전에는 현재 데이터가 `before-restore` 백업으로 자동 저장됩니다.

## 시세 조회 방식

기본 provider 순서:

```text
naver,stooq,alphavantage,yahoo
```

역할:

- `naver`: 한국 6자리 종목코드, `.KS`, `.KQ` 조회
- `stooq`: 미국 종목 조회
- `alphavantage`: Alpha Vantage API 키가 있을 때 사용
- `yahoo`: 마지막 fallback

`.env`에서 provider 순서를 바꿀 수 있습니다.

```text
QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
```

Alpha Vantage를 사용하려면:

```text
ALPHA_VANTAGE_API_KEY=
```

현재 MVP는 무료/공개 시세 조회 경로를 사용합니다. 실제 운영 서비스로 확장할 때는 약관과 안정성을 확인한 유료 또는 공식 시세 API로 교체하는 것이 좋습니다.

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
```

한국 접미사도 허용됩니다.

```text
005930.KS
035720.KQ
```

코드와 이름을 같이 입력해도 6자리 코드가 자동 추출됩니다.

```text
336260 두산퓨얼셀
```

## 구매일 이후 최고가 기준

종목 등록 시 `매수가`와 `구매일`을 입력합니다.

앱은 구매일부터 오늘까지의 일봉 데이터를 조회해서 아래 둘 중 큰 값을 `구매일 이후 최고가`로 저장합니다.

- 구매일 이후 일봉 고가 중 최고값
- 사용자가 입력한 매수가

이후 주기적으로 현재가를 확인하면서 현재가가 기존 최고가보다 높으면 최고가를 새로 갱신합니다.

현재 일봉 provider:

- 한국 종목: Naver 일봉 차트
- 미국 종목: Stooq 일봉 CSV, Yahoo chart fallback

일봉 조회가 실패해도 종목은 등록됩니다. 이 경우 화면의 상태와 오류 메시지로 실패 이유를 확인하고 `최고가 재계산`을 눌러 다시 시도할 수 있습니다.

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

## 데이터 저장과 백업

실제 데이터는 아래 파일에 저장됩니다.

```text
data/store.json
```

현재 실행 중인 서버의 식별 정보는 아래 파일에 저장됩니다.

```text
data/server.json
```

`npm run stop`은 이 파일과 서버의 `/api/health` 응답을 비교해서 Stock Alarm 서버가 맞는지 검증한 뒤 종료합니다.

저장되는 정보:

- 익명 기기 ID
- 기기별 푸시 토큰
- 등록 종목
- 매수가/보유 수량/주당 연 배당금/배당 주기/배당 지급월/구매일
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

복구를 실행하면 현재 데이터가 먼저 `before-restore` 백업으로 저장된 뒤 선택한 백업이 적용됩니다.

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
- 백업 생성/목록/복구
- 서버 실행 정보 파일
- 로컬/휴대폰 접속 주소 계산
- 접속 주소 QR 코드 생성
- 시세 provider 파싱
- 종목 검색

## 배당주 기능

현재 구현된 배당주 기능:

- 주당 연 배당금 수동 입력
- 보유 수량 기반 예상 연 배당금 계산
- 총 매수금액 대비 배당수익률 계산
- 배당 주기와 지급월 기반 1회 예상 배당금 계산
- 포트폴리오 요약에서 월별 예상 배당 현금흐름 표시
- 감시 종목 카드와 전체 포트폴리오 요약에 배당 정보 표시
- 텔레그램 `/edit <종목코드> dividend <주당연배당금>` 수정 지원
- 텔레그램 `/edit <종목코드> dividendfreq <주기>`와 `/edit <종목코드> dividendmonths <월목록>` 수정 지원

추가 후보:

- 배당락일, 지급일 표시
- 배당락일 전후 알림
- 배당 성장률과 최근 배당 변경 내역 표시

현재 배당금과 지급월은 수동 입력 기반입니다. 배당락일, 지급일, 배당금 자동 업데이트는 안정적인 배당 데이터 소스가 필요합니다. 현재 무료 시세 provider만으로는 국내외 배당락일과 지급일을 안정적으로 보장하기 어렵기 때문에, 자동화는 별도 데이터 소스를 정한 뒤 개발하는 것이 좋습니다.

## 문제 해결

### 서버 주소가 안 열릴 때

터미널 로그에 표시된 주소를 확인하세요. 3000 포트가 사용 중이면 3001 이상으로 자동 변경됩니다.

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
- 한국 종목은 6자리 코드 사용
- 미국 종목은 `AAPL`, `TSLA`처럼 티커 사용
- 잠시 뒤 `즉시 확인` 또는 `/check` 재시도

### 백업 복구가 실패할 때

확인할 것:

- `/backups` 목록에 있는 번호 또는 파일명을 사용했는지
- 파일명이 `.json`으로 끝나는지
- `data/backups/` 안의 파일인지
- 직접 수정한 백업 파일의 JSON 구조가 올바른지

복구 명령은 경로 조작을 막기 위해 파일명만 허용합니다.

## 운영 시 주의사항

- PC가 꺼지면 서버도 멈춥니다.
- 실제 24시간 알림 서비스로 쓰려면 서버 배포가 필요합니다.
- 무료 시세 provider는 안정성과 약관 제한이 있을 수 있습니다.
- 텔레그램 봇 토큰은 절대 공개 저장소에 올리면 안 됩니다.
- 복구 전에 자동 안전 백업이 생기지만, 중요한 변경 전에는 `/backup`을 한 번 실행하는 것이 좋습니다.

## 다음 개발 후보

- Postgres 저장소 설계와 JSON -> DB 이전 준비
- Railway API/Worker 배포 설정
- Expo 모바일 앱 초기 프로젝트 생성
- App Store / Play Store 출시 준비
- 유료/공식 시세 API 연동
