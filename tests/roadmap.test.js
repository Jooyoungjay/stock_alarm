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
  assert.ok(roadmap.sections.length >= 8);
  assert.equal(roadmap.recommendedOrder[0], '배당 캘린더 고도화');
  assert.equal(roadmap.nextTask.title, '배당 캘린더 고도화');
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
