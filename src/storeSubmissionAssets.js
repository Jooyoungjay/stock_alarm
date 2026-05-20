import fs from 'node:fs/promises';
import path from 'node:path';

const defaultEnv = process.env;
const imageExtensions = new Set(['.png', '.jpg', '.jpeg']);

export async function buildStoreSubmissionAssetsReadiness(input = {}) {
  const rootDir = input.rootDir || process.cwd();
  const env = input.env || defaultEnv;
  const generatedAt = normalizeGeneratedAt(input.now);
  const values = normalizeStoreAssetValues(rootDir, env, input);
  const context = await readStoreAssetContext(values);
  const checks = await buildChecks(values, context);
  const summary = summarizeChecks(checks);

  return {
    ready: summary.error === 0,
    generatedAt,
    values: {
      rootDir,
      screenshotDir: values.screenshotDir,
      appName: context.appJson?.expo?.name || '',
      bundleIdentifier: context.appJson?.expo?.ios?.bundleIdentifier || '',
      androidPackage: context.appJson?.expo?.android?.package || '',
      privacyPolicyUrl: context.privacyPolicyUrl,
      supportUrl: context.supportUrl,
      plannedScreenshotCount: context.plannedScreens.length,
      foundScreenshotCount: context.screenshotMatches.filter((item) => item.found).length
    },
    summary,
    checks
  };
}

export function formatStoreSubmissionAssetsReport(result) {
  const lines = [
    '스토어 제출 자산 최종 점검 결과',
    `생성 시각: ${result.generatedAt}`,
    `준비 상태: ${result.ready ? 'READY' : 'NOT READY'}`,
    '',
    '주요 값:',
    `- 앱 이름: ${result.values.appName || '(미확인)'}`,
    `- iOS 번들 ID: ${result.values.bundleIdentifier || '(미확인)'}`,
    `- Android 패키지: ${result.values.androidPackage || '(미확인)'}`,
    `- 개인정보 처리방침 URL: ${result.values.privacyPolicyUrl || '(미설정)'}`,
    `- 지원 URL: ${result.values.supportUrl || '(미설정)'}`,
    `- 스크린샷 폴더: ${result.values.screenshotDir}`,
    `- 스크린샷: ${result.values.foundScreenshotCount}/${result.values.plannedScreenshotCount}`,
    '',
    '검증 결과:'
  ];

  for (const check of result.checks) {
    const status = check.ok ? 'OK' : check.level.toUpperCase();
    lines.push(`- [${status}] ${check.label}: ${check.message}`);
  }

  lines.push(
    '',
    `요약: error=${result.summary.error}, warn=${result.summary.warn}, ok=${result.summary.ok}`
  );

  return `${lines.join('\n')}\n`;
}

