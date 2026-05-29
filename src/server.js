import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getAdminAuthStatus,
  getAdminTokenFromRequest,
  isAdminApiPath,
  isAdminRequestAuthorized
} from './adminAuth.js';
import { buildAccessUrls } from './accessUrls.js';
import { config } from './config.js';
import { buildDividendCalendar } from './dividendCalendar.js';
import { lastDividendEventAlertMetaKey, runDividendEventAlertCheck } from './dividendEventAlerts.js';
import { runDividendRefresh, runSingleDividendRefresh } from './dividendRefresh.js';
import { formatKisMarketDivCode, normalizeKisMarketDivCode, resolveKisMarketDivCode } from './kisMarket.js';
import { buildKisNaverQuoteComparison } from './kisNaverCompare.js';
import {
  lastKisNaverAutoCompareMetaKey,
  runKisNaverAutoCompare
} from './kisNaverAutoCompare.js';
import {
  applyKisNaverCompareIssueStates,
  readKisNaverCompareIssueStates,
  updateKisNaverCompareIssueState
} from './kisNaverCompareIssues.js';
import { buildKisQuoteSmokeTest } from './kisQuoteSmokeTest.js';
import {
  buildDailyBriefing,
  formatDailyBriefingMessage,
  normalizeBriefingTime,
  runDailyBriefing
} from './portfolioBriefing.js';
import { createQrSvg } from './qrCode.js';
import { createStore } from './storageFactory.js';
import {
  buildMonitoringHighBaseline,
  buildRegistrationPreview,
  initializeHighFromPurchaseDate,
  runAlertCheck,
  runManualQuoteCheck,
  runStockQuoteRetry
} from './alertEngine.js';
import { fetchHistoricalHighSince, fetchQuote } from './priceProvider.js';
import { sendPushNotificationToDevice } from './pushNotifications.js';
import {
  buildKisNaverCompareTrendSnapshot,
  buildKisNaverTrendRecommendation
} from './storage.js';
import {
  APP_DISPLAY_NAME,
  APP_NAME,
  buildRuntimeInfo,
  getRuntimeInfoPath,
  removeRuntimeInfo,
  writeRuntimeInfo
} from './runtimeInfo.js';
import { readRoadmap } from './roadmap.js';
import { readObservationIssues } from './observationIssues.js';
import {
  deleteLocalObservationHistoryFile,
  pruneLocalObservationHistoryFiles,
  readLocalObservationHistoryDetail,
  readLocalObservationHistoryReport,
  runAndSaveLocalObservationHistory
} from './localObservationCheck.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';
import { pollTelegramCommands } from './telegramCommands.js';
import { normalizeSymbolInput, searchSymbols } from './symbols.js';

const store = createStore(config, {
  backups: {
    enabled: true
  }
});

let lastCheck = null;
let lastDividendRefresh = null;
let lastDividendEventAlert = null;
let lastDailyBriefing = null;
let lastTelegramCommandPoll = null;
let lastKisNaverAutoCompare = null;
let lastAutoBackup = null;
let isChecking = false;
let isRefreshingDividends = false;
let isCheckingDividendEvents = false;
let isSendingDailyBriefing = false;
let isPollingTelegramCommands = false;
let isRunningKisNaverAutoCompare = false;
let isRunningAutoBackup = false;
let activePort = config.port;
let server = null;
const startedAt = new Date().toISOString();
let runtimeInfo = null;
let isShuttingDown = false;

store.createBackup('server-start').catch((error) => {
  console.error('Startup backup failed:', error);
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf8');

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, {
    error: message
  });
}

function sendAdminAuthError(response) {
  sendJson(response, 401, {
    error: '관리자 토큰이 필요합니다.',
    adminAuthRequired: true
  });
}

function requireAdminAuth(request, response, url) {
  if (!isAdminApiPath(request.method, url.pathname)) {
    return true;
  }

  if (isAdminRequestAuthorized(request, config)) {
    return true;
  }

  sendAdminAuthError(response);
  return false;
}

function serializeBackup(backup) {
  if (!backup) {
    return null;
  }

  return {
    created: backup.created,
    name: backup.name,
    reason: backup.reason,
    size: backup.size,
    createdAt: backup.createdAt
  };
}

async function authenticateMobileDevice(request) {
  const deviceId = request.headers['x-device-id'];
  const deviceSecret = request.headers['x-device-secret'];

  if (!deviceId || !deviceSecret) {
    throw new Error('기기 인증 정보가 필요합니다.');
  }

  return store.authenticateDevice(deviceId, deviceSecret);
}

async function runCheckOnce() {
  if (isChecking) {
    return {
      checkedAt: new Date().toISOString(),
      results: [],
      skipped: true,
      reason: 'check_already_running'
    };
  }

  isChecking = true;

  try {
    lastCheck = await runAlertCheck(store, config);
    return lastCheck;
  } finally {
    isChecking = false;
  }
}

async function runTelegramCommandPollOnce() {
  if (isPollingTelegramCommands) {
    return {
      checkedAt: new Date().toISOString(),
      skipped: true,
      reason: 'telegram_command_poll_already_running'
    };
  }

  isPollingTelegramCommands = true;

  try {
    lastTelegramCommandPoll = {
      checkedAt: new Date().toISOString(),
      ...(await pollTelegramCommands(store, config))
    };
    return lastTelegramCommandPoll;
  } finally {
    isPollingTelegramCommands = false;
  }
}

async function runDividendRefreshOnce() {
  if (isRefreshingDividends) {
    return {
      checkedAt: new Date().toISOString(),
      results: [],
      skipped: true,
      reason: 'dividend_refresh_already_running'
    };
  }

  isRefreshingDividends = true;

  try {
    lastDividendRefresh = await runDividendRefresh(store, config);
    return lastDividendRefresh;
  } finally {
    isRefreshingDividends = false;
  }
}

async function runDividendEventAlertOnce(options = {}) {
  if (isCheckingDividendEvents) {
    return {
      checkedAt: new Date().toISOString(),
      results: [],
      skipped: true,
      reason: 'dividend_event_alert_already_running'
    };
  }

  isCheckingDividendEvents = true;

  try {
    lastDividendEventAlert = await runDividendEventAlertCheck(store, config, options);
    return lastDividendEventAlert;
  } finally {
    isCheckingDividendEvents = false;
  }
}

