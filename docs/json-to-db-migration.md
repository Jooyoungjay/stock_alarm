# JSON -> DB 이전 설계

날짜 기준: 2026-05-15

## 목적

현재 Stock Alarm은 로컬 PC에서 `data/store.json`을 읽고 쓰는 MVP입니다. 이 구조는 설치와 백업이 단순하지만, 앱스토어/플레이스토어 출시 방향으로 가면 여러 기기, 푸시 토큰, 알림 이력, 배당 이력, 운영 진단 데이터를 안정적으로 다루기 어렵습니다.

이 문서는 지금 당장 DB를 도입한다는 의미가 아닙니다. 로컬 JSON 실행을 유지하면서, 나중에 Postgres로 이전할 때 데이터 손실 없이 옮기기 위한 기준입니다.

## 현재 기준

- 저장 엔진: 로컬 JSON
- 실제 파일: `data/store.json`
- 스키마 버전: `1`
- 데이터 모델 정의: `src/dataModel.js`
- 데이터 모델 확인 API: `GET /api/data-model`
- 저장소 계약: `src/storageContract.js`
- 저장소 생성: `src/storageFactory.js`
- 백업 위치: `data/backups/`
- 백업 방식: 저장소 스냅샷을 JSON 백업 파일로 export/import하는 공통 계약

현재 JSON 최상위 구조:

```json
{
  "devices": [],
  "stocks": [],
  "alerts": [],
  "meta": {
    "schemaVersion": 1,
    "createdAt": "2026-05-15T00:00:00.000Z",
    "updatedAt": "2026-05-15T00:00:00.000Z"
  }
}
```

## 이전 원칙

- 기존 로컬 실행은 계속 지원합니다.
- DB 이전 전에는 반드시 JSON 백업을 만듭니다.
- 이전은 멱등적으로 설계합니다. 같은 JSON을 다시 넣어도 중복 데이터가 생기면 안 됩니다.
- 앱 기능은 저장소 구현을 직접 알지 않아야 합니다. 서버와 알림 엔진은 공통 저장소 인터페이스만 사용합니다.
- 알림 기록과 배당 이력은 운영 분석에 필요하므로 가능한 한 보존합니다.
- 민감 정보는 평문 저장하지 않습니다. 기기 인증 secret은 현재처럼 해시만 저장합니다.

## 대상 DB

초기 대상은 Postgres입니다.

이유:

- Railway, Render, Supabase 등에서 표준적으로 지원합니다.
- JSONB 컬럼을 함께 사용할 수 있어 MVP에서 자주 변하는 provider 진단 데이터도 수용하기 쉽습니다.
- 앱 출시 이후 기기별 데이터 격리, 인덱스, 백업, 마이그레이션 관리가 쉽습니다.

## 테이블 설계 초안

| JSON 위치 | Postgres 테이블 | 주요 키 | 비고 |
|---|---|---|---|
| `devices[]` | `devices` | `id` | 익명 기기, 플랫폼, secret hash |
| `devices[].pushTokens[]` | `push_tokens` | `id` 또는 `(device_id, provider, token_hash)` | 토큰 원문 저장 여부는 푸시 provider 정책에 맞춰 결정 |
| `stocks[]` | `stocks` | `id` | 종목, 계좌 구분, 증권사/계좌명, 매수가, 보유 수량, 알림 조건, 시세 상태 |
| `stocks[].dividendHistory[]` | `dividend_events` | `id` | 배당금, 배당락일, 지급일 변경 이력 |
| `alerts[]` | `alerts` | `id` | 알림 전송 이력 |
| `meta.quoteProviderStats` | `quote_provider_attempts`, `quote_provider_stats` | `id`, `provider` | 원천 시도 로그와 집계 분리 |
| `meta.kisNaverCompareHistory[]` | `kis_naver_compare_history` | `id` | KIS/Naver 가격 비교와 이상치 판정 이력 |
| `meta.lastDividendRefresh` | `job_runs` | `id` | 배당 갱신 같은 백그라운드 작업 이력 |
| `meta.lastDailyBriefingDate` | `job_runs` 또는 `settings` | `key` | 일일 브리핑 중복 전송 방지 |

