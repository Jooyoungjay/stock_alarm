import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('JSON to DB migration guide documents the migration contract', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/json-to-db-migration.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /Postgres/);
  assert.match(markdown, /`devices`/);
  assert.match(markdown, /`stocks`/);
  assert.match(markdown, /`alerts`/);
  assert.match(markdown, /migrate:postgres:dry-run/);
  assert.match(markdown, /migrate:postgres:rehearsal/);
  assert.match(markdown, /quote_provider_attempts/);
  assert.match(markdown, /kis_naver_compare_history/);
  assert.match(markdown, /tests\/fixtures\/postgres-migration/);
  assert.match(markdown, /storageSnapshotContract/);
  assert.match(markdown, /JSONB/);
  assert.match(markdown, /Postgres 연결 리허설 CLI/);
  assert.match(markdown, /검증 기준/);
  assert.match(markdown, /롤백 전략/);
});

test('user and admin page split guide keeps product and admin scopes separate', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/user-admin-page-split.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /사용자 페이지/);
  assert.match(markdown, /관리자 페이지/);
  assert.match(markdown, /\/admin/);
  assert.match(markdown, /서버 상태/);
  assert.match(markdown, /백업/);
  assert.match(markdown, /포트폴리오 요약/);
  assert.match(markdown, /ADMIN_TOKEN/);
  assert.match(markdown, /x-admin-token/);
});

test('app review documents cover privacy, store metadata, and review blockers', async () => {
  const reviewMarkdown = await fs.readFile(
    new URL('../docs/app-store-review-prep.md', import.meta.url),
    'utf8'
  );
  const privacyMarkdown = await fs.readFile(
    new URL('../docs/privacy-policy-ko.md', import.meta.url),
    'utf8'
  );
  const listing = JSON.parse(
    await fs.readFile(new URL('../mobile/store-listing.ko.json', import.meta.url), 'utf8')
  );

  assert.match(reviewMarkdown, /App Store Review Guidelines/);
  assert.match(reviewMarkdown, /Apple Screenshot specifications/);
  assert.match(reviewMarkdown, /Google Play Data safety/);
  assert.match(reviewMarkdown, /Google Play preview assets/);
  assert.match(reviewMarkdown, /HTTPS 데모 서버/);
  assert.match(reviewMarkdown, /check:demo/);
  assert.match(reviewMarkdown, /check:store-assets/);
  assert.match(reviewMarkdown, /store-screenshots\.md/);
  assert.match(reviewMarkdown, /store-submission-assets\.md/);
  assert.match(reviewMarkdown, /투자 자문/);
  assert.match(reviewMarkdown, /데이터 삭제/);

  assert.match(privacyMarkdown, /개인정보 처리방침 초안/);
  assert.match(privacyMarkdown, /익명 기기 ID/);
  assert.match(privacyMarkdown, /Expo Push Token/);
  assert.match(privacyMarkdown, /deviceSecret 원문 대신 해시/);
  assert.match(privacyMarkdown, /투자 자문 또는 매매 권유/);

  assert.equal(listing.locale, 'ko-KR');
  assert.equal(listing.appName, 'Stock Alarm');
  assert.equal(listing.category, 'FINANCE');
  assert.equal(listing.dataSafety.accountCreation, 'notRequired');
  assert.equal(listing.storeScreenshots.sourceDocument, '../docs/store-screenshots.md');
  assert.ok(listing.storeScreenshots.screens.some((item) => item.id === 'dividend-calendar'));
  assert.ok(listing.storeScreenshots.screens.some((item) => item.id === 'alert-toggle-push'));
  assert.ok(listing.storeScreenshots.knownGapsBeforeSubmission.some((item) => item.includes('실제 캡처')));
  assert.ok(listing.dataSafety.dataCollected.some((item) => item.type === 'Device identifiers'));
  assert.ok(listing.reviewNotes.some((item) => item.includes('HTTPS 서버')));
});

