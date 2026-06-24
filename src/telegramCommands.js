import { buildAlertRule, initializeHighFromPurchaseDate, runAlertCheck } from './alertEngine.js';
import path from 'node:path';
import { createBackup, deleteBackup, listBackups, restoreBackup } from './backups.js';
import {
  formatDividendFailureNextActionsText
} from '../public/dividendFailureGuidance.js';
import { formatKisMarketDivCode } from './kisMarket.js';
import { buildDailyBriefing, formatDailyBriefingMessage } from './portfolioBriefing.js';
import { classifyQuoteFreshness, summarizeQuoteFreshness } from './quoteFreshness.js';
import {
  ALERT_TYPES,
  POSITION_STATUSES,
  normalizeAccountName,
  normalizeAccountNameKey,
  normalizeAccountType
} from './storage.js';
import {
  fetchTelegramUpdates,
  isAuthorizedTelegramChat,
  isTelegramConfigured,
  sendTelegramMessage
} from './telegram.js';
import { assessTelegramPollHealth } from './telegramPollHealth.js';
import { readLocalObservationHistoryReport } from './localObservationCheck.js';
import {
  buildTelegramTodayActions,
  formatTelegramTodayMessage
} from './systemTodayActions.js';

const updateOffsetKey = 'telegramUpdateOffset';

const helpMessage = [
  '[Stock Alarm] 명령어',
  '/list - 감시 종목 목록',
  '/status [종목코드] - 종목 상태 상세',
  '/brief - 위험 종목·이익금 반납·배당·평가 요약',
  '/today - 오늘 확인할 일 요약 (시세·poll·배당)',
  '/check - 지금 바로 전체 확인',
  '/dividend-status [종목코드] - 배당 API 진단 상태',
  '/pause <종목코드> - 알림 끄기',
  '/resume <종목코드> - 알림 켜기',
  '/snooze <종목코드> <분|today|clear> - 알림 일시정지',
  '/sold <종목코드> - 매도 완료 처리',
  '/watch <종목코드> - 관심 종목 처리',
  '/holding <종목코드> - 보유 종목 처리',
  '/edit <종목코드> <항목> <값> - 알림 조건 수정',
  '/delete <종목코드> - 종목 삭제',
  '/backup - 현재 데이터 백업 생성',
  '/backups - 최근 백업 목록',
  '/restore <백업파일명|번호> - 백업 복구',
  '/delete-backup <백업파일명|번호> - 백업 삭제',
  '',
  '등록 예시',
  '/add 336260 두산퓨얼셀 88779 high 10',
  '/add 336260 두산퓨얼셀 88779 profit 10',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 high 10',
  '/add symbol=336260 name=두산퓨얼셀 account=isa broker=키움 price=88779 type=profit percent=10',
  '/add 336260 두산퓨얼셀 88779 target 93000',
  '',
  '수정 예시',
  '/edit 336260 high 8',
  '/edit 336260 profit 10',
  '/edit 336260 loss 5',
  '/edit 336260 target 93000',
  '/edit 336260 account isa',
  '/edit 336260 kis NX',
  '/edit 336260 cooldown 60',
  '/edit 336260 qty 10',
  '/edit 336260 dividend 1200',
  '/edit 336260 dividendfreq quarterly',
  '/edit 336260 dividendmonths 3,6,9,12',
  '/edit 336260 name 두산퓨얼셀',
  '/edit 336260 reason 수소 밸류체인 성장',
  '/edit 336260 goal 120000',
  '/edit 336260 sell 분기 적자 확대 시 매도',
  '/edit 336260 review 2026-08-15',
  '',
  '기준값: high=최고가 대비 하락률, profit=이익금 반납률, loss=매수가 대비 손절률, target=직접 기준가',
  '같은 종목이 여러 계좌에 있으면 336260@isa, 336260@키움처럼 계좌 구분이나 계좌명을 붙여 입력하세요.'
].join('\n');

export async function pollTelegramCommands(store, config, options = {}) {
  if (!isTelegramConfigured(config)) {
    return {
      skipped: true,
      reason: 'telegram_not_configured',
      processed: 0
    };
  }

  const offset = await store.getMetaValue(updateOffsetKey, null);
  const updateFetcher = options.fetchTelegramUpdates || fetchTelegramUpdates;
  const updates = await updateFetcher(config, offset, {
    timeoutSeconds: 0
  });
  let processed = 0;

  for (const update of updates) {
    const nextOffset = Number(update.update_id) + 1;

    try {
      await handleTelegramUpdate(store, config, update, options);
      processed += 1;
    } finally {
      if (Number.isFinite(nextOffset)) {
        await store.setMetaValue(updateOffsetKey, nextOffset);
      }
    }
  }

  return {
    processed,
    nextOffset: await store.getMetaValue(updateOffsetKey, null)
  };
}

export async function handleTelegramUpdate(store, config, update, options = {}) {
  const message = update.message;

  if (!message?.text || !message.chat?.id) {
    return {
      ignored: true,
      reason: 'unsupported_update'
    };
  }

  return handleTelegramMessage(store, config, message, options);
}

export async function handleTelegramMessage(store, config, message, options = {}) {
  const chatId = message.chat.id;

  if (!isAuthorizedTelegramChat(config, chatId)) {
    return {
      ignored: true,
      reason: 'unauthorized_chat'
    };
  }

  const sender = options.sendTelegramMessage || sendTelegramMessage;
  const text = String(message.text || '').trim();
  const command = parseCommand(text);

  if (!command) {
    return {
      ignored: true,
      reason: 'not_a_command'
    };
  }

  try {
    const reply = await executeCommand(store, config, command, options);
    await sender(config, reply, { chatId });

    return {
      command: command.name,
      replied: true
    };
  } catch (error) {
    const reply = `${error.message}\n\n${getShortUsage(command.name)}`;
    await sender(config, reply, { chatId });

    return {
      command: command.name,
      error: error.message
    };
  }
}

export function parseCommand(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const [rawCommand, ...args] = trimmed.split(/\s+/);
  const name = rawCommand.slice(1).split('@')[0].toLowerCase();

  return {
    name,
    args,
    rawArgs: trimmed.slice(rawCommand.length).trim()
  };
}

async function executeCommand(store, config, command, options) {
  switch (command.name) {
    case 'start':
    case 'help':
      return helpMessage;
    case 'list':
      return formatStockList(await store.listStocks());
    case 'status':
      return formatStockStatusFromCommand(store, command.args[0], options);
    case 'brief':
    case 'briefing':
    case 'risk':
      return formatBriefingFromCommand(await store.listStocks(), config, options);
    case 'today':
    case 'today-actions':
      return formatTodayFromCommand(store, config, options);
    case 'add':
      return addStockFromCommand(store, config, command, options);
    case 'pause':
    case 'stop':
      return setStockActive(store, command.args[0], false);
    case 'resume':
    case 'startstock':
      return setStockActive(store, command.args[0], true);
    case 'snooze':
      return snoozeStockFromCommand(store, command.args);
    case 'sold':
      return setStockPositionStatus(store, command.args[0], POSITION_STATUSES.SOLD);
    case 'watch':
      return setStockPositionStatus(store, command.args[0], POSITION_STATUSES.WATCH);
    case 'holding':
    case 'hold':
      return setStockPositionStatus(store, command.args[0], POSITION_STATUSES.HOLDING);
    case 'edit':
      return editStockFromCommand(store, config, command, options);
    case 'delete':
    case 'del':
      return deleteStockFromCommand(store, command.args[0]);
    case 'backup':
      return createBackupFromCommand(store, config, options);
    case 'backups':
      return listBackupsFromCommand(store, config, command, options);
    case 'restore':
      return restoreBackupFromCommand(store, config, command, options);
    case 'delete-backup':
    case 'delbackup':
    case 'deletebackup':
      return deleteBackupFromCommand(store, config, command, options);
    case 'check':
      return runManualCheck(store, config, options);
    case 'dividend-status':
    case 'dividendstatus':
    case 'dividend-diagnostics':
    case 'dividenddiagnostics':
    case 'dividend-diagnosis':
      return formatDividendStatusFromCommand(store, command);
    default:
      return `지원하지 않는 명령어입니다: /${command.name}\n\n${helpMessage}`;
  }
}

