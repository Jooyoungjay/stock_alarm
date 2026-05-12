import { buildAlertRule, initializeHighFromPurchaseDate, runAlertCheck } from './alertEngine.js';
import { createBackup, listBackups, restoreBackup } from './backups.js';
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
  '/check - 지금 바로 전체 확인',
  '/pause <종목코드> - 감시 중지',
  '/resume <종목코드> - 감시 재개',
  '/edit <종목코드> <항목> <값> - 알림 조건 수정',
  '/delete <종목코드> - 종목 삭제',
  '/backup - 현재 데이터 백업 생성',
  '/backups - 최근 백업 목록',
  '/restore <백업파일명|번호> - 백업 복구',
  '',
  '등록 예시',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 high 10',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 target 93000',
  '',
  '수정 예시',
  '/edit 336260 high 8',
  '/edit 336260 loss 5',
  '/edit 336260 target 93000',
  '/edit 336260 cooldown 60',
  '/edit 336260 qty 10',
  '/edit 336260 name 두산퓨얼셀',
  '',
  '기준값: high=최고가 대비 하락률, loss=매수가 대비 손절률, target=직접 기준가'
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
    case 'check':
      return runManualCheck(store, config, options);
    default:
      return `지원하지 않는 명령어입니다: /${command.name}\n\n${helpMessage}`;
  }
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
    stock.highPrice ? `구매일 이후 최고가: ${formatNumber(stock.highPrice)}${stock.currency ? ` ${stock.currency}` : ''}` : ''
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
    stock.purchaseDate ? `매수일: ${stock.purchaseDate}` : '',
    stock.highPrice ? `구매일 이후 최고가: ${formatNumber(stock.highPrice)}${stock.currency ? ` ${stock.currency}` : ''}` : ''
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
      purchaseDate: keyed.date || keyed.purchaseDate,
      alertType: keyed.type || keyed.alertType || keyed.basis,
      thresholdPercent: keyed.rate || keyed.threshold || keyed.thresholdPercent,
      targetPrice: keyed.target || keyed.targetPrice,
      alertCooldownMinutes: keyed.cooldown || keyed.alertCooldownMinutes
    });
  }

  const [symbol, ...rest] = args;
  const dateIndex = rest.findIndex((token) => /^\d{4}-\d{2}-\d{2}$/.test(token));

  if (dateIndex === -1) {
    throw new Error('구매일을 YYYY-MM-DD 형식으로 입력하세요.');
  }

  const beforeDate = rest.slice(0, dateIndex);
  const afterDate = rest.slice(dateIndex + 1);
  const priceIndex = findLastNumberIndex(beforeDate);

  if (priceIndex === -1) {
    throw new Error('매수가를 입력하세요.');
  }

  const displayName = beforeDate.slice(0, priceIndex).join(' ');
  const purchasePrice = beforeDate[priceIndex];
  const typeToken = afterDate[0] || 'high';
  const alertType = normalizeTypeToken(typeToken);
  const valueToken = afterDate[1] || (alertType === ALERT_TYPES.TARGET_PRICE ? '' : afterDate[0]);
  const cooldownToken = afterDate[2] || '';

  return normalizeAddInput({
    symbol,
    displayName,
    purchasePrice,
    purchaseDate: rest[dateIndex],
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
    default:
      throw new Error('수정 항목은 high, loss, target, cooldown, name, price, qty, date, notes 중 하나로 입력하세요.');
  }
}

function normalizeAddInput(input) {
  const alertType = normalizeTypeToken(input.alertType || 'high');

  return {
    symbol: input.symbol,
    displayName: input.displayName || '',
    purchasePrice: input.purchasePrice,
    quantity: input.quantity,
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

function normalizeTypeToken(value) {
  const token = String(value || '').toLowerCase();

  if (['high_drawdown', 'high', 'highest', 'drawdown', 'trailing', '최고가'].includes(token)) {
    return ALERT_TYPES.HIGH_DRAWDOWN;
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

  throw new Error('알림 기준은 high, loss, target 중 하나로 입력하세요.');
}

function normalizeEditField(value) {
  const token = String(value || '').toLowerCase();

  if (['high', 'high_drawdown', 'drawdown', 'trailing', 'rate', 'threshold', '최고가'].includes(token)) {
    return 'high';
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

  if (['date', 'purchasedate', 'purchase_date', 'buydate', '매수일', '구매일'].includes(token)) {
    return 'date';
  }

  if (['note', 'notes', 'memo', '메모'].includes(token)) {
    return 'notes';
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

  return `${updated.displayName || updated.symbol} (${updated.symbol}) 감시를 ${active ? '재개' : '중지'}했습니다.`;
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
    `${stock.displayName || stock.symbol} (${stock.symbol}) ${stock.active ? '감시중' : '중지'}`,
    `기준: ${formatAlertType(stock.alertType)}`,
    stock.purchaseDate ? `매수일: ${stock.purchaseDate}` : '',
    stock.purchasePrice ? `매수가: ${formatNumber(stock.purchasePrice)}` : '',
    stock.quantity ? `보유 수량: ${formatNumber(stock.quantity)}` : '',
    Number.isFinite(currentPrice) ? `현재가: ${formatNumber(currentPrice)}${stock.currency ? ` ${stock.currency}` : ''}` : '',
    formatHoldingLine(stock),
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

    return `알림가: ${formatNumber(rule.thresholdPrice)}${stock.currency ? ` ${stock.currency}` : ''}`;
  } catch {
    return '';
  }
}

function formatAlertType(alertType) {
  const labels = {
    [ALERT_TYPES.HIGH_DRAWDOWN]: '최고가 대비 하락률',
    [ALERT_TYPES.PURCHASE_LOSS]: '매수가 대비 손절률',
    [ALERT_TYPES.TARGET_PRICE]: '직접 기준가'
  };

  return labels[alertType] || labels[ALERT_TYPES.HIGH_DRAWDOWN];
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
      '/add 336260 두산퓨얼셀 88779 2026-05-11 high 10',
      '/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5',
      '/add 336260 두산퓨얼셀 88779 2026-05-11 target 93000'
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
      '/edit 336260 loss 5',
      '/edit 336260 target 93000',
      '/edit 336260 cooldown 60',
      '/edit 336260 name 두산퓨얼셀'
    ].join('\n');
  }

  return '/help 로 사용법을 확인하세요.';
}
