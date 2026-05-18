import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseRoadmapMarkdown, readRoadmap } from '../src/roadmap.js';

test('parseRoadmapMarkdown extracts roadmap metadata and next task', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);

  assert.equal(roadmap.title, '개발 WBS 및 로드맵');
  assert.equal(roadmap.dateLabel, '2026-05-15');
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
  assert.ok(roadmap.sections.length >= 9);
  assert.equal(roadmap.recommendedOrder[0], '모바일 푸시 알림 연결');
  assert.equal(roadmap.recommendedOrder[1], '배당 성장률');
  assert.equal(roadmap.nextTask.title, '모바일 푸시 알림 연결');
  assert.ok(roadmap.summary.total > roadmap.summary.completed);
});

test('parseRoadmapMarkdown keeps task status hints from WBS notes', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);
  const dividendSection = roadmap.sections.find((section) => section.id === '2');
  const completedDividendTask = dividendSection.tasks.find((task) => task.id === '2.4');
  const completedProviderTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.6');

  assert.equal(completedDividendTask.status, 'completed');
  assert.equal(completedProviderTask.status, 'completed');
});

test('readRoadmap loads the default roadmap document from a root directory', async () => {
  const roadmap = await readRoadmap(fileURLToPath(new URL('..', import.meta.url)));

  assert.equal(roadmap.source, 'docs/development-roadmap.md');
  assert.ok(roadmap.sections.some((section) => section.title === '모바일 앱 준비'));
});
