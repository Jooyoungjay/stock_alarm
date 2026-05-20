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
  assert.match(markdown, /한국투자증권/);
  assert.match(markdown, /키움/);
  assert.match(markdown, /주문/);
});
