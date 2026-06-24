import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseRoadmapMarkdown, readRoadmap } from '../src/roadmap.js';

test('parseRoadmapMarkdown extracts roadmap metadata and next task', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);

  assert.equal(roadmap.title, '개발 WBS 및 로드맵');
  assert.equal(roadmap.dateLabel, '2026-06-24');
  assert.ok(roadmap.completedScope.some((item) => item.category === '공식 일봉 provider 실험'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'NXT provider 골격'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '증권사 API adapter 검토'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'KIS quote provider'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'KIS 토큰 자동 발급/갱신'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'KIS 현재가 smoke test'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '관리자 KIS 현재가 점검'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '종목별 KIS 시장 구분'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'KIS/Naver 가격 비교 진단'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 비교 결과 기반 시장 적용'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 차이 이상치 모니터링'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 비교 이력 저장'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 비교 추세 시각화'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '추세 기반 시장 추천'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 비교 자동 점검'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '자동 점검 결과 알림'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 비교 이슈 처리 UX'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '가격 비교 이슈 알림 재전송 정책'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '전수 테스트 시나리오'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '전수 테스트 실행 및 결함 정리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '저장소 쓰기 안정화'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '데이터 모델 정리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'JSON -> DB 이전 설계'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '백업/복구 DB 대응'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '사용자/관리자 화면 분리 설계'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '저장소 인터페이스'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '사용자/관리자 라우팅'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '관리자 기능 이동'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '관리자 보호'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '사용자 첫 화면'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '종목별 알림 토글'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '관리자 링크 노출'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '종목 등록 팝업'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 포함 수익률'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '매수일 선택 입력'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '등록 편의성'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '매수 이유/매도 조건 카드'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '추가매수 계산기'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '텔레그램 배당 진단 명령'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'Expo 모바일 앱 초기 프로젝트'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '모바일 종목 CRUD'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '모바일 푸시 알림'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '앱 심사 준비'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'HTTPS 데모 서버 준비'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '스토어 스크린샷 제작'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '모바일 배당/알림 기록 화면'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '스토어 제출 자산 최종 점검'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '외부 API 실계정 재점검'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '모바일 실기기 E2E 준비'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '로컬 웹앱 연결 안정화'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '매도 판단 대시보드'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '보유/관심/매도 상태 분리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '자동 백업 편의성'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '시세 품질 안내'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '텔레그램 편의 명령'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '브라우저 시각 회귀 점검'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '실사용 관찰 리포트'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '실사용 이슈 반영'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '후속 실사용 이슈 수집'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '관찰 결과 기반 UX 개선'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '실사용 체크 실행과 신규 OBS 처리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '장중 즉시 확인과 알림 제어 실사용 검증'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '실사용 관찰 결과 회고'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '오늘 확인할 일 카드'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '종목 목록 저장 필터'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'CSV 가져오기/내보내기'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '알림 기준 설명 고도화'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 API 자동 검증 대시보드 확장'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '로컬 장중 실사용 재검증'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '로컬 점검 결과 저장/히스토리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '로컬 점검 히스토리 관리자 화면 노출'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '관리자 점검 실행/히스토리 저장'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '점검 히스토리 상세 보기/다운로드'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '점검 히스토리 보관 기간/삭제 관리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 이벤트 알림'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 성장률'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 캘린더'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '작업 상태 필드 정리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '실패 종목 재시도 UX'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'PostgresStore 골격'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'JSON -> Postgres dry-run'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'Postgres 통합 테스트 데이터셋'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '저장소별 백업 스냅샷 검증'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'Postgres 쿼리 어댑터'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'Postgres 연결 리허설'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '개인 로컬 운영 전환 WBS'));
  assert.ok(roadmap.sections.length >= 18);
  assert.equal(roadmap.recommendedOrder[0], '~~개인 로컬 운영 전환 1차 정리~~ (13.1 완료)');
  assert.equal(roadmap.nextTask.title, '장중 알림·점검 피드백 루프');
  assert.ok(roadmap.statusLegend.some((item) => item.status === 'pending' && item.label === '예정'));
  assert.ok(roadmap.summary.paused > 0);
  assert.ok(roadmap.summary.total > roadmap.summary.completed);
});

