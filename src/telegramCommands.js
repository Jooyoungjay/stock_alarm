import { buildAlertRule, initializeHighFromPurchaseDate, runAlertCheck } from './alertEngine.js';
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
  '/delete <종목코드> - 종목 삭제',
  '',
  '등록 예시',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 high 10',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5',
  '/add 336260 두산퓨얼셀 88779 2026-05-11 target 93000',
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
    case 'delete':
    case 'del':
      return deleteStockFromCommand(store, command.args[0]);
    case 'check':
      return runManualCheck(store, config, options);
    default:
      return `지원하지 않는 명령어입니다: /${command.name}\n\n${helpMessage}`;
  }
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

function normalizeAddInput(input) {
  const alertType = normalizeTypeToken(input.alertType || 'high');

  return {
    symbol: input.symbol,
    displayName: input.displayName || '',
    purchasePrice: input.purchasePrice,
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
    Number.isFinite(currentPrice) ? `현재가: ${formatNumber(currentPrice)}${stock.currency ? ` ${stock.currency}` : ''}` : '',
    formatThresholdLine(stock)
  ];

  return line.filter(Boolean).join('\n');
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

function getShortUsage(commandName) {
  if (commandName === 'add') {
    return [
      '예시:',
      '/add 336260 두산퓨얼셀 88779 2026-05-11 high 10',
      '/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5',
      '/add 336260 두산퓨얼셀 88779 2026-05-11 target 93000'
    ].join('\n');
  }

  return '/help 로 사용법을 확인하세요.';
}
