# 개인 실사용 백로그

날짜 기준: 2026-06-24 (WBS 16.3 triage · 16.4 완료)

이 문서는 **개인 PC 로컬 운영** 중 발견한 불편·결함·개선 후보를 한곳에서 triage합니다. 단일 진실 공급원은 작업 승격 시 `docs/development-roadmap.md`(WBS)이고, 이 문서는 **입력 큐**입니다.

관련 문서:

- [로컬 웹앱 실사용 관찰 리포트](local-webapp-observation-2026-05-21.md) — OBS-001~015 기록
- [개발 WBS 및 로드맵](development-roadmap.md) — §16 개인 운영 편의성 개선
- [AI 팀 WBS 16 스킬](../.cursor/skills/wbs-16-evolution/SKILL.md) — 16.2 완료 후 사용
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

OBS-001~015는 [관찰 리포트](local-webapp-observation-2026-05-21.md) 기준 **해결**입니다. WBS 12.x·13.x에서 대응 기능이 반영됐습니다. **재오픈 없음** (16.3 확인).

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
| BL-08 | P3 | 주간 루틴 WBS 15 점검 반영 | 16.4 | 완료 |
| BL-09 | P3 | JSON 레거시 문서 단계 3·4 완료 반영 | 16.4 | 완료 |
| BL-10 | P3 | 텔레그램 운영 poll health 문서화 | 16.4 | 완료 |
| BL-11 | P3 | 관찰 리포트 백업 체크 schema v2 | 16.4 | 완료 |

## 열린 백로그 (WBS 16 잔여)

| ID | P | 내용 | 재현/증거 | WBS | 상태 |
|---|---|---|---|---|---|
| BL-13 | P3 | `check:observation` 배당 대시보드 drift | `dividendFailureGuidance.js` 분리 후 static 오탐 | **16.5** | 완료 |
| BL-12 | P3 | 텔레그램 `/status` 시세 신선도 없음 | 장중 `/status` vs 웹 배너 | **16.6** | 완료 |
| BL-14 | P3 | 시세 배너→종목 필터, 오늘 할 일 카드 통합 | @frontend 제안, 점검 2026-06-24 | **16.7** | 열림 |
| BL-16 | P3 | `stripLegacy` 기본 체크, 점검 히스토리 체크리스트 복사 | @frontend 제안 | **16.8** | 열림 |
| BL-15 | P3 | dead code·observation 검사 상수화 | `createDeviceSecret`, drift 재발 방지 | **16.9** | 열림 |

재현되면 evidence(날짜·스크린샷·점검 파일명)를 적고, P1이면 @pm이 WBS 앞순위로 당깁니다.

## WBS 16 ID ↔ 백로그 (16.3 확정)

| WBS | 작업 | 백로그 | 역할 | 우선순위 |
|---|---|---|---|---|
| ~~16.1~~ | WBS·README·AGENTS 정합성 | — | @docs | 완료 |
| ~~16.2~~ | AI 팀 WBS 16 스킬 | — | @backend | 완료 |
| ~~16.3~~ | 실사용 백로그 triage 3차 | 이 표 | @pm / @docs | 완료 |
| ~~16.4~~ | 운영 문서 정합 | BL-08~11 | @docs | 완료 |
| ~~16.5~~ | observation smoke drift | BL-13 | @qa | 완료 |
| ~~16.6~~ | 텔레그램 원격 점검 강화 | BL-12 | @backend | 완료 |
| **16.7** | 웹 시세 배너·오늘 할 일 | BL-14 | @frontend | **다음** |
| 16.8 | 백업·점검 UX 편의 | BL-16 | @frontend | 5 |
| 16.9 | dead code·observation 상수화 | BL-15 | @cleanup | 6 |

**다음 WBS:** **16.7** 웹 시세 배너·오늘 할 일 (BL-14, @frontend).

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
3. 구현 세션은 [wbs-16-evolution 스킬](../.cursor/skills/wbs-16-evolution/SKILL.md) — **ID 하나씩**
4. 해결 시 상태를 `완료`로 바꾸고 관찰 리포트 또는 점검 히스토리에 evidence 한 줄 링크

## 15.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 모두 해결 — 재오픈 없음 |
| WBS 14 BL-01~05 | 모두 완료 |
| WBS 15 BL-M01~03·BL-06~07 | 모두 완료 |
| 다음 WBS | WBS 15 완료 — 백로그 triage 후 신규 승격 |

## 16.3 triage 요약

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 14·15 해결 BL | 10건 유지 |
| 열린 BL | BL-08~16 (8건) — WBS 16.4~16.9에 1:1 매핑 |
| BL-14 분리 | 16.7(배너·오늘 할 일) / BL-16→16.8(백업·점검 복사) |
| P1/P2 | 없음 |
| 다음 WBS | **16.7** — 16.6 텔레그램 원격 점검 완료 |
