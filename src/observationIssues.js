import fs from 'node:fs/promises';
import path from 'node:path';

const observationReportPath = path.join('docs', 'local-webapp-observation-2026-05-21.md');

const severityRank = {
  높음: 3,
  중간: 2,
  낮음: 1
};

const statusGroups = {
  open: ['열림', '진행중', '예정'],
  resolved: ['해결', '완료', '닫힘'],
  paused: ['보류', '대기']
};

const checklistStatusLabels = {
  pending: '미실행',
  passed: '통과',
  failed: '실패',
  paused: '보류'
};

export async function readObservationIssues(rootDir = process.cwd()) {
  const filePath = path.join(rootDir, observationReportPath);
  const markdown = await fs.readFile(filePath, 'utf8');

  return {
    ...parseObservationIssuesMarkdown(markdown),
    source: observationReportPath.replaceAll(path.sep, '/')
  };
}

export function parseObservationIssuesMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const title = stripHeading(lines.find((line) => line.startsWith('# ')) || '');
  const dateLine = lines.find((line) => line.startsWith('날짜 기준:')) || '';
  const checklist = parseChecklistTable(getSectionLines(lines, '하루 관찰 체크리스트'));
  const checklistSummary = summarizeChecklist(checklist);
  const issues = parseIssueTable(getSectionLines(lines, '현재 발견 이슈'));
  const priorityQueue = buildPriorityQueue(issues);
  const summary = summarizeIssues(issues);
  const nextChecklistItem =
    checklist.find((item) => item.status === 'failed') ||
    checklist.find((item) => item.status === 'pending') ||
    checklist.find((item) => item.status === 'paused') ||
    null;

  return {
    title,
    dateLabel: dateLine.replace(/^날짜 기준:\s*/, '').trim(),
    summary,
    checklistSummary,
    nextChecklistItem,
    priorityQueue,
    nextAction: priorityQueue[0]?.nextAction || '열린 이슈가 없으면 장중 관찰을 이어가며 새 OBS를 기록합니다.',
    checklist,
    issues
  };
}

function stripHeading(line) {
  return line.replace(/^#+\s*/, '').trim();
}

function getSectionLines(lines, heading) {
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);

  if (startIndex === -1) {
    return [];
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.startsWith('## ')
  );

  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function parseIssueTable(lines) {
  return parseFirstTable(lines)
    .map((row) => normalizeIssue(row))
    .filter((issue) => issue.id);
}

function parseChecklistTable(lines) {
  return parseFirstTable(lines)
    .map((row) => normalizeChecklistItem(row))
    .filter((item) => item.timeSlot || item.item);
}

function normalizeChecklistItem(row) {
  const record = String(row['기록'] || '').trim();
  const status = normalizeChecklistStatus(record);

  return {
    timeSlot: String(row['시간대'] || '').trim(),
    item: String(row['확인 항목'] || '').trim(),
    passCriteria: String(row['합격 기준'] || '').trim(),
    record,
    status,
    statusLabel: checklistStatusLabels[status] || checklistStatusLabels.pending
  };
}

function normalizeIssue(row) {
  const severity = normalizeSeverity(row['심각도']);
  const statusLabel = String(row['상태'] || '').trim() || '열림';
  const status = normalizeStatus(statusLabel);
  const rank = severityRank[severity] || 0;

  return {
    id: String(row.ID || '').trim(),
    severity,
    severityRank: rank,
    content: String(row['내용'] || '').trim(),
    status,
    statusLabel,
    nextAction: String(row['다음 조치'] || '').trim(),
    priorityScore: status === 'resolved' ? 0 : rank
  };
}

function normalizeSeverity(value) {
  const text = String(value || '').trim();

  return severityRank[text] ? text : '낮음';
}

function normalizeStatus(value) {
  const text = String(value || '').trim();

  for (const [status, labels] of Object.entries(statusGroups)) {
    if (labels.includes(text)) {
      return status;
    }
  }

  return 'open';
}

function normalizeChecklistStatus(value) {
  const text = String(value || '').trim();

  if (!text || /미실행|미확인|미정/.test(text)) {
    return 'pending';
  }

  if (/^(통과|완료|확인|합격)(\s|-|$)/.test(text)) {
    return 'passed';
  }

  if (/^(보류|대기)(\s|-|$)/.test(text)) {
    return 'paused';
  }

  if (/^(실패|미통과|오류|불합격)(\s|-|$)/.test(text)) {
    return 'failed';
  }

  if (/보류|대기/.test(text)) {
    return 'paused';
  }

  if (/통과|완료|확인|합격/.test(text)) {
    return 'passed';
  }

  return 'pending';
}

function buildPriorityQueue(issues) {
  return issues
    .filter((issue) => issue.status !== 'resolved')
    .toSorted((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.id.localeCompare(right.id, 'ko-KR', { numeric: true });
    });
}

function summarizeIssues(issues) {
  return issues.reduce(
    (summary, issue) => {
      summary.total += 1;
      summary[issue.status] = (summary[issue.status] || 0) + 1;
      summary.bySeverity[issue.severity] = (summary.bySeverity[issue.severity] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      open: 0,
      resolved: 0,
      paused: 0,
      bySeverity: {
        높음: 0,
        중간: 0,
        낮음: 0
      }
    }
  );
}

function summarizeChecklist(checklist) {
  return checklist.reduce(
    (summary, item) => {
      summary.total += 1;
      summary[item.status] = (summary[item.status] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      pending: 0,
      passed: 0,
      failed: 0,
      paused: 0
    }
  );
}

function parseFirstTable(lines) {
  const startIndex = lines.findIndex((line) => line.trim().startsWith('|'));

  if (startIndex === -1) {
    return [];
  }

  const tableLines = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line.startsWith('|')) {
      break;
    }

    tableLines.push(line);
  }

  if (tableLines.length < 2) {
    return [];
  }

  const headers = parseTableRow(tableLines[0]);

  return tableLines
    .slice(2)
    .filter((line) => !isTableSeparator(line))
    .map((line) => {
      const cells = parseTableRow(line);
      return headers.reduce((row, header, index) => {
        row[header] = cells[index] || '';
        return row;
      }, {});
    });
}

function parseTableRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line);
}
