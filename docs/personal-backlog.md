# 개인 실사용 백로그

날짜 기준: 2026-06-22 (post-15 triage)

이 문서는 **개인 PC 로컬 운영** 중 발견한 불편·결함·개선 후보를 한곳에서 triage합니다. 단일 진실 공급원은 작업 승격 시 `docs/development-roadmap.md`(WBS)이고, 이 문서는 **입력 큐**입니다.

관련 문서:

- [로컬 웹앱 실사용 관찰 리포트](local-webapp-observation-2026-05-21.md) — OBS-001~015 기록
- [개발 WBS 및 로드맵](development-roadmap.md) — §15 완료, 신규는 triage 후 승격
- [AI 팀 WBS 15 스킬](../.cursor/skills/wbs-15-evolution/SKILL.md) — 15.2 완료 후 사용
- [KIS/Naver 자동 비교 알림 운영](personal-kis-naver-alert-operations.md) — KA-01~04
- [JSON 레거시 필드 정리 계획](json-legacy-fields-deprecation.md) — LF-01~04
- [주간 회귀 운영 루틴](personal-weekly-routine.md) — W-01~W-17

## Triage 기준

| 우선순위 | 기준 | 처리 |
|---|---|---|
| P1 | 알림 오작동, 데이터 손상, 잘못된 매도 판단 등 금전 판단에 직접 영향 | 즉시 WBS 승격·해당 세션에서 처리 |
| P2 | 등록·알림·백업·텔레그램 핵심 흐름을 반복 막는 문제 | 재현 절차 정리 후 WBS 또는 긴급 수정 |
| P3 | 문구·배치·가독성 등 우회 가능한 불편 | 백로그에 두고 triage 후 WBS에 묶어 개선 |
| 보류 | 모바일 앱, 스토어, Railway, Postgres | 기록만 하고 **진행하지 않음** |

새 항목 ID:

- **OBS-*** — 실사용 관찰 중 발견 (관찰 리포트와 연속 번호)
- **BL-*** — 백로그 전용(문서·운영·정리 후보)

## 해결된 OBS (참고)

OBS-001~015는 [관찰 리포트](local-webapp-observation-2026-05-21.md) 기준 **해결**입니다. WBS 12.x·13.x에서 대응 기능이 반영됐습니다.

## 해결된 백로그 (WBS 14·15)

| ID | P | 내용 | WBS | 상태 |
|---|---|---|---|---|
| BL-01 | P3 | 텔레그램 `/brief` 가독성 | 14.5 | 완료 |
| BL-02 | P3 | 배당 실패 다음 조치 문구 통일 | 14.6 | 완료 |
| BL-03 | P3 | KIS/Naver 자동 비교 알림 노이즈 | 14.7 | 완료 |
| BL-04 | P3 | JSON 레거시 필드 deprecated 정책 | 14.8 | 완료 |
| BL-05 | P3 | 주간 회귀 운영 루틴 문서 | 14.4 | 완료 |
| BL-M01 | P2 | 장중 시세 신선도 가시성 | 15.4 | 완료 |
| BL-M02 | P2 | 텔레그램 폴링·무응답 진단 | 15.5 | 완료 |
| BL-M03 | P3 | 점검 히스토리 manual 요약 | 15.6 | 완료 |
| BL-06 | P3 | 백업/export 레거시 선택적 정리 | 15.7 | 완료 |
| BL-07 | P3 | 레거시 코드·contract 제거 (schema v2) | 15.8 | 완료 |

## 열린 백로그 (WBS 16 후보)

| ID | P | 내용 | 재현/증거 | WBS 후보 | 상태 |
|---|---|---|---|---|---|
| BL-08 | P3 | [주간 회귀 루틴](personal-weekly-routine.md)에 WBS 15 점검 항목 미반영 — `telegramPollHealth`, 시세 신선도 배너, `stripLegacy` 백업 | W-04·W-05·W-11 체크리스트와 관리자 UI 비교 | **16.x** (문서) | 열림 |
| BL-09 | P3 | [JSON 레거시 정리 계획](json-legacy-fields-deprecation.md) 본문이 단계 3·4·contract를 아직 예정/유지로 기술 (코드는 15.7·15.8 완료) | 문서 vs `src/jsonLegacyFields.js` | **16.x** (문서) | 열림 |
| BL-10 | P3 | [텔레그램 운영 가이드](personal-telegram-operations.md)에 `telegramPollHealth`·폴링 지연 진단 미문서화 | `/api/health` vs TG-01~06 체크리스트 | **16.x** (문서) | 열림 |
| BL-11 | P3 | [관찰 리포트](local-webapp-observation-2026-05-21.md) 백업 미리보기 체크에 `기기` 개수 문구 잔존 (schema v2 이후) | 체크리스트 표 vs 백업 미리보기 UI | **16.x** (문서) | 열림 |
| BL-12 | P3 | 시세 신선도 요약이 웹 `/app` 배너에만 있고 텔레그램 `/status`에는 없음 — 장중 원격 점검 시 BL-M01 잔여 불편 | 장중 `/status` vs 웹 배너 | **16.x** (기능) | 열림 |

재현되면 evidence(날짜·스크린샷·점검 파일명)를 적고, P1이면 @pm이 WBS 앞순위로 당깁니다.

## WBS 16 우선순위 (@pm post-15 triage 2026-06-22)

WBS 15 완료 직후 **문서 정합**(BL-08~11)을 기능 확장(BL-12)보다 먼저 둡니다. P1/P2 재오픈 없음.

| 순서 | 후보 | 작업 | 백로그 |
|---|---|---|---|
| 1 | 16.x | 주간 루틴·레거시·텔레그램·관찰 문서 WBS 15 반영 | BL-08~11 |
| 2 | 16.x | 텔레그램 `/status` 시세 신선도 요약 | BL-12 |

**다음 WBS:** WBS 15 완료 — @pm이 위 후보를 묶어 `development-roadmap.md` §16 초안을 작성합니다.

## 보류·제외

| 항목 | 사유 |
|---|---|
| 모바일 실기기 E2E (WBS 11.2) | 개인 로컬·텔레그램 방향; 앱 코드 제거 완료 |
| 스토어 제출 실물 자산 (WBS 11.3) | 앱 출시 안 함 |
| Postgres 전환 | WBS 13.3에서 제거 |
| NXT 웹 스크래핑 | 로드맵 §6 보류 |

## 새 항목 추가 절차

1. 이 문서에 OBS-* 또는 BL-* 행 추가 (P, 내용, 재현, WBS 후보)
2. 개발이 필요하면 @pm이 `development-roadmap.md`에 WBS 행 추가
3. 구현 세션은 [wbs-15-evolution 스킬](../.cursor/skills/wbs-15-evolution/SKILL.md) 패턴 — **ID 하나씩**
4. 해결 시 상태를 `완료`로 바꾸고 관찰 리포트 또는 점검 히스토리에 evidence 한 줄 링크

## 15.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 모두 해결 — 재오픈 없음 |
| WBS 14 BL-01~05 | 모두 완료 |
| WBS 15 BL-M01~03·BL-06~07 | 모두 완료 |
| 다음 WBS | WBS 15 완료 — 백로그 triage 후 신규 승격 |

## post-15 triage 요약

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 14·15 해결 BL | 10건 모두 완료 |
| 신규 열린 BL | BL-08~12 (문서 4 + 기능 1) |
| P1/P2 | 없음 |
| 다음 액션 | BL-08~11 문서 묶음 → WBS §16 초안 (@pm) |
