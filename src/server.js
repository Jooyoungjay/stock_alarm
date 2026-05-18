import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAdminAuthStatus, isAdminApiPath, isAdminRequestAuthorized } from './adminAuth.js';
import { buildAccessUrls } from './accessUrls.js';
import { createBackup, deleteBackup, listBackups, restoreBackup } from './backups.js';
import { config } from './config.js';
import { buildDividendCalendar } from './dividendCalendar.js';
import { runDividendRefresh } from './dividendRefresh.js';
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
  runManualQuoteCheck
} from './alertEngine.js';
import { fetchHistoricalHighSince, fetchQuote } from './priceProvider.js';
import {
  APP_DISPLAY_NAME,
  APP_NAME,
  buildRuntimeInfo,
  getRuntimeInfoPath,
  removeRuntimeInfo,
  writeRuntimeInfo
} from './runtimeInfo.js';
import { readRoadmap } from './roadmap.js';
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
let lastDailyBriefing = null;
let lastTelegramCommandPoll = null;
let isChecking = false;
let isRefreshingDividends = false;
let isSendingDailyBriefing = false;
let isPollingTelegramCommands = false;
let activePort = config.port;
let server = null;
const startedAt = new Date().toISOString();
let runtimeInfo = null;
let isShuttingDown = false;

createBackup(config.dataDir, {
  reason: 'server-start',
  maxBackups: config.backupRetention
}).catch((error) => {
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

function recordQuoteProviderAttempt(attempt) {
  if (typeof store.recordQuoteProviderAttempt !== 'function') {
    return null;
  }

  return store.recordQuoteProviderAttempt(attempt);
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
      dailyBriefingSnapshot,
      quoteProviderStats,
      dataModelInfo
    ] = await Promise.all([
      getLastDividendRefreshSnapshot(),
      getLastDailyBriefingSnapshot(),
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
      telegramConfigured: isTelegramConfigured(config),
      port: activePort,
      accessUrls: buildAccessUrls({ host: config.host, port: activePort }),
      quoteProviders: config.quoteProviders,
      historicalQuoteProviders: config.historicalQuoteProviders,
      dividendProviders: config.dividendProviders,
      pollIntervalSeconds: config.pollIntervalSeconds,
      dividendRefreshIntervalSeconds: config.dividendRefreshIntervalSeconds,
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: normalizeBriefingTime(config.dailyBriefingTime),
      dailyBriefingCheckIntervalSeconds: config.dailyBriefingCheckIntervalSeconds,
      dailyBriefingWarningDistancePercent: config.dailyBriefingWarningDistancePercent,
      dailyBriefingTopLimit: config.dailyBriefingTopLimit,
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll,
      lastDividendRefresh: dividendRefreshSnapshot,
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
      dailyBriefingSnapshot,
      quoteProviderStats
    ] = await Promise.all([
      store.listStocks(),
      store.listAlerts(30),
      canReadAdminDetails ? getLastDividendRefreshSnapshot() : Promise.resolve(null),
      getLastDailyBriefingSnapshot(),
      canReadAdminDetails ? store.getQuoteProviderStats() : Promise.resolve(null)
    ]);
    const dividendCalendar = buildDividendCalendar(stocks);

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
      dividendRefreshIntervalSeconds: config.dividendRefreshIntervalSeconds,
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: normalizeBriefingTime(config.dailyBriefingTime),
      lastDailyBriefing: dailyBriefingSnapshot,
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll,
      lastDividendRefresh: dividendRefreshSnapshot,
      quoteProviderStats,
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

    if (request.method === 'GET' && segments[2] === 'stocks' && !segments[3]) {
      const [stocks, alerts] = await Promise.all([
        store.listStocks({ deviceId: device.id }),
        store.listAlerts(30, { deviceId: device.id })
      ]);

      sendJson(response, 200, { device, stocks, alerts });
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

        if (body.resetHighPrice || body.purchaseDate !== undefined) {
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

    if (request.method === 'PATCH') {
      const body = await readJsonBody(request);
      let stock = await store.updateStock(id, body);

      if (body.resetHighPrice || body.purchaseDate !== undefined) {
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
    const backups = await listBackups(config.dataDir, {
      limit: Number.isFinite(limit) ? limit : config.backupRetention
    });

    sendJson(response, 200, {
      backups: backups.map(serializeBackup),
      retention: config.backupRetention
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/quote-provider-stats') {
    sendJson(response, 200, {
      quoteProviderStats: await store.getQuoteProviderStats()
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/backups') {
    const backup = await createBackup(config.dataDir, {
      reason: 'manual-web',
      maxBackups: config.backupRetention
    });
    const backups = await listBackups(config.dataDir, { limit: config.backupRetention });

    sendJson(response, 200, {
      backup: serializeBackup(backup),
      backups: backups.map(serializeBackup)
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/backups/restore') {
    const body = await readJsonBody(request);
    const result = await restoreBackup(config.dataDir, body.target || body.name || body.index, {
      maxBackups: config.backupRetention
    });
    const backups = await listBackups(config.dataDir, { limit: config.backupRetention });

    sendJson(response, 200, {
      restored: true,
      backup: serializeBackup(result.backup),
      safetyBackup: serializeBackup(result.safetyBackup),
      backups: backups.map(serializeBackup)
    });
    return;
  }

  if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'backups' && segments[2]) {
    const result = await deleteBackup(config.dataDir, decodeURIComponent(segments[2]));
    const backups = await listBackups(config.dataDir, { limit: config.backupRetention });

    sendJson(response, 200, {
      deleted: true,
      backup: serializeBackup(result.backup),
      backups: backups.map(serializeBackup),
      retention: config.backupRetention
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
      `Daily briefing ${config.dailyBriefingEnabled ? `at ${normalizeBriefingTime(config.dailyBriefingTime)}` : 'disabled'}`
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

runTelegramCommandPollOnce().catch((error) => {
  lastTelegramCommandPoll = {
    checkedAt: new Date().toISOString(),
    error: error.message
  };
  console.error('Initial Telegram command poll failed:', error);
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
  clearInterval(dailyBriefingInterval);
  clearInterval(telegramCommandInterval);

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
