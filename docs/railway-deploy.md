# Railway 배포 가이드

이 문서는 Stock Alarm을 Railway에 올려 24시간 실행하기 위한 최소 운영 절차입니다.

## 배포 구조

```text
Railway Web Service
├─ node src/server.js
├─ /api/health
├─ Telegram command polling
├─ scheduled stock checks
└─ Railway Volume: /app/data
```

현재 단계에서는 API 서버와 알림 워커가 같은 Node 프로세스에서 실행됩니다. 사용자가 늘어나면 API 서버와 Worker 서버를 분리하고 Postgres로 이전합니다.

## 포함된 설정

루트의 `railway.json`은 Railway Config as Code용 설정입니다.

```json
{
  "build": {
    "builder": "RAILPACK"
  },
  "deploy": {
    "startCommand": "node src/server.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Railway는 배포 시 `PORT` 환경변수를 주입합니다. 서버는 그 포트로 실행됩니다.

## Railway에서 필요한 환경변수

Railway 서비스 Variables에 아래 값을 등록합니다.

```text
HOST=0.0.0.0
DATA_DIR=/app/data
POLL_INTERVAL_SECONDS=60
TELEGRAM_COMMAND_POLL_SECONDS=5
DIVIDEND_REFRESH_INTERVAL_SECONDS=86400
DIVIDEND_EVENT_ALERT_ENABLED=true
DIVIDEND_EVENT_ALERT_CHECK_INTERVAL_SECONDS=3600
BACKUP_RETENTION=30
DEFAULT_ALERT_COOLDOWN_MINUTES=30
QUOTE_TIMEOUT_MS=10000
QUOTE_PROVIDERS=naver,stooq,alphavantage,yahoo
ALPHA_VANTAGE_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`PORT`는 Railway가 자동으로 넣으므로 직접 설정하지 않습니다.

## Volume 설정

현재 저장소는 `data/store.json` 파일 기반입니다. Railway에서 데이터가 재배포 후에도 유지되려면 Volume이 필요합니다.

Railway Volume 설정:

```text
Mount Path: /app/data
DATA_DIR=/app/data
```

Railway의 앱 작업 디렉터리가 `/app`이므로, 이 프로젝트의 `./data`를 보존하려면 `/app/data`에 Volume을 연결합니다.

## 배포 순서

1. Railway에서 새 Project를 만듭니다.
2. GitHub 저장소 `Jooyoungjay/stock_alarm`을 연결합니다.
3. 서비스 Variables에 `.env.railway.example` 기준 값을 입력합니다.
4. Volume을 생성하고 서비스에 연결합니다.
5. Volume Mount Path를 `/app/data`로 지정합니다.
6. 배포 후 `/api/health`가 200을 반환하는지 확인합니다.
7. Railway 로그에서 아래 내용을 확인합니다.

```text
Stock Alarm is running at http://0.0.0.0:<PORT>
Runtime info: /app/data/server.json
Polling every 60 seconds
```

## 배포 전 로컬 점검

Railway 환경과 비슷하게 실행하려면:

```powershell
$env:RAILWAY_ENVIRONMENT='production'
$env:HOST='0.0.0.0'
$env:PORT='3000'
$env:DATA_DIR='/app/data'
node scripts/check-railway-config.js
```

Railway에서는 서비스 변수 설정 후 아래 스크립트와 같은 기준으로 확인합니다.

```powershell
node scripts/check-railway-config.js
```

## 운영 주의

- 현재 JSON 저장소는 소규모 MVP용입니다.
- 여러 사용자가 늘어나면 Postgres 이전이 필요합니다.
- Railway Volume이 없으면 재배포/재시작 후 `data/store.json`이 보존되지 않을 수 있습니다.
- Volume이 붙은 서비스는 재배포 시 새 배포와 기존 배포가 동시에 같은 Volume을 마운트하지 못하므로 짧은 다운타임이 생길 수 있습니다.
- 장기 운영에서는 API 서버와 Worker 서버 분리를 권장합니다.

## 다음 단계

1. Postgres 테이블 설계
2. JSON 저장소와 Postgres 저장소 인터페이스 분리
3. API 서버와 Worker 프로세스 분리
4. Expo 앱에서 익명 기기 API 연동
