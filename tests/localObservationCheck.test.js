import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  formatLocalObservationReport,
  getLocalObservationHelp,
  parseLocalObservationArgs,
  readLocalObservationHistoryReport,
  runAndSaveLocalObservationHistory,
  runLocalObservationCheck
} from '../src/localObservationCheck.js';
import { main as runLocalObservationCli } from '../scripts/check-local-observation.js';

test('runLocalObservationCheck summarizes read-only observation checks', async () => {
  const rootDir = await createObservationFixture();
  const result = await runLocalObservationCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    adminToken: 'admin-token',
    now: '2026-05-22T09:00:00.000Z',
    fetchImpl: createObservationFetch()
  });

  assert.equal(result.ready, true);
  assert.equal(result.generatedAt, '2026-05-22T09:00:00.000Z');
  assert.equal(result.values.baseUrl, 'http://127.0.0.1:3001');
  assert.equal(result.values.hasAdminToken, true);
  assert.equal(result.summary.failed, 0);
  assert.ok(result.summary.passed >= 8);
  assert.ok(result.summary.manual >= 1);
  assert.ok(result.results.some((item) => item.id === 'manual-check' && item.status === 'manual'));
  assert.equal(result.suggestedIssue.id, 'OBS-003');
  assert.match(formatLocalObservationReport(result), /로컬 웹앱 실사용 체크 결과/);
  assert.match(formatLocalObservationReport(result), /OBS-003/);
});

test('runLocalObservationCheck can verify manual quote and alert controls with a temporary stock', async () => {
  const rootDir = await createObservationFixture();
  const result = await runLocalObservationCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    adminToken: 'admin-token',
    now: '2026-05-22T09:00:00.000Z',
    runStateCheck: true,
    fetchImpl: createObservationFetch()
  });

  assert.equal(result.ready, true);
  assert.equal(result.values.runStateCheck, true);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.manual, 0);
  assert.ok(result.summary.passed >= 10);
  assert.equal(result.results.find((item) => item.id === 'manual-check')?.status, 'passed');
  assert.equal(result.results.find((item) => item.id === 'alert-controls')?.status, 'passed');
  assert.equal(result.stateCheck.ok, true);
  assert.equal(result.stateCheck.cleanedUp, true);
  assert.ok(result.stateCheck.steps.some((step) => step.id === 'manual-quote' && step.status === 'passed'));
  assert.ok(result.stateCheck.steps.some((step) => step.id === 'alert-snooze-clear' && step.status === 'passed'));
  assert.equal(result.suggestedIssue, null);
  assert.match(formatLocalObservationReport(result), /상태 변경 검증/);
});

test('runLocalObservationCheck adds live-session checks for real registered stocks', async () => {
  const rootDir = await createObservationFixture();
  const result = await runLocalObservationCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    adminToken: 'admin-token',
    now: '2026-05-22T09:00:00.000Z',
    liveSession: true,
    liveMaxAgeMinutes: 30,
    liveDividendMaxAgeHours: 72,
    fetchImpl: createObservationFetch({
      stocks: [
        {
          id: 'live-stock-1',
          symbol: '005930',
          displayName: '삼성전자',
          positionStatus: 'holding',
          active: true,
          purchasePrice: 70000,
          highPrice: 76000,
          thresholdPercent: 5,
          lastPrice: 73000,
          lastCheckedAt: '2026-05-22T08:45:00.000Z',
          lastCheckStatus: 'checked',
          dividendLastCheckedAt: '2026-05-22T08:40:00.000Z',
          dividendLastDiagnostic: {
            status: 'updated',
            checkedAt: '2026-05-22T08:40:00.000Z',
            attempts: [{ provider: 'publicdata', status: 'success' }]
          }
        }
      ],
      stocksMeta: {
        lastDividendRefresh: {
          checkedAt: '2026-05-22T08:40:00.000Z',
          results: [{ status: 'updated' }]
        }
      }
    })
  });

  assert.equal(result.ready, true);
  assert.equal(result.values.liveSession, true);
  assert.equal(result.values.liveMaxAgeMinutes, 30);
  assert.equal(result.values.liveDividendMaxAgeHours, 72);
  assert.equal(result.results.find((item) => item.id === 'live-quote-freshness')?.status, 'passed');
  assert.equal(result.results.find((item) => item.id === 'live-dividend-diagnostics')?.status, 'passed');
  assert.equal(result.results.find((item) => item.id === 'live-alert-readiness')?.status, 'passed');
  assert.match(formatLocalObservationReport(result), /장중 재검증: 사용/);
  assert.match(formatLocalObservationReport(result), /장중 시세 최신성/);
});

