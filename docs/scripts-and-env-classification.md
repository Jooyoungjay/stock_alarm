# npm scripts와 환경변수 분류

WBS 13.2 산출물입니다. 개인 PC 로컬 운영에 필요한 항목과 정리 후보를 구분합니다.

날짜: 2026-06-22 (13.10 회귀 테스트 재정의 반영)

## npm scripts

### 일상 운영 (keep)

| Script | 용도 |
|---|---|
| `npm start` / `npm run dev` | 서버 직접 실행 |
| `npm run stop` | 안전 종료 |
| `npm run local:start` | PC 전용 로컬 시작 |
| `npm run local:phone` | 같은 Wi-Fi 휴대폰 접속 허용 |
| `npm run local:status` | 실행 상태·접속 주소 확인 |
| `npm test` | 자동 테스트 (**279개** 기대) |

Windows 배치: `start-local.bat`, `status-local.bat`, `stop-local.bat`, `start-phone.bat`

### 품질·진단 (keep)

| Script | 용도 |
|---|---|
| `npm run check:observation` | 로컬 웹앱 실사용 smoke check |
| `npm run check:visual` | 사용자/관리자 시각 회귀 (Playwright 필요) |
| `npm run check:external-apis` | KIS·공공데이터·텔레그램 설정 통합 점검 |
| `npm run check:broker-api` | 증권사 API adapter 설정 점검 |
| `npm run check:kis-quote` | KIS 현재가 smoke test |
| `npm run check:publicdata-price` | 공공데이터 일봉 실험 |
| `npm run kis:token` | KIS 접근 토큰 발급/캐시 |

### 제거 완료 — Postgres (WBS 13.3)

`migrate:postgres:dry-run`, `migrate:postgres:rehearsal`, `optionalDependencies.pg`는 제거했습니다. 과거 설계는 `docs/archive/json-to-db-migration.md` 참고.

### 제거 완료 — 모바일 (WBS 13.4)

`mobile:install`, `mobile:start`, `check:mobile-e2e`, `mobile/` 디렉터리, `/api/mobile/*`, `POST /api/devices`는 제거했습니다. 과거 Expo 앱 설정과 E2E 절차는 `docs/archive/` 참고.

관련 env `MOBILE_PUSH_ENABLED`, `EXPO_PUSH_ENDPOINT`는 WBS 13.6에서 제거했습니다.

### 제거 완료 — 스토어·Railway (WBS 13.5)

`check:demo`, `check:store-assets`, `check:railway`, `src/demoServerReadiness.js`, `src/storeSubmissionAssets.js` 및 관련 scripts/tests는 제거했습니다. 앱 심사·스토어·Railway 문서와 `railway.json`, `.env.railway.example`은 `docs/archive/`에 보관합니다.

관련 env `REVIEW_*`, `PRIVACY_POLICY_URL`, `SUPPORT_URL`, `STORE_SCREENSHOT_DIR`는 더 이상 사용하지 않습니다.

---

## 환경변수

### 필수 (로컬 알림 MVP)

| 변수 | 설명 |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 알림 수신 채팅 ID |

### 핵심 로컬 운영 (keep)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `HOST` | `127.0.0.1` | `0.0.0.0`은 휴대폰 LAN 테스트 |
| `PORT` | `3000` | 사용 중이면 시작 스크립트가 다음 포트 탐색 |
| `DATA_DIR` | `data` | JSON 저장소·백업·점검 히스토리 |
| `ADMIN_TOKEN` | 빈 값 | `/admin` 및 운영 API 보호 (선택) |
| (기타) | README 참고 | 시세/배당/KIS/백업/브리핑 설정 |

저장소는 **JsonStore 고정**입니다. `STORAGE_ENGINE`, `DATABASE_URL`, `MOBILE_PUSH_ENABLED`, `EXPO_PUSH_ENDPOINT` 환경변수는 더 이상 사용하지 않습니다.

---

## 신규 개발자 최소 `.env`

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

전체 예시: 프로젝트 루트 `.env.example`
