# JSON 레거시 필드 정리 계획

날짜 기준: 2026-06-24 (WBS 14.8·15.7·15.8·16.4·17.8)

개인 로컬·텔레그램 운영 전환(WBS 13.4·13.6) 때 남았던 **모바일·푸시 시절 필드**는 WBS 15.8에서 **schemaVersion 2**로 제거했습니다. 이 문서는 deprecated 정책·제거 이력·과거 백업 호환의 단일 기준입니다.

관련 문서:

- [개인 PC 백업·복구 정책](personal-backup-policy.md)
- [개인 실사용 백로그](personal-backlog.md) — BL-04·BL-06~07·BL-09
- [개발 WBS 및 로드맵](development-roadmap.md) — §14.8·§15.7·§15.8

코드 레지스트리: `src/jsonLegacyFields.js` · 읽기 시 마이그레이션: `src/legacyStoreCleanup.js` · API: `GET /api/data-model` → `legacy` (정책 메타만)

## 현재 상태 (schemaVersion 2)

| 항목 | 설명 |
|---|---|
| 활성 저장소 | `devices`·`push_tokens` 엔터티 없음, `deviceId`·`pushDelivery*` 필드 없음 |
| 읽기 | schemaVersion 1·레거시 envelope는 **자동 마이그레이션** 후 v2로 저장 |
| 신규 알림 | **텔레그램만** — `deliveryStatus` / `sent` |
| 백업 | 관리자 **레거시 필드 비우기** 체크박스 → `stripLegacy` (WBS 15.7) |

## 제거된 대상 (이력)

### 엔터티

| 엔터티 | 경로 | 대체 | 제거 |
|---|---|---|---|
| `devices` | `devices[]` | 없음 (단일 사용자) | 15.8 |
| `push_tokens` | `devices[].pushTokens[]` | 텔레그램 `deliveryStatus` | 15.8 |

### 필드

| 엔터티 | 필드 | 경로 | 대체 |
|---|---|---|---|
| stocks | `deviceId` | `stocks[].deviceId` | 생략 |
| alerts | `deviceId` | `alerts[].deviceId` | 생략 |
| alerts | `pushDeliveryStatus` | `alerts[].pushDeliveryStatus` | `deliveryStatus` |
| alerts | `pushDeliveryError` | `alerts[].pushDeliveryError` | `deliveryStatus` |
| alerts | `pushDeliverySent` | `alerts[].pushDeliverySent` | `sent` |
| alerts | `pushDeliveryFailed` | `alerts[].pushDeliveryFailed` | `deliveryStatus` |

### Storage contract (제거됨, 15.8)

아래 메서드는 JsonStore·HTTP·텔레그램 경로에서 **삭제**했습니다. `jsonLegacyFields.js`의 `storeMethods`는 정책 이력용입니다.

- ~~`createDevice`~~
- ~~`authenticateDevice`~~
- ~~`upsertDevicePushToken`~~
- ~~`listDevicePushTokens`~~
- ~~`createDeviceSecret`~~, ~~`sanitizeDevice`~~ 등 device helper (16.9 storage 정리)

## 제거 단계

| 단계 | ID | 상태 | WBS | 내용 |
|---|---|---|---|---|
| 1 | `documented` | **완료** | 14.8 | 이 문서 + `jsonLegacyFields.js` |
| 2 | `api_marked` | **완료** | 14.8 | `/api/data-model` `legacy` 블록 |
| 3 | `optional_migration` | **완료** | 15.7 | 백업 `stripLegacy`, `legacyStoreCleanup.js` |
| 4 | `removed` | **완료** | 15.8 | schemaVersion 2, contract·API 제거, 자동 마이그레이션 |

레지스트리 `currentPhase`: `removed` (`src/jsonLegacyFields.js`).

## 백업·복구 전 확인

| # | 항목 | 확인 |
|---|---|---|
| LF-01 | 백업 미리보기 | **종목·알림** 수, **스키마 v2** — 과거 백업에만 `기기(레거시)` 표시될 수 있음 |
| LF-02 | 데이터 모델 API | `GET /api/data-model` → `schemaVersion: 2`, `legacy` 정책 요약 |
| LF-03 | stripLegacy 백업 | 관리자 체크박스 또는 POST `{ stripLegacy: true }` — 깨끗한 export |
| LF-04 | 복구 후 | 종목·알림 수가 미리보기와 일치, `meta.schemaVersion` 2 |

과거 백업을 그대로 복구하면 읽기 시 자동 마이그레이션됩니다. 수동으로 `devices` 배열을 지울 필요 없습니다.

## UI·운영 (WBS 15 이후)

- 관리자 데이터 모델 요약: `종목 N · 알림 M · 스키마 v2`
- 백업 생성: **레거시 필드 비우기** 옵션 (schema v2 운영 시 권장)
- 사용자 `/app`: 레거시 카운트 없음

## 다음 조치 (운영)

| 상황 | 조치 |
|---|---|
| `store.json`이 이미 v2 | 정상 — 신규 저장에 레거시 없음 |
| 오래된 백업에 `devices`만 많음 | 복구 가능; 필요 시 stripLegacy로 새 백업 생성 |
| 레거시 정책 확인 | API `legacy` 블록 또는 이 문서 |

## BL-04·BL-09 완료 (16.4)

| 항목 | 결과 |
|---|---|
| deprecated 정책·제거 이력 | 이 문서 (단계 1~4 완료) |
| 코드 레지스트리 | `src/jsonLegacyFields.js` |
| 선택적 정리 | WBS 15.7 `stripLegacy` |
| 코드·contract 제거 | WBS 15.8 schema v2 |