test('parseRoadmapMarkdown normalizes explicit WBS task statuses', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);
  const roadmapSection = roadmap.sections.find((section) => section.id === '1');
  const completedStatusTask = roadmapSection.tasks.find((task) => task.id === '1.4');
  const matchingSection = roadmap.sections.find((section) => section.id === '3');
  const completedMatchingTask = matchingSection.tasks.find((task) => task.id === '3.4');
  const completedNxtTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.5');
  const completedBrokerAdapterTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.7');
  const completedKisProviderTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.8');
  const completedKisTokenTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.9');
  const completedKisSmokeTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.10');
  const completedKisAdminTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.11');
  const completedKisMarketTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.12');
  const completedKisCompareTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.13');
  const completedKisApplyTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.14');
  const completedKisDriftTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.15');
  const completedKisCompareHistoryTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.16');
  const completedKisCompareTrendTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.17');
  const completedKisTrendRecommendationTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.18');
  const completedKisCompareAutomationTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.19');
  const completedKisAutoCompareAlertTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.20');
  const completedKisCompareIssueUxTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.21');
  const completedKisCompareIssueResendTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.22');
  const completedRegressionScenarioTask = roadmap.sections
    .find((section) => section.id === '10')
    .tasks.find((task) => task.id === '10.1');
  const completedRegressionExecutionTask = roadmap.sections
    .find((section) => section.id === '10')
    .tasks.find((task) => task.id === '10.2');
  const completedExternalApiRetestTask = roadmap.sections
    .find((section) => section.id === '11')
    .tasks.find((task) => task.id === '11.1');
  const pausedMobileE2eTask = roadmap.sections
    .find((section) => section.id === '11')
    .tasks.find((task) => task.id === '11.2');
  const completedConnectionUxTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.1');
  const completedBackupPreviewTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.6');
  const completedTelegramConvenienceTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.8');
  const completedVisualRegressionTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.9');
  const completedObservationTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.10');
  const completedObservationIssueTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.11');
  const completedFollowUpObservationTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.12');
  const completedObservationUxTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.13');
  const completedObservationExecutionTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.14');
  const completedManualObservationTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.15');
  const completedObservationReviewTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.16');
  const completedTodayActionCardTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.17');
  const completedSavedFilterTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.18');
  const completedCsvImportExportTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.19');
  const completedAlertGuideTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.20');
  const completedDividendApiDashboardTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.21');
  const completedLocalLiveValidationTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.22');
  const completedObservationHistoryTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.23');
  const completedObservationHistoryAdminTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.24');
  const completedObservationRunTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.25');
  const completedObservationHistoryDetailTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.26');
  const completedObservationHistoryRetentionTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.27');
  const completedObservationActionMemoTask = roadmap.sections
    .find((section) => section.id === '12')
    .tasks.find((task) => task.id === '12.28');
  const completedProviderTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.6');
  const completedBackupStrategyTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.4');
  const completedPostgresStoreTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.5');
  const completedDryRunTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.6');
  const completedPostgresDatasetTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.7');
  const completedSnapshotContractTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.8');
  const completedPostgresRuntimeTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.9');
  const completedPostgresRehearsalTask = roadmap.sections
    .find((section) => section.id === '7')
    .tasks.find((task) => task.id === '7.10');
  const completedDividendAlertTask = roadmap.sections
    .find((section) => section.id === '5')
    .tasks.find((task) => task.id === '5.5');
  const completedDividendCalendarTask = roadmap.sections
    .find((section) => section.id === '5')
    .tasks.find((task) => task.id === '5.6');
  const completedReviewTask = roadmap.sections
    .find((section) => section.id === '9')
    .tasks.find((task) => task.id === '9.4');
  const completedHttpsDemoTask = roadmap.sections
    .find((section) => section.id === '9')
    .tasks.find((task) => task.id === '9.5');
  const completedStoreScreenshotTask = roadmap.sections
    .find((section) => section.id === '9')
    .tasks.find((task) => task.id === '9.6');
  const completedMobileScreenshotGapTask = roadmap.sections
    .find((section) => section.id === '9')
    .tasks.find((task) => task.id === '9.7');
  const completedStoreSubmissionAssetsTask = roadmap.sections
    .find((section) => section.id === '9')
    .tasks.find((task) => task.id === '9.8');
  const completedLocalDirectionTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.1');
  const completedEnvScriptsTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.2');
  const completedPostgresRemovalTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.3');
  const completedMobileRemovalTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.4');
  const completedStoreDocsTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.5');
  const completedTelegramAlertsTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.6');
  const completedRegressionTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.10');
  const completedLocalUxTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.8');
  const completedBackupPolicyTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.7');
  const completedTelegramRemoteTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.9');
  const completedWbs14AlignmentTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.1');
  const completedWbs14SkillTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.2');
  const completedWbs14BacklogTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.3');
  const completedWbs14RoutineTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.4');
  const completedWbs14BriefTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.5');
  const completedWbs14DividendTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.6');
  const completedWbs14KisNaverTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.7');
  const completedWbs14LegacyTask = roadmap.sections
    .find((section) => section.id === '14')
    .tasks.find((task) => task.id === '14.8');
  const completedWbs15LegacyTask = roadmap.sections
    .find((section) => section.id === '15')
    .tasks.find((task) => task.id === '15.8');
  const pendingLocalRegressionTask = roadmap.sections
    .find((section) => section.id === '13')
    .tasks.find((task) => task.id === '13.10');

  assert.equal(completedStatusTask.status, 'completed');
  assert.equal(completedStatusTask.statusLabel, '완료');
  assert.equal(completedStatusTask.priority, '중간');
  assert.equal(completedMatchingTask.status, 'completed');
  assert.equal(completedNxtTask.status, 'completed');
  assert.equal(completedBrokerAdapterTask.status, 'completed');
  assert.equal(completedKisProviderTask.status, 'completed');
  assert.equal(completedKisTokenTask.status, 'completed');
  assert.equal(completedKisSmokeTask.status, 'completed');
  assert.equal(completedKisAdminTask.status, 'completed');
  assert.equal(completedKisMarketTask.status, 'completed');
  assert.equal(completedKisCompareTask.status, 'completed');
  assert.equal(completedKisApplyTask.status, 'completed');
  assert.equal(completedKisDriftTask.status, 'completed');
  assert.equal(completedKisCompareHistoryTask.status, 'completed');
  assert.equal(completedKisCompareTrendTask.status, 'completed');
  assert.equal(completedKisTrendRecommendationTask.status, 'completed');
  assert.equal(completedKisCompareAutomationTask.status, 'completed');
  assert.equal(completedKisAutoCompareAlertTask.status, 'completed');
  assert.equal(completedKisCompareIssueUxTask.status, 'completed');
  assert.equal(completedKisCompareIssueResendTask.status, 'completed');
  assert.equal(completedRegressionScenarioTask.status, 'completed');
  assert.equal(completedRegressionExecutionTask.status, 'completed');
  assert.equal(completedExternalApiRetestTask.status, 'completed');
  assert.equal(pausedMobileE2eTask.status, 'paused');
  assert.equal(completedConnectionUxTask.status, 'completed');
  assert.equal(completedBackupPreviewTask.status, 'completed');
  assert.equal(completedTelegramConvenienceTask.status, 'completed');
  assert.equal(completedVisualRegressionTask.status, 'completed');
  assert.equal(completedObservationTask.status, 'completed');
  assert.equal(completedObservationIssueTask.status, 'completed');
  assert.equal(completedFollowUpObservationTask.status, 'completed');
  assert.equal(completedObservationUxTask.status, 'completed');
  assert.equal(completedObservationExecutionTask.status, 'completed');
  assert.equal(completedManualObservationTask.status, 'completed');
  assert.equal(completedObservationReviewTask.status, 'completed');
  assert.equal(completedTodayActionCardTask.status, 'completed');
  assert.equal(completedSavedFilterTask.status, 'completed');
  assert.equal(completedCsvImportExportTask.status, 'completed');
  assert.equal(completedAlertGuideTask.status, 'completed');
  assert.equal(completedDividendApiDashboardTask.status, 'completed');
  assert.equal(completedLocalLiveValidationTask.status, 'completed');
  assert.equal(completedObservationHistoryTask.status, 'completed');
  assert.equal(completedObservationHistoryAdminTask.status, 'completed');
  assert.equal(completedObservationRunTask.status, 'completed');
  assert.equal(completedObservationHistoryDetailTask.status, 'completed');
  assert.equal(completedObservationHistoryRetentionTask.status, 'completed');
  assert.equal(completedObservationActionMemoTask.status, 'completed');
  assert.equal(completedDividendAlertTask.status, 'completed');
  assert.equal(completedDividendCalendarTask.status, 'completed');
  assert.equal(completedBackupStrategyTask.status, 'completed');
  assert.equal(completedPostgresStoreTask.status, 'completed');
  assert.equal(completedDryRunTask.status, 'completed');
  assert.equal(completedPostgresDatasetTask.status, 'completed');
  assert.equal(completedSnapshotContractTask.status, 'completed');
  assert.equal(completedPostgresRuntimeTask.status, 'completed');
  assert.equal(completedPostgresRehearsalTask.status, 'completed');
  assert.equal(completedProviderTask.status, 'completed');
  assert.equal(completedReviewTask.status, 'completed');
  assert.equal(completedReviewTask.statusLabel, '완료');
  assert.equal(completedHttpsDemoTask.status, 'completed');
  assert.equal(completedStoreScreenshotTask.status, 'completed');
  assert.equal(completedMobileScreenshotGapTask.status, 'completed');
  assert.equal(completedStoreSubmissionAssetsTask.status, 'completed');
  assert.equal(completedLocalDirectionTask.status, 'completed');
  assert.equal(completedEnvScriptsTask.status, 'completed');
  assert.equal(completedPostgresRemovalTask.status, 'completed');
  assert.equal(completedMobileRemovalTask.status, 'completed');
  assert.equal(completedStoreDocsTask.status, 'completed');
  assert.equal(completedTelegramAlertsTask.status, 'completed');
  assert.equal(completedRegressionTask.status, 'completed');
  assert.equal(completedLocalUxTask.status, 'completed');
  assert.equal(completedBackupPolicyTask.status, 'completed');
  assert.equal(completedTelegramRemoteTask.status, 'completed');
  assert.equal(completedWbs14AlignmentTask.status, 'completed');
  assert.equal(completedWbs14SkillTask.status, 'completed');
  assert.equal(completedWbs14BacklogTask.status, 'completed');
  assert.equal(completedWbs14RoutineTask.status, 'completed');
  assert.equal(completedWbs14BriefTask.status, 'completed');
  assert.equal(completedWbs14DividendTask.status, 'completed');
  assert.equal(completedWbs14KisNaverTask.status, 'completed');
  assert.equal(completedWbs14LegacyTask.status, 'completed');
  assert.equal(completedWbs15LegacyTask.status, 'completed');
  assert.equal(pendingLocalRegressionTask.status, 'completed');
  assert.equal(
    roadmap.sections.flatMap((section) => section.tasks).some((task) => task.priority === '완료'),
    false
  );
});

test('readRoadmap loads the default roadmap document from a root directory', async () => {
  const roadmap = await readRoadmap(fileURLToPath(new URL('..', import.meta.url)));

  assert.equal(roadmap.source, 'docs/development-roadmap.md');
  assert.ok(roadmap.sections.some((section) => section.title === '모바일 앱 준비'));
});