test('runLocalObservationCheck saves history and compares the previous result', async () => {
  const rootDir = await createObservationFixture();
  const historyDir = path.join(rootDir, 'observation-history-test');
  const first = await runLocalObservationCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    adminToken: 'admin-token',
    now: '2026-05-22T09:00:00.000Z',
    saveHistory: true,
    historyDir,
    historyLimit: 1,
    fetchImpl: createObservationFetch()
  });

  assert.equal(first.history.enabled, true);
  assert.equal(first.history.saved, true);
  assert.equal(first.history.comparison.hasPrevious, false);
  assert.match(first.history.fileName, /^observation-2026-05-22T09-00-00-000Z\.json$/);
  assert.match(formatLocalObservationReport(first), /히스토리/);
  assert.ok(await fileExists(first.history.filePath));

  const second = await runLocalObservationCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    adminToken: 'admin-token',
    now: '2026-05-22T09:30:00.000Z',
    saveHistory: true,
    historyDir,
    historyLimit: 1,
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED');
    }
  });

  assert.equal(second.ready, false);
  assert.equal(second.history.saved, true);
  assert.equal(second.history.comparison.hasPrevious, true);
  assert.ok(second.history.comparison.delta.failed > 0);
  assert.ok(
    second.history.comparison.changedResults.some(
      (item) => item.id === 'server-start' && item.from === 'passed' && item.to === 'failed'
    )
  );

  const files = await fs.readdir(historyDir);
  assert.equal(files.filter((name) => name.endsWith('.json')).length, 1);

  const report = await readLocalObservationHistoryReport({
    rootDir,
    historyDir,
    limit: 5
  });
  assert.equal(report.count, 1);
  assert.equal(report.latest.ready, false);
  assert.equal(report.recent[0].summary.failed, second.summary.failed);
  assert.equal(report.comparison.hasPrevious, false);
});

test('runAndSaveLocalObservationHistory runs a live check and returns refreshed history', async () => {
  const rootDir = await createObservationFixture();
  const historyDir = path.join(rootDir, 'observation-history-admin-run');
  const result = await runAndSaveLocalObservationHistory({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    adminToken: 'admin-token',
    now: '2026-05-22T10:00:00.000Z',
    liveSession: true,
    historyDir,
    historyLimit: 5,
    reportLimit: 3,
    fetchImpl: createObservationFetch({
      stocks: [
        {
          id: 'stock-1',
          symbol: '005930',
          displayName: '삼성전자',
          active: true,
          highPrice: 80000,
          purchasePrice: 70000,
          lastPrice: 79000,
          lastCheckedAt: '2026-05-22T09:45:00.000Z',
          lastCheckStatus: 'checked',
          dividendLastCheckedAt: '2026-05-22T09:30:00.000Z',
          dividendLastDiagnostic: {
            status: 'updated',
            checkedAt: '2026-05-22T09:30:00.000Z',
            attempts: [{ provider: 'publicdata', status: 'success' }]
          }
        }
      ],
      stocksMeta: {
        stocksMeta: {
          lastDividendRefresh: {
            checkedAt: '2026-05-22T09:30:00.000Z',
            results: [{ status: 'updated' }]
          }
        }
      }
    })
  });

  assert.equal(result.observationResult.values.saveHistory, true);
  assert.equal(result.observationResult.values.liveSession, true);
  assert.equal(result.observationResult.history.saved, true);
  assert.equal(result.observationHistory.count, 1);
  assert.equal(result.observationHistory.latest.fileName, result.observationResult.history.fileName);
  assert.equal(result.observationHistory.latest.resultCount, result.observationResult.results.length);
});

