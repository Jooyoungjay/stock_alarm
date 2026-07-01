# 개인 실사용 백로그

날짜 기준: 2026-06-24 (WBS 20.8 완료 · 운영 유지 모드)

이 문서는 **개인 PC 로컬 운영** 중 발견한 불편·결함·개선 후보를 한곳에서 triage합니다. 단일 진실 공급원은 작업 승격 시 `docs/development-roadmap.md`(WBS)이고, 이 문서는 **입력 큐**입니다.

관련 문서:

- [로컬 웹앱 실사용 관찰 리포트](local-webapp-observation-2026-05-21.md) — OBS-001~015 기록
- [개발 WBS 및 로드맵](development-roadmap.md) — §20 완료, **운영 유지 모드**
- [AI 팀 WBS 20 스킬](../.cursor/skills/wbs-20-evolution/SKILL.md) — 20.2 완료 후 사용
- [AI 팀 WBS 19 스킬](../.cursor/skills/wbs-19-evolution/SKILL.md) — WBS 19 완료 후 참고
- [AI 팀 WBS 17 스킬](../.cursor/skills/wbs-17-evolution/SKILL.md) — WBS 17 완료 후 참고
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

OBS-001~015는 [관찰 리포트](local-webapp-observation-2026-05-21.md) 기준 **해결**입니다. WBS 12.x~18.x에서 대응 기능이 반영됐습니다. **재오픈 없음** (19.3 확인).

## 해결된 백로그 (WBS 14~18)

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
| BL-12 | P3 | 텔레그램 `/status`·`/brief` 시세·poll 강화 | 16.6 | 완료 |
| BL-13 | P3 | observation smoke drift | 16.5 | 완료 |
| BL-14 | P3 | 웹 시세 배너·오늘 할 일 | 16.7 | 완료 |
| BL-15 | P3 | dead code·observation 상수화 | 16.9 | 완료 |
| BL-16 | P3 | 백업·점검 UX 편의 | 16.8 | 완료 |
| BL-17 | P3 | 주간 루틴 WBS 17·`/today` 반영 | 17.4 | 완료 |
| BL-18 | P3 | 텔레그램 `/today` 운영 문서 | 17.4 | 완료 |
| BL-19 | P3 | observation 마커 drift 방지 테스트 | 17.5 | 완료 |
| BL-20 | P3 | 텔레그램 `/today`·헬스 신선도 요약 | 17.6 | 완료 |
| BL-21 | P3 | 오늘 할 일 원클릭 점프 | 17.7 | 완료 |
| BL-22 | P3 | quote freshness·todayAction 마커 정리 | 17.8 | 완료 |
| BL-23 | P3 | `/check` 끝 오늘 할 일 요약 | 18.4 | 완료 |
| BL-24 | P3 | 점검 실패→오늘 할 일·히스토리 점프 | 18.5 | 완료 |
| BL-25 | P3 | 시각 회귀 신선도 배너 | 18.6 | 완료 |
| BL-26 | P3 | 주간 루틴 visual·live 게이트 | 18.7 | 완료 |
| BL-27 | P3 | todayAction 우선순위 공유 모듈 | 18.8 | 완료 |
| BL-28 | P3 | KIS/Naver 미해결 compare 이슈→오늘 할 일 | 19.4 | 완료 |
| BL-29 | P2 | 장중 critical today action 텔레그램 digest·쿨다운 | 19.5 | 완료 |
| BL-30 | P3 | observation-manual 오늘 할 일·히스토리 점프 | 19.6 | 완료 |
| BL-31 | P3 | `/api/health` todayActionsSummary | 19.7 | 완료 |
| BL-32 | P3 | todayAction 타입 observation 마커 | 19.8 | 완료 |
| BL-33 | P3 | todayAction 중복·정렬 계약 테스트 | 19.8 | 완료 |
| BL-34 | P3 | npm test·회귀 시나리오 326개 동기화 | 20.4 | 완료 |
| BL-35 | P3 | todayAction digest 주간 루틴 W-18 | 20.5 | 완료 |
| BL-36 | P3 | scripts-and-env `TODAY_ACTION_DIGEST_*` 분류 | 20.6 | 완료 |
| BL-37 | P3 | 텔레그램·헬스·웹 todayAction parity 테스트 | 20.7 | 완료 |
| BL-38 | P3 | 시각 회귀 todayAction·digest 마커 확장 | 20.8 | 완료 |

