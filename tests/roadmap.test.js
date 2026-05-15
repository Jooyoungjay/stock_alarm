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
  assert.ok(roadmap.sections.length >= 9);
  assert.equal(roadmap.recommendedOrder[0], '관리자 보호 방식 검토');
  assert.equal(roadmap.recommendedOrder[1], '사용자 첫 화면 포트폴리오 중심 재정렬');
  assert.equal(roadmap.nextTask.title, '관리자 보호 방식 검토');
  assert.ok(roadmap.summary.total > roadmap.summary.completed);
});

test('parseRoadmapMarkdown keeps task status hints from WBS notes', async () => {
  const markdown = await fs.readFile(new URL('../docs/development-roadmap.md', import.meta.url), 'utf8');
  const roadmap = parseRoadmapMarkdown(markdown);
  const dividendSection = roadmap.sections.find((section) => section.id === '2');
  const pausedTask = dividendSection.tasks.find((task) => task.id === '2.4');
  const completedProviderTask = roadmap.sections
    .find((section) => section.id === '6')
    .tasks.find((task) => task.id === '6.6');

  assert.equal(pausedTask.status, 'paused');
  assert.equal(completedProviderTask.status, 'completed');
});

test('readRoadmap loads the default roadmap document from a root directory', async () => {
  const roadmap = await readRoadmap(fileURLToPath(new URL('..', import.meta.url)));

  assert.equal(roadmap.source, 'docs/development-roadmap.md');
  assert.ok(roadmap.sections.some((section) => section.title === '모바일 앱 준비'));
});
