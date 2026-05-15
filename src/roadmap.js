import fs from 'node:fs/promises';
import path from 'node:path';

export async function readRoadmap(rootDir = process.cwd()) {
  const filePath = path.join(rootDir, 'docs', 'development-roadmap.md');
  const markdown = await fs.readFile(filePath, 'utf8');

  return {
    ...parseRoadmapMarkdown(markdown),
    source: path.relative(rootDir, filePath).replaceAll(path.sep, '/')
  };
}

export function parseRoadmapMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const title = stripHeading(lines.find((line) => line.startsWith('# ')) || '');
  const dateLine = lines.find((line) => line.startsWith('날짜 기준:')) || '';
  const principles = parseBullets(getSectionLines(lines, '원칙'));
  const completedScope = parseCompletedScope(getSectionLines(lines, '현재 완료된 범위'));
  const sections = parseWbsSections(getSectionLines(lines, 'WBS'));
  const recommendedOrder = parseOrderedList(getSectionLines(lines, '추천 진행 순서'));
  const nextTask = parseNextTask(getSectionLines(lines, '다음 작업'), recommendedOrder[0]);
  const summary = summarizeSections(sections);

  return {
    title,
    dateLabel: dateLine.replace(/^날짜 기준:\s*/, '').trim(),
    principles,
    completedScope,
    sections,
    recommendedOrder,
    nextTask,
    summary
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

function parseBullets(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim());
}

function parseCompletedScope(lines) {
  return parseFirstTable(lines).map((row) => ({
    category: row['구분'] || '',
    status: row['상태'] || '',
    description: row['내용'] || ''
  }));
}

function parseWbsSections(lines) {
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.+)$/);

    if (headingMatch) {
      if (current) {
        sections.push(normalizeWbsSection(current));
      }

      current = {
        heading: headingMatch[1].trim(),
        lines: []
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(normalizeWbsSection(current));
  }

  return sections;
}

function normalizeWbsSection(section) {
  const headingMatch = section.heading.match(/^(\d+)\.\s*(.+)$/);
  const id = headingMatch?.[1] || '';
  const title = headingMatch?.[2] || section.heading;
  const goal =
    section.lines
      .find((line) => line.trim().startsWith('목표:'))
      ?.replace(/^목표:\s*/, '')
      .trim() || '';
  const statusNote =
    section.lines
      .find((line) => line.trim().startsWith('상태:'))
      ?.replace(/^상태:\s*/, '')
      .trim() || '';
  const statusHints = getStatusHints(statusNote);
  const tasks = parseFirstTable(section.lines).map((row) =>
    normalizeWbsTask(row, statusHints)
  );
  const summary = summarizeTasks(tasks);

  return {
    id,
    title,
    goal,
    statusNote,
    tasks,
    summary
  };
}

function normalizeWbsTask(row, statusHints) {
  const id = row.ID || '';
  const priority = row['우선순위'] || '';
  const status = getTaskStatus(id, priority, statusHints);

  return {
    id,
    task: row['작업'] || '',
    output: row['산출물'] || '',
    priority,
    estimate: row['예상 작업량'] || '',
    status
  };
}

function getStatusHints(text) {
  const hints = {
    completed: new Set(),
    paused: new Set(),
    inProgress: new Set()
  };

  if (!text) {
    return hints;
  }

  for (const sentence of text.split(/[.。]\s+/)) {
    const ids = sentence.match(/\d+\.\d+/g) || [];

    if (!ids.length) {
      continue;
    }

    if (sentence.includes('보류')) {
      ids.forEach((id) => hints.paused.add(id));
      continue;
    }

    if (sentence.includes('완료') && /중|일부|후속|표시/.test(sentence)) {
      ids.forEach((id) => hints.inProgress.add(id));
      continue;
    }

    if (sentence.includes('완료')) {
      ids.forEach((id) => hints.completed.add(id));
    }
  }

  return hints;
}

function getTaskStatus(id, priority, statusHints) {
  if (priority.includes('완료')) {
    return 'completed';
  }

  if (priority.includes('보류') || statusHints.paused.has(id)) {
    return 'paused';
  }

  if (statusHints.inProgress.has(id)) {
    return 'in_progress';
  }

  if (statusHints.completed.has(id)) {
    return 'completed';
  }

  return 'pending';
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

function parseOrderedList(lines) {
  return lines
    .map((line) => line.trim().match(/^\d+\.\s+(.+)$/)?.[1])
    .filter(Boolean);
}

function parseNextTask(lines, fallbackTitle = '') {
  const paragraphs = lines.map((line) => line.trim()).filter(Boolean);
  const title =
    paragraphs.find((line) => line.includes('**'))?.match(/\*\*(.+?)\*\*/)?.[1] ||
    fallbackTitle ||
    '';

  return {
    title,
    summary: paragraphs.map((line) => line.replace(/\*\*/g, '')).join(' ')
  };
}

function summarizeSections(sections) {
  return summarizeTasks(sections.flatMap((section) => section.tasks));
}

function summarizeTasks(tasks) {
  return tasks.reduce(
    (summary, task) => {
      summary.total += 1;
      summary[task.status] = (summary[task.status] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      completed: 0,
      in_progress: 0,
      pending: 0,
      paused: 0
    }
  );
}
