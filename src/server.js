import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { JsonStore } from './storage.js';
import { runAlertCheck, runManualQuoteCheck } from './alertEngine.js';
import { fetchQuote } from './priceProvider.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';

const store = new JsonStore(config.dataDir, {
  defaultAlertCooldownMinutes: config.defaultAlertCooldownMinutes
});

let lastCheck = null;
let isChecking = false;
let activePort = config.port;
let server = null;

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

async function handleApi(request, response, url) {
  const segments = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      telegramConfigured: isTelegramConfigured(config),
      port: activePort,
      quoteProviders: config.quoteProviders,
      pollIntervalSeconds: config.pollIntervalSeconds,
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
      lastCheck
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/quote-preview') {
    const symbol = String(url.searchParams.get('symbol') || '').trim().toUpperCase();

    if (!symbol) {
      sendError(response, 400, '종목 코드를 입력하세요.');
      return;
    }

    const quote = await fetchQuote(symbol, {
      timeoutMs: config.quoteTimeoutMs,
      providers: config.quoteProviders,
      alphaVantageApiKey: config.alphaVantageApiKey
    });

    sendJson(response, 200, { quote });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/stocks') {
    const body = await readJsonBody(request);
    const stock = await store.addStock(body);
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
      const stock = await store.updateStock(id, body);
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
    console.log(`Stock Alarm is running at http://${config.host}:${port}`);
    console.log(`Polling every ${config.pollIntervalSeconds} seconds`);
  });
}

listen(config.port);

const interval = setInterval(() => {
  runCheckOnce().catch((error) => {
    console.error('Scheduled alert check failed:', error);
  });
}, config.pollIntervalSeconds * 1000);

process.on('SIGINT', () => {
  clearInterval(interval);
  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => process.exit(0));
});
