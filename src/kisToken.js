import fs from 'node:fs/promises';
import path from 'node:path';

const defaultKisApiBaseUrl = 'https://openapi.koreainvestment.com:9443';
const kisTokenPath = '/oauth2/tokenP';
const defaultRefreshWindowSeconds = 600;

export async function getKisAccessToken(options = {}) {
  const directToken = normalizeBearerToken(options.kisAccessToken);

  if (directToken) {
    return {
      accessToken: directToken,
      tokenType: 'Bearer',
      source: 'env',
      expiresAt: null,
      expiresIn: null,
      cachePath: null,
      cached: false
    };
  }

  if (!options.kisTokenAutoRefresh) {
    throw new Error('KIS_ACCESS_TOKEN이 없고 KIS_TOKEN_AUTO_REFRESH가 꺼져 있습니다.');
  }

  const cachePath = resolveKisTokenCachePath(options);
  const now = normalizeNow(options.now);
  const refreshWindowSeconds = normalizePositiveNumber(
    options.kisTokenRefreshWindowSeconds,
    defaultRefreshWindowSeconds
  );
  const cached = options.forceRefresh ? null : await readKisTokenCache(cachePath);

  if (isUsableKisTokenCache(cached, now, refreshWindowSeconds)) {
    return {
      accessToken: cached.accessToken,
      tokenType: cached.tokenType || 'Bearer',
      source: 'cache',
      expiresAt: cached.expiresAt || null,
      expiresIn: cached.expiresIn || null,
      cachePath,
      cached: true
    };
  }

  const issued = await issueKisAccessToken({
    ...options,
    now
  });
  await writeKisTokenCache(cachePath, issued);

  return {
    ...issued,
    source: 'issued',
    cachePath,
    cached: false
  };
}

export async function issueKisAccessToken(options = {}) {
  const appKey = String(options.kisAppKey || '').trim();
  const appSecret = String(options.kisAppSecret || '').trim();

  if (!appKey || !appSecret) {
    throw new Error('KIS 토큰 발급에는 KIS_APP_KEY와 KIS_APP_SECRET이 필요합니다.');
  }

  const now = normalizeNow(options.now);
  const url = buildKisTokenUrl(options.kisApiBaseUrl);
  const payload = await fetchKisTokenJson(url, {
    ...options,
    body: {
      grant_type: options.kisTokenGrantType || 'client_credentials',
      appkey: appKey,
      appsecret: appSecret
    }
  });

  return normalizeKisTokenResponse(payload, {
    now,
    source: 'issued'
  });
}