## 주요 컬럼 초안

### `devices`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | text primary key | 현재 익명 기기 ID 유지 |
| `label` | text | 사용자 지정 기기명 |
| `platform` | text | ios, android, web, unknown |
| `secret_hash` | text not null | 기기 인증 secret hash |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |
| `last_seen_at` | timestamptz |

### `stocks`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid primary key |
| `device_id` | text null references devices(id) |
| `account_type` | text not null | general, isa, pension, other |
| `account_name` | text not null | 증권사 또는 사용자가 붙인 계좌명. 미입력 시 빈 문자열 |
| `symbol` | text not null |
| `display_name` | text |
| `purchase_price` | numeric null |
| `quantity` | numeric null |
| `purchase_date` | date null |
| `kis_market_div_code` | text null | KIS 현재가 provider 사용 시 J, NX, UN 중 종목별 시장 기준 |
| `alert_type` | text not null |
| `threshold_percent` | numeric not null |
| `target_price` | numeric null |
| `active` | boolean not null |
| `high_price` | numeric null |
| `high_price_at` | timestamptz null |
| `last_price` | numeric null |
| `last_checked_at` | timestamptz null |
| `alert_state` | text not null |
| `currency` | text |
| `exchange` | text |
| `quote_provider` | text |
| `quote_metadata` | jsonb |
| `dividend_snapshot` | jsonb |
| `notes` | text |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

권장 제약:

- `(device_id, account_type, account_name, symbol)` unique
- `threshold_percent > 0 and threshold_percent < 100`
- `purchase_price is not null` when `alert_type` is `profit_retracement` or `purchase_loss`
- `target_price is not null` when `alert_type` is `target_price`

### `alerts`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid primary key |
| `device_id` | text null |
| `stock_id` | uuid null |
| `symbol` | text not null |
| `alert_type` | text |
| `price` | numeric null |
| `threshold_price` | numeric null |
| `metric_percent` | numeric null |
| `maximum_profit_amount` | numeric null |
| `current_profit_amount` | numeric null |
| `retraced_profit_amount` | numeric null |
| `retraced_profit_percent` | numeric null |
| `dividend_event_type` | text null |
| `dividend_event_date` | date null |
| `dividend_event_offset_days` | integer null |
| `expected_dividend_amount` | numeric null |
| `sent` | boolean |
| `message` | text |
| `created_at` | timestamptz |

## 저장소 인터페이스 목표

`JsonStore`와 `PostgresStore`는 `src/storageContract.js`의 같은 메서드를 제공해야 합니다. 서버는 저장소 구현을 직접 생성하지 않고 `src/storageFactory.js`를 통해 생성합니다.

현재 구현 상태:

- `src/storage.js`: 실제 실행 중인 로컬 JSON 저장소
- `src/postgresStore.js`: Postgres JSONB 스냅샷 테이블 기반 쿼리 어댑터
- `src/postgresMigrationDryRun.js`: JSON 스냅샷을 Postgres 테이블 후보 행으로 변환하고 건수/샘플/주의 사항을 검증하는 dry-run 로직
- `scripts/json-to-postgres-dry-run.js`: 로컬 `data/store.json` 또는 백업 JSON 파일을 대상으로 dry-run을 실행하는 CLI
- `scripts/postgres-connection-rehearsal.js`: 실제 `DATABASE_URL`에 리허설 전용 JSONB 테이블을 만들고 import/export 건수를 검증하는 CLI
- `tests/fixtures/postgres-migration/store.snapshot.json`: 실제 Postgres 연결 전 반복 검증용 표준 JSON 스냅샷
- `tests/fixtures/postgres-migration/expected-api.json`: `JsonStore` 핵심 API와 dry-run 테이블 변환의 기대 결과
- `tests/helpers/storageSnapshotContract.js`: 저장소별 스냅샷 export/import 계약을 검증하는 공통 테스트 헬퍼
- `tests/storageSnapshotContract.test.js`: JsonStore와 PostgresStore의 실제 스냅샷 round-trip 계약 검증
- `src/storageFactory.js`: 기본 실행은 `json`을 유지하고, `postgres` 일반 실행은 아직 보호 차단
- `DATABASE_URL`: 실제 Postgres 연결 문자열. 테스트는 fake query client를 사용하고, 운영 실험은 `pg` 설치 후 진행

