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

test('visual regression guide documents browser capture checks', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/visual-regression-check.md', import.meta.url),
    'utf8'
  );
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(markdown, /브라우저 시각 회귀 점검/);
  assert.match(markdown, /npm run check:visual/);
  assert.match(markdown, /Playwright/);
  assert.match(markdown, /user-desktop/);
  assert.match(markdown, /admin-mobile/);
  assert.match(markdown, /data\/visual-regression\/latest/);
  assert.match(markdown, /ADMIN_TOKEN/);

  assert.match(readme, /check-visual-regression\.js/);
  assert.match(readme, /visual-regression-check\.md/);
  assert.match(readme, /VISUAL_REGRESSION_BASE_URL/);
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
  assert.match(markdown, /서버 연결 실패 배너/);
  assert.match(markdown, /백업 미리보기/);
  assert.match(markdown, /시세 품질 표시/);
  assert.match(markdown, /로컬 웹앱 관찰 리포트/);
  assert.match(markdown, /check:visual/);
  assert.match(markdown, /visual-regression-check\.md/);
  assert.match(markdown, /최종 합격 기준/);
});

test('local webapp stabilization docs cover cache, status, backups, and quote quality', async () => {
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
  const roadmap = await fs.readFile(
    new URL('../docs/development-roadmap.md', import.meta.url),
    'utf8'
  );
  const uxReview = await fs.readFile(
    new URL('../docs/local-webapp-ux-review-2026-05-26.md', import.meta.url),
    'utf8'
  );

  assert.match(readme, /Failed to fetch/);
  assert.match(readme, /AUTO_BACKUP_INTERVAL_HOURS/);
  assert.match(readme, /백업 미리보기/);
  assert.match(readme, /매도 판단 대시보드/);
  assert.match(readme, /시세 품질 배지/);
  assert.match(readme, /1시간 쉬기/);
  assert.match(readme, /check:visual/);
  assert.match(readme, /check:observation/);
  assert.match(readme, /--live-session/);
  assert.match(readme, /--save-history/);
  assert.match(readme, /data\/observation-history/);
  assert.match(readme, /check-local-observation\.js/);
  assert.match(readme, /local-webapp-observation-2026-05-21\.md/);
  assert.match(readme, /local-webapp-ux-review-2026-05-26\.md/);
  assert.match(readme, /observationIssues\.js/);
  assert.match(readme, /\/api\/observation-issues/);
  assert.match(readme, /관리자 실사용 이슈 우선순위 표시/);
  assert.match(readme, /실사용 관찰 체크리스트/);
  assert.match(readme, /점검 히스토리/);
  assert.match(readme, /\/api\/observation-history/);
  assert.match(readme, /\/api\/observation-history\/\{fileName\}/);
  assert.match(readme, /\/api\/observation-history\/\{fileName\}\/results\/\{resultId\}\/action/);
  assert.match(readme, /\/api\/observation-history\/run/);
  assert.match(readme, /\/api\/observation-history\/prune/);
  assert.match(readme, /data\/observation-actions\.json/);
  assert.match(readme, /감시 종목 필터와 정렬 선택을 브라우저에 저장/);
  assert.match(readme, /CSV 양식/);
  assert.match(readme, /행 검증 후 일괄 가져오기/);

  assert.match(roadmap, /로컬 웹앱 안정화와 사용자 편의성/);
  assert.match(roadmap, /오프라인\/캐시 상태 UX/);
  assert.match(roadmap, /보유\/관심\/매도 구분/);
  assert.match(roadmap, /브라우저 시각 회귀 테스트/);
  assert.match(roadmap, /실사용 관찰 리포트/);
  assert.match(roadmap, /실사용 이슈 반영/);
  assert.match(roadmap, /후속 실사용 이슈 수집/);
  assert.match(roadmap, /관찰 결과 기반 UX 개선/);
  assert.match(roadmap, /실사용 체크 실행과 신규 OBS 처리/);
  assert.match(roadmap, /장중 즉시 확인과 알림 제어 실사용 검증/);
  assert.match(roadmap, /실사용 관찰 결과 회고와 다음 편의 개선 선정/);
  assert.match(roadmap, /오늘 확인할 일 카드/);
  assert.match(roadmap, /종목 목록 저장 필터/);
  assert.match(roadmap, /CSV 가져오기\/내보내기/);
  assert.match(roadmap, /알림 기준 설명 고도화/);
  assert.match(roadmap, /배당 API 자동 검증 대시보드 확장/);
  assert.match(roadmap, /로컬 장중 실사용 재검증/);
  assert.match(roadmap, /로컬 점검 결과 저장\/히스토리/);
  assert.match(roadmap, /로컬 점검 히스토리 관리자 화면 노출/);
  assert.match(roadmap, /관리자 점검 실행\/히스토리 저장/);
  assert.match(roadmap, /점검 히스토리 상세 보기\/다운로드/);
  assert.match(roadmap, /점검 히스토리 보관 기간\/삭제 관리/);
  assert.match(roadmap, /점검 실패 항목 조치 메모/);
  assert.match(roadmap, /텔레그램 편의 명령 확장/);

  assert.match(uxReview, /로컬 웹앱 사용자 편의 개선 회고/);
  assert.match(uxReview, /오늘 확인할 일 카드/);
  assert.match(uxReview, /종목 목록 저장 필터/);
  assert.match(uxReview, /CSV 가져오기\/내보내기/);
  assert.match(uxReview, /알림 기준 설명 고도화/);
  assert.match(uxReview, /배당 API 자동 검증 대시보드 확장/);
  assert.match(uxReview, /로컬 장중 실사용 재검증/);
  assert.match(uxReview, /로컬 점검 결과 저장\/히스토리/);
  assert.match(uxReview, /로컬 점검 히스토리 관리자 화면 노출/);
  assert.match(uxReview, /관리자 점검 실행\/히스토리 저장/);
  assert.match(uxReview, /점검 히스토리 상세 보기\/다운로드/);
  assert.match(uxReview, /점검 히스토리 보관 기간\/삭제 관리/);
  assert.match(uxReview, /점검 실패 항목 조치 메모/);
  assert.match(uxReview, /위험 종목/);
  assert.match(uxReview, /시세 또는 배당 조회 실패/);
  assert.match(uxReview, /주문, 자동 매매, 매수\/매도 추천 문구는 넣지 않습니다/);
});