function formatBriefingFromCommand(stocks, config, options = {}) {
  const briefing = buildDailyBriefing(stocks, {
    warningDistancePercent: config.dailyBriefingWarningDistancePercent,
    topLimit: config.dailyBriefingTopLimit
  });
  const lines = [formatDailyBriefingMessage(briefing)];
  const pollHealthLine = formatTelegramPollHealthLine(config, options);

  if (pollHealthLine) {
    lines.push('');
    lines.push(pollHealthLine);
  }

  return lines.join('\n');
}

async function formatTodayFromCommand(store, config, options = {}) {
  return buildTelegramTodaySummary(store, config, options);
}

async function buildTelegramTodaySummary(store, config, options = {}) {
  const stocks = await store.listStocks();
  const rootDir = config.rootDir || options.rootDir || process.cwd();
  const dataDir = store?.dataDir || config.dataDir || path.join(rootDir, 'data');
  const observationHistory = await readLocalObservationHistoryReport({
    rootDir,
    dataDir,
    env: options.env
  });
  const actions = buildTelegramTodayActions({
    stocks,
    observationHistoryRecent: observationHistory.recent,
    telegramConfigured: isTelegramConfigured(config),
    telegramCommandPollSeconds: config.telegramCommandPollSeconds,
    lastTelegramCommandPoll: options.lastTelegramCommandPoll ?? null,
    telegramPollHealth: assessTelegramPollHealth({
      telegramConfigured: isTelegramConfigured(config),
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll: options.lastTelegramCommandPoll ?? null,
      now: options.now
    }),
    now: options.now
  });

  return formatTelegramTodayMessage(actions);
}

function formatTelegramPollHealthLine(config, options = {}) {
  const health = assessTelegramPollHealth({
    telegramConfigured: isTelegramConfigured(config),
    telegramCommandPollSeconds: config.telegramCommandPollSeconds,
    lastTelegramCommandPoll: options.lastTelegramCommandPoll ?? null,
    now: options.now
  });

  if (health.status === 'ok') {
    return `텔레그램 폴링: ${health.label} · ${health.detail}`;
  }

  const parts = [`텔레그램 폴링: ${health.label} · ${health.detail}`];

  if (health.nextAction) {
    parts.push(`다음 조치: ${health.nextAction}`);
  }

  return parts.join('\n');
}

async function formatDividendStatusFromCommand(store, command) {
  if (command.args[0]) {
    const stock = await findStock(store, command.args[0]);
    return formatDividendDiagnosticDetail(stock);
  }

  return formatDividendDiagnosticSummary(await store.listStocks());
}

function formatDividendDiagnosticSummary(stocks) {
  if (!stocks.length) {
    return '등록된 감시 종목이 없습니다.';
  }

  const rows = stocks.map((stock) => ({
    stock,
    diagnostic: stock.dividendLastDiagnostic
  }));
  const rowsWithDiagnostics = rows
    .filter((row) => row.diagnostic)
    .sort((left, right) => getDividendDiagnosticTime(right.diagnostic) - getDividendDiagnosticTime(left.diagnostic));
  const counts = countDividendDiagnostics(rowsWithDiagnostics);
  const latestCheckedAt = rowsWithDiagnostics[0]?.diagnostic?.checkedAt || '';
  const pendingCount = stocks.length - rowsWithDiagnostics.length;
  const lines = [
    '배당 API 진단',
    `전체: ${stocks.length}개 · 진단: ${rowsWithDiagnostics.length}개 · 대기: ${pendingCount}개`,
    `결과: 업데이트 ${counts.updated}개 · 확인 ${counts.checked}개 · 실패 ${counts.error}개 · 건너뜀 ${counts.skipped}개`,
    latestCheckedAt ? `최근 확인: ${formatDate(latestCheckedAt)}` : ''
  ].filter(Boolean);

  if (!rowsWithDiagnostics.length) {
    return [
      ...lines,
      '',
      '아직 배당 API 갱신 이력이 없습니다.',
      '웹앱의 배당 새로고침을 실행하거나 자동 갱신을 기다린 뒤 다시 확인하세요.'
    ].join('\n');
  }

  lines.push('');
  lines.push(
    ...rowsWithDiagnostics.slice(0, 5).map((row, index) => formatDividendDiagnosticSummaryLine(row, index))
  );

  if (rowsWithDiagnostics.length > 5) {
    lines.push(`외 ${rowsWithDiagnostics.length - 5}개는 /dividend-status <종목코드>로 상세 확인하세요.`);
  }

  return lines.join('\n');
}

function countDividendDiagnostics(rows) {
  return rows.reduce(
    (counts, row) => {
      const status = row.diagnostic?.status;

      if (status === 'updated') {
        counts.updated += 1;
      } else if (status === 'checked') {
        counts.checked += 1;
      } else if (status === 'error') {
        counts.error += 1;
      } else if (status === 'skipped') {
        counts.skipped += 1;
      }

      return counts;
    },
    {
      updated: 0,
      checked: 0,
      error: 0,
      skipped: 0
    }
  );
}