export function parseStoreSubmissionAssetsArgs(args = [], options = {}) {
  const parsed = {
    env: options.env || process.env,
    rootDir: options.rootDir || process.cwd(),
    screenshotDir: options.screenshotDir || '',
    json: false,
    help: false,
    failOnWarn: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-warn') {
      parsed.failOnWarn = true;
    } else if (arg === '--screenshot-dir') {
      parsed.screenshotDir = args[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--screenshot-dir=')) {
      parsed.screenshotDir = arg.slice('--screenshot-dir='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getStoreSubmissionAssetsHelp() {
  return [
    '사용법: npm run check:store-assets -- [옵션]',
    '',
    '옵션:',
    '  --json                         사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-warn                 경고가 있어도 종료 코드 1로 처리',
    '  --screenshot-dir <path>        실제 스토어 스크린샷 파일 폴더 지정',
    '  --help                         도움말 출력',
    '',
    '주요 환경변수:',
    '  PRIVACY_POLICY_URL             공개 HTTPS 개인정보 처리방침 URL',
    '  SUPPORT_URL                    공개 HTTPS 지원/문의 URL',
    '  STORE_SCREENSHOT_DIR           실제 PNG/JPEG 스크린샷 파일 폴더'
  ].join('\n');
}

function normalizeStoreAssetValues(rootDir, env, input) {
  const screenshotDir =
    input.screenshotDir ||
    firstValue(env.STORE_SCREENSHOT_DIR) ||
    path.join('mobile', 'store-assets', 'screenshots');

  return {
    rootDir,
    env,
    appJsonPath: path.join(rootDir, 'mobile', 'app.json'),
    listingPath: path.join(rootDir, 'mobile', 'store-listing.ko.json'),
    reviewPrepPath: path.join(rootDir, 'docs', 'app-store-review-prep.md'),
    privacyDocumentPath: path.join(rootDir, 'docs', 'privacy-policy-ko.md'),
    screenshotDocumentPath: path.join(rootDir, 'docs', 'store-screenshots.md'),
    screenshotDir: path.resolve(rootDir, screenshotDir),
    envPrivacyPolicyUrl: firstValue(env.PRIVACY_POLICY_URL),
    envSupportUrl: firstValue(env.SUPPORT_URL)
  };
}

async function readStoreAssetContext(values) {
  const [appJson, listing, reviewPrepExists, privacyDocExists, screenshotDocExists, screenshotFiles] =
    await Promise.all([
      readJsonFile(values.appJsonPath),
      readJsonFile(values.listingPath),
      fileExists(values.reviewPrepPath),
      fileExists(values.privacyDocumentPath),
      fileExists(values.screenshotDocumentPath),
      listImageFiles(values.screenshotDir)
    ]);
  const plannedScreens = Array.isArray(listing?.storeScreenshots?.screens)
    ? listing.storeScreenshots.screens
    : [];
  const screenshotMatches = plannedScreens.map((screen) => ({
    screen,
    file: findScreenshotFile(screenshotFiles, screen.fileName),
    found: Boolean(findScreenshotFile(screenshotFiles, screen.fileName))
  }));

  return {
    appJson,
    listing,
    reviewPrepExists,
    privacyDocExists,
    screenshotDocExists,
    screenshotFiles,
    plannedScreens,
    screenshotMatches,
    privacyPolicyUrl: resolvePublicUrl(values.envPrivacyPolicyUrl, listing?.privacyPolicyUrl),
    supportUrl: resolvePublicUrl(values.envSupportUrl, listing?.supportUrl)
  };
}

async function buildChecks(values, context) {
  const app = context.appJson?.expo || {};
  const listing = context.listing || {};
  const iconPath = app.icon ? path.resolve(path.dirname(values.appJsonPath), app.icon) : '';
  const adaptiveIconPath = app.android?.adaptiveIcon?.foregroundImage
    ? path.resolve(path.dirname(values.appJsonPath), app.android.adaptiveIcon.foregroundImage)
    : '';
  const [iconExists, adaptiveIconExists] = await Promise.all([
    iconPath ? fileExists(iconPath) : Promise.resolve(false),
    adaptiveIconPath ? fileExists(adaptiveIconPath) : Promise.resolve(false)
  ]);
  const metadataFields = [
    listing.locale,
    listing.appName,
    listing.subtitle,
    listing.shortDescription,
    listing.category,
    listing.supportEmail
  ];
  const fullDescription = Array.isArray(listing.fullDescription) ? listing.fullDescription : [];
  const reviewNotes = Array.isArray(listing.reviewNotes) ? listing.reviewNotes : [];
  const dataSafety = listing.dataSafety || {};
  const screenshotSets = Array.isArray(listing.storeScreenshots?.sets)
    ? listing.storeScreenshots.sets
    : [];
  const screensWithAltText = context.plannedScreens.filter(
    (screen) => screen.altText && String(screen.altText).length <= 140
  );
  const missingScreenshotNames = context.screenshotMatches
    .filter((match) => !match.found)
    .map((match) => match.screen.fileName || match.screen.id)
    .filter(Boolean);

  return [
    createCheck('app_config_present', 'Expo 앱 설정', Boolean(context.appJson), 'mobile/app.json을 읽었습니다.', 'mobile/app.json을 읽을 수 없습니다.'),
    createCheck('listing_metadata_present', '스토어 메타데이터', Boolean(context.listing), 'mobile/store-listing.ko.json을 읽었습니다.', '스토어 메타데이터 JSON을 읽을 수 없습니다.'),
    createCheck('ios_bundle_id', 'iOS 번들 ID', Boolean(app.ios?.bundleIdentifier), `iOS 번들 ID: ${app.ios?.bundleIdentifier || ''}`, 'iOS 번들 ID가 필요합니다.'),
    createCheck('android_package', 'Android 패키지명', Boolean(app.android?.package), `Android 패키지명: ${app.android?.package || ''}`, 'Android 패키지명이 필요합니다.'),
    createCheck('app_icon_exists', '앱 아이콘 파일', iconExists, `앱 아이콘 파일이 있습니다: ${relativePath(values.rootDir, iconPath)}`, '앱 아이콘 파일이 없습니다.'),
    createCheck('adaptive_icon_exists', 'Android adaptive icon', adaptiveIconExists, `Android adaptive icon 파일이 있습니다: ${relativePath(values.rootDir, adaptiveIconPath)}`, 'Android adaptive icon 파일이 없습니다.'),
    createCheck('metadata_required_fields', '스토어 필수 문구', metadataFields.every(Boolean) && fullDescription.length >= 3, '스토어 기본 문구가 채워져 있습니다.', '앱 이름, 부제, 설명, 카테고리, 지원 이메일을 확인해야 합니다.'),
    createCheck('privacy_policy_public_url', '개인정보 처리방침 URL', isPublicHttpsUrl(context.privacyPolicyUrl), '공개 HTTPS 개인정보 처리방침 URL이 준비되어 있습니다.', 'PRIVACY_POLICY_URL 또는 listing privacyPolicyUrl을 공개 HTTPS URL로 설정해야 합니다.'),
    createCheck('support_public_url', '지원 URL', isPublicHttpsUrl(context.supportUrl), '공개 HTTPS 지원 URL이 준비되어 있습니다.', 'SUPPORT_URL 또는 listing supportUrl을 공개 HTTPS URL로 설정해야 합니다.'),
    createCheck('review_notes_present', '심사 메모', reviewNotes.length >= 4 && reviewNotes.some((item) => item.includes('투자 자문')), '심사 메모 초안이 있습니다.', '계정 없음, 데모 서버, 푸시 테스트, 투자 자문 아님을 심사 메모에 넣어야 합니다.'),
    createCheck('data_safety_present', 'Data safety 초안', dataSafety.accountCreation === 'notRequired' && Array.isArray(dataSafety.dataCollected), 'Data safety 입력 기준이 정리되어 있습니다.', 'Google Play Data safety 입력 기준이 필요합니다.'),
    createCheck('financial_disclaimer_present', '금융 고지 문구', fullDescription.some((item) => /투자 자문|매매 중개|주문 실행/.test(item)), '투자 자문/매매 기능이 아님을 설명합니다.', '스토어 설명에 투자 자문, 매매 중개, 주문 실행이 아님을 명시해야 합니다.'),
    createCheck('review_prep_document_present', '심사 준비 문서', context.reviewPrepExists, '앱 심사 준비 문서가 있습니다.', 'docs/app-store-review-prep.md가 필요합니다.'),
    createCheck('privacy_document_present', '개인정보 문서', context.privacyDocExists, '개인정보 처리방침 초안이 있습니다.', 'docs/privacy-policy-ko.md가 필요합니다.'),
    createCheck('screenshot_document_present', '스크린샷 가이드', context.screenshotDocExists, '스크린샷 제작 가이드가 있습니다.', 'docs/store-screenshots.md가 필요합니다.'),
    createCheck('screenshot_sets_present', '스크린샷 제출 세트', screenshotSets.length >= 3 && hasScreenshotSet(screenshotSets, 'App Store') && hasScreenshotSet(screenshotSets, 'Google Play'), 'App Store와 Google Play 제출 세트가 정리되어 있습니다.', 'App Store와 Google Play용 스크린샷 세트가 필요합니다.'),
    createCheck('screenshot_copy_complete', '스크린샷 문구와 대체 텍스트', context.plannedScreens.length >= 6 && screensWithAltText.length === context.plannedScreens.length, '스크린샷별 제목, 설명, 대체 텍스트가 준비되어 있습니다.', '스크린샷 6장 이상의 문구와 140자 이하 대체 텍스트가 필요합니다.'),
    createCheck('screenshot_files_present', '실제 스크린샷 파일', missingScreenshotNames.length === 0 && context.plannedScreens.length > 0, '계획된 스크린샷 파일이 모두 있습니다.', `스크린샷 파일이 부족합니다: ${missingScreenshotNames.join(', ') || '계획 없음'}`)
  ];
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
    { ok: 0, warn: 0, error: 0 }
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

async function listImageFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => imageExtensions.has(path.extname(name).toLowerCase()))
      .sort((left, right) => left.localeCompare(right, 'ko-KR'));
  } catch {
    return [];
  }
}

function findScreenshotFile(files, fileName) {
  const expected = String(fileName || '').trim().toLowerCase();

  if (!expected) {
    return '';
  }

  return files.find((file) => path.basename(file, path.extname(file)).toLowerCase() === expected) || '';
}

function resolvePublicUrl(primary, fallback) {
  const value = firstValue(primary, fallback);

  if (!value || /^TBD\b/i.test(value)) {
    return '';
  }

  return value;
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host);
  } catch {
    return false;
  }
}

function hasScreenshotSet(sets, storeName) {
  return sets.some((set) => String(set.store || '').includes(storeName));
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

function relativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/') || filePath;
}

function normalizeGeneratedAt(value) {
  const date = value ? new Date(value) : new Date();

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