test('user webapp wires the today action panel into the first account area', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(html, /todayActionPanel/);
  assert.match(script, /renderTodayActionPanel/);
  assert.match(script, /buildTodayActions/);
  assert.match(script, /알림 기준 도달/);
  assert.match(script, /배당락일 임박/);
  assert.match(script, /보유 종목 알림 꺼짐/);
  assert.match(styles, /today-action-panel/);
  assert.match(styles, /today-action-item/);
});

test('user webapp persists watch filters and sort order locally', async () => {
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /watchFilterButtons/);
  assert.match(html, /watchSortSelect/);
  assert.match(script, /WATCH_VIEW_STORAGE_KEY/);
  assert.match(script, /loadWatchViewPreference/);
  assert.match(script, /saveWatchViewPreference/);
  assert.match(script, /normalizeWatchFilter/);
  assert.match(script, /normalizeWatchSort/);
  assert.match(script, /localStorage/);
});

test('user webapp imports and exports stock CSV files with validation', async () => {
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const styles = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(html, /downloadCsvTemplateButton/);
  assert.match(html, /exportCsvButton/);
  assert.match(html, /importCsvButton/);
  assert.match(html, /csvImportInput/);
  assert.match(html, /csvImportResult/);
  assert.match(script, /CSV_STOCK_FIELDS/);
  assert.match(script, /parseCsvText/);
  assert.match(script, /validateCsvStockRows/);
  assert.match(script, /exportStocksCsv/);
  assert.match(script, /importStocksCsv/);
  assert.match(script, /중복 종목/);
  assert.match(styles, /csv-import-result/);
});

test('user webapp explains alert rule formulas without investment advice', async () => {
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const styles = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(html, /data-alert-rule-guide/);
  assert.match(script, /buildAlertRuleGuides/);
  assert.match(script, /renderAlertRuleGuideComparison/);
  assert.match(script, /필요 입력/);
  assert.match(script, /계산식/);
  assert.match(script, /예시/);
  assert.match(script, /투자 권유가 아니라/);
  assert.match(script, /최고가 대비 하락률/);
  assert.match(script, /이익금 반납률/);
  assert.match(script, /매수가 대비 손절률/);
  assert.match(script, /직접 기준가/);
  assert.doesNotMatch(script, /빠른 추천값|추천 상황|초보 추천/);
  assert.match(styles, /alert-rule-guide/);
});

test('admin page exposes dividend API automatic validation dashboard', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(html, /dividendDiagnosticsPanel/);
  assert.match(script, /buildDividendApiDashboard/);
  assert.match(script, /renderDividendApiDashboard/);
  assert.match(script, /dividend-provider-grid/);
  assert.match(script, /다음 조치/);
  assert.match(script, /DATA_GO_KR_SERVICE_KEY/);
  assert.match(script, /OPEN_DART_API_KEY/);
  assert.match(script, /ALPHA_VANTAGE_API_KEY/);
  assert.match(styles, /dividend-api-dashboard/);
  assert.match(styles, /dividend-provider-card/);
  assert.match(styles, /dividend-next-actions/);
});