export function buildKisTokenUrl(baseUrl) {
  const endpoint = String(baseUrl || defaultKisApiBaseUrl).trim();
  return new URL(kisTokenPath, endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
}

export function resolveKisTokenCachePath(options = {}) {
  if (options.kisTokenCachePath) {
    return path.resolve(String(options.kisTokenCachePath));
  }

  const dataDir = options.dataDir || path.join(process.cwd(), 'data');
  return path.join(path.resolve(dataDir), 'kis-token.json');
}

export function normalizeKisTokenResponse(payload, options = {}) {
  if (payload?.rt_cd && String(payload.rt_cd) !== '0') {
    throw new Error(payload.msg1 || payload.msg_cd || 'KIS 토큰 발급 오류');
  }

  const accessToken = normalizeBearerToken(payload?.access_token || payload?.token);

  if (!accessToken) {
    throw new Error('KIS 토큰 응답에서 access_token을 찾을 수 없습니다.');
  }

  const now = normalizeNow(options.now);
  const expiresIn = normalizePositiveNumber(payload?.expires_in, null);
  const expiresAt =
    parseKisTokenExpiry(payload?.access_token_token_expired) ||
    (expiresIn ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null);

  return {
    accessToken,
    tokenType: payload?.token_type || 'Bearer',
    expiresIn,
    expiresAt,
    issuedAt: now.toISOString(),
    refreshToken: normalizeBearerToken(payload?.refresh_token) || undefined,
    refreshTokenExpiresAt: parseKisTokenExpiry(payload?.refresh_token_token_expired),
    refreshTokenExpiresIn: normalizePositiveNumber(payload?.refresh_token_expires_in, null),
    source: options.source || 'issued'
  };
}

export function formatKisTokenReport(result) {
  return [
    'KIS 접근 토큰 점검 결과',
    `상태: ${result.ok ? 'OK' : 'FAILED'}`,
    `발급/확인 시각: ${result.generatedAt}`,
    `토큰 출처: ${result.source || '(없음)'}`,
    `토큰: ${result.maskedAccessToken || '(없음)'}`,
    `만료 시각: ${result.expiresAt || '(알 수 없음)'}`,
    `캐시 경로: ${result.cachePath || '(사용 안 함)'}`,
    `메시지: ${result.message}`
  ].join('\n') + '\n';
}

export async function buildKisTokenReport(options = {}) {
  const generatedAt = normalizeNow(options.now).toISOString();

  try {
    const token = await getKisAccessToken({
      ...options,
      kisTokenAutoRefresh: true
    });

    return {
      ok: true,
      generatedAt,
      source: token.source,
      maskedAccessToken: maskSecret(token.accessToken),
      expiresAt: token.expiresAt,
      cachePath: token.cachePath,
      cached: token.cached,
      message: token.cached
        ? '캐시된 KIS 접근 토큰을 사용할 수 있습니다.'
        : token.source === 'env'
          ? '환경변수 KIS_ACCESS_TOKEN을 사용할 수 있습니다.'
          : 'KIS 접근 토큰을 새로 발급하고 캐시에 저장했습니다.'
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      source: '',
      maskedAccessToken: '',
      expiresAt: '',
      cachePath: resolveKisTokenCachePath(options),
      cached: false,
      message: error.message
    };
  }
}

export function parseKisTokenArgs(args = [], options = {}) {
  const parsed = {
    env: options.env || process.env,
    json: false,
    help: false,
    forceRefresh: false,
    cachePath: ''
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--force') {
      parsed.forceRefresh = true;
    } else if (arg === '--cache-path') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('--cache-path 값이 필요합니다.');
      }

      parsed.cachePath = value;
      index += 1;
    } else if (arg.startsWith('--cache-path=')) {
      parsed.cachePath = arg.slice('--cache-path='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getKisTokenHelp() {
  return [
    '사용법: npm run kis:token -- [옵션]',
    '',
    '옵션:',
    '  --json                 사람이 읽는 보고서 대신 JSON 출력',
    '  --force                캐시가 유효해도 토큰을 새로 발급',
    '  --cache-path <path>    기본 data/kis-token.json 대신 사용할 캐시 경로',
    '  --help                 도움말 출력',
    '',
    '필수 환경변수:',
    '  KIS_APP_KEY            한국투자증권 앱 키',
    '  KIS_APP_SECRET         한국투자증권 앱 시크릿',
    '',
    '선택 환경변수:',
    '  KIS_API_BASE_URL       기본값 https://openapi.koreainvestment.com:9443',
    '  KIS_TOKEN_CACHE_PATH   접근 토큰 캐시 파일 경로'
  ].join('\n');
}

async function readKisTokenCache(cachePath) {
  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeKisTokenCache(cachePath, token) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    `${JSON.stringify(
      {
        accessToken: token.accessToken,
        tokenType: token.tokenType || 'Bearer',
        expiresAt: token.expiresAt,
        expiresIn: token.expiresIn,
        issuedAt: token.issuedAt,
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        refreshTokenExpiresIn: token.refreshTokenExpiresIn
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function isUsableKisTokenCache(cache, now, refreshWindowSeconds) {
  const accessToken = normalizeBearerToken(cache?.accessToken);

  if (!accessToken) {
    return false;
  }

  if (!cache.expiresAt) {
    return true;
  }

  const expiresAt = new Date(cache.expiresAt);

  if (!Number.isFinite(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() - now.getTime() > refreshWindowSeconds * 1000;
}

async function fetchKisTokenJson(url, options = {}) {
  const timeoutMs = normalizePositiveNumber(options.timeoutMs, 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetch || fetch;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(options.body)
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`KIS 토큰 발급 실패: HTTP ${response.status}: ${formatSafeErrorPayload(payload)}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function formatSafeErrorPayload(payload) {
  const message = payload?.msg1 || payload?.message || payload?.error_description || payload?.error || '';
  const code = payload?.msg_cd || payload?.code || '';
  const detail = [code, message].filter(Boolean).join(' ');

  return detail || '응답 본문 없음';
}

function parseKisTokenExpiry(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeBearerToken(value) {
  return String(value || '').trim().replace(/^Bearer\s+/i, '');
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNow(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function maskSecret(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  if (text.length <= 10) {
    return `${text.slice(0, 2)}...${text.slice(-2)}`;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}
