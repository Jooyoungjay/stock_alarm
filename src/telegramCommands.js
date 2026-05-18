import { buildAlertRule, initializeHighFromPurchaseDate, runAlertCheck } from './alertEngine.js';
import { createBackup, deleteBackup, listBackups, restoreBackup } from './backups.js';
import { buildDailyBriefing, formatDailyBriefingMessage } from './portfolioBriefing.js';
import { ALERT_TYPES } from './storage.js';
import {
  fetchTelegramUpdates,
  isAuthorizedTelegramChat,
  isTelegramConfigured,
  sendTelegramMessage
} from './telegram.js';

const updateOffsetKey = 'telegramUpdateOffset';

const helpMessage = [
  '[Stock Alarm] 명령어',
  '/list - 감시 종목 목록',
  '/brief - 위험도 순위와 일일 브리핑',
  '/check - 지금 바로 전체 확인',
  '/pause <종목코드> - 알림 끄기',
  '/resume <종목코드> - 알림 켜기',
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
  '/add 336260 두산퓨얼셀 88779 target 93000',
  '',
  '수정 예시',
  '/edit 336260 high 8',
  '/edit 336260 profit 10',
  '/edit 336260 loss 5',
  '/edit 336260 target 93000',
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
  '기준값: high=최고가 대비 하락률, profit=이익금 반납률, loss=매수가 대비 손절률, target=직접 기준가'
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
    case 'status':
      return formatStockList(await store.listStocks());
    case 'brief':
    case 'briefing':
    case 'risk':
      return formatBriefingFromCommand(await store.listStocks(), config);
    case 'add':
      return addStockFromCommand(store, config, command, options);
    case 'pause':
    case 'stop':
      return setStockActive(store, command.args[0], false);
    case 'resume':
    case 'startstock':
      return setStockActive(store, command.args[0], true);
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
    default:
      return `지원하지 않는 명령어입니다: /${command.name}\n\n${helpMessage}`;
  }
}