test('runLocalObservationCheck fails when the server cannot be reached', async () => {
  const rootDir = await createObservationFixture();
  const result = await runLocalObservationCheck({
    rootDir,
    baseUrl: 'http://127.0.0.1:3001',
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED');
    }
  });

  assert.equal(result.ready, false);
  assert.ok(result.summary.failed >= 1);
  assert.ok(result.results.some((item) => item.id === 'server-start' && item.status === 'failed'));
});

test('local observation args and CLI support help, json, and manual strict mode', async () => {
  const parsed = parseLocalObservationArgs([
    '--base-url',
    'http://127.0.0.1:3002',
    '--admin-token=secret',
    '--timeout-ms',
    '15000',
    '--json',
    '--fail-on-manual',
    '--run-state-check',
    '--live-session',
    '--live-max-age-minutes',
    '45',
    '--live-dividend-max-age-hours=96',
    '--save-history',
    '--history-dir',
    'data/custom-observation-history',
    '--history-limit=7'
  ]);

  assert.equal(parsed.baseUrl, 'http://127.0.0.1:3002');
  assert.equal(parsed.adminToken, 'secret');
  assert.equal(parsed.timeoutMs, '15000');
  assert.equal(parsed.json, true);
  assert.equal(parsed.failOnManual, true);
  assert.equal(parsed.runStateCheck, true);
  assert.equal(parsed.liveSession, true);
  assert.equal(parsed.liveMaxAgeMinutes, '45');
  assert.equal(parsed.liveDividendMaxAgeHours, '96');
  assert.equal(parsed.saveHistory, true);
  assert.equal(parsed.historyDir, 'data/custom-observation-history');
  assert.equal(parsed.historyLimit, '7');
  assert.match(getLocalObservationHelp(), /check:observation/);
  assert.match(getLocalObservationHelp(), /--run-state-check/);
  assert.match(getLocalObservationHelp(), /--live-session/);
  assert.match(getLocalObservationHelp(), /--save-history/);

  const helpOutput = createWritableBuffer();
  const helpCode = await runLocalObservationCli(['--help'], {
    stdout: helpOutput,
    stderr: createWritableBuffer()
  });

  assert.equal(helpCode, 0);
  assert.match(helpOutput.text, /수동 확인 항목/);

  const rootDir = await createObservationFixture();
  const jsonOutput = createWritableBuffer();
  const errorOutput = createWritableBuffer();
  const code = await runLocalObservationCli(['--json', '--fail-on-manual'], {
    rootDir,
    stdout: jsonOutput,
    stderr: errorOutput,
    fetchImpl: createObservationFetch(),
    now: '2026-05-22T09:00:00.000Z'
  });

  assert.equal(code, 1);
  assert.equal(JSON.parse(jsonOutput.text).ready, true);
  assert.match(errorOutput.text, /수동 확인 항목/);
});

async function createObservationFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-observation-'));
  await fs.mkdir(path.join(rootDir, 'public'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'public', 'app.js'),
    [
      'function getQuoteQuality() {}',
      'function renderSellDecisionPanel() {}',
      'function normalizePositionStatus() {}',
      'function alertToggle() {}',
      'function snoozeStockAlert() {}',
      'function snoozeStockAlertUntilTomorrow() {}',
      'function previewBackupItem() {}',
      'function getDisplayErrorMessage() {}',
      'function loadWatchViewPreference() {}',
      'function saveWatchViewPreference() {}',
      'function normalizeWatchFilter() {}',
      'function normalizeWatchSort() {}',
      'function parseCsvText() {}',
      'function validateCsvStockRows() {}',
      'function exportStocksCsv() {}',
      'function importStocksCsv() {}',
      'function buildAlertRuleGuides() {}',
      'function renderAlertRuleGuideComparison() {}',
      'function buildDividendApiDashboard() {}',
      'function renderDividendApiDashboard() {}',
      'const WATCH_VIEW_STORAGE_KEY = "stock_alarm_watch_view";',
      'const CSV_STOCK_FIELDS = [];',
      'const a = "quote-quality maximumProfitAmount retracement 알림 재개 /api/backups/preview /api/stocks connectionBanner 다시 연결 캐시 초기화 Failed to fetch 필요 입력 계산식 투자 권유가 아니라 dividend-provider-grid 다음 조치 DATA_GO_KR_SERVICE_KEY OPEN_DART_API_KEY ALPHA_VANTAGE_API_KEY";'
    ].join('\n')
  );
  await fs.writeFile(
    path.join(rootDir, 'public', 'index.html'),
    '<button data-watch-filter="holding"></button><button data-watch-filter="watch"></button><button data-watch-filter="sold"></button><input id="csvImportInput"><div id="csvImportResult"></div><div id="alertRuleSummary" data-alert-rule-guide></div><div id="dividendDiagnosticsPanel">배당 provider 상태</div><button>CSV 가져오기</button><button>CSV 내보내기</button><button>CSV 양식</button>'
  );
  await fs.writeFile(path.join(rootDir, 'public', 'styles.css'), '.alert-rule-guide {} .dividend-api-dashboard {} .dividend-provider-card {} .dividend-next-actions {}');

  return rootDir;
}