## 열린 백로그

| ID | P | 내용 | WBS 후보 | 상태 |
|---|---|---|---|---|
| — | — | **없음** (WBS 13~20 완료) | 운영 유지 모드 | — |

재현되면 evidence(날짜·스크린샷·점검 파일명)를 적고, P1이면 @pm이 즉시 처리 또는 소규모 WBS 승격을 검토합니다.

## 운영 유지 모드 (WBS 20 이후)

| 단계 | 내용 |
|---|---|
| 1 | 불편·결함 발견 → 이 문서에 BL-* 또는 OBS-* 추가 |
| 2 | P1/P2 → 즉시 수정 또는 @pm WBS 승격 |
| 3 | P3 → 주간 **W-11** triage에서 묶기 |
| 4 | 회귀 → **W-01~W-18**, `npm test` **326개** |

**자동 WBS 21+ 기획 없음.** 대형 작업은 사용자가 명시적으로 요청할 때만 로드맵에 추가합니다.

## WBS 20 ID ↔ 백로그 (20.3 확정)

| WBS | 작업 | 백로그 | 역할 | 우선순위 |
|---|---|---|---|---|
| 20.1 | WBS·README·AGENTS 정합성 | — | @docs | 완료 |
| 20.2 | AI 팀 WBS 20 스킬 | — | @backend | 완료 |
| 20.3 | 실사용 백로그 triage 7차 | 이 표 | @pm / @docs | 완료 |
| 20.4 | 회귀·테스트 수 문서 정합 | BL-34 | @docs | 완료 |
| 20.5 | digest 주간 루틴 W-18 | BL-35 | @docs | 완료 |
| 20.6 | env 분류 digest 반영 | BL-36 | @docs | 완료 |
| 20.7 | todayAction parity 테스트 | BL-37 | @qa | 완료 |
| 20.8 | 시각 회귀 todayAction 확장 | BL-38 | @qa | 완료 |

**다음:** 운영 유지 모드 — 열린 BL 없음.

## WBS 19 ID ↔ 백로그 (19.3 확정, 보관)

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
3. 구현 세션은 주간 triage 또는 명시적 WBS 승격 시 — **ID 하나씩** (참고: [wbs-20-evolution 스킬](../.cursor/skills/wbs-20-evolution/SKILL.md))
4. 해결 시 상태를 `완료`로 바꾸고 관찰 리포트 또는 점검 히스토리에 evidence 한 줄 링크

## 15.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 모두 해결 — 재오픈 없음 |
| WBS 14 BL-01~05 | 모두 완료 |
| WBS 15 BL-M01~03·BL-06~07 | 모두 완료 |
| 다음 WBS | WBS 15 완료 — 백로그 triage 후 신규 승격 |

## 16.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 16 BL-08~16 | 모두 완료 |
| 다음 WBS | WBS 16 완료 |

## 17.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 17 BL-17~22 | 모두 완료 |
| 다음 WBS | WBS 17 완료 |

## 18.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 18 BL-23~27 | 모두 완료 |
| 다음 WBS | WBS 19 — BL-28~33 (6건) |

## 20.3 triage 요약

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 20 BL-34~38 | 모두 완료 |
| 다음 | **운영 유지 모드** — 자동 WBS 21+ 없음 |

## 19.3 triage 요약 (보관)

| 구분 | 결과 |
|---|---|
| OBS-001~015 | 재오픈 없음 |
| WBS 19 BL-28~33 | 모두 완료 |
| 다음 WBS | WBS 20 — BL-34~38 (5건) |