async function runDailyBriefingOnce(options = {}) {
  if (isSendingDailyBriefing) {
    return {
      checkedAt: new Date().toISOString(),
      skipped: true,
      reason: 'daily_briefing_already_running'
    };
  }

  isSendingDailyBriefing = true;

  try {
    lastDailyBriefing = await runDailyBriefing(store, config, options);
    return lastDailyBriefing;
  } finally {
    isSendingDailyBriefing = false;
  }
}

async function runKisNaverAutoCompareOnce(options = {}) {
  if (isRunningKisNaverAutoCompare) {
    return {
      checkedAt: new Date().toISOString(),
      results: [],
      skipped: true,
      reason: 'kis_naver_auto_compare_already_running'
    };
  }

  isRunningKisNaverAutoCompare = true;

  try {
    lastKisNaverAutoCompare = await runKisNaverAutoCompare(store, config, {
      ...options,
      compare: (body) => runKisNaverQuoteComparison(body)
    });
    return lastKisNaverAutoCompare;
  } finally {
    isRunningKisNaverAutoCompare = false;
  }
}

async function runAutoBackupOnce(options = {}) {
  const checkedAt = new Date().toISOString();

  if (!config.autoBackupEnabled && !options.force) {
    lastAutoBackup = {
      checkedAt,
      skipped: true,
      reason: 'disabled'
    };
    return lastAutoBackup;
  }

  if (isRunningAutoBackup) {
    return {
      checkedAt,
      skipped: true,
      reason: 'auto_backup_already_running'
    };
  }

  const previous = await store.getMetaValue('lastAutoBackup', null);
  const previousTime = new Date(previous?.createdAt || previous?.checkedAt || 0).getTime();
  const minIntervalMs = Number(config.autoBackupMinIntervalMinutes || 120) * 60 * 1000;

  if (!options.force && Number.isFinite(previousTime) && Date.now() - previousTime < minIntervalMs) {
    lastAutoBackup = {
      checkedAt,
      skipped: true,
      reason: 'min_interval',
      previous
    };
    return lastAutoBackup;
  }

  isRunningAutoBackup = true;

  try {
    const backup = await store.createBackup(options.reason || 'auto-scheduled');
    lastAutoBackup = {
      checkedAt,
      createdAt: backup.createdAt || checkedAt,
      backup: serializeBackup(backup),
      skipped: backup.created === false,
      reason: backup.created === false ? backup.reason : options.reason || 'auto-scheduled'
    };
    await store.setMetaValue('lastAutoBackup', lastAutoBackup);
    return lastAutoBackup;
  } finally {
    isRunningAutoBackup = false;
  }
}

async function getLastAutoBackupSnapshot() {
  if (lastAutoBackup) {
    return lastAutoBackup;
  }

  if (typeof store.getMetaValue !== 'function') {
    return null;
  }

  return store.getMetaValue('lastAutoBackup', null);
}

async function getLastDividendEventAlertSnapshot() {
  if (lastDividendEventAlert) {
    return lastDividendEventAlert;
  }

  if (typeof store.getMetaValue !== 'function') {
    return null;
  }

  return store.getMetaValue(lastDividendEventAlertMetaKey, null);
}

async function getLastDividendRefreshSnapshot() {
  if (lastDividendRefresh) {
    return lastDividendRefresh;
  }

  if (typeof store.getMetaValue !== 'function') {
    return null;
  }

  return store.getMetaValue('lastDividendRefresh', null);
}

async function getLastDailyBriefingSnapshot() {
  if (lastDailyBriefing) {
    return lastDailyBriefing;
  }

  if (typeof store.getMetaValue !== 'function') {
    return null;
  }

  const lastDate = await store.getMetaValue('lastDailyBriefingDate', null);

  return lastDate
    ? {
        dateKey: lastDate,
        deliveryStatus: 'sent'
      }
    : null;
}

async function getLastKisNaverAutoCompareSnapshot() {
  let snapshot = null;

  if (lastKisNaverAutoCompare) {
    snapshot = lastKisNaverAutoCompare.lastKisNaverAutoCompare || lastKisNaverAutoCompare;
  } else if (typeof store.getMetaValue === 'function') {
    snapshot = await store.getMetaValue(lastKisNaverAutoCompareMetaKey, null);
  } else {
    return null;
  }

  return enrichKisNaverAutoCompareSnapshot(snapshot);
}

async function enrichKisNaverAutoCompareSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  const issueStates = await readKisNaverCompareIssueStates(store);
  return applyKisNaverCompareIssueStates(snapshot, issueStates);
}

function recordQuoteProviderAttempt(attempt) {
  if (typeof store.recordQuoteProviderAttempt !== 'function') {
    return null;
  }

  return store.recordQuoteProviderAttempt(attempt);
}

function getStockKisMarketDivCode(stock) {
  return resolveKisMarketDivCode(stock?.kisMarketDivCode, config.kisMarketDivCode || 'J');
}

function getRequestKisMarketDivCode(value) {
  const fallback = resolveKisMarketDivCode('', config.kisMarketDivCode || 'J');
  const text = String(value || '').trim();

  return text ? normalizeKisMarketDivCode(text) : fallback;
}

async function runKisQuoteSmokeTest(body = {}) {
  const forceToken = Boolean(body.forceToken);

  return buildKisQuoteSmokeTest({
    symbol: body.symbol || config.kisSmokeSymbol,
    market: body.market || config.kisMarketDivCode,
    timeoutMs: config.quoteTimeoutMs,
    kisApiBaseUrl: config.kisApiBaseUrl,
    kisAppKey: config.kisAppKey,
    kisAppSecret: config.kisAppSecret,
    kisAccessToken: forceToken ? '' : config.kisAccessToken,
    kisMarketDivCode: config.kisMarketDivCode,
    kisCustType: config.kisCustType,
    kisTokenAutoRefresh: config.kisTokenAutoRefresh,
    kisTokenCachePath: config.kisTokenCachePath,
    forceRefresh: forceToken,
    onProviderAttempt: (attempt) =>
      recordQuoteProviderAttempt({
        ...attempt,
        source: 'kis_smoke_test'
      })
  });
}

async function runKisNaverQuoteComparison(body = {}) {
  return buildKisNaverQuoteComparison({
    symbol: body.symbol || config.kisSmokeSymbol,
    market: body.market || 'all',
    driftThresholdPercent: body.driftThresholdPercent,
    timeoutMs: config.quoteTimeoutMs,
    dataGoKrServiceKey: config.dataGoKrServiceKey,
    alphaVantageApiKey: config.alphaVantageApiKey,
    kisApiBaseUrl: config.kisApiBaseUrl,
    kisAppKey: config.kisAppKey,
    kisAppSecret: config.kisAppSecret,
    kisAccessToken: config.kisAccessToken,
    kisMarketDivCode: config.kisMarketDivCode,
    kisCustType: config.kisCustType,
    kisTokenAutoRefresh: config.kisTokenAutoRefresh,
    kisTokenCachePath: config.kisTokenCachePath,
    onProviderAttempt: (attempt) =>
      recordQuoteProviderAttempt({
        ...attempt,
        source: 'kis_naver_compare'
      })
  });
}

