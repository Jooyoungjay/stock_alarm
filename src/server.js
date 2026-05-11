import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createBackup } from './backups.js';
import { config } from './config.js';
import { JsonStore } from './storage.js';
import {
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
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';
import { pollTelegramCommands } from './telegramCommands.js';
import { normalizeSymbolInput, searchSymbols } from './symbols.js';

const store = new JsonStore(config.dataDir, {
  defaultAlertCooldownMinutes: config.defaultAlertCooldownMinutes,
  backups: {
    enabled: true,
    maxBackups: config.backupRetention
  }
});

let lastCheck = null;
let lastTelegramCommandPoll = null;
let isChecking = false;
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

async function initializePurchaseHigh(stock) {
  if (!stock?.purchaseDate) {
    return stock;
  }

  try {
    return await initializeHighFromPurchaseDate(store, config, stock);
  } catch (error) {
    const timestamp = new Date().toISOString();
    const updated = await store.replaceStock({
      ...stock,
      lastCheckStatus: 'error',
      lastError: `구매일 이후 최고가 계산 실패: ${error.message}`,
      lastErrorAt: timestamp,
      updatedAt: timestamp
    });

    return updated || stock;
  }
}

async function handleApi(request, response, url) {
  const segments = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      appName: APP_NAME,
      appDisplayName: APP_DISPLAY_NAME,
      pid: process.pid,
      cwd: process.cwd(),
      rootDir: config.rootDir,
      dataDir: config.dataDir,
      startedAt,
      runtimeFile: getRuntimeInfoPath(config.dataDir),
      telegramConfigured: isTelegramConfigured(config),
      port: activePort,
      quoteProviders: config.quoteProviders,
      pollIntervalSeconds: config.pollIntervalSeconds,
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll,
      lastCheck
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/stocks') {
    const [stocks, alerts] = await Promise.all([store.listStocks(), store.listAlerts(30)]);

    sendJson(response, 200, {
      stocks,
      alerts,
      telegramConfigured: isTelegramConfigured(config),
      quoteProviders: config.quoteProviders,
      pollIntervalSeconds: config.pollIntervalSeconds,
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll,
      lastCheck
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/symbol-search') {
    const query = url.searchParams.get('q');
    sendJson(response, 200, { results: searchSymbols(query) });
    return;
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
      alphaVantageApiKey: config.alphaVantageApiKey
    };
    const quote = await fetchQuote(symbol, quoteOptions);
    const purchaseDate = String(url.searchParams.get('purchaseDate') || '').trim();
    let historicalHigh = null;

    if (purchaseDate) {
      historicalHigh = await fetchHistoricalHighSince(symbol, purchaseDate, {
        ...quoteOptions,
        endDate: new Date()
      });
    }

    sendJson(
      response,
      200,
      buildRegistrationPreview(
        {
          purchasePrice: url.searchParams.get('purchasePrice'),
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

  if (request.method === 'POST' && url.pathname === '/api/check-now') {
    const result = await runCheckOnce();
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

async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
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
  });
}

listen(config.port);

const interval = setInterval(() => {
  runCheckOnce().catch((error) => {
    console.error('Scheduled alert check failed:', error);
  });
}, config.pollIntervalSeconds * 1000);

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
