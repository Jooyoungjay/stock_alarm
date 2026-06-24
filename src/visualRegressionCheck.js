import fs from 'node:fs/promises';
import path from 'node:path';

const defaultEnv = process.env;
const adminTokenStorageKey = 'stock_alarm_admin_token';
const defaultTimeoutMs = 15000;
const minimumTextLength = 40;
const minimumScreenshotBytes = 4096;
const overflowTolerancePx = 4;

const visualScenarios = Object.freeze([
  Object.freeze({
    id: 'user-desktop',
    label: '사용자 화면 데스크톱',
    path: '/',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    requiredSelectors: Object.freeze([
      '.app-header',
      '#watchTitle',
      '#openRegisterButton',
      '#portfolioSummaryBar',
      '#quoteFreshnessBanner',
      '#todayActionPanel',
      '#stockList',
      '#alertList'
    ])
  }),
  Object.freeze({
    id: 'user-mobile',
    label: '사용자 화면 모바일',
    path: '/',
    viewport: Object.freeze({ width: 390, height: 844 }),
    requiredSelectors: Object.freeze([
      '.app-header',
      '#watchTitle',
      '#openRegisterMobileButton',
      '#portfolioSummaryBar',
      '#quoteFreshnessBanner',
      '#todayActionPanel',
      '#stockList',
      '.mobile-nav'
    ])
  }),
  Object.freeze({
    id: 'admin-desktop',
    label: '관리자 화면 데스크톱',
    path: '/admin',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    requiredSelectors: Object.freeze([
      '.app-header',
      '#adminAuthTitle',
      '#serverStatusPanel',
      '#quoteDiagnosticsPanel',
      '#roadmapPanel',
      '#observationIssuesPanel',
      '#backupList'
    ])
  }),
  Object.freeze({
    id: 'admin-mobile',
    label: '관리자 화면 모바일',
    path: '/admin',
    viewport: Object.freeze({ width: 390, height: 844 }),
    requiredSelectors: Object.freeze([
      '.app-header',
      '#adminAuthTitle',
      '#serverStatusPanel',
      '#roadmapPanel',
      '#observationIssuesPanel',
      '#backupList'
    ])
  })
]);

export function getVisualRegressionScenarios() {
  return visualScenarios.map((scenario) => cloneScenario(scenario));
}