async function recordKisNaverQuoteComparisonResult(result) {
  const kisNaverCompareHistory =
    typeof store.recordKisNaverCompareHistory === 'function'
      ? await store.recordKisNaverCompareHistory(result, { returnLimit: 12 })
      : [];
  const kisNaverCompareTrend = buildKisNaverCompareTrendSnapshot(kisNaverCompareHistory);
  const symbolKisNaverCompareTrend = buildKisNaverCompareTrendSnapshot(
    filterKisNaverCompareHistoryBySymbol(
      kisNaverCompareHistory,
      result.symbol || result.inputSymbol
    )
  );
  const kisNaverTrendRecommendation = buildKisNaverTrendRecommendation(
    symbolKisNaverCompareTrend,
    result.recommendation,
    { scope: 'symbol' }
  );

  return {
    kisNaverCompareHistory,
    kisNaverCompareTrend,
    kisNaverTrendRecommendation
  };
}

function normalizeStockSymbolForCompare(value) {
  const normalized = normalizeSymbolInput(value) || String(value || '').trim().toUpperCase();
  return normalized.replace(/\.(KS|KQ)$/i, '');
}

function findStocksByComparableSymbol(stocks, symbol) {
  const normalized = normalizeStockSymbolForCompare(symbol);

  if (!normalized) {
    return [];
  }

  return stocks.filter((stock) => normalizeStockSymbolForCompare(stock.symbol) === normalized);
}

function filterKisNaverCompareHistoryBySymbol(history = [], symbol) {
  const normalized = normalizeStockSymbolForCompare(symbol);

  if (!normalized) {
    return [];
  }

  return history.filter((item) => {
    const itemSymbol = normalizeStockSymbolForCompare(item.symbol || item.inputSymbol);
    return itemSymbol === normalized;
  });
}

async function applyKisMarketFromComparison(body = {}) {
  const market = normalizeKisMarketDivCode(body.market);

  if (!market) {
    throw new Error('적용할 KIS 시장을 J, NX, UN 중 하나로 입력하세요.');
  }

  const stocks = await store.listStocks();
  const stockId = String(body.stockId || '').trim();
  const comparedSymbol = normalizeStockSymbolForCompare(body.symbol);
  let stock = null;

  if (stockId) {
    stock = stocks.find((item) => item.id === stockId) || null;

    if (!stock) {
      throw new Error('적용할 등록 종목을 찾을 수 없습니다.');
    }

    if (comparedSymbol && normalizeStockSymbolForCompare(stock.symbol) !== comparedSymbol) {
      throw new Error('비교한 종목과 적용 대상 종목이 다릅니다.');
    }
  } else {
    const matches = findStocksByComparableSymbol(stocks, comparedSymbol);

    if (!matches.length) {
      throw new Error('적용할 등록 종목을 찾을 수 없습니다.');
    }

    if (matches.length > 1) {
      throw new Error('같은 종목이 여러 개 등록되어 있습니다. 적용할 종목을 선택하세요.');
    }

    stock = matches[0];
  }

  let updated = await store.updateStock(stock.id, {
    kisMarketDivCode: market,
    resetHighPrice: true
  });
  updated = await initializePurchaseHigh(updated);

  return {
    stock: updated,
    appliedMarket: market,
    appliedMarketLabel: formatKisMarketDivCode(market),
    matchedSymbol: normalizeStockSymbolForCompare(updated.symbol)
  };
}

async function initializePurchaseHigh(stock) {
  try {
    if (stock?.purchaseDate) {
      return await initializeHighFromPurchaseDate(store, config, stock);
    }

    const now = new Date();
    const quote = await fetchQuote(stock.symbol, {
      timeoutMs: config.quoteTimeoutMs,
      providers: config.quoteProviders,
      dataGoKrServiceKey: config.dataGoKrServiceKey,
      alphaVantageApiKey: config.alphaVantageApiKey,
      nxtQuoteEndpointTemplate: config.nxtQuoteEndpointTemplate,
      nxtApiKey: config.nxtApiKey,
      nxtApiKeyHeader: config.nxtApiKeyHeader,
      nxtApiKeyScheme: config.nxtApiKeyScheme,
      kisApiBaseUrl: config.kisApiBaseUrl,
      kisAppKey: config.kisAppKey,
      kisAppSecret: config.kisAppSecret,
      kisAccessToken: config.kisAccessToken,
      kisMarketDivCode: getStockKisMarketDivCode(stock),
      kisCustType: config.kisCustType,
      kisTokenAutoRefresh: config.kisTokenAutoRefresh,
      kisTokenCachePath: config.kisTokenCachePath,
      onProviderAttempt: (attempt) =>
        recordQuoteProviderAttempt({
          ...attempt,
          stockId: stock.id,
          source: 'initial_monitoring_high'
        })
    });
    const baselineHigh = buildMonitoringHighBaseline(stock, quote, now);
    const timestamp = now.toISOString();

    return await store.replaceStock({
      ...stock,
      lastPrice: quote.price,
      lastCheckedAt: timestamp,
      currency: quote.currency || stock.currency || '',
      exchange: quote.exchange || stock.exchange || '',
      marketState: quote.marketState || stock.marketState || '',
      quoteProvider: quote.provider || stock.quoteProvider || '',
      quoteProviderLabel: quote.providerLabel || stock.quoteProviderLabel || '',
      quoteDataDelay: quote.dataDelay || stock.quoteDataDelay || '',
      quoteVenue: quote.venue || stock.quoteVenue || '',
      quoteLicenseType: quote.licenseType || stock.quoteLicenseType || '',
      quoteSourceNote: quote.sourceNote || stock.quoteSourceNote || '',
      quoteRegularMarketTime: quote.regularMarketTime || stock.quoteRegularMarketTime || null,
      highPrice: baselineHigh.highPrice,
      highPriceAt: baselineHigh.highPriceAt,
      highPriceSource: baselineHigh.source,
      highPriceProvider: baselineHigh.provider || stock.highPriceProvider || '',
      highPriceProviderLabel: baselineHigh.providerLabel || stock.highPriceProviderLabel || '',
      highPriceDataDelay: baselineHigh.dataDelay || stock.highPriceDataDelay || '',
      highPriceVenue: baselineHigh.venue || stock.highPriceVenue || '',
      highPriceSourceNote: baselineHigh.sourceNote || stock.highPriceSourceNote || '',
      lastCheckStatus: 'high_initialized',
      lastError: '',
      lastErrorAt: null,
      updatedAt: timestamp
    });
  } catch (error) {
    const timestamp = new Date().toISOString();
    const message = stock.purchaseDate
      ? `구매일 이후 최고가 계산 실패: ${error.message}`
      : `감시 최고가 초기화 실패: ${error.message}`;
    const updated = await store.replaceStock({
      ...stock,
      lastCheckStatus: 'error',
      lastError: message,
      lastErrorAt: timestamp,
      updatedAt: timestamp
    });

    return updated || stock;
  }
}

