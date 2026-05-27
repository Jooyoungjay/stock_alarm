import fs from 'node:fs/promises';
import path from 'node:path';

const defaultBaseUrl = 'http://127.0.0.1:3000';
const defaultTimeoutMs = 10000;
const defaultLiveMaxAgeMinutes = 30;
const defaultLiveDividendMaxAgeHours = 72;
const defaultHistoryLimit = 30;
const defaultHistoryDirName = 'observation-history';
const defaultEnv = process.env;

const statusLabels = {
  passed: '통과',
  failed: '실패',
  manual: '수동 필요'
};

export function parseLocalObservationArgs(args = [], options = {}) {
  const parsed = {
    env: options.env || defaultEnv,
    rootDir: options.rootDir || process.cwd(),
    baseUrl: options.baseUrl || '',
    adminToken: options.adminToken || '',
    timeoutMs: options.timeoutMs || defaultTimeoutMs,
    json: false,
    help: false,
    failOnManual: false,
    runStateCheck: false,
    liveSession: false,
    liveMaxAgeMinutes: defaultLiveMaxAgeMinutes,
    liveDividendMaxAgeHours: defaultLiveDividendMaxAgeHours,
    saveHistory: false,
    historyDir: '',
    historyLimit: defaultHistoryLimit
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-manual') {
      parsed.failOnManual = true;
    } else if (arg === '--run-state-check') {
      parsed.runStateCheck = true;
    } else if (arg === '--live-session') {
      parsed.liveSession = true;
    } else if (arg === '--save-history') {
      parsed.saveHistory = true;
    } else if (arg === '--base-url') {
      parsed.baseUrl = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      parsed.baseUrl = arg.slice('--base-url='.length);
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
    } else if (arg === '--live-max-age-minutes') {
      parsed.liveMaxAgeMinutes = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--live-max-age-minutes=')) {
      parsed.liveMaxAgeMinutes = arg.slice('--live-max-age-minutes='.length);
    } else if (arg === '--live-dividend-max-age-hours') {
      parsed.liveDividendMaxAgeHours = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--live-dividend-max-age-hours=')) {
      parsed.liveDividendMaxAgeHours = arg.slice('--live-dividend-max-age-hours='.length);
    } else if (arg === '--history-dir') {
      parsed.historyDir = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--history-dir=')) {
      parsed.historyDir = arg.slice('--history-dir='.length);
    } else if (arg === '--history-limit') {
      parsed.historyLimit = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--history-limit=')) {
      parsed.historyLimit = arg.slice('--history-limit='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getLocalObservationHelp() {
  return [
    '사용법: npm run check:observation -- [옵션]',
    '',
    '옵션:',
    '  --base-url <url>       실행 중인 Stock Alarm 서버 주소. 기본값 http://127.0.0.1:3000',
    '  --admin-token <token>  ADMIN_TOKEN 보호 API 점검용 토큰',
    '  --timeout-ms <ms>      HTTP 요청 제한 시간. 기본값 10000',
    '  --json                 사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-manual       수동 확인 항목이 남아도 종료 코드 1로 처리',
    '  --run-state-check      검증용 종목으로 즉시 확인과 알림 제어 저장 흐름까지 실행',
    '  --live-session         실제 등록 종목의 장중 시세/배당/알림 상태를 추가 검증',
    `  --live-max-age-minutes <분>       장중 시세 최신성 기준. 기본값 ${defaultLiveMaxAgeMinutes}`,
    `  --live-dividend-max-age-hours <시간> 배당 진단 최신성 기준. 기본값 ${defaultLiveDividendMaxAgeHours}`,
    '  --save-history         점검 결과를 JSON 파일로 저장하고 직전 결과와 비교',
    `  --history-dir <path>   히스토리 저장 폴더. 기본값 DATA_DIR/${defaultHistoryDirName}`,
    `  --history-limit <개수> 보관할 최근 히스토리 파일 수. 기본값 ${defaultHistoryLimit}`,
    '  --help                 도움말 출력',
    '',
    '주의:',
    '  기본 점검은 읽기 중심 smoke check입니다.',
    '  --run-state-check는 사전 백업 후 검증용 종목을 만들고 삭제하는 데이터 변경 점검입니다.',
    '  --live-session은 읽기 전용이며, 장중 즉시 확인이나 배당 새로고침을 실행한 뒤 쓰면 실데이터 상태를 검증합니다.',
    `  --save-history는 기본적으로 data/${defaultHistoryDirName}/ 아래에 점검 기록을 남깁니다.`
  ].join('\n');
}

export async function runLocalObservationCheck(input = {}) {
  const rootDir = input.rootDir || process.cwd();
  const env = input.env || defaultEnv;
  const generatedAt = normalizeGeneratedAt(input.now);
  const values = normalizeValues(rootDir, env, input);
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  const staticFiles = await readStaticFiles(rootDir);
  const context = {
    health: null,
    stocks: null,
    backups: null,
    observationIssues: null,
    userHtml: '',
    adminHtml: '',
    stateCheck: null,
    fetchErrors: {}
  };

  if (!isHttpUrl(values.baseUrl)) {
    return buildAndMaybeSaveResult({
      generatedAt,
      values,
      results: [
        createResult(
          'server-start',
          '서버 시작과 접속 주소',
          '포트가 명확히 표시되고 `/app`이 열린다',
          'failed',
          `서버 주소가 http 또는 https URL이 아닙니다: ${values.baseUrl}`,
          '실행 중인 서버 주소를 --base-url로 지정합니다.'
        )
      ]
    });
  }

  await Promise.all([
    fetchJson('/api/health', values, fetchImpl).then((result) => {
      context.health = result.data;
      context.fetchErrors.health = result.error;
    }),
    fetchJson('/api/stocks', values, fetchImpl, { admin: false }).then((result) => {
      context.stocks = result.data;
      context.fetchErrors.stocks = result.error;
    }),
    fetchJson('/api/backups', values, fetchImpl).then((result) => {
      context.backups = result.data;
      context.fetchErrors.backups = result.error;
    }),
    fetchJson('/api/observation-issues', values, fetchImpl).then((result) => {
      context.observationIssues = result.data;
      context.fetchErrors.observationIssues = result.error;
    }),
    fetchText('/app', values, fetchImpl, { admin: false }).then((result) => {
      context.userHtml = result.text;
      context.fetchErrors.userHtml = result.error;
    }),
    fetchText('/admin', values, fetchImpl).then((result) => {
      context.adminHtml = result.text;
      context.fetchErrors.adminHtml = result.error;
    })
  ]);

  if (values.runStateCheck) {
    context.stateCheck = await runStateMutationCheck(values, fetchImpl, generatedAt);
  }

  const results = [
    checkServerAccess(context),
    checkUserHome(context),
    checkAdminHome(context),
    checkManualQuoteFlow(context),
    checkQuoteQuality(staticFiles),
    checkAlertControls(staticFiles, context),
    checkPositionStatus(staticFiles),
    checkWatchViewPreference(staticFiles),
    checkCsvImportExport(staticFiles),
    checkAlertRuleGuide(staticFiles),
    checkDividendApiDashboard(staticFiles),
    checkSellDecision(staticFiles),
    checkBackupPreview(staticFiles, context),
    checkConnectionFailure(staticFiles),
    checkSafeStop(context)
  ];

  if (values.liveSession) {
    results.push(
      checkLiveQuoteFreshness(context, values, generatedAt),
      checkLiveDividendDiagnostics(context, values, generatedAt),
      checkLiveAlertReadiness(context, generatedAt)
    );
  }

  return buildAndMaybeSaveResult({ generatedAt, values, results, stateCheck: context.stateCheck });
}

export function formatLocalObservationReport(result) {
  const lines = [
    '로컬 웹앱 실사용 체크 결과',
    `생성 시각: ${result.generatedAt}`,
    `준비 상태: ${result.ready ? 'READY' : 'NOT READY'}`,
    '',
    '주요 값:',
    `- 서버 주소: ${result.values.baseUrl}`,
    `- 관리자 토큰: ${result.values.hasAdminToken ? '설정됨' : '미설정'}`,
    `- 타임아웃: ${result.values.timeoutMs}ms`,
    ...(result.values.liveSession
      ? [
          `- 장중 재검증: 사용`,
          `- 장중 시세 최신성 기준: ${result.values.liveMaxAgeMinutes}분`,
          `- 배당 진단 최신성 기준: ${result.values.liveDividendMaxAgeHours}시간`
        ]
      : []),
    '',
    '체크 결과:'
  ];

  for (const item of result.results) {
    lines.push(`- [${item.statusLabel}] ${item.item}: ${item.evidence}`);
    if (item.nextAction) {
      lines.push(`  다음 조치: ${item.nextAction}`);
    }
  }

  if (result.stateCheck) {
    lines.push('', '상태 변경 검증:');
    lines.push(`- 사전 백업: ${result.stateCheck.backupName || '확인 안 됨'}`);
    lines.push(`- 테스트 종목: ${result.stateCheck.symbol || '-'} / 정리: ${result.stateCheck.cleanedUp ? '완료' : '확인 필요'}`);
    for (const step of result.stateCheck.steps) {
      lines.push(`- [${statusLabels[step.status] || statusLabels.failed}] ${step.label}: ${step.evidence}`);
    }
  }

  lines.push(
    '',
    `요약: failed=${result.summary.failed}, manual=${result.summary.manual}, passed=${result.summary.passed}`
  );

  if (result.history?.enabled) {
    lines.push('', '히스토리:');
    if (result.history.saved) {
      lines.push(`- 저장 파일: ${result.history.filePath}`);
      lines.push(`- 보관 폴더: ${result.history.historyDir}`);

      if (result.history.comparison?.hasPrevious) {
        const comparison = result.history.comparison;
        lines.push(`- 직전 점검: ${comparison.previous.generatedAt} · ${comparison.previous.ready ? 'READY' : 'NOT READY'}`);
        lines.push(`- 변화: ${formatHistoryDelta(comparison.delta)}`);

        if (comparison.changedResults.length) {
          lines.push(
            `- 상태 변경: ${comparison.changedResults
              .slice(0, 5)
              .map((item) => `${item.item} ${formatStatusLabel(item.from)}→${formatStatusLabel(item.to)}`)
              .join(', ')}`
          );
        } else {
          lines.push('- 상태 변경: 없음');
        }
      } else {
        lines.push('- 직전 점검: 없음. 이번 결과가 비교 기준입니다.');
      }
    } else {
      lines.push(`- 저장 실패: ${result.history.error || '원인 미상'}`);
    }
  }

  if (result.suggestedIssue) {
    lines.push(
      '',
      '신규 OBS 후보:',
      `- ${result.suggestedIssue.id} · ${result.suggestedIssue.content}`,
      `  다음 조치: ${result.suggestedIssue.nextAction}`
    );
  }

  return `${lines.join('\n')}\n`;
}

export async function readLocalObservationHistoryReport(input = {}) {
  const rootDir = input.rootDir || process.cwd();
  const env = input.env || defaultEnv;
  const dataDir = input.dataDir || firstValue(env.DATA_DIR) || path.join(rootDir, 'data');
  const historyDir = normalizeHistoryDir(
    rootDir,
    input.historyDir || firstValue(env.LOCAL_OBSERVATION_HISTORY_DIR),
    dataDir
  );
  const limit = normalizeBoundedNumber(
    input.limit || firstValue(env.LOCAL_OBSERVATION_HISTORY_LIMIT),
    defaultHistoryLimit,
    { min: 1, max: 365 }
  );
  const entries = await readLocalObservationHistory(historyDir, { limit });
  const latest = entries[0] || null;
  const previous = entries[1] || null;

  return {
    schemaVersion: 1,
    historyDir,
    limit,
    count: entries.length,
    latest: latest ? summarizeObservationHistoryEntry(latest) : null,
    comparison: latest ? compareObservationHistory(latest, previous) : null,
    recent: entries.map(summarizeObservationHistoryEntry)
  };
}

export async function runAndSaveLocalObservationHistory(input = {}) {
  const result = await runLocalObservationCheck({
    ...input,
    saveHistory: true
  });
  const history = await readLocalObservationHistoryReport({
    ...input,
    historyDir: result.values.historyDir,
    limit: input.reportLimit || input.limit || 8
  });

  return {
    observationResult: result,
    observationHistory: history
  };
}

function checkServerAccess(context) {
  const health = context.health || {};
  const ok = Boolean(['Stock Alarm', 'stock_alarm'].includes(health.appName) && health.port);

  return createResult(
    'server-start',
    '서버 시작과 접속 주소',
    '포트가 명확히 표시되고 `/app`이 열린다',
    ok ? 'passed' : 'failed',
    ok
      ? `Stock Alarm 서버 확인. 포트 ${health.port}, HOST ${health.host || '-'}`
      : context.fetchErrors.health || '헬스 체크 응답을 확인하지 못했습니다.',
    ok ? '' : '서버를 켠 뒤 다시 실행합니다: npm run local:start'
  );
}

function checkUserHome(context) {
  const ok = containsAll(context.userHtml, [
    'watchTitle',
    'portfolioSummaryBar',
    'todayActionPanel',
    'stockList'
  ]);

  return createResult(
    'user-home',
    '사용자 첫 화면',
    '`내 계좌 상황`, 포트폴리오 요약, 오늘 확인할 일, 감시 종목이 보인다',
    ok ? 'passed' : 'failed',
    ok ? '/app HTML에서 사용자 핵심 영역을 확인했습니다.' : context.fetchErrors.userHtml || '/app HTML 핵심 영역이 부족합니다.',
    ok ? '' : '/app 접속과 public/index.html 렌더링을 확인합니다.'
  );
}

function checkAdminHome(context) {
  const ok = containsAll(context.adminHtml, [
    'serverStatusPanel',
    'backupList',
    'observationIssuesPanel',
    'observationHistoryPanel',
    'runObservationCheckButton'
  ]);

  return createResult(
    'admin-home',
    '관리자 첫 화면',
    '서버 상태, 자동 백업, 종료 안전장치가 보인다',
    ok ? 'passed' : 'failed',
    ok ? '/admin HTML에서 관리자 핵심 영역을 확인했습니다.' : context.fetchErrors.adminHtml || '/admin HTML 핵심 영역이 부족합니다.',
    ok ? '' : '/admin 화면과 관리자 보호 토큰 설정을 확인합니다.'
  );
}

function checkManualQuoteFlow(context) {
  if (context.stateCheck) {
    const step = findStateCheckStep(context.stateCheck, 'manual-quote');
    const ok = context.stateCheck.ok && step?.status === 'passed';

    return createResult(
      'manual-check',
      '즉시 확인',
      '성공/실패 결과가 메시지와 종목 카드에 반영된다',
      ok ? 'passed' : 'failed',
      ok
        ? step.evidence
        : step?.evidence || context.stateCheck.error || '상태 변경 검증에서 즉시 확인 흐름을 완료하지 못했습니다.',
      ok ? '' : '검증용 종목 정리 여부를 확인한 뒤 --run-state-check를 다시 실행합니다.'
    );
  }

  const stocks = Array.isArray(context.stocks?.stocks) ? context.stocks.stocks : [];

  return createResult(
    'manual-check',
    '즉시 확인',
    '성공/실패 결과가 메시지와 종목 카드에 반영된다',
    'manual',
    stocks.length
      ? `등록 종목 ${stocks.length}개 확인. 실제 시세 요청과 알림 전송 가능성이 있어 자동 실행하지 않았습니다.`
      : '등록 종목이 없어 즉시 확인의 성공/실패 반영을 실제 데이터로 확인하지 못했습니다.',
    stocks.length ? '장중에 관리자 화면에서 즉시 확인을 1회 실행하고 메시지와 종목 카드 변화를 기록합니다.' : '테스트 종목을 1개 등록한 뒤 장중 즉시 확인을 실행합니다.'
  );
}

function checkQuoteQuality(staticFiles) {
  const ok = containsAll(staticFiles.appJs, ['function getQuoteQuality', 'quote-quality']);

  return createResult(
    'quote-quality',
    '시세 품질',
    '정상/지연/오래됨/실패 배지가 납득 가능하게 보인다',
    ok ? 'passed' : 'failed',
    ok ? '시세 품질 계산 함수와 배지 렌더링 연결을 확인했습니다.' : '시세 품질 배지 렌더링 코드를 찾지 못했습니다.',
    ok ? '' : '종목 카드의 시세 품질 표시 연결을 복구합니다.'
  );
}

function checkAlertControls(staticFiles, context) {
  const stocks = Array.isArray(context.stocks?.stocks) ? context.stocks.stocks : [];
  const wired = containsAll(staticFiles.appJs, [
    'function alertToggle',
    'snoozeStockAlert',
    'snoozeStockAlertUntilTomorrow',
    '알림 재개'
  ]);

  if (!wired) {
    return createResult(
      'alert-controls',
      '알림 제어',
      '토글, 1시간 쉬기, 오늘 쉬기, 해제가 저장된다',
      'failed',
      '알림 제어 버튼 또는 저장 함수 연결을 찾지 못했습니다.',
      '종목 카드 알림 제어 렌더링과 updateStock 연결을 확인합니다.'
    );
  }

  if (context.stateCheck) {
    const requiredStepIds = ['alert-off', 'alert-on', 'alert-snooze-hour', 'alert-snooze-today', 'alert-snooze-clear'];
    const steps = requiredStepIds.map((id) => findStateCheckStep(context.stateCheck, id));
    const ok = context.stateCheck.ok && steps.every((step) => step?.status === 'passed');
    const evidence = ok
      ? `알림 끄기/켜기, 1시간 쉬기, 오늘 쉬기, 해제 저장 확인. ${steps.map((step) => step.evidence).join(' / ')}`
      : steps.find((step) => step?.status === 'failed')?.evidence || context.stateCheck.error || '알림 제어 저장 검증을 완료하지 못했습니다.';

    return createResult(
      'alert-controls',
      '알림 제어',
      '토글, 1시간 쉬기, 오늘 쉬기, 해제가 저장된다',
      ok ? 'passed' : 'failed',
      evidence,
      ok ? '' : '검증용 종목 정리 여부를 확인한 뒤 알림 제어 API 저장 흐름을 다시 확인합니다.'
    );
  }

  return createResult(
    'alert-controls',
    '알림 제어',
    '토글, 1시간 쉬기, 오늘 쉬기, 해제가 저장된다',
    stocks.length ? 'manual' : 'manual',
    stocks.length
      ? `알림 제어 UI 연결 확인. 등록 종목 ${stocks.length}개가 있어 실제 저장 확인은 수동으로 남겼습니다.`
      : '알림 제어 UI 연결은 확인했지만 등록 종목이 없어 저장 흐름은 미실행입니다.',
    '실제 종목 카드에서 알림 끄기, 1시간 쉬기, 오늘 쉬기, 해제를 차례로 눌러 저장 여부를 확인합니다.'
  );
}

function checkPositionStatus(staticFiles) {
  const ok = containsAll(staticFiles.indexHtml, ['data-watch-filter="holding"', 'data-watch-filter="watch"', 'data-watch-filter="sold"'])
    && staticFiles.appJs.includes('normalizePositionStatus');

  return createResult(
    'position-status',
    '종목 상태',
    '보유/관심/매도 필터가 의도대로 동작한다',
    ok ? 'passed' : 'failed',
    ok ? '보유/관심/매도 필터와 상태 정규화 연결을 확인했습니다.' : '종목 상태 필터 또는 정규화 연결을 찾지 못했습니다.',
    ok ? '' : '종목 상태 필터 버튼과 normalizePositionStatus 연결을 확인합니다.'
  );
}

function checkWatchViewPreference(staticFiles) {
  const ok = containsAll(staticFiles.appJs, [
    'WATCH_VIEW_STORAGE_KEY',
    'loadWatchViewPreference',
    'saveWatchViewPreference',
    'normalizeWatchFilter',
    'normalizeWatchSort'
  ]);

  return createResult(
    'watch-view-preference',
    '종목 목록 저장 필터',
    '필터와 정렬 선택이 브라우저에 저장되고 다음 방문 때 복원된다',
    ok ? 'passed' : 'failed',
    ok ? '필터/정렬 로컬 저장과 복원 연결을 확인했습니다.' : '필터/정렬 저장 또는 복원 코드를 찾지 못했습니다.',
    ok ? '' : 'watchFilter/watchSort 변경 시 localStorage 저장과 초기 복원 연결을 확인합니다.'
  );
}

function checkCsvImportExport(staticFiles) {
  const ok = containsAll(staticFiles.indexHtml, [
    'csvImportInput',
    'csvImportResult',
    'CSV 가져오기',
    'CSV 내보내기',
    'CSV 양식'
  ]) && containsAll(staticFiles.appJs, [
    'CSV_STOCK_FIELDS',
    'parseCsvText',
    'validateCsvStockRows',
    'exportStocksCsv',
    'importStocksCsv',
    '/api/stocks'
  ]);

  return createResult(
    'csv-import-export',
    'CSV 가져오기/내보내기',
    '종목 목록을 CSV로 내려받고 검증 후 일괄 등록할 수 있다',
    ok ? 'passed' : 'failed',
    ok ? 'CSV 양식/내보내기/가져오기 UI와 검증 후 등록 흐름을 확인했습니다.' : 'CSV 가져오기/내보내기 연결을 찾지 못했습니다.',
    ok ? '' : 'CSV 버튼, 파일 입력, 파서, 행 검증, /api/stocks 등록 연결을 확인합니다.'
  );
}

function checkAlertRuleGuide(staticFiles) {
  const ok = containsAll(staticFiles.indexHtml, [
    'alertRuleSummary',
    'data-alert-rule-guide'
  ]) && containsAll(staticFiles.appJs, [
    'buildAlertRuleGuides',
    'renderAlertRuleGuideComparison',
    '필요 입력',
    '계산식',
    '투자 권유가 아니라'
  ]) && staticFiles.stylesCss.includes('alert-rule-guide');

  return createResult(
    'alert-rule-guide',
    '알림 기준 설명',
    '알림 기준별 필요 입력값, 계산식, 예시, 주의점이 투자 권유 없이 비교된다',
    ok ? 'passed' : 'failed',
    ok ? '알림 기준 비교 안내와 등록/편집 재사용 연결을 확인했습니다.' : '알림 기준 비교 안내 연결을 찾지 못했습니다.',
    ok ? '' : '등록/편집 화면의 알림 기준 안내, 계산식, 투자 권유 방지 문구를 확인합니다.'
  );
}

function checkDividendApiDashboard(staticFiles) {
  const ok = containsAll(staticFiles.indexHtml, [
    'dividendDiagnosticsPanel',
    '배당 provider 상태'
  ]) && containsAll(staticFiles.appJs, [
    'buildDividendApiDashboard',
    'renderDividendApiDashboard',
    'dividend-provider-grid',
    '다음 조치',
    'DATA_GO_KR_SERVICE_KEY',
    'OPEN_DART_API_KEY',
    'ALPHA_VANTAGE_API_KEY'
  ]) && containsAll(staticFiles.stylesCss, [
    'dividend-api-dashboard',
    'dividend-provider-card',
    'dividend-next-actions'
  ]);

  return createResult(
    'dividend-api-dashboard',
    '배당 API 자동 검증',
    '최근 자동 검증 상태, provider별 결과, 다음 조치가 관리자 화면에서 보인다',
    ok ? 'passed' : 'failed',
    ok ? '배당 API 자동 검증 대시보드와 provider별 다음 조치 연결을 확인했습니다.' : '배당 API 자동 검증 대시보드 연결을 찾지 못했습니다.',
    ok ? '' : '관리자 운영 진단의 배당 API 요약, provider 카드, 다음 조치 표시를 확인합니다.'
  );
}

function checkSellDecision(staticFiles) {
  const ok = containsAll(staticFiles.appJs, ['renderSellDecisionPanel', 'maximumProfitAmount', 'retracement']);

  return createResult(
    'sell-decision',
    '매도 판단',
    '기준가 거리와 최대 수익금/반납률 설명이 이해된다',
    ok ? 'passed' : 'failed',
    ok ? '매도 판단 패널과 최대 수익금/반납률 계산 연결을 확인했습니다.' : '매도 판단 패널 연결을 찾지 못했습니다.',
    ok ? '' : '매도 판단 패널 렌더링과 반납률 계산 필드를 확인합니다.'
  );
}

function checkBackupPreview(staticFiles, context) {
  const wired = containsAll(staticFiles.appJs, ['previewBackupItem', '/api/backups/preview']);
  const backups = Array.isArray(context.backups?.backups) ? context.backups.backups : [];

  if (!wired) {
    return createResult(
      'backup-preview',
      '백업 미리보기',
      '복구 전 종목/알림/기기 개수와 샘플을 확인할 수 있다',
      'failed',
      '백업 미리보기 UI 연결을 찾지 못했습니다.',
      '백업 목록의 미리보기 버튼과 /api/backups/preview 연결을 복구합니다.'
    );
  }

  if (context.fetchErrors.backups) {
    return createResult(
      'backup-preview',
      '백업 미리보기',
      '복구 전 종목/알림/기기 개수와 샘플을 확인할 수 있다',
      'manual',
      `백업 미리보기 UI는 확인했지만 백업 API 확인은 보류했습니다. ${context.fetchErrors.backups}`,
      'ADMIN_TOKEN을 지정해 다시 실행하거나 관리자 화면에서 백업 미리보기를 직접 확인합니다.'
    );
  }

  return createResult(
    'backup-preview',
    '백업 미리보기',
    '복구 전 종목/알림/기기 개수와 샘플을 확인할 수 있다',
    'passed',
    `백업 목록 API와 미리보기 UI 연결을 확인했습니다. 백업 ${backups.length}개`,
    backups.length ? '' : '실제 복구 전 확인은 백업이 생긴 뒤 한 번 더 확인합니다.'
  );
}

function checkConnectionFailure(staticFiles) {
  const ok = containsAll(staticFiles.appJs, [
    'connectionBanner',
    '다시 연결',
    '캐시 초기화',
    'getDisplayErrorMessage',
    'Failed to fetch'
  ]);

  return createResult(
    'connection-failure',
    '연결 실패 안내',
    '`Failed to fetch` 대신 안내 배너와 다시 연결/캐시 초기화가 보인다',
    ok ? 'passed' : 'failed',
    ok ? '연결 실패 배너, 다시 연결, 캐시 초기화, 오류 문구 변환 연결을 확인했습니다.' : '연결 실패 안내 연결을 찾지 못했습니다.',
    ok ? '' : '연결 실패 배너와 fetch 오류 문구 변환을 복구합니다.'
  );
}

function checkSafeStop(context) {
  const health = context.health || {};
  const ok = Boolean(health.safeStop?.policy || health.safeStop?.message);

  return createResult(
    'safe-stop',
    '안전 종료',
    '`node scripts\\stop-server.js`가 Stock Alarm 서버만 종료한다',
    ok ? 'passed' : 'failed',
    ok
      ? `헬스 체크 안전 종료 정책 확인. ${health.runtimeVerified ? '실행 정보 일치' : '실행 정보 확인 필요'}`
      : '헬스 체크에서 안전 종료 정책을 확인하지 못했습니다.',
    ok ? '실제 종료는 수행하지 않았습니다. 종료가 필요할 때 stop-local.bat 또는 npm run stop을 사용합니다.' : 'runtimeInfo와 /api/health 안전 종료 정보를 확인합니다.'
  );
}

function checkLiveQuoteFreshness(context, values, generatedAt) {
  if (context.fetchErrors.stocks) {
    return createResult(
      'live-quote-freshness',
      '장중 시세 최신성',
      '실제 등록 종목의 현재가와 마지막 확인 시각이 장중 기준 안에 있다',
      'failed',
      `종목 API 확인 실패: ${context.fetchErrors.stocks}`,
      '서버와 관리자 토큰을 확인한 뒤 다시 실행합니다.'
    );
  }

  const stocks = getObservationStocks(context);
  const activeStocks = stocks.filter((stock) => stock.active !== false);
  const now = new Date(generatedAt);
  const maxAgeMinutes = values.liveMaxAgeMinutes;

  if (!activeStocks.length) {
    return createResult(
      'live-quote-freshness',
      '장중 시세 최신성',
      '실제 등록 종목의 현재가와 마지막 확인 시각이 장중 기준 안에 있다',
      'manual',
      '보유 또는 관심 상태의 알림 대상 종목이 없습니다.',
      '실제 확인할 종목을 1개 이상 등록하고 알림을 켠 뒤 다시 실행합니다.'
    );
  }

  const failures = activeStocks.filter((stock) => stock.lastCheckStatus === 'error' || String(stock.lastError || '').trim());
  const missing = activeStocks.filter((stock) => getStockQuoteCheckedAt(stock) === '' || !hasPositiveNumber(stock.lastPrice));
  const stale = activeStocks.filter((stock) => {
    const checkedAt = getStockQuoteCheckedAt(stock);
    const age = getAgeMinutes(checkedAt, now);

    return checkedAt && Number.isFinite(age) && age > maxAgeMinutes;
  });
  const freshCount = Math.max(0, activeStocks.length - failures.length - missing.length - stale.length);
  const ok = failures.length === 0 && missing.length === 0 && stale.length === 0;
  const evidence = [
    `대상 ${activeStocks.length}개`,
    `최신 ${freshCount}개`,
    `조회 실패 ${failures.length}개`,
    `미확인 ${missing.length}개`,
    `오래됨 ${stale.length}개`,
    `기준 ${maxAgeMinutes}분`
  ].join(' · ');
  const nextAction = ok
    ? ''
    : [
        failures.length ? `조회 실패: ${formatStockSamples(failures)}` : '',
        stale.length ? `오래된 시세: ${formatStockSamples(stale)}` : '',
        missing.length ? `미확인: ${formatStockSamples(missing)}` : '',
        '관리자 화면에서 즉시 확인 또는 종목별 시세 재시도를 실행한 뒤 --live-session으로 다시 확인합니다.'
      ].filter(Boolean).join(' / ');

  return createResult(
    'live-quote-freshness',
    '장중 시세 최신성',
    '실제 등록 종목의 현재가와 마지막 확인 시각이 장중 기준 안에 있다',
    ok ? 'passed' : 'failed',
    evidence,
    nextAction
  );
}

function checkLiveDividendDiagnostics(context, values, generatedAt) {
  if (context.fetchErrors.stocks) {
    return createResult(
      'live-dividend-diagnostics',
      '장중 배당 진단',
      '배당 자동 검증 결과가 최근 기준 안에 있고 실패 종목이 없다',
      'failed',
      `종목 API 확인 실패: ${context.fetchErrors.stocks}`,
      '서버와 관리자 토큰을 확인한 뒤 다시 실행합니다.'
    );
  }

  const stocks = getObservationStocks(context);
  const now = new Date(generatedAt);
  const maxAgeHours = values.liveDividendMaxAgeHours;

  if (!stocks.length) {
    return createResult(
      'live-dividend-diagnostics',
      '장중 배당 진단',
      '배당 자동 검증 결과가 최근 기준 안에 있고 실패 종목이 없다',
      'manual',
      '등록된 종목이 없어 배당 진단 최신성을 판단하지 않았습니다.',
      '배당을 확인할 종목을 등록한 뒤 다시 실행합니다.'
    );
  }

  const lastRefreshAt = context.stocks?.lastDividendRefresh?.checkedAt || '';
  const refreshAgeHours = getAgeHours(lastRefreshAt, now);
  const diagnostics = stocks.filter((stock) => getStockDividendCheckedAt(stock));
  const failures = stocks.filter((stock) => {
    const diagnosticStatus = String(stock.dividendLastDiagnostic?.status || '').toLowerCase();
    return String(stock.dividendLastError || '').trim() || diagnosticStatus === 'error';
  });
  const staleDiagnostics = diagnostics.filter((stock) => {
    const age = getAgeHours(getStockDividendCheckedAt(stock), now);
    return Number.isFinite(age) && age > maxAgeHours;
  });
  const missingDiagnostics = stocks.filter((stock) => !getStockDividendCheckedAt(stock));
  const refreshFresh = lastRefreshAt && Number.isFinite(refreshAgeHours) && refreshAgeHours <= maxAgeHours;
  const ok = refreshFresh && failures.length === 0 && staleDiagnostics.length === 0;
  const evidence = [
    `최근 자동 검증 ${lastRefreshAt ? formatAge(refreshAgeHours, 'hour') : '없음'}`,
    `진단 이력 ${diagnostics.length}/${stocks.length}개`,
    `실패 ${failures.length}개`,
    `오래됨 ${staleDiagnostics.length}개`,
    `기준 ${maxAgeHours}시간`
  ].join(' · ');
  const nextAction = ok
    ? ''
    : [
        !refreshFresh ? '관리자 화면에서 배당 새로고침을 실행합니다.' : '',
        failures.length ? `배당 실패: ${formatStockSamples(failures)}` : '',
        staleDiagnostics.length ? `오래된 배당 진단: ${formatStockSamples(staleDiagnostics)}` : '',
        missingDiagnostics.length ? `진단 이력 없음: ${formatStockSamples(missingDiagnostics)}` : '',
        'provider 카드의 API 키, 호출 한도, 종목 매칭 조치를 확인합니다.'
      ].filter(Boolean).join(' / ');

  return createResult(
    'live-dividend-diagnostics',
    '장중 배당 진단',
    '배당 자동 검증 결과가 최근 기준 안에 있고 실패 종목이 없다',
    ok ? 'passed' : 'failed',
    evidence,
    nextAction
  );
}

function checkLiveAlertReadiness(context, generatedAt) {
  if (context.fetchErrors.stocks) {
    return createResult(
      'live-alert-readiness',
      '장중 알림 상태',
      '보유/관심 종목의 알림 켜짐, 꺼짐, 쉬기, 알림 진입 상태가 요약된다',
      'failed',
      `종목 API 확인 실패: ${context.fetchErrors.stocks}`,
      '서버와 관리자 토큰을 확인한 뒤 다시 실행합니다.'
    );
  }

  const stocks = getObservationStocks(context);

  if (!stocks.length) {
    return createResult(
      'live-alert-readiness',
      '장중 알림 상태',
      '보유/관심 종목의 알림 켜짐, 꺼짐, 쉬기, 알림 진입 상태가 요약된다',
      'manual',
      '보유 또는 관심 상태의 종목이 없습니다.',
      '실제 감시할 종목을 등록한 뒤 다시 확인합니다.'
    );
  }

  const now = new Date(generatedAt);
  const active = stocks.filter((stock) => stock.active !== false);
  const inactive = stocks.filter((stock) => stock.active === false);
  const snoozed = stocks.filter((stock) => isAlertSnoozed(stock, now));
  const triggered = stocks.filter((stock) => stock.alertState === 'triggered');
  const missingBasis = active.filter((stock) => !hasAlertBasis(stock));
  const ok = active.length > 0 && missingBasis.length === 0;
  const evidence = [
    `감시 대상 ${stocks.length}개`,
    `알림 켜짐 ${active.length}개`,
    `꺼짐 ${inactive.length}개`,
    `쉬기 ${snoozed.length}개`,
    `알림 진입 ${triggered.length}개`
  ].join(' · ');
  const nextAction = ok
    ? ''
    : [
        active.length === 0 ? '실제 알림을 받을 종목의 알림을 켭니다.' : '',
        missingBasis.length ? `기준 계산 필요: ${formatStockSamples(missingBasis)}` : ''
      ].filter(Boolean).join(' / ');

  return createResult(
    'live-alert-readiness',
    '장중 알림 상태',
    '보유/관심 종목의 알림 켜짐, 꺼짐, 쉬기, 알림 진입 상태가 요약된다',
    ok ? 'passed' : 'manual',
    evidence,
    nextAction
  );
}

async function buildAndMaybeSaveResult({ generatedAt, values, results, stateCheck = null }) {
  const result = buildResult({ generatedAt, values, results, stateCheck });

  if (values.saveHistory) {
    result.history = await saveLocalObservationHistory(result, values);
  } else {
    result.history = {
      enabled: false,
      saved: false
    };
  }

  return result;
}

function buildResult({ generatedAt, values, results, stateCheck = null }) {
  const summary = results.reduce(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    { passed: 0, failed: 0, manual: 0 }
  );

  return {
    ready: summary.failed === 0,
    generatedAt,
    values: {
      rootDir: values.rootDir,
      baseUrl: values.baseUrl,
      hasAdminToken: Boolean(values.adminToken),
      timeoutMs: values.timeoutMs,
      runStateCheck: Boolean(values.runStateCheck),
      liveSession: Boolean(values.liveSession),
      liveMaxAgeMinutes: values.liveMaxAgeMinutes,
      liveDividendMaxAgeHours: values.liveDividendMaxAgeHours,
      saveHistory: Boolean(values.saveHistory),
      historyDir: values.historyDir,
      historyLimit: values.historyLimit
    },
    summary,
    results,
    stateCheck,
    suggestedIssue:
      summary.failed === 0 && summary.manual > 0
        ? {
            id: 'OBS-003',
            severity: '낮음',
            content: '읽기 중심 smoke check로 즉시 확인과 알림 제어의 실제 장중 저장 흐름은 수동 확인 필요',
            nextAction: '테스트 종목 1개로 장중 즉시 확인, 알림 끄기, 1시간 쉬기, 오늘 쉬기를 실행하고 결과를 기록'
          }
        : null
  };
}

async function saveLocalObservationHistory(result, values) {
  const historyDir = values.historyDir;

  try {
    const previousEntries = await readLocalObservationHistory(historyDir, {
      limit: values.historyLimit
    });
    const previous = previousEntries[0] || null;
    const snapshot = createObservationHistorySnapshot(result);
    const fileName = createObservationHistoryFileName(result.generatedAt);
    const filePath = path.join(historyDir, fileName);

    await fs.mkdir(historyDir, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await pruneLocalObservationHistory(historyDir, values.historyLimit);

    const recent = await readLocalObservationHistory(historyDir, {
      limit: Math.min(values.historyLimit, 5)
    });

    return {
      enabled: true,
      saved: true,
      historyDir,
      fileName,
      filePath,
      previous: previous ? summarizeObservationHistoryEntry(previous) : null,
      comparison: compareObservationHistory(result, previous),
      recent: recent.map(summarizeObservationHistoryEntry)
    };
  } catch (error) {
    return {
      enabled: true,
      saved: false,
      historyDir,
      fileName: '',
      filePath: '',
      previous: null,
      comparison: null,
      recent: [],
      error: error.message
    };
  }
}

async function readLocalObservationHistory(historyDir, options = {}) {
  const limit = normalizeBoundedNumber(options.limit, defaultHistoryLimit, { min: 1, max: 10000 });
  let names = [];

  try {
    names = await fs.readdir(historyDir);
  } catch {
    return [];
  }

  const entries = await Promise.all(
    names
      .filter((name) => name.startsWith('observation-') && name.endsWith('.json'))
      .map(async (name) => {
        const filePath = path.join(historyDir, name);

        try {
          const [content, stat] = await Promise.all([
            fs.readFile(filePath, 'utf8'),
            fs.stat(filePath)
          ]);
          const data = JSON.parse(content);

          return {
            ...data,
            fileName: name,
            filePath,
            mtimeMs: stat.mtimeMs,
            generatedAt: normalizeIsoDateTime(data.generatedAt) || new Date(stat.mtimeMs).toISOString()
          };
        } catch {
          return null;
        }
      })
  );

  return entries
    .filter(Boolean)
    .sort((left, right) => {
      const rightTime = new Date(right.generatedAt).getTime();
      const leftTime = new Date(left.generatedAt).getTime();

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.mtimeMs - left.mtimeMs;
    })
    .slice(0, limit);
}

async function pruneLocalObservationHistory(historyDir, historyLimit) {
  const entries = await readLocalObservationHistory(historyDir, { limit: 10000 });
  const staleEntries = entries.slice(historyLimit);

  await Promise.all(
    staleEntries.map((entry) =>
      fs.unlink(entry.filePath).catch(() => {})
    )
  );
}

function createObservationHistorySnapshot(result) {
  return {
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    ready: result.ready,
    summary: normalizeHistorySummary(result.summary),
    values: {
      baseUrl: result.values.baseUrl,
      hasAdminToken: result.values.hasAdminToken,
      timeoutMs: result.values.timeoutMs,
      runStateCheck: result.values.runStateCheck,
      liveSession: result.values.liveSession,
      liveMaxAgeMinutes: result.values.liveMaxAgeMinutes,
      liveDividendMaxAgeHours: result.values.liveDividendMaxAgeHours
    },
    results: result.results.map((item) => ({
      id: item.id,
      item: item.item,
      status: item.status,
      statusLabel: item.statusLabel,
      evidence: item.evidence,
      nextAction: item.nextAction || ''
    })),
    stateCheck: result.stateCheck
      ? {
          ok: Boolean(result.stateCheck.ok),
          backupName: result.stateCheck.backupName || '',
          symbol: result.stateCheck.symbol || '',
          cleanedUp: Boolean(result.stateCheck.cleanedUp),
          error: result.stateCheck.error || '',
          steps: result.stateCheck.steps || []
        }
      : null,
    suggestedIssue: result.suggestedIssue
  };
}

function createObservationHistoryFileName(generatedAt) {
  return `observation-${String(generatedAt || new Date().toISOString()).replace(/[:.]/g, '-')}.json`;
}

function compareObservationHistory(current, previous) {
  if (!previous) {
    return {
      hasPrevious: false,
      previous: null,
      delta: { failed: 0, manual: 0, passed: 0 },
      changedResults: []
    };
  }

  const previousSummary = normalizeHistorySummary(previous.summary);
  const currentSummary = normalizeHistorySummary(current.summary);
  const previousResults = new Map((previous.results || []).map((item) => [item.id, item]));
  const currentResults = new Map((current.results || []).map((item) => [item.id, item]));
  const resultIds = [...new Set([...previousResults.keys(), ...currentResults.keys()])];
  const changedResults = resultIds
    .map((id) => {
      const previousItem = previousResults.get(id);
      const currentItem = currentResults.get(id);
      const from = previousItem?.status || 'missing';
      const to = currentItem?.status || 'missing';

      if (from === to) {
        return null;
      }

      return {
        id,
        item: currentItem?.item || previousItem?.item || id,
        from,
        to
      };
    })
    .filter(Boolean);

  return {
    hasPrevious: true,
    previous: summarizeObservationHistoryEntry(previous),
    delta: {
      failed: currentSummary.failed - previousSummary.failed,
      manual: currentSummary.manual - previousSummary.manual,
      passed: currentSummary.passed - previousSummary.passed
    },
    changedResults
  };
}

function summarizeObservationHistoryEntry(entry) {
  const summary = normalizeHistorySummary(entry.summary);

  return {
    fileName: entry.fileName || '',
    filePath: entry.filePath || '',
    generatedAt: entry.generatedAt || '',
    ready: Boolean(entry.ready),
    summary,
    resultCount: Array.isArray(entry.results) ? entry.results.length : 0,
    failedResultIds: (entry.results || [])
      .filter((item) => item.status === 'failed')
      .map((item) => item.id),
    manualResultIds: (entry.results || [])
      .filter((item) => item.status === 'manual')
      .map((item) => item.id)
  };
}

function normalizeHistorySummary(summary = {}) {
  return {
    failed: normalizeCount(summary.failed),
    manual: normalizeCount(summary.manual),
    passed: normalizeCount(summary.passed)
  };
}

function normalizeCount(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function formatHistoryDelta(delta = {}) {
  return [
    `failed ${formatSignedNumber(delta.failed)}`,
    `manual ${formatSignedNumber(delta.manual)}`,
    `passed ${formatSignedNumber(delta.passed)}`
  ].join(', ');
}

function formatSignedNumber(value) {
  const number = Number(value || 0);

  if (number > 0) {
    return `+${number}`;
  }

  return String(number);
}

function formatStatusLabel(status) {
  if (status === 'missing') {
    return '없음';
  }

  return statusLabels[status] || status;
}

function createResult(id, item, passCriteria, status, evidence, nextAction = '') {
  return {
    id,
    item,
    passCriteria,
    status,
    statusLabel: statusLabels[status] || statusLabels.failed,
    evidence,
    nextAction
  };
}

async function readStaticFiles(rootDir) {
  const [appJs, indexHtml, stylesCss] = await Promise.all([
    readOptionalFile(path.join(rootDir, 'public', 'app.js')),
    readOptionalFile(path.join(rootDir, 'public', 'index.html')),
    readOptionalFile(path.join(rootDir, 'public', 'styles.css'))
  ]);

  return {
    appJs,
    indexHtml,
    stylesCss
  };
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function fetchJson(endpoint, values, fetchImpl, options = {}) {
  const result = await fetchText(endpoint, values, fetchImpl, options);

  if (result.error) {
    return {
      data: null,
      error: result.error
    };
  }

  try {
    return {
      data: JSON.parse(result.text),
      error: ''
    };
  } catch (error) {
    return {
      data: null,
      error: `JSON 파싱 실패: ${error.message}`
    };
  }
}

async function fetchText(endpoint, values, fetchImpl, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), values.timeoutMs);
  const headers = {};
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);

  if (options.admin !== false && values.adminToken) {
    headers['x-admin-token'] = values.adminToken;
  }

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  try {
    const response = await fetchImpl(new URL(endpoint, values.baseUrl).href, {
      method: options.method || 'GET',
      headers,
      body,
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        text,
        error: `HTTP ${response.status}`
      };
    }

    return {
      text,
      error: ''
    };
  } catch (error) {
    return {
      text: '',
      error: error.name === 'AbortError' ? `요청 시간 초과 ${values.timeoutMs}ms` : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeValues(rootDir, env, input) {
  const dataDir = input.dataDir || firstValue(env.DATA_DIR) || path.join(rootDir, 'data');
  const historyDir = normalizeHistoryDir(
    rootDir,
    input.historyDir || firstValue(env.LOCAL_OBSERVATION_HISTORY_DIR),
    dataDir
  );

  return {
    rootDir,
    baseUrl: trimTrailingSlash(
      input.baseUrl ||
        firstValue(env.LOCAL_OBSERVATION_BASE_URL, env.VISUAL_REGRESSION_BASE_URL) ||
        defaultBaseUrl
    ),
    adminToken:
      input.adminToken ||
      firstValue(env.LOCAL_OBSERVATION_ADMIN_TOKEN, env.VISUAL_REGRESSION_ADMIN_TOKEN, env.ADMIN_TOKEN) ||
      '',
    timeoutMs: normalizeTimeout(input.timeoutMs || firstValue(env.LOCAL_OBSERVATION_TIMEOUT_MS)),
    runStateCheck: Boolean(input.runStateCheck),
    liveSession: Boolean(input.liveSession),
    liveMaxAgeMinutes: normalizeBoundedNumber(
      input.liveMaxAgeMinutes || firstValue(env.LOCAL_OBSERVATION_LIVE_MAX_AGE_MINUTES),
      defaultLiveMaxAgeMinutes,
      { min: 1, max: 1440 }
    ),
    liveDividendMaxAgeHours: normalizeBoundedNumber(
      input.liveDividendMaxAgeHours || firstValue(env.LOCAL_OBSERVATION_DIVIDEND_MAX_AGE_HOURS),
      defaultLiveDividendMaxAgeHours,
      { min: 1, max: 720 }
    ),
    saveHistory: Boolean(input.saveHistory),
    historyDir,
    historyLimit: normalizeBoundedNumber(
      input.historyLimit || firstValue(env.LOCAL_OBSERVATION_HISTORY_LIMIT),
      defaultHistoryLimit,
      { min: 1, max: 365 }
    )
  };
}

async function runStateMutationCheck(values, fetchImpl, generatedAt) {
  const steps = [];
  const state = {
    ok: false,
    backupName: '',
    stockId: '',
    symbol: '',
    cleanedUp: false,
    error: '',
    steps
  };

  try {
    const backup = await requestJson('/api/backups', values, fetchImpl, {
      method: 'POST'
    });
    state.backupName = backup.backup?.name || backup.backup?.fileName || backup.backup?.path || '';
    steps.push(createStateStep('backup', '사전 백업', 'passed', state.backupName || '백업 API가 성공 응답을 반환했습니다.'));

    const stocksBefore = await requestJson('/api/stocks', values, fetchImpl, { admin: false });
    const existingStocks = Array.isArray(stocksBefore.stocks) ? stocksBefore.stocks : [];
    state.symbol = pickObservationTestSymbol(existingStocks);

    const created = await requestJson('/api/stocks', values, fetchImpl, {
      method: 'POST',
      admin: false,
      body: buildObservationTestStock(state.symbol, generatedAt)
    });
    state.stockId = created.stock?.id || '';

    if (!state.stockId) {
      throw new Error('검증용 종목 생성 응답에서 stock.id를 확인하지 못했습니다.');
    }

    steps.push(createStateStep('create-stock', '검증용 종목 생성', 'passed', `${state.symbol} 생성 완료`));

    const manual = await requestJson(`/api/stocks/${encodeURIComponent(state.stockId)}/test-quote`, values, fetchImpl, {
      method: 'POST',
      admin: false,
      body: {
        price: 100,
        currency: 'KRW',
        exchange: 'OBS-003 manual test'
      }
    });
    const manualResult = Array.isArray(manual.results) ? manual.results[0] : null;

    if (!manualResult || manualResult.status === 'alert' || manualResult.status === 'error') {
      throw new Error(`수동 가격 테스트 결과가 예상과 다릅니다: ${manualResult?.status || '결과 없음'}`);
    }

    await verifyStockState(values, fetchImpl, state.stockId, (stock) => Number(stock.lastPrice) === 100);
    steps.push(
      createStateStep(
        'manual-quote',
        '즉시 가격 테스트',
        'passed',
        `수동 현재가 100 반영, 결과 ${manualResult.status}, 알림 전송 없음`
      )
    );

    await patchStockAndVerify(values, fetchImpl, state.stockId, { active: false }, (stock) => stock.active === false);
    steps.push(createStateStep('alert-off', '알림 끄기 저장', 'passed', 'active=false 저장 확인'));

    await patchStockAndVerify(values, fetchImpl, state.stockId, { active: true }, (stock) => stock.active === true);
    steps.push(createStateStep('alert-on', '알림 켜기 저장', 'passed', 'active=true 저장 확인'));

    const hourSnoozeUntil = new Date(new Date(generatedAt).getTime() + 60 * 60 * 1000).toISOString();
    await patchStockAndVerify(
      values,
      fetchImpl,
      state.stockId,
      { active: true, alertSnoozedUntil: hourSnoozeUntil },
      (stock) => stock.alertSnoozedUntil === hourSnoozeUntil
    );
    steps.push(createStateStep('alert-snooze-hour', '1시간 쉬기 저장', 'passed', `alertSnoozedUntil=${hourSnoozeUntil}`));

    const todaySnoozeUntil = getEndOfDayIso(generatedAt);
    await patchStockAndVerify(
      values,
      fetchImpl,
      state.stockId,
      { active: true, alertSnoozedUntil: todaySnoozeUntil },
      (stock) => stock.alertSnoozedUntil === todaySnoozeUntil
    );
    steps.push(createStateStep('alert-snooze-today', '오늘 쉬기 저장', 'passed', `alertSnoozedUntil=${todaySnoozeUntil}`));

    await patchStockAndVerify(
      values,
      fetchImpl,
      state.stockId,
      { active: true, alertSnoozedUntil: null },
      (stock) => stock.active === true && !stock.alertSnoozedUntil
    );
    steps.push(createStateStep('alert-snooze-clear', '알림 쉬기 해제 저장', 'passed', 'alertSnoozedUntil 해제 확인'));
  } catch (error) {
    state.error = error.message;
    steps.push(createStateStep('state-check-error', '상태 변경 검증 오류', 'failed', error.message));
  } finally {
    if (state.stockId) {
      try {
        await requestJson(`/api/stocks/${encodeURIComponent(state.stockId)}`, values, fetchImpl, {
          method: 'DELETE',
          admin: false
        });
        const removed = await verifyStockDeleted(values, fetchImpl, state.stockId);
        state.cleanedUp = removed;
        steps.push(
          createStateStep(
            'cleanup-stock',
            '검증용 종목 삭제',
            removed ? 'passed' : 'failed',
            removed ? `${state.symbol} 삭제 확인` : `${state.symbol} 삭제 후 목록에서 남아 있습니다.`
          )
        );
      } catch (error) {
        state.cleanedUp = false;
        steps.push(createStateStep('cleanup-stock', '검증용 종목 삭제', 'failed', error.message));
      }
    }
  }

  state.ok = steps.length > 0 && steps.every((step) => step.status === 'passed') && (!state.stockId || state.cleanedUp);
  return state;
}

async function requestJson(endpoint, values, fetchImpl, options = {}) {
  const result = await fetchJson(endpoint, values, fetchImpl, options);

  if (result.error) {
    throw new Error(`${endpoint} 요청 실패: ${result.error}`);
  }

  return result.data || {};
}

async function patchStockAndVerify(values, fetchImpl, stockId, body, predicate) {
  await requestJson(`/api/stocks/${encodeURIComponent(stockId)}`, values, fetchImpl, {
    method: 'PATCH',
    admin: false,
    body
  });

  return verifyStockState(values, fetchImpl, stockId, predicate);
}

async function verifyStockState(values, fetchImpl, stockId, predicate) {
  const stock = await readStock(values, fetchImpl, stockId);

  if (!stock) {
    throw new Error(`종목을 찾지 못했습니다: ${stockId}`);
  }

  if (!predicate(stock)) {
    throw new Error(`종목 저장 상태가 예상과 다릅니다: ${stockId}`);
  }

  return stock;
}

async function verifyStockDeleted(values, fetchImpl, stockId) {
  const data = await requestJson('/api/stocks', values, fetchImpl, { admin: false });
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];

  return !stocks.some((stock) => stock.id === stockId);
}

async function readStock(values, fetchImpl, stockId) {
  const data = await requestJson('/api/stocks', values, fetchImpl, { admin: false });
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];

  return stocks.find((stock) => stock.id === stockId) || null;
}

function buildObservationTestStock(symbol, generatedAt) {
  return {
    symbol,
    displayName: 'OBS-003 검증용 테스트 종목',
    purchasePrice: 100,
    quantity: 1,
    alertType: 'target_price',
    targetPrice: 1,
    thresholdPercent: 5,
    alertCooldownMinutes: 30,
    positionStatus: 'holding',
    active: true,
    notes: `OBS-003 자동 검증 후 삭제되는 테스트 종목 (${generatedAt})`
  };
}

function pickObservationTestSymbol(stocks) {
  const existingSymbols = new Set(stocks.map((stock) => String(stock.symbol || '').toUpperCase()));
  const candidates = ['MSFT', 'AAPL', 'TSLA', 'NVDA', 'OBS003'];

  return candidates.find((symbol) => !existingSymbols.has(symbol)) || `OBS${Date.now()}`;
}

function createStateStep(id, label, status, evidence) {
  return {
    id,
    label,
    status,
    evidence
  };
}

function findStateCheckStep(stateCheck, id) {
  return stateCheck.steps.find((step) => step.id === id) || null;
}

function getEndOfDayIso(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function containsAll(text, patterns) {
  return patterns.every((pattern) => String(text || '').includes(pattern));
}

function getObservationStocks(context) {
  const stocks = Array.isArray(context.stocks?.stocks) ? context.stocks.stocks : [];

  return stocks.filter((stock) => normalizePositionStatus(stock.positionStatus) !== 'sold');
}

function normalizePositionStatus(value) {
  const text = String(value || '').trim().toLowerCase();

  if (['sold', '매도'].includes(text)) {
    return 'sold';
  }

  if (['watch', 'watching', '관심'].includes(text)) {
    return 'watch';
  }

  return 'holding';
}

function getStockQuoteCheckedAt(stock) {
  return normalizeIsoDateTime(stock.lastCheckedAt) || normalizeIsoDateTime(stock.quoteRegularMarketTime) || '';
}

function getStockDividendCheckedAt(stock) {
  return (
    normalizeIsoDateTime(stock.dividendLastDiagnostic?.checkedAt) ||
    normalizeIsoDateTime(stock.dividendLastCheckedAt) ||
    normalizeIsoDateTime(stock.dividendUpdatedAt) ||
    ''
  );
}

function getAgeMinutes(value, now) {
  const time = new Date(value || '').getTime();
  const base = now instanceof Date ? now.getTime() : new Date(now || '').getTime();

  if (!Number.isFinite(time) || !Number.isFinite(base)) {
    return Infinity;
  }

  return Math.max(0, (base - time) / 60000);
}

function getAgeHours(value, now) {
  return getAgeMinutes(value, now) / 60;
}

function formatAge(value, unit) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '확인 전';
  }

  if (unit === 'hour') {
    if (number < 1) {
      return `${Math.round(number * 60)}분 전`;
    }

    return `${Math.round(number * 10) / 10}시간 전`;
  }

  return `${Math.round(number)}분 전`;
}

function formatStockSamples(stocks) {
  const items = (Array.isArray(stocks) ? stocks : []).slice(0, 3).map(formatStockLabel);
  const remaining = Math.max(0, (Array.isArray(stocks) ? stocks.length : 0) - items.length);

  return `${items.join(', ')}${remaining ? ` 외 ${remaining}개` : ''}`;
}

function formatStockLabel(stock) {
  const name = String(stock.displayName || stock.name || stock.symbol || '').trim();
  const symbol = String(stock.symbol || '').trim();

  if (name && symbol && name !== symbol) {
    return `${name}(${symbol})`;
  }

  return name || symbol || '이름 없음';
}

function isAlertSnoozed(stock, now) {
  const until = new Date(stock.alertSnoozedUntil || '').getTime();
  const base = now instanceof Date ? now.getTime() : new Date(now || '').getTime();

  return Number.isFinite(until) && Number.isFinite(base) && until > base;
}

function hasAlertBasis(stock) {
  const alertType = String(stock.alertType || 'high_drawdown').trim();

  if (alertType === 'target_price') {
    return hasPositiveNumber(stock.targetPrice);
  }

  if (alertType === 'purchase_loss') {
    return hasPositiveNumber(stock.purchasePrice);
  }

  if (alertType === 'profit_retracement') {
    return hasPositiveNumber(stock.purchasePrice) && hasPositiveNumber(stock.highPrice);
  }

  return hasPositiveNumber(stock.highPrice) || hasPositiveNumber(stock.purchasePrice);
}

function hasPositiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0;
}

function normalizeIsoDateTime(value) {
  const time = new Date(value || '').getTime();

  if (!Number.isFinite(time)) {
    return '';
  }

  return new Date(time).toISOString();
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

function normalizeBoundedNumber(value, fallback, limits = {}) {
  const number = Number(value || fallback);
  const min = Number(limits.min ?? 0);
  const max = Number(limits.max ?? Number.MAX_SAFE_INTEGER);

  if (!Number.isFinite(number) || number < min) {
    return fallback;
  }

  return Math.min(number, max);
}

function normalizeHistoryDir(rootDir, value, dataDir) {
  const input = String(value || '').trim();
  const base = String(dataDir || '').trim() || path.join(rootDir, 'data');
  const target = input || path.join(base, defaultHistoryDirName);

  if (path.isAbsolute(target)) {
    return path.normalize(target);
  }

  return path.resolve(rootDir, target);
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
