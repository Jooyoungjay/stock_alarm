import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildAccessUrls } from './accessUrls.js';
import { APP_NAME, readRuntimeInfo } from './runtimeInfo.js';

const defaultEnv = process.env;
const minimumExpoNodeVersion = '20.19.0';
const defaultExpoPushEndpoint = 'https://exp.host/--/api/v2/push/send';
const mobileSourceFiles = [
  path.join('mobile', 'App.js'),
  path.join('mobile', 'src', 'api.js'),
  path.join('mobile', 'src', 'deviceStorage.js'),
  path.join('mobile', 'src', 'pushNotifications.js')
];

export async function buildMobileE2eReadiness(input = {}) {
  const rootDir = path.resolve(input.rootDir || process.cwd());
  const env = input.env || defaultEnv;
  const generatedAt = normalizeGeneratedAt(input.now);
  const values = normalizeMobileE2eValues(rootDir, env, input);
  const context = await readMobileE2eContext(values, input);
  const checks = await buildMobileE2eChecks(values, context, input);
  const summary = summarizeChecks(checks);

  return {
    ready: summary.error === 0,
    generatedAt,
    values: {
      rootDir,
      dataDir: values.dataDir,
      runtimeState: context.runtimeState,
      serverBaseUrl: context.serverBaseUrl,
      localUrl: context.accessUrls.local,
      lanUrls: context.accessUrls.lan,
      appName: context.appJson?.expo?.name || '',
      defaultApiBaseUrl: context.appJson?.expo?.extra?.defaultApiBaseUrl || '',
      mobilePushEnabled: values.mobilePushEnabled,
      expoPushEndpoint: values.expoPushEndpoint,
      nodeVersion: values.nodeVersion
    },
    summary,
    checks,
    nextActions: buildMobileE2eNextActions(checks, context)
  };
}

