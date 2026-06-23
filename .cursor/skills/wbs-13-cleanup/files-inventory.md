# WBS 13 — file inventory

## Postgres (13.3 — 완료)

제거됨. 보관: `docs/archive/json-to-db-migration.md`

## Mobile / Expo Push (13.4 + 13.6 — 완료)

제거됨: `mobile/`, `/api/mobile/*`, `src/pushNotifications.js`, `MOBILE_PUSH_*`, `scripts/check-mobile-e2e.js`, `src/mobileE2eReadiness.js`, 관련 tests

보관: `docs/archive/mobile-app.json`, `docs/archive/mobile-real-device-e2e.md`, `docs/archive/store-listing.ko.json`

알림 경로는 텔레그램만 사용. `alertEngine.js`, `dividendEventAlerts.js`에서 Push 분기 제거 완료.

## Store / Railway / demo (13.5 — 완료)

제거됨: `check:demo`, `check:store-assets`, `check:railway`, `src/demoServerReadiness.js`, `src/storeSubmissionAssets.js`, 관련 scripts/tests

보관: `docs/archive/app-store-review-prep.md`, `docs/archive/https-demo-server.md`, `docs/archive/store-screenshots.md`, `docs/archive/store-submission-assets.md`, `docs/archive/privacy-policy-ko.md`, `docs/archive/railway-deploy.md`, `docs/archive/railway.json`, `docs/archive/.env.railway.example`

## package.json scripts removed

```text
migrate:postgres:*      # 13.3
mobile:*                # 13.4
check:mobile-e2e        # 13.4
check:demo              # 13.5
check:store-assets      # 13.5
check:railway           # 13.5
```

## Keep (core local operation)

자동 회귀: `npm test` **247개** 통과 (`docs/full-regression-test-scenarios.md`)

```text
src/server.js
src/alertEngine.js
src/storage.js
src/telegram.js
src/telegramCommands.js
src/priceProvider.js
src/dividend*.js
src/backups.js
src/localObservationCheck.js
public/
scripts/local-server.js
scripts/stop-server.js
scripts/check-local-observation.js
scripts/check-visual-regression.js
start-local.bat
status-local.bat
stop-local.bat
```