export function parseVisualRegressionArgs(args = [], options = {}) {
  const parsed = {
    env: options.env || process.env,
    rootDir: options.rootDir || process.cwd(),
    baseUrl: options.baseUrl || '',
    outputDir: options.outputDir || '',
    adminToken: options.adminToken || '',
    timeoutMs: options.timeoutMs || defaultTimeoutMs,
    json: false,
    help: false,
    failOnWarn: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-warn') {
      parsed.failOnWarn = true;
    } else if (arg === '--base-url') {
      parsed.baseUrl = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      parsed.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--output-dir') {
      parsed.outputDir = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--output-dir=')) {
      parsed.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--admin-token') {
      parsed.adminToken = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--admin-token=')) {
      parsed.adminToken = arg.slice('--admin-token='.length);
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      parsed.timeoutMs = arg.slice('--timeout-ms='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getVisualRegressionHelp() {
  return [
    '사용법: npm run check:visual -- [옵션]',
    '',
    '옵션:',
    '  --base-url <url>       실행 중인 Stock Alarm 서버 주소. 기본값 http://127.0.0.1:3000',
    '  --output-dir <path>    스크린샷 저장 폴더. 기본값 data/visual-regression/latest',
    '  --admin-token <token>  ADMIN_TOKEN 보호 화면 캡처용 토큰',
    '  --timeout-ms <ms>      각 화면 대기 시간. 기본값 15000',
    '  --json                 사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-warn         경고가 있어도 종료 코드 1로 처리',
    '  --help                 도움말 출력',
    '',
    '필요 조건:',
    '  서버를 먼저 켜세요: npm run local:start',
    '  실제 브라우저 캡처에는 playwright 패키지와 Chromium 설치가 필요합니다.'
  ].join('\n');
}

export async function runVisualRegressionCheck(input = {}) {
  const rootDir = input.rootDir || process.cwd();
  const env = input.env || defaultEnv;
  const generatedAt = normalizeGeneratedAt(input.now);
  const values = normalizeVisualRegressionValues(rootDir, env, input);
  const scenarios = getVisualRegressionScenarios();
  const checks = [
    createCheck(
      'base_url_http',
      '서버 주소',
      isHttpUrl(values.baseUrl),
      `서버 주소를 사용할 수 있습니다: ${values.baseUrl}`,
      `서버 주소는 http 또는 https URL이어야 합니다. 현재: ${values.baseUrl}`
    )
  ];

  let scenarioResults = [];
  const captureScenarios =
    input.captureScenarios === undefined ? await createPlaywrightCapture() : input.captureScenarios;

  if (!captureScenarios) {
    checks.push(
      createCheck(
        'browser_runner_available',
        '브라우저 실행기',
        false,
        '브라우저 실행기를 사용할 수 있습니다.',
        'playwright 패키지 또는 주입된 브라우저 실행기가 필요합니다.'
      )
    );

    return buildResult({ generatedAt, values, scenarios, scenarioResults, checks });
  }

  checks.push(
    createCheck(
      'browser_runner_available',
      '브라우저 실행기',
      true,
      '브라우저 실행기를 사용할 수 있습니다.',
      'playwright 패키지 또는 주입된 브라우저 실행기가 필요합니다.'
    )
  );

  if (isHttpUrl(values.baseUrl)) {
    await fs.mkdir(values.outputDir, { recursive: true });

    try {
      scenarioResults = normalizeScenarioResults(
        await captureScenarios({
          scenarios,
          values,
          baseUrl: values.baseUrl,
          outputDir: values.outputDir,
          adminToken: values.adminToken,
          timeoutMs: values.timeoutMs
        }),
        scenarios,
        values
      );
      checks.push(...buildScenarioChecks(scenarioResults));
    } catch (error) {
      checks.push(
        createCheck(
          'browser_capture_run',
          '브라우저 캡처 실행',
          false,
          '브라우저 캡처가 완료되었습니다.',
          error.message || '브라우저 캡처 중 오류가 발생했습니다.'
        )
      );
    }
  }

  return buildResult({ generatedAt, values, scenarios, scenarioResults, checks });
}

export function formatVisualRegressionReport(result) {
  const lines = [
    '브라우저 시각 회귀 점검 결과',
    `생성 시각: ${result.generatedAt}`,
    `준비 상태: ${result.ready ? 'READY' : 'NOT READY'}`,
    '',
    '주요 값:',
    `- 서버 주소: ${result.values.baseUrl}`,
    `- 스크린샷 폴더: ${result.values.outputDir}`,
    `- 관리자 토큰: ${result.values.hasAdminToken ? '설정됨' : '미설정'}`,
    `- 시나리오: ${result.values.capturedScenarioCount}/${result.values.plannedScenarioCount}`,
    '',
    '캡처 결과:'
  ];

  if (!result.scenarioResults.length) {
    lines.push('- 캡처된 화면이 없습니다.');
  } else {
    for (const item of result.scenarioResults) {
      lines.push(
        `- ${item.label}: ${item.ok ? 'OK' : 'NOT READY'} · ${item.viewport.width}x${item.viewport.height} · ${relativePath(result.values.rootDir, item.screenshotPath) || '(스크린샷 없음)'}`
      );

      if (item.error) {
        lines.push(`  오류: ${item.error}`);
      }

      if (item.missingSelectors.length) {
        lines.push(`  누락 셀렉터: ${item.missingSelectors.join(', ')}`);
      }

      if (item.horizontalOverflowPx > overflowTolerancePx) {
        lines.push(`  가로 넘침: ${item.horizontalOverflowPx}px`);
      }

      if (item.consoleErrors.length) {
        lines.push(`  콘솔 오류: ${item.consoleErrors.slice(0, 3).join(' | ')}`);
      }
    }
  }

  lines.push('', '검증 결과:');

  for (const check of result.checks) {
    const status = check.ok ? 'OK' : check.level.toUpperCase();
    lines.push(`- [${status}] ${check.label}: ${check.message}`);
  }

  lines.push(
    '',
    `요약: error=${result.summary.error}, warn=${result.summary.warn}, ok=${result.summary.ok}`
  );

  return `${lines.join('\n')}\n`;
}

async function createPlaywrightCapture() {
  let playwright;

  try {
    playwright = await import('playwright');
  } catch {
    return null;
  }

  return async function captureWithPlaywright({ scenarios, baseUrl, outputDir, adminToken, timeoutMs }) {
    const browser = await playwright.chromium.launch({ headless: true });
    const results = [];

    try {
      for (const scenario of scenarios) {
        const url = new URL(scenario.path, baseUrl).href;
        const screenshotPath = path.join(outputDir, `${scenario.id}.png`);
        const consoleErrors = [];
        let context = null;
        let page = null;

        try {
          context = await browser.newContext({
            viewport: scenario.viewport,
            deviceScaleFactor: 1
          });

          if (adminToken) {
            await context.addInitScript(
              ({ key, token }) => window.localStorage.setItem(key, token),
              { key: adminTokenStorageKey, token: adminToken }
            );
          }

          page = await context.newPage();
          page.on('console', (message) => {
            if (message.type() === 'error') {
              consoleErrors.push(message.text());
            }
          });
          page.on('pageerror', (error) => {
            consoleErrors.push(error.message);
          });

          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs
          });
          await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5000) }).catch(() => {});
          await page.waitForTimeout(500);

          const missingSelectors = [];

          for (const selector of scenario.requiredSelectors) {
            const visible = await page
              .locator(selector)
              .first()
              .isVisible({ timeout: 1000 })
              .catch(() => false);

            if (!visible) {
              missingSelectors.push(selector);
            }
          }

          const metrics = await page.evaluate(() => {
            const root = document.documentElement;
            const body = document.body;

            return {
              title: document.title,
              textLength: (body?.innerText || '').trim().length,
              scrollWidth: root?.scrollWidth || 0,
              clientWidth: root?.clientWidth || window.innerWidth,
              scrollHeight: root?.scrollHeight || 0
            };
          });

          await page.screenshot({ path: screenshotPath, fullPage: true });
          const stat = await fs.stat(screenshotPath);

          results.push({
            ...scenario,
            url,
            screenshotPath,
            screenshotSize: stat.size,
            textLength: metrics.textLength,
            horizontalOverflowPx: Math.max(0, metrics.scrollWidth - metrics.clientWidth),
            pageTitle: metrics.title,
            pageHeight: metrics.scrollHeight,
            missingSelectors,
            consoleErrors
          });
        } catch (error) {
          results.push({
            ...scenario,
            url,
            screenshotPath,
            error: error.message || String(error),
            missingSelectors: [...scenario.requiredSelectors],
            consoleErrors
          });
        } finally {
          await context?.close().catch(() => {});
        }
      }
    } finally {
      await browser.close();
    }

    return results;
  };
}