export function formatMobileE2eReadinessReport(result = {}) {
  const values = result.values || {};
  const lines = [
    '모바일 실기기 E2E 준비 점검 결과',
    `생성 시각: ${result.generatedAt || new Date().toISOString()}`,
    `준비 상태: ${result.ready ? 'READY' : 'NOT READY'}`,
    '',
    '주요 값:',
    `- 앱 이름: ${values.appName || '(미확인)'}`,
    `- Node.js: ${values.nodeVersion || process.version}`,
    `- 서버 상태: ${values.runtimeState || '(미확인)'}`,
    `- PC 접속 주소: ${values.localUrl || '(없음)'}`,
    `- 휴대폰 접속 주소: ${values.lanUrls?.length ? values.lanUrls.join(', ') : '(없음)'}`,
    `- 점검 서버 URL: ${values.serverBaseUrl || '(없음)'}`,
    `- 앱 기본 서버 URL: ${values.defaultApiBaseUrl || '(미설정)'}`,
    `- 모바일 푸시: ${values.mobilePushEnabled ? '켜짐' : '꺼짐'}`,
    '',
    '검증 결과:'
  ];

  for (const check of Array.isArray(result.checks) ? result.checks : []) {
    const status = check.ok ? 'OK' : check.level.toUpperCase();
    lines.push(`- [${status}] ${check.label}: ${check.message}`);
  }

  lines.push(
    '',
    `요약: error=${result.summary?.error || 0}, warn=${result.summary?.warn || 0}, ok=${result.summary?.ok || 0}`
  );

  if (Array.isArray(result.nextActions) && result.nextActions.length) {
    lines.push('', '다음 조치:');
    result.nextActions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

export function parseMobileE2eReadinessArgs(args = [], options = {}) {
  const parsed = {
    env: options.env || process.env,
    rootDir: options.rootDir || process.cwd(),
    serverUrl: options.serverUrl || '',
    json: false,
    help: false,
    failOnWarn: false,
    probeServer: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-warn') {
      parsed.failOnWarn = true;
    } else if (arg === '--no-probe') {
      parsed.probeServer = false;
    } else if (arg === '--server-url') {
      parsed.serverUrl = requireNextValue(args, (index += 1), arg);
    } else if (arg.startsWith('--server-url=')) {
      parsed.serverUrl = arg.slice('--server-url='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getMobileE2eReadinessHelp() {
  return [
    '사용법: npm run check:mobile-e2e -- [옵션]',
    '',
    '옵션:',
    '  --json                 사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-warn         경고가 있어도 종료 코드 1로 처리',
    '  --server-url <url>     자동 감지 대신 직접 모바일 서버 URL 점검',
    '  --no-probe             /api/mobile/ping 네트워크 호출 생략',
    '  --help                 도움말 출력',
    '',
    '권장 순서:',
    '  1. npm run stop',
    '  2. npm run local:phone',
    '  3. npm run check:mobile-e2e',
    '  4. npm run mobile:start'
  ].join('\n');
}

function normalizeMobileE2eValues(rootDir, env, input) {
  return {
    rootDir,
    env,
    dataDir: path.resolve(rootDir, firstValue(input.dataDir, env.DATA_DIR, path.join(rootDir, 'data'))),
    mobileDir: path.join(rootDir, 'mobile'),
    packagePath: path.join(rootDir, 'mobile', 'package.json'),
    appJsonPath: path.join(rootDir, 'mobile', 'app.json'),
    e2eDocPath: path.join(rootDir, 'docs', 'mobile-real-device-e2e.md'),
    serverUrl: normalizeBaseUrl(firstValue(input.serverUrl, env.MOBILE_E2E_SERVER_URL)),
    nodeVersion: firstValue(input.nodeVersion, process.version),
    mobilePushEnabled: normalizeBoolean(firstValue(env.MOBILE_PUSH_ENABLED), true),
    expoPushEndpoint: firstValue(env.EXPO_PUSH_ENDPOINT, defaultExpoPushEndpoint),
    networkInterfaces: input.networkInterfaces || os.networkInterfaces(),
    fetchImpl: input.fetchImpl || globalThis.fetch,
    probeServer: input.probeServer !== false
  };
}

async function readMobileE2eContext(values, input) {
  const [packageJson, appJson, sourceFiles, e2eDocExists, installedExpo] = await Promise.all([
    readJsonFile(values.packagePath),
    readJsonFile(values.appJsonPath),
    Promise.all(mobileSourceFiles.map((file) => fileExists(path.join(values.rootDir, file)))),
    fileExists(values.e2eDocPath),
    fileExists(path.join(values.mobileDir, 'node_modules', 'expo', 'package.json'))
  ]);
  const runtime = await readRuntime(values, input);
  const accessUrls = runtime?.info ? buildAccessUrls(runtime.info, values.networkInterfaces) : { local: '', lan: [] };
  const serverBaseUrl =
    values.serverUrl ||
    normalizeBaseUrl(accessUrls.lan[0]) ||
    normalizeBaseUrl(accessUrls.local) ||
    normalizeBaseUrl(appJson?.expo?.extra?.defaultApiBaseUrl);

  return {
    packageJson,
    appJson,
    sourceFiles,
    e2eDocExists,
    installedExpo,
    runtimeInfo: runtime?.info || null,
    runtimeState: runtime?.state || 'missing',
    accessUrls,
    serverBaseUrl,
    ping: values.probeServer ? await probeMobilePing(serverBaseUrl, values.fetchImpl) : null
  };
}

async function buildMobileE2eChecks(values, context) {
  const dependencies = context.packageJson?.dependencies || {};
  const app = context.appJson?.expo || {};
  const plugins = Array.isArray(app.plugins) ? app.plugins : [];
  const defaultApiBaseUrl = app.extra?.defaultApiBaseUrl || '';
  const hasLocalhostDefault = isLocalhostUrl(defaultApiBaseUrl);
  const hasExplicitServerUrl = Boolean(values.serverUrl);
  const hasLanUrl = context.accessUrls.lan.length > 0;
  const runtimeIsLan =
    context.runtimeInfo?.host === '0.0.0.0' ||
    context.runtimeInfo?.host === '::' ||
    Boolean(hasExplicitServerUrl && !isLocalhostUrl(values.serverUrl));
  const sourceFileNames = mobileSourceFiles.map((file, index) => ({
    file,
    exists: context.sourceFiles[index]
  }));
  const missingSourceFiles = sourceFileNames.filter((item) => !item.exists).map((item) => item.file);
  const projectId = firstValue(
    app.extra?.eas?.projectId,
    app.extra?.projectId,
    app.extra?.expo?.projectId
  );

  return [
    createCheck(
      'mobile_package_present',
      '모바일 package.json',
      Boolean(context.packageJson),
      'mobile/package.json을 읽었습니다.',
      'mobile/package.json을 읽을 수 없습니다.'
    ),
    createCheck(
      'expo_node_version',
      'Expo Node.js 버전',
      compareSemver(stripNodeVersion(values.nodeVersion), minimumExpoNodeVersion) >= 0,
      `Node.js ${values.nodeVersion}은 Expo SDK 55 기준을 만족합니다.`,
      `Expo SDK 55는 Node.js ${minimumExpoNodeVersion} 이상이 필요합니다. 현재: ${values.nodeVersion}`
    ),
    createCheck(
      'expo_dependencies',
      'Expo 필수 의존성',
      Boolean(dependencies.expo && dependencies['expo-notifications'] && dependencies['expo-secure-store']),
      'expo, expo-notifications, expo-secure-store 의존성이 있습니다.',
      'mobile/package.json에 expo, expo-notifications, expo-secure-store가 필요합니다.'
    ),
    createCheck(
      'mobile_dependencies_installed',
      '모바일 의존성 설치',
      context.installedExpo,
      'mobile/node_modules에 Expo 의존성이 설치되어 있습니다.',
      '실기기 실행 전 `npm run mobile:install`이 필요할 수 있습니다.',
      'warn'
    ),
    createCheck(
      'app_config_present',
      'Expo 앱 설정',
      Boolean(context.appJson),
      'mobile/app.json을 읽었습니다.',
      'mobile/app.json을 읽을 수 없습니다.'
    ),
    createCheck(
      'app_identifiers',
      '앱 식별자',
      Boolean(app.ios?.bundleIdentifier && app.android?.package),
      `iOS ${app.ios?.bundleIdentifier || '-'}, Android ${app.android?.package || '-'}`,
      'iOS bundleIdentifier와 Android package가 필요합니다.'
    ),
    createCheck(
      'secure_store_plugin',
      '기기 인증 저장소',
      hasPlugin(plugins, 'expo-secure-store'),
      'expo-secure-store 플러그인이 설정되어 있습니다.',
      'deviceSecret 저장을 위해 expo-secure-store 플러그인이 필요합니다.'
    ),
    createCheck(
      'notifications_plugin',
      '푸시 알림 플러그인',
      hasPlugin(plugins, 'expo-notifications'),
      'expo-notifications 플러그인이 설정되어 있습니다.',
      '푸시 알림을 위해 expo-notifications 플러그인이 필요합니다.'
    ),
    createCheck(
      'mobile_source_files',
      '모바일 핵심 파일',
      missingSourceFiles.length === 0,
      '앱, API, 기기 저장소, 푸시 파일이 모두 있습니다.',
      `모바일 핵심 파일이 없습니다: ${missingSourceFiles.join(', ')}`
    ),
    createCheck(
      'default_api_base_url',
      '앱 기본 서버 주소',
      Boolean(defaultApiBaseUrl) && !hasLocalhostDefault,
      `기본값은 ${defaultApiBaseUrl}입니다.`,
      defaultApiBaseUrl
        ? `기본값은 ${defaultApiBaseUrl}입니다. 실기기에서는 앱 화면에 LAN 주소를 입력해야 합니다.`
        : 'mobile/app.json extra.defaultApiBaseUrl이 필요합니다.',
      hasLocalhostDefault ? 'warn' : 'error'
    ),
    createCheck(
      'runtime_info_present',
      '로컬 서버 실행 정보',
      context.runtimeState === 'running' || hasExplicitServerUrl,
      hasExplicitServerUrl ? `직접 지정한 서버 URL을 사용합니다: ${values.serverUrl}` : 'Stock Alarm 서버 실행 정보가 있습니다.',
      '실기기 테스트 전 서버를 실행해야 합니다. `npm run local:phone`을 권장합니다.'
    ),
    createCheck(
      'server_lan_bind',
      '휴대폰 접속 가능한 서버',
      (hasExplicitServerUrl && !isLocalhostUrl(values.serverUrl)) ||
        (context.runtimeState === 'running' && runtimeIsLan && hasLanUrl),
      hasLanUrl
        ? `같은 Wi-Fi 접속 주소가 있습니다: ${context.accessUrls.lan.join(', ')}`
        : `직접 지정한 서버 URL을 사용합니다: ${values.serverUrl}`,
      '현재 서버는 PC 전용 주소입니다. 실기기 테스트는 `npm run local:phone`으로 시작해야 합니다.'
    ),
    createCheck(
      'mobile_ping',
      '모바일 ping API',
      !values.probeServer || context.ping?.ok,
      values.probeServer
        ? `/api/mobile/ping 응답 확인: ${context.serverBaseUrl}`
        : '네트워크 ping을 생략했습니다.',
      values.probeServer
        ? `/api/mobile/ping 호출 실패: ${context.ping?.error || 'unknown'}`
        : '네트워크 ping을 생략했습니다.'
    ),
    createCheck(
      'expo_push_endpoint',
      'Expo Push endpoint',
      !values.mobilePushEnabled || isHttpsUrl(values.expoPushEndpoint),
      'Expo Push endpoint가 HTTPS입니다.',
      'MOBILE_PUSH_ENABLED=true이면 EXPO_PUSH_ENDPOINT는 HTTPS여야 합니다.'
    ),
    createCheck(
      'eas_project_id',
      'Expo 프로젝트 ID',
      Boolean(projectId),
      'Expo projectId가 설정되어 있습니다.',
      '실제 빌드 푸시 안정성을 위해 EAS projectId 설정을 권장합니다.',
      'warn'
    ),
    createCheck(
      'e2e_document',
      '실기기 E2E 문서',
      context.e2eDocExists,
      '실기기 E2E 테스트 문서가 있습니다.',
      'docs/mobile-real-device-e2e.md가 필요합니다.'
    )
  ];
}

function buildMobileE2eNextActions(checks, context) {
  const actions = [];
  const byName = Object.fromEntries(checks.map((check) => [check.name, check]));

  if (!byName.mobile_dependencies_installed?.ok) {
    actions.push('모바일 앱 실행 전 `npm run mobile:install`을 실행합니다.');
  }

  if (!byName.server_lan_bind?.ok || context.runtimeState !== 'running') {
    actions.push('실제 휴대폰 테스트는 `npm run stop`으로 PC 전용 서버를 끈 뒤 `npm run local:phone`으로 다시 시작합니다.');
  }

  if (!byName.mobile_ping?.ok) {
    actions.push('휴대폰과 PC가 같은 Wi-Fi인지 확인하고, 앱 서버 주소에는 `npm run local:phone`에 표시된 LAN URL을 입력합니다.');
  }

  if (!byName.eas_project_id?.ok) {
    actions.push('푸시 토큰 발급이 불안정하면 EAS projectId를 mobile/app.json의 extra.eas.projectId에 추가합니다.');
  }

  if (!byName.e2e_document?.ok) {
    actions.push('실기기 테스트 절차를 docs/mobile-real-device-e2e.md에 기록합니다.');
  }

  return actions;
}

async function readRuntime(values, input) {
  if (input.runtimeInfo) {
    return {
      state: 'running',
      info: input.runtimeInfo
    };
  }

  try {
    const info = await readRuntimeInfo(values.dataDir);

    if (info.appName !== APP_NAME) {
      return {
        state: 'foreign',
        info
      };
    }

    return {
      state: 'running',
      info
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        state: 'missing'
      };
    }

    return {
      state: 'error',
      error
    };
  }
}

async function probeMobilePing(serverBaseUrl, fetchImpl) {
  if (!serverBaseUrl) {
    return {
      ok: false,
      error: 'server_url_missing'
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      error: 'fetch_unavailable'
    };
  }

  try {
    const response = await fetchImpl(`${serverBaseUrl}/api/mobile/ping`);
    const payload = await parseJsonResponse(response);

    return {
      ok: response.ok && payload?.mobileApi === true,
      status: response.status,
      payload,
      error: response.ok ? '' : payload?.error || payload?.message || `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
}

async function parseJsonResponse(response) {
  if (typeof response?.json === 'function') {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  if (typeof response?.text !== 'function') {
    return {};
  }

  try {
    return JSON.parse(await response.text());
  } catch {
    return {};
  }
}

function createCheck(name, label, ok, successMessage, failureMessage, level = 'error') {
  return {
    name,
    label,
    level,
    ok: Boolean(ok),
    message: ok ? successMessage : failureMessage
  };
}

function summarizeChecks(checks) {
  return checks.reduce(
    (summary, check) => {
      if (check.ok) {
        summary.ok += 1;
      } else {
        summary[check.level] += 1;
      }

      return summary;
    },
    {
      ok: 0,
      warn: 0,
      error: 0
    }
  );
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function hasPlugin(plugins, name) {
  return plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalhostUrl(value) {
  try {
    const url = new URL(normalizeBaseUrl(value));
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

function normalizeBoolean(value, fallback) {
  const text = String(value ?? '').trim().toLowerCase();

  if (!text) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(text)) {
    return false;
  }

  return fallback;
}

function compareSemver(left, right) {
  const leftParts = String(left || '').split('.').map(toInteger);
  const rightParts = String(right || '').split('.').map(toInteger);

  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);

    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

function stripNodeVersion(value) {
  return String(value || '').replace(/^v/i, '');
}

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : 0;
}

function normalizeGeneratedAt(value) {
  const date = value ? new Date(value) : new Date();

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function requireNextValue(args, index, option) {
  const value = args[index];

  if (!value || value.startsWith('--')) {
    throw new Error(`${option} 옵션 값이 필요합니다.`);
  }

  return value;
}

function firstValue(...values) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) {
      return text;
    }
  }

  return '';
}