function formatBriefingFromCommand(stocks, config) {
  const briefing = buildDailyBriefing(stocks, {
    warningDistancePercent: config.dailyBriefingWarningDistancePercent,
    topLimit: config.dailyBriefingTopLimit
  });

  return formatDailyBriefingMessage(briefing);
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

async function listBackupsFromCommand(_store, config, command, options) {
  const backupLister = options.listBackups || listBackups;
  const limit = normalizeListLimit(command.args[0] || 5);
  const backups = await backupLister(config.dataDir, { limit });

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

async function restoreBackupFromCommand(_store, config, command, options) {
  const target = command.args[0];
  const backupRestorer = options.restoreBackup || restoreBackup;
  const result = await backupRestorer(config.dataDir, target, {
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

async function deleteBackupFromCommand(_store, config, command, options) {
  const target = command.args[0];
  const backupDeleter = options.deleteBackup || deleteBackup;
  const result = await backupDeleter(config.dataDir, target);

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
    `${stock.displayName || stock.symbol} (${stock.symbol})`,
    `알림 기준: ${formatAlertType(stock.alertType)}`,
    stock.alertType === ALERT_TYPES.TARGET_PRICE
      ? `직접 기준가: ${formatNumber(stock.targetPrice)}`
      : `비율: ${stock.thresholdPercent}%`,
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    stock.annualDividendPerShare ? `주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}` : '',
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
    `${stock.displayName || stock.symbol} (${stock.symbol})`,
    `수정 항목: ${input.label}`,
    `알림 기준: ${formatAlertType(stock.alertType)}`,
    stock.alertType === ALERT_TYPES.TARGET_PRICE
      ? `직접 기준가: ${formatNumber(stock.targetPrice)}`
      : `비율: ${stock.thresholdPercent}%`,
    `반복 알림: ${stock.alertCooldownMinutes}분`,
    stock.purchasePrice ? `매수가: ${formatNumber(stock.purchasePrice)}` : '',
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    stock.annualDividendPerShare ? `주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}` : '',
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
    purchasePrice,
    purchaseDate: dateIndex === -1 ? '' : rest[dateIndex],
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
    default:
      throw new Error('수정 항목은 high, profit, loss, target, cooldown, name, price, qty, dividend, dividendfreq, dividendmonths, date, notes, reason, goal, sell, review 중 하나로 입력하세요.');
  }
}

function normalizeAddInput(input) {
  const alertType = normalizeTypeToken(input.alertType || 'high');

  return {
    symbol: input.symbol,
    displayName: input.displayName || '',
    purchasePrice: input.purchasePrice,
    quantity: input.quantity,
    annualDividendPerShare: input.annualDividendPerShare,
    dividendFrequency: input.dividendFrequency,
    dividendMonths: input.dividendMonths,
    purchaseDate: input.purchaseDate,
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

async function setStockActive(store, query, active) {
  const stock = await findStock(store, query);
  const updated = await store.updateStock(stock.id, { active });

  return `${updated.displayName || updated.symbol} (${updated.symbol}) 알림을 ${active ? '켰습니다' : '껐습니다'}.`;
}

async function deleteStockFromCommand(store, query) {
  const stock = await findStock(store, query);
  await store.deleteStock(stock.id);

  return `${stock.displayName || stock.symbol} (${stock.symbol}) 종목을 삭제했습니다.`;
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

  return [
    '즉시 확인을 완료했습니다.',
    `전체: ${result.results.length}개`,
    counts.alert ? `알림: ${counts.alert}개` : '',
    counts.checked ? `정상: ${counts.checked}개` : '',
    counts.recovered ? `회복: ${counts.recovered}개` : '',
    counts.high_updated ? `새 최고가: ${counts.high_updated}개` : '',
    counts.error ? `오류: ${counts.error}개` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

async function findStock(store, query) {
  if (!query) {
    throw new Error('종목코드를 입력하세요.');
  }

  const normalizedQuery = String(query).trim().toLowerCase();
  const stocks = await store.listStocks();
  const stock = stocks.find((item) => {
    return (
      item.id === query ||
      String(item.symbol || '').toLowerCase() === normalizedQuery ||
      String(item.displayName || '').toLowerCase() === normalizedQuery
    );
  });

  if (!stock) {
    throw new Error(`종목을 찾을 수 없습니다: ${query}`);
  }

  return stock;
}

function formatStockList(stocks) {
  if (!stocks.length) {
    return '등록된 감시 종목이 없습니다.';
  }

  return stocks.map((stock, index) => `${index + 1}. ${formatStockLine(stock)}`).join('\n\n');
}

function formatStockLine(stock) {
  const currentPrice = Number(stock.lastPrice);
  const line = [
    `${stock.displayName || stock.symbol} (${stock.symbol}) ${stock.active ? '알림 켜짐' : '알림 꺼짐'}`,
    `기준: ${formatAlertType(stock.alertType)}`,
    stock.purchaseDate ? `매수일: ${stock.purchaseDate}` : '',
    stock.purchasePrice ? `매수가: ${formatNumber(stock.purchasePrice)}` : '',
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    stock.annualDividendPerShare ? `주당 연 배당금: ${formatNumber(stock.annualDividendPerShare)}` : '',
    Number.isFinite(currentPrice) ? `현재가: ${formatNumber(currentPrice)}${stock.currency ? ` ${stock.currency}` : ''}` : '',
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

  if (commandName === 'edit') {
    return [
      '예시:',
      '/edit 336260 high 8',
      '/edit 336260 profit 10',
      '/edit 336260 loss 5',
      '/edit 336260 target 93000',
      '/edit 336260 cooldown 60',
      '/edit 336260 name 두산퓨얼셀',
      '/edit 336260 reason 수소 밸류체인 성장',
      '/edit 336260 goal 120000',
      '/edit 336260 sell 분기 적자 확대 시 매도',
      '/edit 336260 review 2026-08-15'
    ].join('\n');
  }

  return '/help 로 사용법을 확인하세요.';
}