function normalizeVisualRegressionValues(rootDir, env, input) {
  const baseUrl = trimTrailingSlash(
    input.baseUrl || firstValue(env.VISUAL_REGRESSION_BASE_URL) || 'http://127.0.0.1:3000'
  );
  const outputDir =
    input.outputDir ||
    firstValue(env.VISUAL_REGRESSION_OUTPUT_DIR) ||
    path.join('data', 'visual-regression', 'latest');

  return {
    rootDir,
    baseUrl,
    outputDir: path.resolve(rootDir, outputDir),
    adminToken:
      input.adminToken ||
      firstValue(env.VISUAL_REGRESSION_ADMIN_TOKEN) ||
      firstValue(env.ADMIN_TOKEN) ||
      '',
    timeoutMs: normalizeTimeout(input.timeoutMs || firstValue(env.VISUAL_REGRESSION_TIMEOUT_MS))
  };
}

function normalizeScenarioResults(rawResults, scenarios, values) {
  const resultsById = new Map((Array.isArray(rawResults) ? rawResults : []).map((item) => [item.id, item]));

  return scenarios.map((scenario) => {
    const result = resultsById.get(scenario.id) || {};
    const screenshotPath = result.screenshotPath
      ? path.resolve(values.rootDir, result.screenshotPath)
      : path.join(values.outputDir, `${scenario.id}.png`);
    const missingSelectors = Array.isArray(result.missingSelectors)
      ? result.missingSelectors
      : [];
    const consoleErrors = Array.isArray(result.consoleErrors) ? result.consoleErrors : [];
    const textLength = normalizeNumber(result.textLength);
    const screenshotSize = normalizeNumber(result.screenshotSize);
    const horizontalOverflowPx = normalizeNumber(result.horizontalOverflowPx);
    const ok =
      !result.error &&
      textLength >= minimumTextLength &&
      screenshotSize >= minimumScreenshotBytes &&
      missingSelectors.length === 0;

    return {
      id: scenario.id,
      label: scenario.label,
      path: scenario.path,
      url: result.url || new URL(scenario.path, values.baseUrl).href,
      viewport: scenario.viewport,
      requiredSelectors: [...scenario.requiredSelectors],
      screenshotPath,
      screenshotSize,
      textLength,
      horizontalOverflowPx,
      pageTitle: result.pageTitle || '',
      pageHeight: normalizeNumber(result.pageHeight),
      missingSelectors,
      consoleErrors,
      error: result.error || '',
      ok
    };
  });
}