test('local webapp observation report documents daily use checks and issue tracking', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/local-webapp-observation-2026-05-21.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /로컬 웹앱 실사용 관찰 리포트/);
  assert.match(markdown, /하루 관찰 체크리스트/);
  assert.match(markdown, /종목 상태/);
  assert.match(markdown, /백업 미리보기/);
  assert.match(markdown, /연결 실패 안내/);
  assert.match(markdown, /초기 짧은 관찰 결과/);
  assert.match(markdown, /OBS-001/);
  assert.match(markdown, /OBS-002/);
  assert.match(markdown, /OBS-003/);
  assert.match(markdown, /OBS-004/);
  assert.match(markdown, /OBS-005/);
  assert.match(markdown, /OBS-006/);
  assert.match(markdown, /OBS-007/);
  assert.match(markdown, /OBS-008/);
  assert.match(markdown, /OBS-009/);
  assert.match(markdown, /OBS-010/);
  assert.match(markdown, /OBS-011/);
  assert.match(markdown, /OBS-012/);
  assert.match(markdown, /OBS-013/);
  assert.match(markdown, /OBS-014/);
  assert.match(markdown, /OBS-015/);
  assert.match(markdown, /data\/observation-actions\.json/);
  assert.match(markdown, /check:observation/);
  assert.match(markdown, /--run-state-check/);
  assert.match(markdown, /--live-session/);
  assert.match(markdown, /--save-history/);
  assert.match(markdown, /상태 변경 검증 결과/);
  assert.match(markdown, /실사용 회고 결과/);
  assert.match(markdown, /실패 항목 \| 0개/);
  assert.match(markdown, /연결 실패 메시지/);
  assert.match(markdown, /우선순위 판정 기준/);
  assert.match(markdown, /관리자 화면의 `실사용 이슈` 카드/);
  assert.match(markdown, /오늘 확인할 일 카드/);
  assert.match(markdown, /종목 목록 저장 필터/);
  assert.match(markdown, /CSV 가져오기\/내보내기/);
  assert.match(markdown, /알림 기준 설명 고도화/);
  assert.match(markdown, /배당 API 자동 검증 대시보드 확장/);
  assert.match(markdown, /로컬 장중 실사용 재검증/);
  assert.match(markdown, /로컬 점검 결과 저장\/히스토리/);
  assert.match(markdown, /로컬 점검 히스토리 관리자 화면 노출/);
  assert.match(markdown, /관리자 점검 실행\/히스토리 저장/);
  assert.match(markdown, /점검 히스토리 상세 보기\/다운로드/);
  assert.match(markdown, /점검 히스토리 보관 기간\/삭제 관리/);
  assert.match(markdown, /점검 실패 항목 조치 메모/);
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

test('mobile real-device E2E guide documents phone testing readiness checks', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/mobile-real-device-e2e.md', import.meta.url),
    'utf8'
  );
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(markdown, /모바일 실기기 E2E 테스트/);
  assert.match(markdown, /npm run check:mobile-e2e/);
  assert.match(markdown, /npm run local:phone/);
  assert.match(markdown, /\/api\/mobile\/ping/);
  assert.match(markdown, /Expo Push Token/);
  assert.match(markdown, /LAN URL/);
  assert.match(markdown, /Node\.js/);
  assert.match(markdown, /NOT READY/);

  assert.match(readme, /npm run check:mobile-e2e/);
  assert.match(readme, /mobile-real-device-e2e\.md/);
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

test('admin page exposes local observation issue controls', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(html, /실사용 이슈/);
  assert.match(html, /observationIssuesPanel/);
  assert.match(html, /refreshObservationIssuesButton/);
  assert.match(html, /점검 히스토리/);
  assert.match(html, /observationHistoryPanel/);
  assert.match(html, /refreshObservationHistoryButton/);
  assert.match(html, /runObservationCheckButton/);
  assert.match(html, /observationRunResult/);
  assert.match(script, /\/api\/observation-issues/);
  assert.match(script, /\/api\/observation-history/);
  assert.match(script, /\/api\/observation-history\/run/);
  assert.match(script, /\/api\/observation-history\/prune/);
  assert.match(script, /results\/\$\{encodeURIComponent\(resultId\)\}\/action/);
  assert.match(script, /data-observation-history-detail/);
  assert.match(script, /data-observation-history-download/);
  assert.match(script, /data-observation-history-delete/);
  assert.match(script, /data-observation-history-prune/);
  assert.match(script, /data-observation-action-save/);
  assert.match(script, /saveObservationHistoryAction/);
  assert.match(script, /renderObservationIssues/);
  assert.match(script, /renderObservationChecklist/);
  assert.match(script, /renderObservationHistory/);
  assert.match(script, /renderObservationRunResult/);
  assert.match(script, /renderObservationHistoryDetail/);
  assert.match(script, /downloadObservationHistoryDetail/);
  assert.match(script, /deleteObservationHistoryFile/);
  assert.match(script, /pruneObservationHistoryFiles/);
  assert.match(script, /formatHistoryDeltaText/);
  assert.match(script, /nextChecklistItem/);
  assert.match(script, /priorityQueue/);
  assert.match(styles, /observation-history-panel/);
  assert.match(styles, /observation-history-row/);
  assert.match(styles, /observation-history-detail/);
  assert.match(styles, /observation-history-retention/);
  assert.match(styles, /observation-action-editor/);
  assert.match(styles, /observation-run-card/);
});

test('user stock forms expose per-stock KIS market settings', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(html, /name="kisMarketDivCode"/);
  assert.match(html, /KIS 시장 기준/);
  assert.match(script, /renderKisMarketDivCodeOptions/);
  assert.match(script, /kisMarketDivCode: elements\.form\.elements\.kisMarketDivCode\.value/);
});