function formatDividendDiagnosticSummaryLine(row, index) {
  const { stock, diagnostic } = row;
  const attempts = Array.isArray(diagnostic.attempts) ? diagnostic.attempts : [];
  const lines = [
    `${index + 1}. ${formatStockTitle(stock)} ${formatDividendDiagnosticStatus(diagnostic.status)}`,
    `   적용값: ${formatDividendAppliedValue(stock, diagnostic)} · 출처: ${formatProviderLabel(diagnostic.provider)} · ${formatDate(diagnostic.checkedAt)}`,
    attempts.length ? `   시도: ${formatDividendAttemptSummary(attempts)}` : '',
    diagnostic.error ? `   실패: ${diagnostic.error}` : '',
    diagnostic.reason ? `   사유: ${formatDividendDiagnosticReason(diagnostic.reason)}` : ''
  ];

  if (diagnostic.status === 'error' && diagnostic.error) {
    const nextActions = formatDividendFailureNextActionsText({
      error: diagnostic.error,
      provider: diagnostic.provider,
      attempts,
      preservedAnnualDividendPerShare: diagnostic.preservedAnnualDividendPerShare,
      includeCause: false
    });

    if (nextActions) {
      lines.push(`   다음 조치: ${nextActions}`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

function formatDividendDiagnosticDetail(stock) {
  const diagnostic = stock.dividendLastDiagnostic;
  const lines = [
    `배당 API 진단: ${formatStockTitle(stock)}`,
    stock.annualDividendPerShare
      ? `현재 주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}${formatCurrencySuffix(stock.dividendCurrency || stock.currency)}`
      : '현재 주당 연 배당금: -',
    formatDividendScheduleLine(stock),
    formatDividendEventLine(stock),
    formatDividendHistoryLine(stock)
  ].filter(Boolean);

  if (!diagnostic) {
    return [
      ...lines,
      '',
      '아직 배당 API 갱신 이력이 없습니다.',
      '웹앱의 배당 새로고침을 실행하거나 자동 갱신을 기다린 뒤 다시 확인하세요.'
    ].join('\n');
  }

  const attempts = Array.isArray(diagnostic.attempts) ? diagnostic.attempts : [];
  lines.push('');
  lines.push(`상태: ${formatDividendDiagnosticStatus(diagnostic.status)}`);
  lines.push(`확인 시각: ${formatDate(diagnostic.checkedAt)}`);
  lines.push(`적용값: ${formatDividendAppliedValue(stock, diagnostic)}`);
  lines.push(`출처: ${formatDividendDiagnosticSource(diagnostic)}`);

  if (diagnostic.lastDividendValue) {
    lines.push(
      `최근 1주 배당: ${formatNumber(diagnostic.lastDividendValue)}${formatCurrencySuffix(diagnostic.currency || stock.dividendCurrency || stock.currency)}`
    );
  }

  if (diagnostic.exDividendDate) {
    lines.push(`배당락일: ${formatDateOnly(diagnostic.exDividendDate)}`);
  }

  if (diagnostic.dividendDate) {
    lines.push(`지급일: ${formatDateOnly(diagnostic.dividendDate)}`);
  }

  if (diagnostic.error) {
    lines.push(`실패 사유: ${diagnostic.error}`);
    const nextActions = formatDividendFailureNextActionsText({
      error: diagnostic.error,
      provider: diagnostic.provider,
      attempts,
      preservedAnnualDividendPerShare: diagnostic.preservedAnnualDividendPerShare,
      includeCause: false
    });

    if (nextActions) {
      lines.push(`다음 조치: ${nextActions}`);
    }
  }

  if (diagnostic.reason) {
    lines.push(`처리 사유: ${formatDividendDiagnosticReason(diagnostic.reason)}`);
  }

  if (attempts.length) {
    lines.push('');
    lines.push('Provider 시도:');
    lines.push(...attempts.map((attempt, index) => `${index + 1}. ${formatDividendAttemptLine(attempt, stock)}`));
  }

  return lines.join('\n');
}

function formatDividendDiagnosticStatus(status) {
  const labels = {
    updated: '업데이트',
    checked: '확인',
    error: '실패',
    skipped: '건너뜀'
  };

  return labels[status] || '대기';
}

function formatDividendDiagnosticReason(reason) {
  const labels = {
    inactive: '알림 꺼짐',
    amount: '배당금 변경',
    lastDividend: '최근 1주 배당 변경',
    exDate: '배당락일 변경',
    payDate: '지급일 변경'
  };

  return String(reason || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => labels[item] || item)
    .join(', ');
}

function formatDividendAppliedValue(stock, diagnostic) {
  const currency = diagnostic.currency || stock.dividendCurrency || stock.currency || '';

  if (hasPositiveNumber(diagnostic.annualDividendPerShare)) {
    return `${formatNumber(diagnostic.annualDividendPerShare)}${formatCurrencySuffix(currency)}`;
  }

  if (hasPositiveNumber(diagnostic.preservedAnnualDividendPerShare)) {
    return `${formatNumber(diagnostic.preservedAnnualDividendPerShare)}${formatCurrencySuffix(currency)} 유지`;
  }

  if (hasPositiveNumber(stock.annualDividendPerShare)) {
    return `${formatNumber(stock.annualDividendPerShare)}${formatCurrencySuffix(currency)} 기존값`;
  }

  return '-';
}

function formatDividendDiagnosticSource(diagnostic) {
  const parts = [formatProviderLabel(diagnostic.provider)];

  if (diagnostic.sourceSymbol) {
    parts.push(diagnostic.sourceSymbol);
  }

  return parts.filter((part) => part && part !== '-').join(' · ') || '-';
}

function formatDividendAttemptSummary(attempts) {
  const summary = attempts
    .slice(0, 4)
    .map((attempt) => `${formatProviderLabel(attempt.provider)} ${attempt.status === 'success' ? '성공' : '실패'}`);

  if (attempts.length > 4) {
    summary.push(`외 ${attempts.length - 4}개`);
  }

  return summary.join(' · ');
}

function formatDividendAttemptLine(attempt, stock) {
  const provider = formatProviderLabel(attempt.provider);
  const status = attempt.status === 'success' ? '성공' : '실패';
  const detail = attempt.status === 'success'
    ? formatDividendAttemptValue(attempt, stock)
    : attempt.error || '실패 사유 없음';

  return `${provider}: ${status} · ${detail}`;
}

function formatDividendAttemptValue(attempt, stock) {
  const currency = attempt.currency || stock.dividendCurrency || stock.currency || '';
  const parts = [];

  if (hasPositiveNumber(attempt.annualDividendPerShare)) {
    parts.push(`연 ${formatNumber(attempt.annualDividendPerShare)}${formatCurrencySuffix(currency)}`);
  }

  if (hasPositiveNumber(attempt.lastDividendValue)) {
    parts.push(`최근 ${formatNumber(attempt.lastDividendValue)}${formatCurrencySuffix(currency)}`);
  }

  if (attempt.exDividendDate) {
    parts.push(`배당락 ${formatDateOnly(attempt.exDividendDate)}`);
  }

  if (attempt.dividendDate) {
    parts.push(`지급 ${formatDateOnly(attempt.dividendDate)}`);
  }

  return parts.join(' · ') || '값 없음';
}

function formatProviderLabel(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  const labels = {
    public: '공공데이터',
    publicdata: '공공데이터',
    opendart: 'OpenDART',
    'open-dart': 'OpenDART',
    alphavantage: 'Alpha Vantage',
    'alpha-vantage': 'Alpha Vantage',
    yahoo: 'Yahoo',
    manual: '수동'
  };

  return labels[normalized] || provider || '-';
}

function formatCurrencySuffix(currency) {
  return currency ? ` ${currency}` : '';
}

function hasPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function getDividendDiagnosticTime(diagnostic) {
  const time = new Date(diagnostic?.checkedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function createBackupFromCommand(store, config, options) {
  const backupCreator = options.createBackup || createBackup;
  const backup = options.createBackup
    ? await backupCreator(config.dataDir, {
        reason: 'telegram-manual',
        maxBackups: config.backupRetention
      })
    : store.createBackup
      ? await store.createBackup('telegram-manual')
      : await backupCreator(config.dataDir, {
          reason: 'telegram-manual',
          maxBackups: config.backupRetention
        });

  if (!backup.created) {
    return `백업을 만들지 못했습니다: ${backup.reason}`;
  }

  return [
    '백업을 생성했습니다.',
    `파일: ${backup.name}`,
    `크기: ${formatBytes(backup.size)}`
  ].join('\n');
}

async function listBackupsFromCommand(store, config, command, options) {
  const backupLister = options.listBackups || listBackups;
  const limit = normalizeListLimit(command.args[0] || 5);
  const backups = options.listBackups
    ? await backupLister(config.dataDir, { limit })
    : await store.listBackups({ limit });

  if (!backups.length) {
    return '백업 파일이 없습니다.';
  }

  return [
    `최근 백업 ${backups.length}개`,
    ...backups.map(
      (backup, index) =>
        `${index + 1}. ${backup.name}\n   ${formatDate(backup.createdAt)} · ${formatBytes(backup.size)}`
    )
  ].join('\n');
}

async function restoreBackupFromCommand(store, config, command, options) {
  const target = command.args[0];
  const backupRestorer = options.restoreBackup || restoreBackup;
  const result = options.restoreBackup
    ? await backupRestorer(config.dataDir, target, {
        maxBackups: config.backupRetention
      })
    : await store.restoreBackup(target, {
        maxBackups: config.backupRetention
      });

  return [
    '백업을 복구했습니다.',
    `복구 파일: ${result.backup.name}`,
    result.safetyBackup?.created ? `복구 전 안전 백업: ${result.safetyBackup.name}` : '',
    '서버가 다음 확인 주기부터 복구된 데이터를 사용합니다.'
  ]
    .filter(Boolean)
    .join('\n');
}

async function deleteBackupFromCommand(store, config, command, options) {
  const target = command.args[0];
  const backupDeleter = options.deleteBackup || deleteBackup;
  const result = options.deleteBackup
    ? await backupDeleter(config.dataDir, target)
    : await store.deleteBackup(target);

  return [
    '백업을 삭제했습니다.',
    `삭제 파일: ${result.backup.name}`,
    '현재 데이터에는 영향이 없습니다.'
  ].join('\n');
}

async function addStockFromCommand(store, config, command, options) {
  const input = parseAddArgs(command.args);
  let stock = await store.addStock(input);
  const highInitializer = options.initializeHighFromPurchaseDate || initializeHighFromPurchaseDate;

  if (stock.purchaseDate) {
    stock = await highInitializer(store, config, stock);
  }

  return [
    '종목을 등록했습니다.',
    formatStockTitle(stock),
    `알림 기준: ${formatAlertType(stock.alertType)}`,
    stock.alertType === ALERT_TYPES.TARGET_PRICE
      ? `직접 기준가: ${formatNumber(stock.targetPrice)}`
      : `비율: ${stock.thresholdPercent}%`,
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    stock.annualDividendPerShare ? `주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}` : '',
    formatKisMarketLine(stock),
    formatDividendScheduleLine(stock),
    formatHighPriceLine(stock)
  ]
    .filter(Boolean)
    .join('\n');
}

async function editStockFromCommand(store, config, command, options) {
  const input = parseEditArgs(command.args);
  let stock = await findStock(store, input.query);
  stock = await store.updateStock(stock.id, input.patch);

  if (input.reinitializeHigh && stock.purchaseDate) {
    const highInitializer = options.initializeHighFromPurchaseDate || initializeHighFromPurchaseDate;
    stock = await highInitializer(store, config, stock);
  }

  return [
    '종목 정보를 수정했습니다.',
    formatStockTitle(stock),
    `수정 항목: ${input.label}`,
    `알림 기준: ${formatAlertType(stock.alertType)}`,
    stock.alertType === ALERT_TYPES.TARGET_PRICE
      ? `직접 기준가: ${formatNumber(stock.targetPrice)}`
      : `비율: ${stock.thresholdPercent}%`,
    `반복 알림: ${stock.alertCooldownMinutes}분`,
    stock.purchasePrice ? `매수가: ${formatNumber(stock.purchasePrice)}` : '',
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    stock.annualDividendPerShare ? `주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}` : '',
    formatKisMarketLine(stock),
    formatDividendScheduleLine(stock),
    stock.purchaseDate ? `매수일: ${stock.purchaseDate}` : '',
    formatHighPriceLine(stock)
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseAddArgs(args) {
  if (!args.length) {
    throw new Error('등록할 종목 정보를 입력하세요.');
  }

  const keyed = parseKeyValueArgs(args);

  if (keyed.symbol) {
    return normalizeAddInput({
      symbol: keyed.symbol,
      displayName: keyed.name || keyed.displayName || '',
      accountType: keyed.account || keyed.accountType || keyed.account_type,
      accountName: keyed.accountName || keyed.account_name || keyed.broker || keyed.brokerName || keyed.accountLabel,
      purchasePrice: keyed.price || keyed.purchasePrice,
      quantity: keyed.qty || keyed.quantity || keyed.shares,
      annualDividendPerShare:
        keyed.dividend ||
        keyed.dividendPerShare ||
        keyed.annualDividendPerShare ||
        keyed.annualDividend,
      dividendFrequency:
        keyed.dividendFrequency ||
        keyed.frequency ||
        keyed.dividendFreq ||
        keyed.dividendCycle,
      dividendMonths: keyed.dividendMonths || keyed.months || keyed.payMonths || keyed.payoutMonths,
      purchaseDate: keyed.date || keyed.purchaseDate,
      kisMarketDivCode: keyed.kis || keyed.market || keyed.kisMarket || keyed.kisMarketDivCode,
      alertType: keyed.type || keyed.alertType || keyed.basis,
      thresholdPercent: keyed.rate || keyed.threshold || keyed.thresholdPercent,
      targetPrice: keyed.target || keyed.targetPrice,
      alertCooldownMinutes: keyed.cooldown || keyed.alertCooldownMinutes
    });
  }

  const [symbol, ...rest] = args;
  const dateIndex = rest.findIndex((token) => /^\d{4}-\d{2}-\d{2}$/.test(token));
  const beforeDate = dateIndex === -1 ? rest : rest.slice(0, dateIndex);
  const afterDate = dateIndex === -1 ? [] : rest.slice(dateIndex + 1);
  const typeIndex = dateIndex === -1 ? beforeDate.findIndex(isExplicitTypeToken) : -1;
  const beforeType = typeIndex === -1 ? beforeDate : beforeDate.slice(0, typeIndex);
  const afterType = typeIndex === -1 ? afterDate : beforeDate.slice(typeIndex + 1);
  const typeToken = typeIndex === -1 ? afterDate[0] || 'high' : beforeDate[typeIndex];
  const priceIndex = findLastNumberIndex(beforeType);

  if (priceIndex === -1) {
    throw new Error('매수가를 입력하세요.');
  }

  const displayName = beforeType.slice(0, priceIndex).join(' ');
  const purchasePrice = beforeType[priceIndex];
  const alertType = normalizeTypeToken(typeToken);
  const valueTokens =
    typeIndex === -1
      ? isExplicitTypeToken(afterDate[0])
        ? afterDate.slice(1)
        : afterDate
      : afterType;
  const valueToken = valueTokens[0] || '';
  const cooldownToken = valueTokens[1] || '';

  return normalizeAddInput({
    symbol,
    displayName,
    accountType: '',
    accountName: '',
    purchasePrice,
    purchaseDate: dateIndex === -1 ? '' : rest[dateIndex],
    kisMarketDivCode: '',
    alertType,
    thresholdPercent: alertType === ALERT_TYPES.TARGET_PRICE ? undefined : valueToken,
    targetPrice: alertType === ALERT_TYPES.TARGET_PRICE ? valueToken : undefined,
    alertCooldownMinutes: cooldownToken
  });
}

export function parseEditArgs(args) {
  if (args.length < 2) {
    throw new Error('수정할 종목코드와 항목을 입력하세요.');
  }

  const [query, rawField, ...valueTokens] = args;
  const field = normalizeEditField(rawField);
  const value = valueTokens.join(' ').trim();
  const firstValue = valueTokens[0];

  switch (field) {
    case 'high':
      requireValue(value, '최고가 대비 하락률을 입력하세요.');
      return {
        query,
        label: '최고가 대비 하락률',
        patch: {
          alertType: ALERT_TYPES.HIGH_DRAWDOWN,
          thresholdPercent: firstValue,
          targetPrice: null
        }
      };
    case 'loss':
      requireValue(value, '매수가 대비 손절률을 입력하세요.');
      return {
        query,
        label: '매수가 대비 손절률',
        patch: {
          alertType: ALERT_TYPES.PURCHASE_LOSS,
          thresholdPercent: firstValue,
          targetPrice: null
        }
      };
    case 'profit':
      requireValue(value, '이익금 반납률을 입력하세요.');
      return {
        query,
        label: '이익금 반납률',
        patch: {
          alertType: ALERT_TYPES.PROFIT_RETRACEMENT,
          thresholdPercent: firstValue,
          targetPrice: null
        }
      };
    case 'target':
      requireValue(value, '직접 기준가를 입력하세요.');
      return {
        query,
        label: '직접 기준가',
        patch: {
          alertType: ALERT_TYPES.TARGET_PRICE,
          targetPrice: firstValue
        }
      };
    case 'cooldown':
      requireValue(value, '반복 알림 간격을 분 단위로 입력하세요.');
      return {
        query,
        label: '반복 알림 간격',
        patch: {
          alertCooldownMinutes: firstValue
        }
      };
    case 'name':
      requireValue(value, '표시 이름을 입력하세요.');
      return {
        query,
        label: '표시 이름',
        patch: {
          displayName: value
        }
      };
    case 'price':
      requireValue(value, '매수가를 입력하세요.');
      return {
        query,
        label: '매수가',
        reinitializeHigh: true,
        patch: {
          purchasePrice: firstValue,
          resetHighPrice: true
        }
      };
    case 'quantity':
      requireValue(value, '보유 수량을 입력하세요.');
      return {
        query,
        label: '보유 수량',
        patch: {
          quantity: firstValue
        }
      };
    case 'dividend':
      requireValue(value, '주당 연 배당금을 입력하세요.');
      return {
        query,
        label: '주당 연 배당금',
        patch: {
          annualDividendPerShare: firstValue
        }
      };
    case 'dividendFrequency':
      requireValue(value, '배당 주기를 입력하세요.');
      return {
        query,
        label: '배당 주기',
        patch: {
          dividendFrequency: firstValue
        }
      };
    case 'dividendMonths':
      requireValue(value, '배당 지급월을 입력하세요.');
      return {
        query,
        label: '배당 지급월',
        patch: {
          dividendMonths: value
        }
      };
    case 'date':
      requireValue(value, '매수일을 YYYY-MM-DD 형식으로 입력하세요.');
      return {
        query,
        label: '매수일',
        reinitializeHigh: true,
        patch: {
          purchaseDate: firstValue,
          resetHighPrice: true
        }
      };
    case 'kisMarket':
      requireValue(value, 'KIS 시장 구분을 J, NX, UN 또는 default로 입력하세요.');
      return {
        query,
        label: 'KIS 시장 기준',
        reinitializeHigh: true,
        patch: {
          kisMarketDivCode: firstValue,
          resetHighPrice: true
        }
      };
    case 'notes':
      return {
        query,
        label: '메모',
        patch: {
          notes: value
        }
      };
    case 'reason':
      return {
        query,
        label: '매수 이유',
        patch: {
          investmentReason: value
        }
      };
    case 'planTarget':
      return {
        query,
        label: '투자 목표가',
        patch: {
          investmentTargetPrice: firstValue || ''
        }
      };
    case 'sellCondition':
      return {
        query,
        label: '매도 조건',
        patch: {
          sellCondition: value
        }
      };
    case 'reviewDate':
      return {
        query,
        label: '실적 체크일',
        patch: {
          reviewDate: firstValue || ''
        }
      };
    case 'account':
      requireValue(value, '계좌 구분을 입력하세요. 예: general, isa, pension, other');
      return {
        query,
        label: '계좌 구분',
        patch: {
          accountType: firstValue
        }
      };
    case 'accountname':
      return {
        query,
        label: '증권사/계좌명',
        patch: {
          accountName: value
        }
      };
    default:
      throw new Error('수정 항목은 high, profit, loss, target, cooldown, name, account, accountname, price, qty, dividend, dividendfreq, dividendmonths, date, kis, notes, reason, goal, sell, review 중 하나로 입력하세요.');
  }
}

function normalizeAddInput(input) {
  const alertType = normalizeTypeToken(input.alertType || 'high');

  return {
    symbol: input.symbol,
    displayName: input.displayName || '',
    accountType: input.accountType || '',
    accountName: input.accountName || '',
    purchasePrice: input.purchasePrice,
    quantity: input.quantity,
    annualDividendPerShare: input.annualDividendPerShare,
    dividendFrequency: input.dividendFrequency,
    dividendMonths: input.dividendMonths,
    purchaseDate: input.purchaseDate,
    kisMarketDivCode: input.kisMarketDivCode,
    alertType,
    thresholdPercent:
      alertType === ALERT_TYPES.TARGET_PRICE ? input.thresholdPercent || 5 : input.thresholdPercent,
    targetPrice: alertType === ALERT_TYPES.TARGET_PRICE ? input.targetPrice : null,
    alertCooldownMinutes: input.alertCooldownMinutes || 30
  };
}

function parseKeyValueArgs(args) {
  const result = {};

  for (const arg of args) {
    const separator = arg.indexOf('=');

    if (separator === -1) {
      continue;
    }

    const key = arg.slice(0, separator).trim();
    const value = arg.slice(separator + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

function findLastNumberIndex(tokens) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const number = Number(tokens[index]);

    if (Number.isFinite(number) && number > 0) {
      return index;
    }
  }

  return -1;
}

function formatHighPriceLine(stock) {
  if (!stock.highPrice) {
    return '';
  }

  const label = stock.purchaseDate ? '구매일 이후 최고가' : '감시 최고가';
  const currency = stock.currency ? ` ${stock.currency}` : '';
  return `${label}: ${formatNumber(stock.highPrice)}${currency}`;
}

function formatKisMarketLine(stock) {
  if (!stock.kisMarketDivCode) {
    return '';
  }

  return `KIS 시장 기준: ${formatKisMarketDivCode(stock.kisMarketDivCode)}`;
}

function isExplicitTypeToken(value) {
  const token = String(value || '').toLowerCase();

  return [
    'high_drawdown',
    'high',
    'highest',
    'drawdown',
    'trailing',
    '최고가',
    'profit_retracement',
    'profit',
    'gain',
    'retracement',
    'retracing',
    'giveback',
    'takeprofit',
    'take_profit',
    '이익',
    '수익',
    '반납',
    '이익금',
    '수익금',
    'purchase_loss',
    'loss',
    'stop',
    'stoploss',
    'buy',
    '손절',
    '매수가',
    'target_price',
    'target',
    'price',
    'direct',
    '기준가',
    '직접'
  ].includes(token);
}

function normalizeTypeToken(value) {
  const token = String(value || '').toLowerCase();

  if (['high_drawdown', 'high', 'highest', 'drawdown', 'trailing', '최고가'].includes(token)) {
    return ALERT_TYPES.HIGH_DRAWDOWN;
  }

  if (
    [
      'profit_retracement',
      'profit',
      'gain',
      'retracement',
      'retracing',
      'giveback',
      'takeprofit',
      'take_profit',
      '이익',
      '수익',
      '반납',
      '이익금',
      '수익금'
    ].includes(token)
  ) {
    return ALERT_TYPES.PROFIT_RETRACEMENT;
  }

  if (['purchase_loss', 'loss', 'stop', 'stoploss', 'buy', '손절', '매수가'].includes(token)) {
    return ALERT_TYPES.PURCHASE_LOSS;
  }

  if (['target_price', 'target', 'price', 'direct', '기준가', '직접'].includes(token)) {
    return ALERT_TYPES.TARGET_PRICE;
  }

  if (Number.isFinite(Number(token))) {
    return ALERT_TYPES.HIGH_DRAWDOWN;
  }

  throw new Error('알림 기준은 high, profit, loss, target 중 하나로 입력하세요.');
}

function normalizeEditField(value) {
  const token = String(value || '').toLowerCase();

  if (['high', 'high_drawdown', 'drawdown', 'trailing', 'rate', 'threshold', '최고가'].includes(token)) {
    return 'high';
  }

  if (
    [
      'profit',
      'profit_retracement',
      'gain',
      'retracement',
      'giveback',
      'takeprofit',
      'take_profit',
      '이익',
      '수익',
      '반납',
      '이익금',
      '수익금'
    ].includes(token)
  ) {
    return 'profit';
  }

  if (['loss', 'purchase_loss', 'stop', 'stoploss', 'buy', '손절'].includes(token)) {
    return 'loss';
  }

  if (['target', 'target_price', 'price_target', 'direct', '기준가', '직접'].includes(token)) {
    return 'target';
  }

  if (['cooldown', 'interval', 'repeat', 'minutes', '반복', '간격'].includes(token)) {
    return 'cooldown';
  }

  if (['name', 'displayname', 'display_name', 'title', '이름'].includes(token)) {
    return 'name';
  }

  if (['price', 'purchaseprice', 'purchase_price', 'buyprice', '매수가'].includes(token)) {
    return 'price';
  }

  if (['qty', 'quantity', 'shares', 'amount', '수량', '보유수량'].includes(token)) {
    return 'quantity';
  }

  if (
    [
      'account',
      'accounttype',
      'account_type',
      '계좌구분',
      '계좌종류',
      'isa',
      '일반계좌',
      '연금계좌',
      '기타계좌'
    ].includes(token)
  ) {
    return 'account';
  }

  if (
    [
      'accountname',
      'account_name',
      'accountlabel',
      'broker',
      'brokername',
      '계좌',
      '계좌명',
      '증권사',
      '증권사명',
      '증권계좌'
    ].includes(token)
  ) {
    return 'accountname';
  }

  if (
    [
      'dividend',
      'div',
      'annualdividend',
      'annual_dividend',
      'dividendpershare',
      'dividend_per_share',
      '배당',
      '배당금',
      '주당배당금'
    ].includes(token)
  ) {
    return 'dividend';
  }

  if (
    [
      'dividendfreq',
      'dividendfrequency',
      'dividend_frequency',
      'frequency',
      'cycle',
      '배당주기'
    ].includes(token)
  ) {
    return 'dividendFrequency';
  }

  if (
    [
      'dividendmonths',
      'dividend_months',
      'months',
      'paymonths',
      'payoutmonths',
      '배당월',
      '지급월',
      '배당지급월'
    ].includes(token)
  ) {
    return 'dividendMonths';
  }

  if (['kis', 'kismarket', 'kis_market', 'kismarketdivcode', 'market', 'venue', '시장'].includes(token)) {
    return 'kisMarket';
  }

  if (['date', 'purchasedate', 'purchase_date', 'buydate', '매수일', '구매일'].includes(token)) {
    return 'date';
  }

  if (['note', 'notes', 'memo', '메모'].includes(token)) {
    return 'notes';
  }

  if (['reason', 'thesis', 'buyreason', 'investmentreason', '매수이유', '투자이유'].includes(token)) {
    return 'reason';
  }

  if (['goal', 'plantarget', 'investmenttarget', 'investmenttargetprice', '목표가', '투자목표가'].includes(token)) {
    return 'planTarget';
  }

  if (['sell', 'sellcondition', 'exit', 'exitcondition', '매도조건', '매도기준'].includes(token)) {
    return 'sellCondition';
  }

  if (['review', 'reviewdate', 'checkdate', '실적체크일', '점검일', '체크일'].includes(token)) {
    return 'reviewDate';
  }

  return token;
}

function requireValue(value, message) {
  if (!String(value || '').trim()) {
    throw new Error(message);
  }
}

function isSnoozeClearToken(value) {
  return ['clear', 'off', 'resume', '0', '해제', '끄기해제', '일시정지해제'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function parseSnoozeUntil(value, now = new Date()) {
  const token = String(value || '').trim().toLowerCase();

  if (!token) {
    throw new Error('/snooze는 시간 값이 필요합니다. 예: /snooze 336260 60 또는 /snooze 336260 today');
  }

  if (['today', 'day', '오늘', '오늘하루'].includes(token)) {
    const until = new Date(now);
    until.setHours(24, 0, 0, 0);
    return until;
  }

  const match = token.match(/^(\d+)(m|분|h|시간)?$/);

  if (!match) {
    throw new Error('일시정지 시간은 분 숫자, 시간 단위, today, clear 중 하나로 입력하세요. 예: 60, 2h, today, clear');
  }

  const amount = Number(match[1]);
  const unit = match[2] || 'm';

  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error('일시정지 시간은 1분 이상이어야 합니다.');
  }

  const minutes = unit === 'h' || unit === '시간' ? amount * 60 : amount;
  const until = new Date(now);
  until.setMinutes(until.getMinutes() + minutes);

  return until;
}

async function setStockActive(store, query, active) {
  const stock = await findStock(store, query);

  if (active && stock.positionStatus === POSITION_STATUSES.SOLD) {
    throw new Error('매도 완료 종목은 /holding <종목코드>로 보유 상태로 바꾼 뒤 알림을 켜세요.');
  }

  const updated = await store.updateStock(stock.id, { active });

  return `${formatStockTitle(updated)} 알림을 ${active ? '켰습니다' : '껐습니다'}.`;
}

async function snoozeStockFromCommand(store, args) {
  const [query, durationToken] = args;
  const stock = await findStock(store, query);

  if (stock.positionStatus === POSITION_STATUSES.SOLD) {
    throw new Error('매도 완료 종목은 알림을 일시정지할 수 없습니다. /holding <종목코드>로 보유 상태로 바꾼 뒤 사용하세요.');
  }

  if (isSnoozeClearToken(durationToken)) {
    const updated = await store.updateStock(stock.id, {
      alertSnoozedUntil: null,
      active: true
    });

    return `${formatStockTitle(updated)} 알림 일시정지를 해제하고 알림을 켰습니다.`;
  }

  const snoozeUntil = parseSnoozeUntil(durationToken);
  const updated = await store.updateStock(stock.id, {
    alertSnoozedUntil: snoozeUntil.toISOString(),
    active: true
  });

  return `${formatStockTitle(updated)} 알림을 ${formatDate(updated.alertSnoozedUntil)}까지 일시정지했습니다.`;
}

async function setStockPositionStatus(store, query, positionStatus) {
  const stock = await findStock(store, query);
  const patch = { positionStatus };

  if (positionStatus === POSITION_STATUSES.HOLDING) {
    patch.active = true;
    patch.alertSnoozedUntil = null;
  } else if (positionStatus === POSITION_STATUSES.WATCH) {
    patch.active = false;
    patch.alertSnoozedUntil = null;
  }

  const updated = await store.updateStock(stock.id, patch);
  const actionText = {
    [POSITION_STATUSES.HOLDING]: '보유중으로 변경하고 알림을 켰습니다.',
    [POSITION_STATUSES.WATCH]: '관심 종목으로 변경하고 알림을 껐습니다.',
    [POSITION_STATUSES.SOLD]: '매도 완료로 변경하고 알림 대상에서 제외했습니다.'
  }[updated.positionStatus];

  return [
    `${formatStockTitle(updated)} ${actionText}`,
    formatPositionStatusLine(updated),
    formatAlertControlLine(updated)
  ].join('\n');
}

async function deleteStockFromCommand(store, query) {
  const stock = await findStock(store, query);
  await store.deleteStock(stock.id);

  return `${formatStockTitle(stock)} 종목을 삭제했습니다.`;
}

async function runManualCheck(store, config, options) {
  const checker = options.runAlertCheck || runAlertCheck;
  const result = await checker(store, config);
  const counts = result.results.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    {}
  );

  const lines = [
    '즉시 확인을 완료했습니다.',
    `전체: ${result.results.length}개`,
    counts.alert ? `알림: ${counts.alert}개` : '',
    counts.checked ? `정상: ${counts.checked}개` : '',
    counts.recovered ? `회복: ${counts.recovered}개` : '',
    counts.high_updated ? `새 최고가: ${counts.high_updated}개` : '',
    counts.error ? `오류: ${counts.error}개` : ''
  ].filter(Boolean);

  const todaySummary = await buildTelegramTodaySummary(store, config, options);

  if (todaySummary) {
    lines.push('', todaySummary);
  }

  return lines.join('\n');
}

async function findStock(store, query) {
  if (!query) {
    throw new Error('종목코드를 입력하세요.');
  }

  const parsed = parseStockQuery(query);
  const normalizedQuery = parsed.term.toLowerCase();
  const stocks = await store.listStocks();
  const matches = stocks.filter((item) => {
    return (
      item.id === parsed.term ||
      String(item.symbol || '').toLowerCase() === normalizedQuery ||
      String(item.displayName || '').toLowerCase() === normalizedQuery
    );
  });
  const filteredMatches = parsed.accountSelector
    ? matches.filter((item) => stockMatchesAccountSelector(item, parsed.accountSelector))
    : matches;

  if (!filteredMatches.length) {
    throw new Error(`종목을 찾을 수 없습니다: ${query}`);
  }

  if (filteredMatches.length > 1) {
    throw new Error(formatAmbiguousStockMessage(parsed.term, filteredMatches));
  }

  return filteredMatches[0];
}

function parseStockQuery(query) {
  const raw = String(query || '').trim();
  const accountMatch = raw.match(/^(.+?)[@:]([A-Za-z가-힣0-9_-]+)$/);

  if (!accountMatch) {
    return {
      term: raw,
      accountSelector: null
    };
  }

  const accountType = parseAccountTypeToken(accountMatch[2]);
  const accountName = normalizeAccountName(accountMatch[2]);

  if (!accountType && !accountName) {
    return {
      term: raw,
      accountSelector: null
    };
  }

  return {
    term: accountMatch[1],
    accountSelector: {
      raw: accountMatch[2],
      accountType,
      accountNameKey: normalizeAccountNameKey(accountName)
    }
  };
}

function stockMatchesAccountSelector(stock, selector) {
  if (selector.accountType && normalizeAccountType(stock.accountType) === selector.accountType) {
    return true;
  }

  return selector.accountNameKey !== 'default' &&
    normalizeAccountNameKey(stock.accountName) === selector.accountNameKey;
}

function parseAccountTypeToken(value) {
  const token = String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  const allowed = new Set([
    'general',
    'normal',
    'cash',
    'regular',
    '일반',
    '일반계좌',
    '종합',
    '종합계좌',
    'isa',
    '중개형isa',
    '개인종합자산관리계좌',
    'pension',
    'retirement',
    'irp',
    '연금',
    '연금계좌',
    'other',
    '기타'
  ]);

  return allowed.has(token) ? normalizeAccountType(value) : null;
}

function formatAmbiguousStockMessage(query, stocks) {
  const examples = stocks
    .slice(0, 4)
    .map((stock) => `${stock.symbol}@${formatAccountSelector(stock)}(${formatAccountLabel(stock)})`);

  return [
    `여러 계좌에 같은 종목이 있습니다: ${query}`,
    `계좌를 붙여 입력하세요. 예: ${examples.join(', ')}`,
    '계좌 구분은 @general, @isa, @pension을 붙이고, 같은 구분이 여러 개면 @키움처럼 계좌명을 붙이면 됩니다.'
  ].join('\n');
}

function formatStockList(stocks, options = {}) {
  if (!stocks.length) {
    return '등록된 감시 종목이 없습니다.';
  }

  return stocks.map((stock, index) => `${index + 1}. ${formatStockLine(stock, options)}`).join('\n\n');
}

async function formatStockStatusFromCommand(store, query, options = {}) {
  const stocks = await store.listStocks();

  if (!query) {
    const summaryLine = formatQuoteFreshnessSummaryLine(stocks, options);
    const list = formatStockList(stocks, options);

    return summaryLine ? `${summaryLine}\n\n${list}` : list;
  }

  const stock = await findStock(store, query);

  return ['종목 상태', formatStockLine(stock, options)].join('\n');
}

function formatQuoteFreshnessSummaryLine(stocks, options = {}) {
  const summary = summarizeQuoteFreshness(stocks, options);

  if (!summary.activeCount) {
    return '';
  }

  const parts = [
    `시세 신선도 요약: 감시 ${summary.activeCount} · 정상 ${summary.fresh || 0}`
  ];

  if (summary.stale) {
    parts.push(`오래됨 ${summary.stale}`);
  }

  if (summary.error) {
    parts.push(`오류 ${summary.error}`);
  }

  if (summary.missing) {
    parts.push(`미확인 ${summary.missing}`);
  }

  if (summary.delayed) {
    parts.push(`지연 ${summary.delayed}`);
  }

  if (summary.needsAttention) {
    parts.push(`기준 ${summary.maxAgeMinutes}분`);
  }

  return parts.join(' · ');
}

function formatQuoteFreshnessLine(stock, options = {}) {
  if (stock?.active === false) {
    return '';
  }

  const freshness = classifyQuoteFreshness(stock, options);
  const parts = [`시세 신선도: ${freshness.label} · ${freshness.detail}`];

  if (freshness.nextAction) {
    parts.push(`다음 조치: ${freshness.nextAction}`);
  }

  return parts.join('\n');
}

function formatStockLine(stock, options = {}) {
  const currentPrice = Number(stock.lastPrice);
  const line = [
    formatStockTitle(stock),
    formatPositionStatusLine(stock),
    formatAlertControlLine(stock),
    `기준: ${formatAlertType(stock.alertType)}`,
    stock.purchaseDate ? `매수일: ${stock.purchaseDate}` : '',
    stock.purchasePrice ? `매수가: ${formatNumber(stock.purchasePrice)}` : '',
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    stock.annualDividendPerShare ? `주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}` : '',
    formatKisMarketLine(stock),
    Number.isFinite(currentPrice) ? `현재가: ${formatNumber(currentPrice)}${stock.currency ? ` ${stock.currency}` : ''}` : '',
    formatQuoteFreshnessLine(stock, options),
    formatDividendScheduleLine(stock),
    formatDividendEventLine(stock),
    formatDividendHistoryLine(stock),
    formatHoldingLine(stock),
    formatDividendLine(stock),
    formatAlertStateLine(stock),
    formatThresholdLine(stock)
  ];

  return line.filter(Boolean).join('\n');
}

function formatPositionStatusLine(stock) {
  return `종목 상태: ${formatPositionStatus(stock.positionStatus)}`;
}

function formatStockTitle(stock) {
  return `${stock.displayName || stock.symbol} (${stock.symbol}, ${formatAccountLabel(stock)})`;
}

function formatAccountType(value) {
  const labels = {
    general: '일반',
    isa: 'ISA',
    pension: '연금',
    other: '기타'
  };

  return labels[normalizeAccountType(value)] || labels.general;
}

function formatAccountLabel(stock) {
  const accountName = normalizeAccountName(stock.accountName);
  const accountTypeLabel = formatAccountType(stock.accountType);
  return accountName ? `${accountTypeLabel} · ${accountName}` : accountTypeLabel;
}

function formatAccountSelector(stock) {
  const accountName = normalizeAccountName(stock.accountName);
  return accountName || normalizeAccountType(stock.accountType);
}

function formatAlertControlLine(stock) {
  if (stock.positionStatus === POSITION_STATUSES.SOLD) {
    return '알림: 매도 완료로 중지';
  }

  const snoozedUntil = getFutureSnoozeUntil(stock);

  if (snoozedUntil) {
    return `알림: 일시정지 (${formatDate(snoozedUntil.toISOString())}까지)`;
  }

  return `알림: ${stock.active ? '켜짐' : '꺼짐'}`;
}

function formatPositionStatus(value) {
  const labels = {
    [POSITION_STATUSES.HOLDING]: '보유중',
    [POSITION_STATUSES.WATCH]: '관심종목',
    [POSITION_STATUSES.SOLD]: '매도 완료'
  };

  return labels[value] || labels[POSITION_STATUSES.HOLDING];
}

function getFutureSnoozeUntil(stock, now = new Date()) {
  const time = new Date(stock.alertSnoozedUntil || 0).getTime();

  if (!Number.isFinite(time) || time <= now.getTime()) {
    return null;
  }

  return new Date(time);
}

function formatHoldingLine(stock) {
  const quantity = Number(stock.quantity);
  const purchasePrice = Number(stock.purchasePrice);
  const currentPrice = Number(stock.lastPrice);

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice <= 0 ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return '';
  }

  const investmentAmount = quantity * purchasePrice;
  const marketValue = quantity * currentPrice;
  const profit = marketValue - investmentAmount;
  const profitPercent = investmentAmount > 0 ? (profit / investmentAmount) * 100 : 0;
  const currency = stock.currency ? ` ${stock.currency}` : '';

  return `평가손익: ${formatSignedNumber(profit)}${currency} (${formatSignedPercent(profitPercent)})`;
}

function formatDividendLine(stock) {
  const quantity = Number(stock.quantity);
  const purchasePrice = Number(stock.purchasePrice);
  const annualDividendPerShare = Number(stock.annualDividendPerShare);

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice <= 0 ||
    !Number.isFinite(annualDividendPerShare) ||
    annualDividendPerShare <= 0
  ) {
    return '';
  }

  const investmentAmount = quantity * purchasePrice;
  const expectedAnnualDividend = quantity * annualDividendPerShare;
  const dividendYieldPercent =
    investmentAmount > 0 ? (expectedAnnualDividend / investmentAmount) * 100 : 0;
  const currency = stock.currency ? ` ${stock.currency}` : '';

  return `예상 연 배당금: ${formatNumber(expectedAnnualDividend)}${currency} (${formatPercent(dividendYieldPercent)})`;
}

function formatDividendScheduleLine(stock) {
  const schedule = getDividendSchedule(stock);

  if (!schedule.frequency && !schedule.months.length) {
    return '';
  }

  return `배당 일정: ${formatDividendFrequency(schedule.frequency)} · ${formatDividendMonths(schedule.months)}`;
}

function formatDividendEventLine(stock) {
  const parts = [];
  const currency = stock.dividendCurrency || stock.currency || '';

  if (stock.lastDividendValue) {
    parts.push(`최근 1주 배당 ${formatNumber(stock.lastDividendValue)}${currency ? ` ${currency}` : ''}`);
  }

  if (stock.exDividendDate) {
    parts.push(`배당락 ${formatDateOnly(stock.exDividendDate)}`);
  }

  if (stock.dividendDate) {
    parts.push(`지급 ${formatDateOnly(stock.dividendDate)}`);
  }

  return parts.length ? `배당 이벤트: ${parts.join(' · ')}` : '';
}

function formatDividendHistoryLine(stock) {
  const latest = Array.isArray(stock.dividendHistory) ? stock.dividendHistory[0] : null;

  if (!latest) {
    return '';
  }

  const currency = latest.currency || stock.dividendCurrency || stock.currency || '';
  const parts = [];

  if (latest.previousAnnualDividendPerShare !== latest.annualDividendPerShare) {
    parts.push(
      `연 ${formatNumber(latest.previousAnnualDividendPerShare)} -> ${formatNumber(latest.annualDividendPerShare)}${currency ? ` ${currency}` : ''}`
    );
  }

  if (latest.previousExDividendDate !== latest.exDividendDate) {
    parts.push(`락 ${formatDateOnly(latest.previousExDividendDate)} -> ${formatDateOnly(latest.exDividendDate)}`);
  }

  if (latest.previousDividendDate !== latest.dividendDate) {
    parts.push(`지급 ${formatDateOnly(latest.previousDividendDate)} -> ${formatDateOnly(latest.dividendDate)}`);
  }

  return parts.length ? `최근 배당 변경: ${parts.join(' · ')}` : '';
}

function formatAlertStateLine(stock) {
  if (stock.alertState === 'triggered') {
    const count = Number(stock.alertRepeatCount || 0);
    return `상태: 알림 기준 이하${count ? ` (${count}회차)` : ''}`;
  }

  if (stock.alertRecoveredAt) {
    return `상태: 회복 (${formatDateOnly(stock.alertRecoveredAt)})`;
  }

  return '상태: 정상';
}

function formatThresholdLine(stock) {
  try {
    const referencePrice =
      stock.alertType === ALERT_TYPES.TARGET_PRICE ? stock.targetPrice : stock.lastPrice || stock.highPrice;
    const rule = buildAlertRule(stock, referencePrice || 1);

    if (rule.thresholdPrice === null) {
      return '';
    }

    return `알림가: ${formatNumber(rule.thresholdPrice)}${stock.currency ? ` ${stock.currency}` : ''}`;
  } catch {
    return '';
  }
}

function formatAlertType(alertType) {
  const labels = {
    [ALERT_TYPES.HIGH_DRAWDOWN]: '최고가 대비 하락률',
    [ALERT_TYPES.PROFIT_RETRACEMENT]: '이익금 반납률',
    [ALERT_TYPES.PURCHASE_LOSS]: '매수가 대비 손절률',
    [ALERT_TYPES.TARGET_PRICE]: '직접 기준가'
  };

  return labels[alertType] || labels[ALERT_TYPES.HIGH_DRAWDOWN];
}

function getDividendSchedule(stock) {
  const frequency = normalizeDividendFrequency(stock.dividendFrequency);
  const explicitMonths = parseDividendMonths(stock.dividendMonths);
  const months = explicitMonths.length ? explicitMonths : getDefaultDividendMonths(frequency);

  return {
    frequency,
    months
  };
}

function normalizeDividendFrequency(value) {
  const frequency = String(value || '').trim().toLowerCase();
  const allowed = ['', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];

  return allowed.includes(frequency) ? frequency : '';
}

function getDefaultDividendMonths(frequency) {
  switch (normalizeDividendFrequency(frequency)) {
    case 'monthly':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case 'quarterly':
      return [3, 6, 9, 12];
    case 'semiannual':
      return [6, 12];
    case 'annual':
      return [12];
    default:
      return [];
  }
}

function parseDividendMonths(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const rawItems = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const months = rawItems
    .map((item) => Number(item))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);

  return [...new Set(months)].sort((left, right) => left - right);
}

function formatDividendFrequency(value) {
  const labels = {
    monthly: '월배당',
    quarterly: '분기배당',
    semiannual: '반기배당',
    annual: '연배당',
    custom: '직접 입력',
    '': '-'
  };

  return labels[normalizeDividendFrequency(value)] || '-';
}

function formatDividendMonths(value) {
  const months = parseDividendMonths(value);

  if (!months.length) {
    return '-';
  }

  if (months.length === 12) {
    return '매월';
  }

  return months.map((month) => `${month}월`).join(', ');
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return number.toLocaleString('ko-KR', {
    maximumFractionDigits: number >= 1000 ? 0 : 2
  });
}

function formatSignedNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${number > 0 ? '+' : ''}${formatNumber(number)}`;
}

function formatSignedPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${number.toFixed(2)}%`;
}

function formatDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return '-';
  }

  return `${match[1]}.${match[2]}.${match[3]}`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ko-KR');
}

function formatBytes(value) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeListLimit(value) {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1) {
    return 5;
  }

  return Math.min(limit, 20);
}

function getShortUsage(commandName) {
  if (commandName === 'add') {
    return [
      '예시:',
      '/add 336260 두산퓨얼셀 88779 high 10',
      '/add 336260 두산퓨얼셀 88779 profit 10',
      '/add 336260 두산퓨얼셀 88779 2026-05-11 high 10',
      '/add symbol=336260 name=두산퓨얼셀 account=isa broker=키움 price=88779 type=profit percent=10',
      '/add 336260 두산퓨얼셀 88779 target 93000'
    ].join('\n');
  }

  if (commandName === 'restore') {
    return [
      '예시:',
      '/backups',
      '/restore 1',
      '/restore store-20260511-082342-355-server-start-c6b8dcd7.json'
    ].join('\n');
  }

  if (commandName === 'snooze') {
    return [
      '예시:',
      '/snooze 336260 60',
      '/snooze 336260 2h',
      '/snooze 336260 today',
      '/snooze 336260 clear'
    ].join('\n');
  }

  if (['status', 'pause', 'resume', 'sold', 'watch', 'holding', 'hold'].includes(commandName)) {
    return [
      '예시:',
      '/status 336260',
      '/status 336260@isa',
      '/status 336260@키움',
      '/pause 336260',
      '/resume 336260',
      '/sold 336260',
      '/watch 336260',
      '/holding 336260'
    ].join('\n');
  }

  if (commandName === 'edit') {
    return [
      '예시:',
      '/edit 336260 high 8',
      '/edit 336260 profit 10',
      '/edit 336260 loss 5',
      '/edit 336260 target 93000',
      '/edit 336260 account isa',
      '/edit 336260 accountname 키움 일반',
      '/edit 336260 cooldown 60',
      '/edit 336260 name 두산퓨얼셀',
      '/edit 336260 reason 수소 밸류체인 성장',
      '/edit 336260 goal 120000',
      '/edit 336260 sell 분기 적자 확대 시 매도',
      '/edit 336260 review 2026-08-15',
      '/edit 336260 kis NX'
    ].join('\n');
  }

  return '/help 로 사용법을 확인하세요.';
}
