import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  formatVisualRegressionReport,
  getVisualRegressionHelp,
  getVisualRegressionScenarios,
  parseVisualRegressionArgs,
  runVisualRegressionCheck
} from '../src/visualRegressionCheck.js';
import { main as runVisualRegressionCli } from '../scripts/check-visual-regression.js';

test('visual regression scenarios cover user and admin desktop and mobile screens', () => {
  const scenarios = getVisualRegressionScenarios();

  assert.deepEqual(
    scenarios.map((scenario) => scenario.id),
    ['user-desktop', 'user-mobile', 'admin-desktop', 'admin-mobile']
  );
  assert.ok(scenarios.find((scenario) => scenario.id === 'user-desktop').requiredSelectors.includes('#stockList'));
  assert.ok(scenarios.find((scenario) => scenario.id === 'user-desktop').requiredSelectors.includes('#todayActionPanel'));
  assert.ok(scenarios.find((scenario) => scenario.id === 'user-desktop').requiredSelectors.includes('.today-action-box'));
  assert.ok(scenarios.find((scenario) => scenario.id === 'admin-desktop').requiredSelectors.includes('#observationHistoryPanel'));
  assert.ok(scenarios.find((scenario) => scenario.id === 'admin-desktop').requiredSelectors.includes('#kisNaverCompareHistoryPanel'));
});

test('runVisualRegressionCheck passes with a captured scenario set', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-visual-'));
  const result = await runVisualRegressionCheck({
    rootDir,
    now: '2026-05-21T10:00:00.000Z',
    baseUrl: 'http://127.0.0.1:3001',
    outputDir: 'visual-output',
    adminToken: 'admin-token',
    captureScenarios: createSuccessfulCapture()
  });

  assert.equal(result.ready, true);
  assert.equal(result.generatedAt, '2026-05-21T10:00:00.000Z');
  assert.equal(result.values.baseUrl, 'http://127.0.0.1:3001');
  assert.equal(result.values.hasAdminToken, true);
  assert.equal(result.values.capturedScenarioCount, 4);
  assert.equal(result.summary.error, 0);
  assert.equal(result.scenarioResults.every((item) => item.ok), true);
  assert.match(formatVisualRegressionReport(result), /브라우저 시각 회귀 점검 결과/);
  assert.match(formatVisualRegressionReport(result), /user-desktop\.png/);
});

test('runVisualRegressionCheck reports blank screens, missing selectors, overflow, and console errors', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-visual-fail-'));
  const result = await runVisualRegressionCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3000',
    captureScenarios: async ({ scenarios, outputDir, baseUrl }) =>
      scenarios.map((scenario, index) => ({
        ...scenario,
        url: new URL(scenario.path, baseUrl).href,
        screenshotPath: path.join(outputDir, `${scenario.id}.png`),
        screenshotSize: index === 0 ? 512 : 8192,
        textLength: index === 0 ? 0 : 200,
        missingSelectors: index === 0 ? ['#stockList'] : [],
        horizontalOverflowPx: index === 1 ? 32 : 0,
        consoleErrors: index === 2 ? ['fetch failed'] : []
      }))
  });

  assert.equal(result.ready, false);
  assert.ok(result.summary.error >= 1);
  assert.ok(result.summary.warn >= 2);
  assert.equal(result.scenarioResults[0].ok, false);
  assert.match(formatVisualRegressionReport(result), /NOT READY/);
  assert.match(formatVisualRegressionReport(result), /가로 넘침/);
  assert.match(formatVisualRegressionReport(result), /콘솔 오류/);
});

test('visual regression args and CLI support help, JSON, and missing browser reporting', async () => {
  const parsed = parseVisualRegressionArgs([
    '--base-url',
    'http://127.0.0.1:3001',
    '--output-dir=shots',
    '--admin-token',
    'secret',
    '--timeout-ms',
    '20000',
    '--json',
    '--fail-on-warn'
  ]);

  assert.equal(parsed.baseUrl, 'http://127.0.0.1:3001');
  assert.equal(parsed.outputDir, 'shots');
  assert.equal(parsed.adminToken, 'secret');
  assert.equal(parsed.timeoutMs, '20000');
  assert.equal(parsed.json, true);
  assert.equal(parsed.failOnWarn, true);

  const helpOutput = createWritableBuffer();
  const helpCode = await runVisualRegressionCli(['--help'], {
    stdout: helpOutput,
    stderr: createWritableBuffer()
  });

  assert.equal(helpCode, 0);
  assert.match(helpOutput.text, /check:visual/);
  assert.match(getVisualRegressionHelp(), /playwright/);

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-visual-cli-'));
  const jsonOutput = createWritableBuffer();
  const errorOutput = createWritableBuffer();
  const code = await runVisualRegressionCli(['--json'], {
    rootDir,
    env: {},
    stdout: jsonOutput,
    stderr: errorOutput,
    now: '2026-05-21T10:00:00.000Z',
    captureScenarios: createSuccessfulCapture()
  });

  assert.equal(code, 0);
  assert.equal(JSON.parse(jsonOutput.text).ready, true);
  assert.equal(errorOutput.text, '');

  const missingOutput = createWritableBuffer();
  const missingErrorOutput = createWritableBuffer();
  const missingCode = await runVisualRegressionCli(['--json'], {
    rootDir,
    env: {},
    stdout: missingOutput,
    stderr: missingErrorOutput,
    now: '2026-05-21T10:00:00.000Z',
    captureScenarios: null
  });

  assert.equal(missingCode, 1);
  assert.equal(JSON.parse(missingOutput.text).ready, false);
  assert.match(missingErrorOutput.text, /점검에 실패/);
});

function createSuccessfulCapture() {
  return async ({ scenarios, outputDir, baseUrl }) =>
    scenarios.map((scenario) => ({
      ...scenario,
      url: new URL(scenario.path, baseUrl).href,
      screenshotPath: path.join(outputDir, `${scenario.id}.png`),
      screenshotSize: 12000,
      textLength: 600,
      missingSelectors: [],
      horizontalOverflowPx: 0,
      consoleErrors: []
    }));
}

function createWritableBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}
