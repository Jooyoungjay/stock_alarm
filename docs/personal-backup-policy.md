# 개인 PC 백업·복구 정책

날짜 기준: 2026-06-22 (WBS 13.7)

Stock Alarm은 **로컬 JSON 파일(`data/store.json`)** 을 단일 저장소로 씁니다. Postgres나 원격 DB는 사용하지 않습니다. 개인 PC 운영에서 데이터를 잃지 않도록 아래 정책을 따릅니다.

## 저장 위치

| 경로 | 내용 |
|---|---|
| `data/store.json` | 감시 종목, 알림 기록, 메타 설정 |
| `data/backups/` | 자동·수동 백업 스냅샷 |
| `data/observation-history/` | `check:observation` 점검 히스토리 |
| `data/observation-actions.json` | 점검 실패 항목 조치 메모 |

## JSON 스토어 백업

### 자동 백업

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `AUTO_BACKUP_ENABLED` | `true` | 서버 실행 중 주기 백업 |
| `AUTO_BACKUP_INTERVAL_HOURS` | `24` | 자동 백업 주기(시간) |
| `AUTO_BACKUP_MIN_INTERVAL_MINUTES` | `120` | 재시작 직후 과도한 백업 방지 |
| `BACKUP_RETENTION` | `30` | `data/backups/`에 남길 최대 파일 수 |

자동 백업은 서버 시작·종목 변경·설정 주기에 따라 `data/backups/store-YYYYMMDD-HHmmss-xxx-<reason>-<id>.json` 형태로 저장됩니다. 관리자 화면과 `/api/health`의 `lastAutoBackup`으로 마지막 실행을 확인합니다.

### 수동 백업

| 방법 | 명령/동작 |
|---|---|
| 웹 관리자 | `백업 생성` 버튼 |
| 텔레그램 | `/backup` |
| API | `POST /api/backups` (관리자) |

대규모 변경·CSV 가져오기·복구 전에는 **반드시 수동 백업**을 먼저 실행합니다.

### 복구

| 방법 | 안전 장치 |
|---|---|
| 웹 관리자 `백업 미리보기` → 복구 | 복구 전 종목·알림 개수 확인 |
| 텔레그램 `/restore <번호\|파일명>` | 복구 직전 `before-restore` 백업 자동 생성 |
| API `POST /api/backups/restore` | 동일 |

복구는 현재 `store.json`을 덮어씁니다. 잘못 복구했을 때를 대비해 `before-restore` 백업이 항상 하나 남습니다.

### 백업 삭제

- 웹 관리자 또는 텔레그램 `/delete-backup`
- `BACKUP_RETENTION` 초과분은 새 백업 생성 시 오래된 파일부터 자동 삭제

## CSV보내기·가져오기

CSV는 백업 파일이 아니라 **종목 목록 이전·편집용** 포맷입니다.

| 기능 | 용도 |
|---|---|
| CSV 양식 다운로드 | 컬럼 형식 확인 |
| 현재 종목보내기 | 스프레드시트 편집 |
| 검증 후 일괄 가져오기 | 대량 등록 |

CSV 가져오기 전에도 JSON 백업(`/backup` 또는 관리자 백업)을 권장합니다.

## 점검 히스토리 보관

`npm run check:observation -- --save-history` 또는 관리자 `점검 실행` 결과는 `data/observation-history/`에 JSON으로 쌓입니다.

| 설정 | 기본값 | 설명 |
|---|---|---|
| 저장 폴더 | `data/observation-history` | `LOCAL_OBSERVATION_HISTORY_DIR`로 변경 가능 |
| UI/API 기본 보관 개수 | `30` | `LOCAL_OBSERVATION_HISTORY_LIMIT` |
| 관리자 정리 | 최근 N개만 유지 | `/api/observation-history/prune` |

점검 히스토리는 **운영 데이터가 아니라 진단 기록**입니다. 디스크가 부족하면 관리자 화면에서 오래된 파일을 삭제하거나 `keepLatest`로 정리합니다. 종목·알림 복구에는 `data/backups/`만 사용합니다.

## 권장 운영 루틴

1. **매일**: 서버 시작 후 `/api/health` 또는 관리자 화면에서 자동 백업 상태 확인
2. **종목 대량 변경 전**: `/backup` 또는 관리자 백업
3. **월 1회**: `data/backups/`를 외부 드라이브·클라우드에 복사 (선택)
4. **OS 재설치·PC 교체 전**: `data/` 폴더 전체 백업

## 13.7 재점검 결과

| 항목 | 결과 |
|---|---|
| JsonStore 단일 저장소 | 통과 |
| 자동 백업·보관 개수(`BACKUP_RETENTION`) | 통과 |
| 복구 전 `before-restore` 안전 백업 | 통과 |
| 백업 미리보기 API·관리자 UI | 통과 |
| CSV보내기/가져오기와 백업 역할 분리 | 통과 |
| 점검 히스토리 보관·정리(기본 30개) | 통과 |

관련 문서: [개인용 회귀 테스트 시나리오](full-regression-test-scenarios.md) A-13, [개인 PC 로컬 실행 가이드](personal-local-execution-guide.md)