test('store screenshot guide documents capture sets, copy, and demo data rules', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/store-screenshots.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /스토어 스크린샷 제작 가이드/);
  assert.match(markdown, /App Store/);
  assert.match(markdown, /Google Play/);
  assert.match(markdown, /iPhone portrait/);
  assert.match(markdown, /iPad portrait/);
  assert.match(markdown, /Android phone portrait/);
  assert.match(markdown, /데모 데이터 원칙/);
  assert.match(markdown, /포트폴리오 요약/);
  assert.match(markdown, /감시 종목 목록/);
  assert.match(markdown, /종목 등록\/편집/);
  assert.match(markdown, /배당 캘린더/);
  assert.match(markdown, /알림 기록/);
  assert.match(markdown, /테스트 푸시/);
  assert.match(markdown, /대체 텍스트/);
  assert.match(markdown, /33626L/);
});

test('store submission assets guide documents final app store readiness checks', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/store-submission-assets.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /스토어 제출 자산 최종 점검/);
  assert.match(markdown, /npm run check:store-assets/);
  assert.match(markdown, /STORE_SCREENSHOT_DIR/);
  assert.match(markdown, /PRIVACY_POLICY_URL/);
  assert.match(markdown, /SUPPORT_URL/);
  assert.match(markdown, /실제 PNG\/JPEG/);
});

test('HTTPS demo server guide documents review readiness checks', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/https-demo-server.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /HTTPS 데모 서버 준비/);
  assert.match(markdown, /npm run check:demo/);
  assert.match(markdown, /REVIEW_DEMO_URL/);
  assert.match(markdown, /PRIVACY_POLICY_URL/);
  assert.match(markdown, /ADMIN_TOKEN/);
  assert.match(markdown, /stock_alarm_store/);
});

test('NXT market data guide documents contract adapter limits and settings', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/nxt-market-data-review.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /NXT 시세 API 검토/);
  assert.match(markdown, /NEXTRADE 데이터 포털/);
  assert.match(markdown, /ICE Consolidated Feed/);
  assert.match(markdown, /NXT_QUOTE_ENDPOINT_TEMPLATE/);
  assert.match(markdown, /missing_nxt_quote_endpoint/);
  assert.match(markdown, /화면 scraping/);
});

test('broker API adapter guide documents quote-only checks and trading guard', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/broker-api-adapter-review.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /증권사 API adapter 검토/);
  assert.match(markdown, /npm run check:broker-api/);
  assert.match(markdown, /BROKER_QUOTE_PROVIDER/);
  assert.match(markdown, /BROKER_TRADING_ENABLED/);
  assert.match(markdown, /QUOTE_PROVIDERS=kis/);
  assert.match(markdown, /npm run kis:token/);
  assert.match(markdown, /npm run check:kis-quote/);
  assert.match(markdown, /\/api\/kis\/quote-smoke-test/);
  assert.match(markdown, /\/api\/kis\/naver-compare/);
  assert.match(markdown, /\/api\/kis\/naver-compare\/auto-run/);
  assert.match(markdown, /\/api\/kis\/naver-compare\/issues/);
  assert.match(markdown, /\/api\/kis\/naver-compare\/apply/);
  assert.match(markdown, /가격 차이 이상치/);
  assert.match(markdown, /가격 비교 이력/);
  assert.match(markdown, /가격 비교 추세/);
  assert.match(markdown, /추세 기반 시장 추천/);
  assert.match(markdown, /KIS_MARKET_DIV_CODE/);
  assert.match(markdown, /KIS_TOKEN_AUTO_REFRESH/);
  assert.match(markdown, /KIS_SMOKE_SYMBOL/);
  assert.match(markdown, /KIS_NAVER_AUTO_COMPARE_ENABLED/);
  assert.match(markdown, /KIS_NAVER_AUTO_COMPARE_ALERT_ENABLED/);
  assert.match(markdown, /KIS_NAVER_AUTO_COMPARE_ALERT_COOLDOWN_MINUTES/);
  assert.match(markdown, /확인\/보류/);
  assert.match(markdown, /재알림/);
  assert.match(markdown, /한국투자증권/);
  assert.match(markdown, /키움/);
  assert.match(markdown, /주문/);
});