async function handleApi(request, response, url) {
  const segments = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && url.pathname === '/api/admin/session') {
    sendJson(response, 200, {
      adminAuth: getAdminAuthStatus(request, config)
    });
    return;
  }

  if (!requireAdminAuth(request, response, url)) {
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    const [
      dividendRefreshSnapshot,
      dividendEventAlertSnapshot,
      dailyBriefingSnapshot,
      kisNaverAutoCompareSnapshot,
      autoBackupSnapshot,
      quoteProviderStats,
      dataModelInfo
    ] = await Promise.all([
      getLastDividendRefreshSnapshot(),
      getLastDividendEventAlertSnapshot(),
      getLastDailyBriefingSnapshot(),
      getLastKisNaverAutoCompareSnapshot(),
      getLastAutoBackupSnapshot(),
      store.getQuoteProviderStats(),
      store.getDataModelInfo()
    ]);

    sendJson(response, 200, {
      ok: true,
      appName: APP_NAME,
      appDisplayName: APP_DISPLAY_NAME,
      pid: process.pid,
      cwd: process.cwd(),
      rootDir: config.rootDir,
      dataDir: config.dataDir,
      storageEngine: store.engine || config.storageEngine,
      host: config.host,
      railwayRuntime: config.isRailwayRuntime,
      startedAt,
      runtimeFile: getRuntimeInfoPath(config.dataDir),
      runtimeVerified: Boolean(runtimeInfo && runtimeInfo.pid === process.pid),
      safeStop: {
        command: 'node scripts\\stop-server.js',
        policy: 'runtime_file_and_health_match_required',
        message: 'server.json과 /api/health가 같은 Stock Alarm PID일 때만 종료합니다.'
      },
      telegramConfigured: isTelegramConfigured(config),
      port: activePort,
      accessUrls: buildAccessUrls({ host: config.host, port: activePort }),
      quoteProviders: config.quoteProviders,
      historicalQuoteProviders: config.historicalQuoteProviders,
      dividendProviders: config.dividendProviders,
      pollIntervalSeconds: config.pollIntervalSeconds,
      kisNaverAutoCompareEnabled: config.kisNaverAutoCompareEnabled,
      kisNaverAutoCompareIntervalSeconds: config.kisNaverAutoCompareIntervalSeconds,
      kisNaverAutoCompareLimit: config.kisNaverAutoCompareLimit,
      kisNaverAutoCompareMarkets: config.kisNaverAutoCompareMarkets,
      kisNaverAutoCompareDriftThresholdPercent:
        config.kisNaverAutoCompareDriftThresholdPercent,
      kisNaverAutoCompareAlertEnabled: config.kisNaverAutoCompareAlertEnabled,
      kisNaverAutoCompareAlertCooldownMinutes:
        config.kisNaverAutoCompareAlertCooldownMinutes,
      dividendRefreshIntervalSeconds: config.dividendRefreshIntervalSeconds,
      dividendEventAlertEnabled: config.dividendEventAlertEnabled,
      dividendEventAlertCheckIntervalSeconds: config.dividendEventAlertCheckIntervalSeconds,
      dividendEventAlertExDateOffsets: config.dividendEventAlertExDateOffsets,
      dividendEventAlertPaymentDateOffsets: config.dividendEventAlertPaymentDateOffsets,
      autoBackupEnabled: config.autoBackupEnabled,
      autoBackupIntervalHours: config.autoBackupIntervalHours,
      autoBackupMinIntervalMinutes: config.autoBackupMinIntervalMinutes,
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: normalizeBriefingTime(config.dailyBriefingTime),
      dailyBriefingCheckIntervalSeconds: config.dailyBriefingCheckIntervalSeconds,
      dailyBriefingWarningDistancePercent: config.dailyBriefingWarningDistancePercent,
      dailyBriefingTopLimit: config.dailyBriefingTopLimit,
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll,
      lastKisNaverAutoCompare: kisNaverAutoCompareSnapshot,
      lastDividendRefresh: dividendRefreshSnapshot,
      lastDividendEventAlert: dividendEventAlertSnapshot,
      lastAutoBackup: autoBackupSnapshot,
      lastDailyBriefing: dailyBriefingSnapshot,
      quoteProviderStats,
      dataSchemaVersion: dataModelInfo.schemaVersion,
      dataModel: {
        schemaVersion: dataModelInfo.schemaVersion,
        storageEngine: dataModelInfo.storageEngine,
        summary: dataModelInfo.summary,
        store: dataModelInfo.store
      },
      lastCheck
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/data-model') {
    sendJson(response, 200, {
      dataModel: await store.getDataModelInfo()
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/stocks') {
    const canReadAdminDetails = isAdminRequestAuthorized(request, config);
    const [
      stocks,
      alerts,
      dividendRefreshSnapshot,
      dividendEventAlertSnapshot,
      dailyBriefingSnapshot,
      kisNaverAutoCompareSnapshot,
      quoteProviderStats,
      kisNaverCompareHistory
    ] = await Promise.all([
      store.listStocks(),
      store.listAlerts(30),
      canReadAdminDetails ? getLastDividendRefreshSnapshot() : Promise.resolve(null),
      canReadAdminDetails ? getLastDividendEventAlertSnapshot() : Promise.resolve(null),
      getLastDailyBriefingSnapshot(),
      canReadAdminDetails ? getLastKisNaverAutoCompareSnapshot() : Promise.resolve(null),
      canReadAdminDetails ? store.getQuoteProviderStats() : Promise.resolve(null),
      canReadAdminDetails && typeof store.getKisNaverCompareHistory === 'function'
        ? store.getKisNaverCompareHistory(12)
        : Promise.resolve([])
    ]);
    const dividendCalendar = buildDividendCalendar(stocks);
    const kisNaverCompareTrend = buildKisNaverCompareTrendSnapshot(kisNaverCompareHistory);
    const kisNaverTrendRecommendation =
      kisNaverCompareTrend.recommendation || buildKisNaverTrendRecommendation(kisNaverCompareTrend);

    sendJson(response, 200, {
      stocks,
      alerts,
      dividendCalendar,
      briefing: buildDailyBriefing(stocks, {
        warningDistancePercent: config.dailyBriefingWarningDistancePercent,
        topLimit: config.dailyBriefingTopLimit
      }),
      telegramConfigured: isTelegramConfigured(config),
      quoteProviders: config.quoteProviders,
      historicalQuoteProviders: config.historicalQuoteProviders,
      dividendProviders: config.dividendProviders,
      pollIntervalSeconds: config.pollIntervalSeconds,
      kisNaverAutoCompareEnabled: config.kisNaverAutoCompareEnabled,
      kisNaverAutoCompareIntervalSeconds: config.kisNaverAutoCompareIntervalSeconds,
      kisNaverAutoCompareLimit: config.kisNaverAutoCompareLimit,
      kisNaverAutoCompareMarkets: config.kisNaverAutoCompareMarkets,
      kisNaverAutoCompareDriftThresholdPercent:
        config.kisNaverAutoCompareDriftThresholdPercent,
      kisNaverAutoCompareAlertEnabled: config.kisNaverAutoCompareAlertEnabled,
      kisNaverAutoCompareAlertCooldownMinutes:
        config.kisNaverAutoCompareAlertCooldownMinutes,
      dividendRefreshIntervalSeconds: config.dividendRefreshIntervalSeconds,
      dividendEventAlertEnabled: config.dividendEventAlertEnabled,
      dividendEventAlertCheckIntervalSeconds: config.dividendEventAlertCheckIntervalSeconds,
      dividendEventAlertExDateOffsets: config.dividendEventAlertExDateOffsets,
      dividendEventAlertPaymentDateOffsets: config.dividendEventAlertPaymentDateOffsets,
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: normalizeBriefingTime(config.dailyBriefingTime),
      lastDailyBriefing: dailyBriefingSnapshot,
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll,
      lastKisNaverAutoCompare: kisNaverAutoCompareSnapshot,
      lastDividendRefresh: dividendRefreshSnapshot,
      lastDividendEventAlert: dividendEventAlertSnapshot,
      quoteProviderStats,
      kisNaverCompareHistory,
      kisNaverCompareTrend,
      kisNaverTrendRecommendation,
      lastCheck
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/dividend-calendar') {
    const stocks = await store.listStocks();
    sendJson(response, 200, {
      dividendCalendar: buildDividendCalendar(stocks)
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/roadmap') {
    sendJson(response, 200, {
      roadmap: await readRoadmap(config.rootDir)
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/observation-issues') {
    sendJson(response, 200, {
      observationIssues: await readObservationIssues(config.rootDir)
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/observation-history') {
    const limit = Number(url.searchParams.get('limit') || 8);

    sendJson(response, 200, {
      observationHistory: await readLocalObservationHistoryReport({
        rootDir: config.rootDir,
        dataDir: config.dataDir,
        limit: Number.isFinite(limit) ? limit : 8
      })
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/observation-history/run') {
    const body = await readJsonBody(request);
    const accessUrls = buildAccessUrls({ host: config.host, port: activePort });
    const result = await runAndSaveLocalObservationHistory({
      rootDir: config.rootDir,
      dataDir: config.dataDir,
      baseUrl: accessUrls.local || `http://127.0.0.1:${activePort}`,
      adminToken: getAdminTokenFromRequest(request) || config.adminToken,
      timeoutMs: body.timeoutMs,
      liveSession: body.liveSession !== false,
      liveMaxAgeMinutes: body.liveMaxAgeMinutes,
      liveDividendMaxAgeHours: body.liveDividendMaxAgeHours,
      runStateCheck: Boolean(body.runStateCheck),
      historyLimit: body.historyLimit,
      reportLimit: body.reportLimit || 8
    });

    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/observation-history/prune') {
    const body = await readJsonBody(request);

    sendJson(response, 200, await pruneLocalObservationHistoryFiles({
      rootDir: config.rootDir,
      dataDir: config.dataDir,
      keepLatest: body.keepLatest,
      reportLimit: body.reportLimit || 8
    }));
    return;
  }

  if (
    request.method === 'GET' &&
    segments[0] === 'api' &&
    segments[1] === 'observation-history' &&
    segments[2] &&
    segments.length === 3
  ) {
    sendJson(response, 200, {
      observationHistoryDetail: await readLocalObservationHistoryDetail({
        rootDir: config.rootDir,
        dataDir: config.dataDir,
        fileName: decodeURIComponent(segments[2])
      })
    });
    return;
  }

  if (
    request.method === 'DELETE' &&
    segments[0] === 'api' &&
    segments[1] === 'observation-history' &&
    segments[2] &&
    segments.length === 3
  ) {
    sendJson(response, 200, await deleteLocalObservationHistoryFile({
      rootDir: config.rootDir,
      dataDir: config.dataDir,
      fileName: decodeURIComponent(segments[2]),
      reportLimit: Number(url.searchParams.get('reportLimit') || 8)
    }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/symbol-search') {
    const query = url.searchParams.get('q');
    sendJson(response, 200, { results: searchSymbols(query) });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/qr.svg') {
    const text = String(url.searchParams.get('text') || '').trim();

    if (!text) {
      sendError(response, 400, 'QR 코드로 만들 주소가 필요합니다.');
      return;
    }

    response.writeHead(200, {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(createQrSvg(text));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/mobile/ping') {
    sendJson(response, 200, {
      ok: true,
      appName: APP_NAME,
      appDisplayName: APP_DISPLAY_NAME,
      pid: process.pid,
      host: config.host,
      port: activePort,
      startedAt,
      serverTime: new Date().toISOString(),
      mobileApi: true
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/devices') {
    const body = await readJsonBody(request);
    const result = await store.createDevice(body);

    sendJson(response, 201, result);
    return;
  }

  if (segments[0] === 'api' && segments[1] === 'mobile') {
    const device = await authenticateMobileDevice(request);

    if (request.method === 'GET' && segments[2] === 'me') {
      sendJson(response, 200, { device });
      return;
    }

    if (request.method === 'POST' && segments[2] === 'push-token') {
      const body = await readJsonBody(request);
      const updatedDevice = await store.upsertDevicePushToken(device.id, body);

      sendJson(response, 200, { device: updatedDevice });
      return;
    }

    if (request.method === 'POST' && segments[2] === 'push-test') {
      const result = await sendPushNotificationToDevice(store, config, device.id, {
        title: 'Stock Alarm 테스트',
        body: `서버 시간이 ${new Date().toLocaleString('ko-KR')}로 확인되었습니다.`,
        data: {
          type: 'push-test',
          createdAt: new Date().toISOString()
        }
      });

      sendJson(response, 200, {
        ok: result.deliveryStatus === 'sent' || result.deliveryStatus === 'partial',
        ...result
      });
      return;
    }

    if (request.method === 'GET' && segments[2] === 'stocks' && !segments[3]) {
      const [stocks, alerts] = await Promise.all([
        store.listStocks({ deviceId: device.id }),
        store.listAlerts(30, { deviceId: device.id })
      ]);
      const dividendCalendar = buildDividendCalendar(stocks);

      sendJson(response, 200, { device, stocks, alerts, dividendCalendar });
      return;
    }

    if (request.method === 'POST' && segments[2] === 'stocks' && !segments[3]) {
      const body = await readJsonBody(request);
      let stock = await store.addStock({
        ...body,
        deviceId: device.id
      });
      stock = await initializePurchaseHigh(stock);

      sendJson(response, 201, { stock });
      return;
    }

    if (segments[2] === 'stocks' && segments[3]) {
      const id = segments[3];

      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        let stock = await store.updateStock(id, body, { deviceId: device.id });

        if (body.resetHighPrice || body.purchaseDate !== undefined || body.kisMarketDivCode !== undefined) {
          stock = await initializePurchaseHigh(stock);
        }

        sendJson(response, 200, { stock });
        return;
      }

      if (request.method === 'DELETE') {
        await store.deleteStock(id, { deviceId: device.id });
        sendJson(response, 200, { ok: true });
        return;
      }
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/quote-preview') {
    const symbol = normalizeSymbolInput(url.searchParams.get('symbol'));

    if (!symbol) {
      sendError(response, 400, '종목 코드를 입력하세요.');
      return;
    }

    const quoteOptions = {
      timeoutMs: config.quoteTimeoutMs,
      providers: config.quoteProviders,
      dataGoKrServiceKey: config.dataGoKrServiceKey,
      alphaVantageApiKey: config.alphaVantageApiKey,
      nxtQuoteEndpointTemplate: config.nxtQuoteEndpointTemplate,
      nxtApiKey: config.nxtApiKey,
      nxtApiKeyHeader: config.nxtApiKeyHeader,
      nxtApiKeyScheme: config.nxtApiKeyScheme,
      kisApiBaseUrl: config.kisApiBaseUrl,
      kisAppKey: config.kisAppKey,
      kisAppSecret: config.kisAppSecret,
      kisAccessToken: config.kisAccessToken,
      kisMarketDivCode: getRequestKisMarketDivCode(url.searchParams.get('kisMarketDivCode')),
      kisCustType: config.kisCustType,
      kisTokenAutoRefresh: config.kisTokenAutoRefresh,
      kisTokenCachePath: config.kisTokenCachePath,
      onProviderAttempt: (attempt) =>
        recordQuoteProviderAttempt({
          ...attempt,
          source: 'quote_preview'
        })
    };
    const quote = await fetchQuote(symbol, quoteOptions);
    const purchaseDate = String(url.searchParams.get('purchaseDate') || '').trim();
    let historicalHigh = null;

    if (purchaseDate) {
      historicalHigh = await fetchHistoricalHighSince(symbol, purchaseDate, {
        ...quoteOptions,
        providers: config.historicalQuoteProviders || config.quoteProviders,
        endDate: new Date()
      });
    }

    sendJson(
      response,
      200,
      buildRegistrationPreview(
        {
          purchasePrice: url.searchParams.get('purchasePrice'),
          quantity: url.searchParams.get('quantity'),
          annualDividendPerShare: url.searchParams.get('annualDividendPerShare'),
          dividendFrequency: url.searchParams.get('dividendFrequency'),
          dividendMonths: url.searchParams.get('dividendMonths'),
          purchaseDate,
          alertType: url.searchParams.get('alertType'),
          thresholdPercent: url.searchParams.get('thresholdPercent'),
          targetPrice: url.searchParams.get('targetPrice')
        },
        quote,
        historicalHigh
      )
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/stocks') {
    const body = await readJsonBody(request);
    let stock = await store.addStock(body);
    stock = await initializePurchaseHigh(stock);
    sendJson(response, 201, { stock });
    return;
  }

  if (segments[0] === 'api' && segments[1] === 'stocks' && segments[2]) {
    const id = segments[2];

    if (request.method === 'POST' && segments[3] === 'test-quote') {
      const body = await readJsonBody(request);
      const result = await runManualQuoteCheck(store, config, id, body);
      lastCheck = result;
      sendJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && segments[3] === 'retry-quote') {
      const result = await runStockQuoteRetry(store, config, id);
      lastCheck = result;
      sendJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && segments[3] === 'retry-dividend') {
      const result = await runSingleDividendRefresh(store, config, id);
      lastDividendRefresh = result;
      sendJson(response, 200, result);
      return;
    }

    if (request.method === 'PATCH') {
      const body = await readJsonBody(request);
      let stock = await store.updateStock(id, body);

      if (body.resetHighPrice || body.purchaseDate !== undefined || body.kisMarketDivCode !== undefined) {
        stock = await initializePurchaseHigh(stock);
      }

      sendJson(response, 200, { stock });
      return;
    }

    if (request.method === 'DELETE') {
      await store.deleteStock(id);
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/alerts') {
    const limit = Number(url.searchParams.get('limit') || 50);
    const alerts = await store.listAlerts(Number.isFinite(limit) ? limit : 50);
    sendJson(response, 200, { alerts });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/backups') {
    const limit = Number(url.searchParams.get('limit') || config.backupRetention);
    const backups = await store.listBackups({
      limit: Number.isFinite(limit) ? limit : config.backupRetention
    });

    sendJson(response, 200, {
      backups: backups.map(serializeBackup),
      retention: config.backupRetention,
      autoBackup: {
        enabled: config.autoBackupEnabled,
        intervalHours: config.autoBackupIntervalHours,
        minIntervalMinutes: config.autoBackupMinIntervalMinutes,
        last: await getLastAutoBackupSnapshot()
      }
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/quote-provider-stats') {
    sendJson(response, 200, {
      quoteProviderStats: await store.getQuoteProviderStats()
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/kis/quote-smoke-test') {
    const body = await readJsonBody(request);
    const result = await runKisQuoteSmokeTest(body);
    const quoteProviderStats = await store.getQuoteProviderStats();

    sendJson(response, 200, {
      kisQuoteSmokeTest: result,
      quoteProviderStats
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/kis/naver-compare') {
    const body = await readJsonBody(request);
    const result = await runKisNaverQuoteComparison(body);
    const {
      kisNaverCompareHistory,
      kisNaverCompareTrend,
      kisNaverTrendRecommendation
    } = await recordKisNaverQuoteComparisonResult(result);
    const quoteProviderStats = await store.getQuoteProviderStats();

    sendJson(response, 200, {
      kisNaverQuoteComparison: {
        ...result,
        trendRecommendation: kisNaverTrendRecommendation
      },
      kisNaverCompareHistory,
      kisNaverCompareTrend,
      kisNaverTrendRecommendation,
      quoteProviderStats
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/kis/naver-compare/auto-run') {
    const result = await runKisNaverAutoCompareOnce({ force: true });
    const quoteProviderStats = await store.getQuoteProviderStats();
    const lastKisNaverAutoCompareSnapshot = await enrichKisNaverAutoCompareSnapshot(
      result.lastKisNaverAutoCompare || result
    );

    sendJson(response, 200, {
      kisNaverAutoCompare: result,
      lastKisNaverAutoCompare: lastKisNaverAutoCompareSnapshot,
      kisNaverCompareHistory: result.kisNaverCompareHistory || [],
      kisNaverCompareTrend: result.kisNaverCompareTrend || buildKisNaverCompareTrendSnapshot([]),
      kisNaverTrendRecommendation:
        result.kisNaverTrendRecommendation ||
        result.kisNaverCompareTrend?.recommendation ||
        buildKisNaverTrendRecommendation({}),
      quoteProviderStats
    });
    return;
  }

  if (request.method === 'PATCH' && url.pathname === '/api/kis/naver-compare/issues') {
    const body = await readJsonBody(request);
    const result = await updateKisNaverCompareIssueState(store, body);
    const lastKisNaverAutoCompareSnapshot = await getLastKisNaverAutoCompareSnapshot();

    sendJson(response, 200, {
      ...result,
      lastKisNaverAutoCompare: lastKisNaverAutoCompareSnapshot
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/kis/naver-compare/apply') {
    const body = await readJsonBody(request);
    const result = await applyKisMarketFromComparison(body);

    sendJson(response, 200, {
      applied: true,
      ...result
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/backups') {
    const backup = await store.createBackup('manual-web');
    const backups = await store.listBackups({ limit: config.backupRetention });

    sendJson(response, 200, {
      backup: serializeBackup(backup),
      backups: backups.map(serializeBackup),
      autoBackup: {
        enabled: config.autoBackupEnabled,
        intervalHours: config.autoBackupIntervalHours,
        minIntervalMinutes: config.autoBackupMinIntervalMinutes,
        last: await getLastAutoBackupSnapshot()
      }
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/backups/auto-run') {
    const result = await runAutoBackupOnce({ force: true, reason: 'auto-manual-web' });
    const backups = await store.listBackups({ limit: config.backupRetention });

    sendJson(response, 200, {
      autoBackup: {
        enabled: config.autoBackupEnabled,
        intervalHours: config.autoBackupIntervalHours,
        minIntervalMinutes: config.autoBackupMinIntervalMinutes,
        last: result
      },
      backups: backups.map(serializeBackup),
      retention: config.backupRetention
    });
    return;
  }

  if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'backups' && segments[2] === 'preview') {
    const preview = await store.previewBackup(url.searchParams.get('target'));
    sendJson(response, 200, {
      preview: {
        ...preview,
        backup: serializeBackup(preview.backup)
      }
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/backups/restore') {
    const body = await readJsonBody(request);
    const result = await store.restoreBackup(body.target || body.name || body.index, {
      maxBackups: config.backupRetention
    });
    const backups = await store.listBackups({ limit: config.backupRetention });

    sendJson(response, 200, {
      restored: true,
      backup: serializeBackup(result.backup),
      safetyBackup: serializeBackup(result.safetyBackup),
      backups: backups.map(serializeBackup),
      autoBackup: {
        enabled: config.autoBackupEnabled,
        intervalHours: config.autoBackupIntervalHours,
        minIntervalMinutes: config.autoBackupMinIntervalMinutes,
        last: await getLastAutoBackupSnapshot()
      }
    });
    return;
  }

  if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'backups' && segments[2]) {
    const result = await store.deleteBackup(decodeURIComponent(segments[2]));
    const backups = await store.listBackups({ limit: config.backupRetention });

    sendJson(response, 200, {
      deleted: true,
      backup: serializeBackup(result.backup),
      backups: backups.map(serializeBackup),
      retention: config.backupRetention,
      autoBackup: {
        enabled: config.autoBackupEnabled,
        intervalHours: config.autoBackupIntervalHours,
        minIntervalMinutes: config.autoBackupMinIntervalMinutes,
        last: await getLastAutoBackupSnapshot()
      }
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/check-now') {
    const result = await runCheckOnce();
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/dividends/refresh') {
    const result = await runDividendRefreshOnce();
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/dividend-alerts/check') {
    const result = await runDividendEventAlertOnce({ force: true });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/briefing') {
    const stocks = await store.listStocks();
    const briefing = buildDailyBriefing(stocks, {
      warningDistancePercent: config.dailyBriefingWarningDistancePercent,
      topLimit: config.dailyBriefingTopLimit
    });

    sendJson(response, 200, {
      briefing,
      message: formatDailyBriefingMessage(briefing),
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: normalizeBriefingTime(config.dailyBriefingTime),
      lastDailyBriefing: await getLastDailyBriefingSnapshot()
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/briefing/send') {
    const result = await runDailyBriefingOnce({ force: true });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/telegram/test') {
    await sendTelegramMessage(
      config,
      `[Stock Alarm] 테스트 알림\n서버 시간이 ${new Date().toLocaleString('ko-KR')}로 확인되었습니다.`
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  sendError(response, 404, 'API를 찾을 수 없습니다.');
}

function resolveStaticRequestPath(pathname) {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';

  if (normalizedPathname === '/' || normalizedPathname === '/app' || normalizedPathname === '/admin') {
    return '/index.html';
  }

  return pathname;
}

async function serveStatic(request, response, url) {
  const requestedPath = resolveStaticRequestPath(url.pathname);
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(config.publicDir, safePath);
  const relative = path.relative(config.publicDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    sendError(response, 403, '접근할 수 없는 경로입니다.');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);

    response.writeHead(200, {
      'content-type': mimeTypes[extension] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendError(response, 404, '페이지를 찾을 수 없습니다.');
      return;
    }

    throw error;
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url);
        return;
      }

      await serveStatic(request, response, url);
    } catch (error) {
      sendError(response, 400, error.message || '요청 처리 중 오류가 발생했습니다.');
    }
  });
}

function listen(port, remainingAttempts = 20) {
  const candidate = createServer();
  const handleError = (error) => {
    if ((error.code === 'EADDRINUSE' || error.code === 'EACCES') && remainingAttempts > 0) {
      candidate.close();
      listen(port + 1, remainingAttempts - 1);
      return;
    }

    throw error;
  };

  candidate.once('error', handleError);
  candidate.listen(port, config.host, () => {
    candidate.off('error', handleError);
    server = candidate;
    activePort = port;
    runtimeInfo = buildRuntimeInfo(config, port, startedAt);
    writeRuntimeInfo(config.dataDir, runtimeInfo).catch((error) => {
      console.error('Runtime info write failed:', error);
    });
    console.log(`Stock Alarm is running at http://${config.host}:${port}`);
    console.log(`Runtime info: ${getRuntimeInfoPath(config.dataDir)}`);
    console.log(`Polling every ${config.pollIntervalSeconds} seconds`);
    console.log(`Refreshing dividends every ${config.dividendRefreshIntervalSeconds} seconds`);
    console.log(
      `Dividend event alerts ${config.dividendEventAlertEnabled ? `every ${config.dividendEventAlertCheckIntervalSeconds} seconds` : 'disabled'}`
    );
    console.log(
      `Daily briefing ${config.dailyBriefingEnabled ? `at ${normalizeBriefingTime(config.dailyBriefingTime)}` : 'disabled'}`
    );
    console.log(
      `KIS/Naver auto compare ${config.kisNaverAutoCompareEnabled ? `every ${config.kisNaverAutoCompareIntervalSeconds} seconds` : 'disabled'}`
    );
    console.log(
      `Auto backup ${config.autoBackupEnabled ? `every ${config.autoBackupIntervalHours} hours` : 'disabled'}`
    );
  });
}

listen(config.port);

const interval = setInterval(() => {
  runCheckOnce().catch((error) => {
    console.error('Scheduled alert check failed:', error);
  });
}, config.pollIntervalSeconds * 1000);

const dividendRefreshInterval = setInterval(() => {
  runDividendRefreshOnce().catch((error) => {
    lastDividendRefresh = {
      checkedAt: new Date().toISOString(),
      error: error.message
    };
    console.error('Scheduled dividend refresh failed:', error);
  });
}, config.dividendRefreshIntervalSeconds * 1000);

const dividendEventAlertInterval = setInterval(() => {
  runDividendEventAlertOnce().catch((error) => {
    lastDividendEventAlert = {
      checkedAt: new Date().toISOString(),
      error: error.message
    };
    console.error('Scheduled dividend event alert check failed:', error);
  });
}, config.dividendEventAlertCheckIntervalSeconds * 1000);

const dailyBriefingInterval = setInterval(() => {
  runDailyBriefingOnce().catch((error) => {
    lastDailyBriefing = {
      checkedAt: new Date().toISOString(),
      error: error.message
    };
    console.error('Daily briefing failed:', error);
  });
}, config.dailyBriefingCheckIntervalSeconds * 1000);

const telegramCommandInterval = setInterval(() => {
  runTelegramCommandPollOnce().catch((error) => {
    lastTelegramCommandPoll = {
      checkedAt: new Date().toISOString(),
      error: error.message
    };
    console.error('Telegram command poll failed:', error);
  });
}, config.telegramCommandPollSeconds * 1000);

const kisNaverAutoCompareInterval = config.kisNaverAutoCompareEnabled
  ? setInterval(() => {
      runKisNaverAutoCompareOnce().catch((error) => {
        lastKisNaverAutoCompare = {
          checkedAt: new Date().toISOString(),
          error: error.message
        };
        console.error('Scheduled KIS/Naver auto compare failed:', error);
      });
    }, config.kisNaverAutoCompareIntervalSeconds * 1000)
  : null;

const autoBackupInterval = config.autoBackupEnabled
  ? setInterval(() => {
      runAutoBackupOnce().catch((error) => {
        lastAutoBackup = {
          checkedAt: new Date().toISOString(),
          error: error.message
        };
        console.error('Scheduled auto backup failed:', error);
      });
    }, config.autoBackupIntervalHours * 60 * 60 * 1000)
  : null;

runTelegramCommandPollOnce().catch((error) => {
  lastTelegramCommandPoll = {
    checkedAt: new Date().toISOString(),
    error: error.message
  };
  console.error('Initial Telegram command poll failed:', error);
});

runDividendEventAlertOnce().catch((error) => {
  lastDividendEventAlert = {
    checkedAt: new Date().toISOString(),
    error: error.message
  };
  console.error('Initial dividend event alert check failed:', error);
});

runAutoBackupOnce({ reason: 'auto-startup' }).catch((error) => {
  lastAutoBackup = {
    checkedAt: new Date().toISOString(),
    error: error.message
  };
  console.error('Initial auto backup failed:', error);
});

async function closeServer() {
  if (!server) {
    return;
  }

  await new Promise((resolve) => {
    server.close(resolve);
  });
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearInterval(interval);
  clearInterval(dividendRefreshInterval);
  clearInterval(dividendEventAlertInterval);
  clearInterval(dailyBriefingInterval);
  clearInterval(telegramCommandInterval);
  if (kisNaverAutoCompareInterval) {
    clearInterval(kisNaverAutoCompareInterval);
  }
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
  }

  try {
    await closeServer();
    if (runtimeInfo) {
      await removeRuntimeInfo(config.dataDir, {
        pid: process.pid,
        startedAt: runtimeInfo.startedAt
      });
    }
  } catch (error) {
    console.error('Shutdown cleanup failed:', error);
  }

  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown();
});

process.on('SIGTERM', () => {
  shutdown();
});