function createObservationFetch(options = {}) {
  const stocks = Array.isArray(options.stocks) ? [...options.stocks] : [];
  const stocksMeta = options.stocksMeta || {};

  return async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || 'GET';

    if (method === 'GET' && parsed.pathname === '/api/health') {
      return jsonResponse({
        appName: 'Stock Alarm',
        port: 3001,
        host: '127.0.0.1',
        runtimeVerified: true,
        safeStop: {
          policy: 'runtime_file_and_health_match_required',
          message: 'verified'
        }
      });
    }

    if (method === 'GET' && parsed.pathname === '/api/stocks') {
      return jsonResponse({ stocks, ...stocksMeta });
    }

    if (method === 'POST' && parsed.pathname === '/api/stocks') {
      const body = JSON.parse(options.body || '{}');
      const stock = {
        id: 'obs-stock-1',
        highPrice: body.purchasePrice,
        highPriceDate: '2026-05-22T09:00:00.000Z',
        lastCheckStatus: 'checked',
        ...body
      };
      stocks.push(stock);

      return jsonResponse({ stock }, 201);
    }

    if (method === 'POST' && parsed.pathname === '/api/stocks/obs-stock-1/test-quote') {
      const body = JSON.parse(options.body || '{}');
      stocks[0] = {
        ...stocks[0],
        lastPrice: Number(body.price),
        lastCheckStatus: 'checked'
      };

      return jsonResponse({
        checkedAt: '2026-05-22T09:00:00.000Z',
        manual: true,
        results: [
          {
            stockId: 'obs-stock-1',
            symbol: stocks[0].symbol,
            status: 'checked',
            price: Number(body.price),
            deliveryStatus: 'none'
          }
        ]
      });
    }

    if (method === 'PATCH' && parsed.pathname === '/api/stocks/obs-stock-1') {
      const body = JSON.parse(options.body || '{}');
      stocks[0] = {
        ...stocks[0],
        ...body
      };

      return jsonResponse({ stock: stocks[0] });
    }

    if (method === 'DELETE' && parsed.pathname === '/api/stocks/obs-stock-1') {
      stocks.splice(0, stocks.length);

      return jsonResponse({ ok: true });
    }

    if (method === 'GET' && parsed.pathname === '/api/backups') {
      return jsonResponse({ backups: [{ name: 'backup.json' }] });
    }

    if (method === 'POST' && parsed.pathname === '/api/backups') {
      return jsonResponse({
        backup: { name: 'store-manual-web-2026-05-22T09-00-00-000Z.json' },
        backups: [{ name: 'store-manual-web-2026-05-22T09-00-00-000Z.json' }]
      });
    }

    if (method === 'GET' && parsed.pathname === '/api/observation-issues') {
      return jsonResponse({ observationIssues: { summary: { open: 1 } } });
    }

    if (method === 'GET' && parsed.pathname === '/app') {
      return textResponse(
        '<div id="watchTitle"></div><div id="portfolioSummaryBar"></div><div id="todayActionPanel"></div><div id="stockList"></div>'
      );
    }

    if (method === 'GET' && parsed.pathname === '/admin') {
      return textResponse('<div id="serverStatusPanel"></div><div id="backupList"></div><div id="observationIssuesPanel"></div><button id="runObservationCheckButton"></button><div id="observationHistoryPanel"></div>');
    }

    return textResponse('', 404);
  };
}

function jsonResponse(body, status = 200) {
  return textResponse(JSON.stringify(body), status);
}

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text
  };
}

function createWritableBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
