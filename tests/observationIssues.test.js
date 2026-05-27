import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseObservationIssuesMarkdown, readObservationIssues } from '../src/observationIssues.js';

test('parseObservationIssuesMarkdown extracts issue summary and priority queue', () => {
  const markdown = `# 로컬 웹앱 실사용 관찰 리포트

날짜 기준: 2026-05-22

## 하루 관찰 체크리스트

| 시간대 | 확인 항목 | 합격 기준 | 기록 |
|---|---|---|---|
| 시작 직후 | 서버 시작 | 접속 주소가 보인다 | 통과 |
| 장중 | 즉시 확인 | 결과가 카드에 반영된다 | 미실행 |
| 종료 | 안전 종료 | Stock Alarm 서버만 종료한다 | 실패 |

## 현재 발견 이슈

| ID | 심각도 | 내용 | 상태 | 다음 조치 |
|---|---|---|---|---|
| OBS-001 | 낮음 | 하루 전체 관찰 필요 | 열림 | 장중 사용 후 기록 |
| OBS-002 | 높음 | 알림 조건 오작동 | 열림 | 즉시 수정 |
| OBS-003 | 중간 | 문구 혼동 | 해결 | 안내 문구 교체 |
`;

  const report = parseObservationIssuesMarkdown(markdown);

  assert.equal(report.title, '로컬 웹앱 실사용 관찰 리포트');
  assert.equal(report.dateLabel, '2026-05-22');
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.open, 2);
  assert.equal(report.summary.resolved, 1);
  assert.equal(report.summary.bySeverity.높음, 1);
  assert.equal(report.checklistSummary.total, 3);
  assert.equal(report.checklistSummary.passed, 1);
  assert.equal(report.checklistSummary.pending, 1);
  assert.equal(report.checklistSummary.failed, 1);
  assert.equal(report.nextChecklistItem.item, '안전 종료');
  assert.deepEqual(report.priorityQueue.map((issue) => issue.id), ['OBS-002', 'OBS-001']);
  assert.equal(report.nextAction, '즉시 수정');
});

test('readObservationIssues loads the default observation report', async () => {
  const report = await readObservationIssues(fileURLToPath(new URL('..', import.meta.url)));

  assert.equal(report.source, 'docs/local-webapp-observation-2026-05-21.md');
  assert.ok(report.issues.some((issue) => issue.id === 'OBS-001'));
  assert.ok(report.issues.some((issue) => issue.id === 'OBS-002' && issue.status === 'resolved'));
  assert.deepEqual(report.priorityQueue.map((issue) => issue.id), ['OBS-010']);
  assert.match(report.nextAction, /로컬 점검 결과 저장\/히스토리/);
  assert.ok(report.checklist.length >= 1);
  assert.equal(report.checklistSummary.failed, 0);
  assert.equal(report.checklistSummary.paused, 0);
  assert.equal(report.nextChecklistItem, null);
});