test('full regression scenario guide documents end-to-end test coverage', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/full-regression-test-scenarios.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /Stock Alarm 전수 테스트 시나리오/);
  assert.match(markdown, /npm test/);
  assert.match(markdown, /서버 실행\/종료 테스트/);
  assert.match(markdown, /사용자 웹앱 테스트/);
  assert.match(markdown, /텔레그램 테스트/);
  assert.match(markdown, /배당 기능 테스트/);
  assert.match(markdown, /KIS\/Naver 가격 비교 테스트/);
  assert.match(markdown, /해결 후 재발/);
  assert.match(markdown, /모바일 앱\/API 테스트/);
  assert.match(markdown, /최종 합격 기준/);
});

test('full regression execution report records results and fixed defects', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/full-regression-test-report-2026-05-21.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /전수 테스트 실행 기록/);
  assert.match(markdown, /238개 통과/);
  assert.match(markdown, /JsonStore/);
  assert.match(markdown, /store\.json\.tmp/);
  assert.match(markdown, /HTTP 403 Forbidden/);
  assert.match(markdown, /KIS_APP_KEY/);
  assert.match(markdown, /모바일 실기기/);
});

test('external API recheck report documents current real-account blockers', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/external-api-recheck-2026-05-21.md', import.meta.url),
    'utf8'
  );
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(markdown, /외부 API 실계정 재점검 기록/);
  assert.match(markdown, /npm run check:external-apis/);
  assert.match(markdown, /--send-telegram/);
  assert.match(markdown, /KIS_APP_KEY/);
  assert.match(markdown, /HTTP 403 Forbidden/);
  assert.match(markdown, /모바일 실기기 E2E 테스트/);

  assert.match(readme, /npm run check:external-apis/);
  assert.match(readme, /external-api-recheck-2026-05-21\.md/);
});

test('admin page exposes the KIS quote smoke test controls', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(html, /KIS 현재가 점검/);
  assert.match(html, /kisSmokeTestForm/);
  assert.match(html, /kisSmokeMarketSelect/);
  assert.match(html, /kisSmokeForceTokenInput/);
  assert.match(script, /\/api\/kis\/quote-smoke-test/);
  assert.match(script, /renderKisSmokeTestResult/);
});

test('admin page exposes the KIS and Naver comparison controls', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(html, /KIS\/Naver 가격 비교/);
  assert.match(html, /kisNaverCompareForm/);
  assert.match(html, /kisNaverCompareMarketSelect/);
  assert.match(html, /kisNaverCompareDriftThresholdInput/);
  assert.match(html, /kisNaverAutoCompareRunButton/);
  assert.match(html, /kisNaverCompareHistoryPanel/);
  assert.match(html, /이상치 기준/);
  assert.match(script, /\/api\/kis\/naver-compare/);
  assert.match(script, /\/api\/kis\/naver-compare\/auto-run/);
  assert.match(script, /\/api\/kis\/naver-compare\/issues/);
  assert.match(script, /\/api\/kis\/naver-compare\/apply/);
  assert.match(script, /kisNaverCompareHistory/);
  assert.match(script, /kisNaverCompareTrend/);
  assert.match(script, /kisNaverTrendRecommendation/);
  assert.match(script, /lastKisNaverAutoCompare/);
  assert.match(script, /자동 가격 비교/);
  assert.match(script, /가격 비교 이슈/);
  assert.match(script, /data-kis-issue-status/);
  assert.match(script, /formatKisNaverAutoCompareAlertStatus/);
  assert.match(script, /formatKisNaverCompareIssueStatusLabel/);
  assert.match(script, /renderKisNaverCompareHistory/);
  assert.match(script, /renderKisNaverCompareTrend/);
  assert.match(script, /renderKisNaverTrendRecommendation/);
  assert.match(script, /시장별 괴리 추세/);
  assert.match(script, /추세 추천/);
  assert.match(script, /data-kis-apply-market/);
  assert.match(script, /driftThresholdPercent/);
  assert.match(script, /renderKisNaverCompareResult/);
});

test('user stock forms expose per-stock KIS market settings', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(html, /name="kisMarketDivCode"/);
  assert.match(html, /KIS 시장 기준/);
  assert.match(script, /renderKisMarketDivCodeOptions/);
  assert.match(script, /kisMarketDivCode: elements\.form\.elements\.kisMarketDivCode\.value/);
});