PostgresStore는 `stock_alarm_store` JSONB 테이블에 저장소 스냅샷을 저장하는 실제 쿼리 어댑터입니다. 초기화 시 `CREATE SCHEMA`, `CREATE TABLE`, 기본 row 생성 쿼리를 실행하고, 읽기/쓰기는 `SELECT payload`, `INSERT ... ON CONFLICT DO UPDATE`로 처리합니다. 다만 로컬 기본 실행은 여전히 `STORAGE_ENGINE=json`이며, `STORAGE_ENGINE=postgres` 일반 서버 전환은 데이터 이전 리허설 전까지 보호 차단합니다.

초기 PostgresStore는 안정성을 위해 전체 저장소 스냅샷을 JSONB row로 저장합니다. 이 방식은 현재 `JsonStore` 계약, 백업/복구, 관리자 화면을 그대로 재사용하게 해 주며, 이후 필요할 때 dry-run에서 정의한 `devices`, `stocks`, `alerts` 관계형 테이블로 확장할 수 있습니다.

Postgres 연결 리허설 CLI:

```bash
npm run migrate:postgres:rehearsal
npm run migrate:postgres:rehearsal -- --store data/backups/store-YYYYMMDD-HHMMSS-manual.json
npm run migrate:postgres:rehearsal -- --json
```

리허설은 기본적으로 `stock_alarm_store_rehearsal` 테이블을 사용합니다. 운영용 `stock_alarm_store` 테이블은 명시 옵션 없이는 사용할 수 없게 막아두었습니다.

dry-run 실행:

```bash
npm run migrate:postgres:dry-run
```

백업 파일을 직접 확인할 때:

```bash
npm run migrate:postgres:dry-run -- --store data/backups/store-YYYYMMDD-HHMMSS-manual.json
```

JSON으로 상세 결과를 받을 때:

```bash
npm run migrate:postgres:dry-run -- --json --samples 5
```

dry-run은 다음 테이블 후보 행을 만듭니다.

- `devices`
- `push_tokens`
- `stocks`
- `dividend_events`
- `alerts`
- `quote_provider_stats`
- `quote_provider_attempts`
- `kis_naver_compare_history`
- `job_runs`
- `settings`

푸시 토큰은 원문을 내보내지 않고 SHA-256 해시만 샘플에 포함합니다. 삭제된 종목의 과거 알림처럼 현재 `stocks[]`에 없는 `stock_id`가 발견되면 주의 사항으로 표시하지만, 실제 DB 연결이나 쓰기는 수행하지 않습니다.

통합 테스트 데이터셋:

- 기기 2개, 푸시 토큰 2개, 종목 2개, 알림 2개, 배당 변경 이력 1개를 포함합니다.
- 국내 배당주, 미국 종목, 활성/중지 종목, 이익금 반납률, 직접 기준가 알림을 함께 포함합니다.
- 삭제된 종목을 가리키는 과거 알림 1건을 포함해 `stock_id` 정합성 경고를 고정합니다.
- `tests/postgresMigrationDataset.test.js`에서 `JsonStore`의 `listStocks`, `listAlerts`, `getDataModelInfo` 결과와 dry-run 테이블 행을 함께 검증합니다.

스냅샷 계약 검증:

- 실행 가능한 저장소는 `importBackupSnapshot -> exportBackupSnapshot -> importBackupSnapshot` round-trip을 통과해야 합니다.
- `JsonStore`는 표준 fixture를 가져온 뒤 종목, 알림, 데이터 모델 건수가 유지되는지 검증합니다.
- `PostgresStore`는 fake query client 기반 테스트에서 같은 스냅샷 계약을 통과해야 합니다.
- 실제 `DATABASE_URL`을 연결하기 전에도 같은 헬퍼로 JSON 저장소와 동일한 백업/복구 계약을 검증합니다.

필수 메서드:

- `read()`
- `write(data)`
- `getDataModelInfo()`
- `createDevice(input)`
- `authenticateDevice(deviceId, deviceSecret)`
- `upsertDevicePushToken(deviceId, input)`
- `listStocks(options)`
- `addStock(input)`
- `updateStock(id, patch, options)`
- `replaceStock(stock)`
- `deleteStock(id, options)`
- `listAlerts(limit, options)`
- `appendAlert(alert)`
- `getMetaValue(key, fallback)`
- `setMetaValue(key, value)`
- `getQuoteProviderStats()`
- `recordQuoteProviderAttempt(attempt)`
- `createBackup(reason)`
- `listBackups(options)`
- `restoreBackup(target, options)`
- `deleteBackup(target)`
- `exportBackupSnapshot()`
- `importBackupSnapshot(snapshot)`

백업/복구 계약:

- 서버와 텔레그램 명령은 `store.createBackup`, `store.listBackups`, `store.restoreBackup`, `store.deleteBackup`만 호출합니다.
- `JsonStore`는 현재 데이터를 스냅샷으로 내보낸 뒤 `data/backups/`에 JSON 파일로 저장합니다.
- `PostgresStore`도 같은 스냅샷 구조를 export/import하므로 관리자 화면, 텔레그램 명령, 안전 백업 흐름을 바꾸지 않고 사용할 수 있습니다.
- 복구 전에는 현재 저장소 상태를 `before-restore` 백업으로 먼저 남깁니다.

## 이전 절차

1. 서버를 안전 종료합니다.
2. `data/store.json` 백업을 만듭니다.
3. JSON 구조를 `src/dataModel.js` 기준으로 정규화합니다.
4. Postgres에 기본 테이블을 생성합니다.
5. `devices`를 먼저 넣습니다.
6. `push_tokens`를 넣습니다.
7. `stocks`를 넣습니다.
8. `dividend_events`를 넣습니다.
9. `alerts`를 넣습니다.
10. `meta` 기반 운영 정보를 `settings`, `job_runs`, provider 통계, KIS/Naver 비교 이력 테이블로 옮깁니다.
11. 건수 검증을 수행합니다.
12. 샘플 종목 1개로 API 응답을 비교합니다.
13. 문제가 없으면 서버 저장소 설정을 DB로 전환합니다.

## 검증 기준

이전 후 아래 값이 JSON과 DB에서 같아야 합니다.

- 전체 기기 수
- 전체 푸시 토큰 수
- 전체 종목 수
- 활성 종목 수
- 전체 알림 수
- 배당 변경 이력 수
- 종목별 `symbol`, `accountType`, `accountName`, `purchasePrice`, `quantity`, `alertType`, `thresholdPercent`
- 알림별 `symbol`, `alertType`, `createdAt`
- 마지막 시세 확인과 배당 갱신 상태

## 롤백 전략

- DB 전환 직전 저장소 스냅샷 백업을 보관합니다.
- DB 전환 후 장애가 있으면 `.env` 저장소 설정을 JSON으로 되돌립니다.
- 롤백 시 DB에 새로 쌓인 알림 이력은 별도 export 후 필요할 때 수동 병합합니다.
- 백업 복구는 기존 `data/backups/` 흐름을 유지하되, 저장소별 import 메서드를 통해 적용합니다.

## 사용자/관리자 화면 분리와의 관계

DB 이전은 화면 분리와 직접 연결됩니다. 사용자 화면은 종목 관리와 알림 확인에 집중하고, 관리자 화면은 저장소 상태, provider 진단, 백업, 로드맵, 서버 상태를 담당해야 합니다.

분리 기준:

- 사용자 화면: 종목 등록, 감시 종목, 알림 기록, 배당 캘린더, 포트폴리오 요약
- 관리자 화면: 서버 상태, 데이터 모델, provider 진단, 백업/복구/삭제, 개발 WBS, API 키/환경 점검

초기 로컬 MVP에서는 인증을 강하게 넣기보다 라우팅 분리부터 시작합니다. 앱 출시 단계에서는 관리자 화면에 로컬 PIN 또는 관리자 토큰을 적용합니다.

## 다음 구현 작업

1. 앱 제출 전 HTTPS 데모 서버 준비
