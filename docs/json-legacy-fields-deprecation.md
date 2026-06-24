# JSON 레거시 필드 정리 계획

날짜 기준: 2026-06-22 (WBS 14.8)

개인 로컬·텔레그램 운영으로 전환(WBS 13.4·13.6)한 뒤에도 `store.json`과 데이터 모델 API에 **모바일·푸시 시절 필드**가 남아 있습니다. 이 문서는 deprecated 정책과 단계적 제거 기준의 단일 기준입니다.

관련 문서:

- [개인 PC 백업·복구 정책](personal-backup-policy.md)
- [개인 실사용 백로그](personal-backlog.md) — BL-04
- [개발 WBS 및 로드맵](development-roadmap.md) — §14.8

코드 레지스트리: `src/jsonLegacyFields.js` · API: `GET /api/data-model` → `legacy`

## 왜 유지하나

| 이유 | 설명 |
|---|---|
| 백업 호환 | 과거 백업·`store.json`에 `devices`·`deviceId`·`pushDelivery*`가 포함될 수 있음 |
| 무손실 import | 복구 시 알 수 없는 필드를 버리지 않고 envelope를 그대로 읽음 |
| schemaVersion 1 | WBS 14 범위에서는 스키마 버전을 올리지 않음 |

신규 알림은 **텔레그램만** 전송합니다. `pushDelivery*`는 기록용 placeholder(`none`, `0`)만 남깁니다.

## Deprecated 대상

### 엔터티

| 엔터티 | 경로 | 대체 | 제거 단계 |
|---|---|---|---|
| `devices` | `devices[]` | 없음 (단일 사용자) | `removed` |
| `push_tokens` | `devices[].pushTokens[]` | 텔레그램 `deliveryStatus` | `removed` |

### 필드

| 엔터티 | 필드 | 경로 | 대체 |
|---|---|---|---|
| stocks | `deviceId` | `stocks[].deviceId` | null / 생략 |
| alerts | `deviceId` | `alerts[].deviceId` | null / 생략 |
| alerts | `pushDeliveryStatus` | `alerts[].pushDeliveryStatus` | `deliveryStatus` |
| alerts | `pushDeliveryError` | `alerts[].pushDeliveryError` | `deliveryStatus` |
| alerts | `pushDeliverySent` | `alerts[].pushDeliverySent` | `sent` |
| alerts | `pushDeliveryFailed` | `alerts[].pushDeliveryFailed` | `deliveryStatus` |

### Storage contract (유지·미사용)

JsonStore에 남아 있으나 HTTP·텔레그램 경로에서는 호출하지 않습니다.

- `createDevice`
- `authenticateDevice`
- `upsertDevicePushToken`
- `listDevicePushTokens`

## 제거 단계

| 단계 | ID | 상태 (14.8) | 내용 |
|---|---|---|---|
| 1 | `documented` | **완료** | 이 문서 + `jsonLegacyFields.js` |
| 2 | `api_marked` | **완료** | `/api/data-model`에 `legacy` 블록, UI 백업 요약에 레거시 라벨 |
| 3 | `optional_migration` | 예정 | 백업/export 시 레거시 필드 비우기(선택) |
| 4 | `removed` | 예정 | schemaVersion bump + 코드·contract 제거 (별도 WBS) |

단계 3·4는 **WBS 14 범위 밖**입니다. 승격 전까지 읽기·쓰기 호환을 유지합니다.

## 백업·복구 전 확인

| # | 항목 | 확인 |
|---|---|---|
| LF-01 | 백업 미리보기 | `기기(레거시)` 카운트 — 0이면 정리 후보 |
| LF-02 | 데이터 모델 API | `GET /api/data-model` → `legacy.summary` |
| LF-03 | 알림 기록 | 신규 알림에 `pushDeliveryStatus: none`만 있는지 샘플 확인 |
| LF-04 | 복구 후 | 종목·알림 수가 미리보기와 일치하는지 |

복구는 레거시 배열을 **삭제하지 않습니다**. 단계 3 마이그레이션 전에는 수동으로 `devices`를 지우지 마세요.

## UI 표시 (WBS 14.8)

- 관리자/헬스 **데이터 모델** 요약: `기기(레거시) N`
- 백업 미리보기: `기기(레거시): N개`

0이어도 스키마 호환을 위해 envelope의 `devices: []`는 유지합니다.

## 다음 조치 (운영)

| 상황 | 조치 |
|---|---|
| `devices`가 비어 있음 | 조치 불필요 — 정상 |
| 오래된 백업에 기기만 많음 | 복구는 가능; 단계 3 WBS 전까지 그대로 둠 |
| 데이터 모델 이해가 어려움 | 이 문서와 API `legacy` 블록 참고 |
| 필드를 코드에서 즉시 삭제하고 싶음 | BL-04 triage → 새 WBS 행 추가 후 단계 4 진행 |

## BL-04 완료 기준 (14.8)

| 항목 | 결과 |
|---|---|
| deprecated 정책 문서 | 이 문서 |
| 코드 레지스트리 | `src/jsonLegacyFields.js` |
| API 표시 | `GET /api/data-model` |
| 단계적 제거 기준 | §제거 단계 |