function buildScenarioChecks(results) {
  const checks = [];

  for (const result of results) {
    checks.push(
      createCheck(
        `${result.id}_page_loaded`,
        `${result.label} 로딩`,
        !result.error && result.textLength >= minimumTextLength,
        `화면 텍스트를 확인했습니다. ${result.textLength}자`,
        result.error || `화면 텍스트가 부족합니다. ${result.textLength}자`
      ),
      createCheck(
        `${result.id}_required_selectors`,
        `${result.label} 핵심 영역`,
        result.missingSelectors.length === 0,
        '핵심 영역 셀렉터가 모두 보입니다.',
        `보이지 않는 셀렉터: ${result.missingSelectors.join(', ') || '-'}`
      ),
      createCheck(
        `${result.id}_screenshot_written`,
        `${result.label} 스크린샷`,
        result.screenshotSize >= minimumScreenshotBytes,
        `스크린샷을 저장했습니다. ${formatBytes(result.screenshotSize)}`,
        `스크린샷 파일이 없거나 너무 작습니다. ${formatBytes(result.screenshotSize)}`
      ),
      createCheck(
        `${result.id}_horizontal_overflow`,
        `${result.label} 가로 넘침`,
        result.horizontalOverflowPx <= overflowTolerancePx,
        '가로 스크롤 넘침이 허용 범위 안입니다.',
        `가로 넘침이 ${result.horizontalOverflowPx}px 감지되었습니다.`,
        'warn'
      ),
      createCheck(
        `${result.id}_console_errors`,
        `${result.label} 콘솔 오류`,
        result.consoleErrors.length === 0,
        '브라우저 콘솔 오류가 없습니다.',
        `콘솔 오류 ${result.consoleErrors.length}개: ${result.consoleErrors.slice(0, 2).join(' | ')}`,
        'warn'
      )
    );
  }

  return checks;
}

function buildResult({ generatedAt, values, scenarios, scenarioResults, checks }) {
  const summary = summarizeChecks(checks);

  return {
    ready: summary.error === 0,
    generatedAt,
    values: {
      rootDir: values.rootDir,
      baseUrl: values.baseUrl,
      outputDir: values.outputDir,
      hasAdminToken: Boolean(values.adminToken),
      timeoutMs: values.timeoutMs,
      plannedScenarioCount: scenarios.length,
      capturedScenarioCount: scenarioResults.length
    },
    summary,
    checks,
    scenarios,
    scenarioResults
  };
}

function cloneScenario(scenario) {
  return {
    ...scenario,
    viewport: { ...scenario.viewport },
    requiredSelectors: [...scenario.requiredSelectors]
  };
}

function createCheck(name, label, ok, successMessage, failureMessage, level = 'error') {
  return {
    name,
    label,
    level,
    ok: Boolean(ok),
    message: ok ? successMessage : failureMessage
  };
}

function summarizeChecks(checks) {
  return checks.reduce(
    (summary, check) => {
      if (check.ok) {
        summary.ok += 1;
      } else {
        summary[check.level] += 1;
      }

      return summary;
    },
    { ok: 0, warn: 0, error: 0 }
  );
}

function normalizeGeneratedAt(value) {
  if (value) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function normalizeTimeout(value) {
  const timeoutMs = Number(value || defaultTimeoutMs);

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    return defaultTimeoutMs;
  }

  return Math.min(timeoutMs, 60000);
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function firstValue(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function relativePath(rootDir, targetPath) {
  if (!targetPath) {
    return '';
  }

  return path.relative(rootDir, targetPath).replaceAll(path.sep, '/');
}

function formatBytes(value) {
  const bytes = normalizeNumber(value);

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
