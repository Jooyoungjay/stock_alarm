import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseRoadmapMarkdown, readRoadmap } from '../src/roadmap.js';

test('parseRoadmapMarkdown extracts roadmap metadata and next task', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);

  assert.equal(roadmap.title, '개발 WBS 및 로드맵');
  assert.equal(roadmap.dateLabel, '2026-05-18');
  assert.ok(roadmap.completedScope.some((item) => item.category === '공식 일봉 provider 실험'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '데이터 모델 정리'));
  assert.ok(roadmap.completedScope.some((item) => item.category === 'JSON -> DB 이전 설계'));
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
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 이벤트 알림'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 성장률'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '배당 캘린더'));
  assert.ok(roadmap.completedScope.some((item) => item.category === '작업 상태 필드 정리'));
  assert.ok(roadmap.sections.length >= 9);
  assert.equal(roadmap.recommendedOrder[0], '백업/복구 DB 대응');
  assert.equal(roadmap.recommendedOrder[1], '실패 종목 재시도 UX');
  assert.equal(roadmap.nextTask.title, '백업/복구 DB 대응');
  assert.ok(roadmap.statusLegend.some((item) => item.status === 'pending' && item.label === '예정'));
  assert.ok(roadmap.summary.pending > 0);
  assert.ok(roadmap.summary.paused > 0);
  assert.ok(roadmap.summary.total > roadmap.summary.completed);
});

test('parseRoadmapMarkdown normalizes explicit WBS task statuses', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);
  const roadmapSection = roadmap.sections.find((section) => section.id === '1');
  const completedStatusTask = roadmapSection.tasks.find((task) => task.id === '1.4');
  const matchingSection = roadmap.sections.find((section) => section.id === '3');
  const pausedMatchingTask = matchingSection.tasks.find((task) => task.id === '3.4');
  const completedProviderTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.6');
  const completedDividendAlertTask = roadmap.sections
    .find((section) => section.id === '5')
    .tasks.find((task) => task.id === '5.5');
  const completedDividendCalendarTask = roadmap.sections
    .find((section) => section.id === '5')
    .tasks.find((task) => task.id === '5.6');
  const completedReviewTask = roadmap.sections
    .find((section) => section.id === '9')
    .tasks.find((task) => task.id === '9.4');

  assert.equal(completedStatusTask.status, 'completed');
  assert.equal(completedStatusTask.statusLabel, '완료');
  assert.equal(completedStatusTask.priority, '중간');
  assert.equal(pausedMatchingTask.status, 'paused');
  assert.equal(completedDividendAlertTask.status, 'completed');
  assert.equal(completedDividendCalendarTask.status, 'completed');
  assert.equal(completedProviderTask.status, 'completed');
  assert.equal(completedReviewTask.status, 'completed');
  assert.equal(completedReviewTask.statusLabel, '완료');
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
