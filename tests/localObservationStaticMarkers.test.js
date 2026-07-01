import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { OBSERVATION_STATIC_MARKERS } from '../src/localObservationStaticMarkers.js';

async function readPublicFile(name) {
  return fs.readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
}

function assertContainsAll(source, markers, label) {
  for (const marker of markers) {
    assert.match(
      source,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${label} should include marker: ${marker}`
    );
  }
}

test('OBSERVATION_STATIC_MARKERS match public and guidance source files', async () => {
  const [indexHtml, appJs, stylesCss, guidanceJs] = await Promise.all([
    readPublicFile('index.html'),
    readPublicFile('app.js'),
    readPublicFile('styles.css'),
    readPublicFile('dividendFailureGuidance.js')
  ]);

  assertContainsAll(indexHtml, OBSERVATION_STATIC_MARKERS.positionStatusFilters, 'index.html');
  assertContainsAll(indexHtml, OBSERVATION_STATIC_MARKERS.csvImportExport.indexHtml, 'index.html csv');
  assertContainsAll(indexHtml, OBSERVATION_STATIC_MARKERS.alertRuleGuide.indexHtml, 'index.html alert guide');
  assertContainsAll(indexHtml, OBSERVATION_STATIC_MARKERS.dividendDashboard.indexHtml, 'index.html dividend');

  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.quoteQuality, 'app.js quote quality');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.alertControls, 'app.js alert controls');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.positionStatusApp, 'app.js position status');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.watchViewPreference, 'app.js watch view');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.csvImportExport.appJs, 'app.js csv');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.alertRuleGuide.appJs, 'app.js alert guide');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.dividendDashboard.appJs, 'app.js dividend');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.sellDecision, 'app.js sell decision');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.backupPreview, 'app.js backup preview');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.connectionFailure, 'app.js connection failure');
  assertContainsAll(appJs, OBSERVATION_STATIC_MARKERS.todayActionControls, 'app.js today action');

  assertContainsAll(stylesCss, OBSERVATION_STATIC_MARKERS.alertRuleGuide.stylesCss, 'styles.css alert guide');
  assertContainsAll(stylesCss, OBSERVATION_STATIC_MARKERS.dividendDashboard.stylesCss, 'styles.css dividend');
  assertContainsAll(guidanceJs, OBSERVATION_STATIC_MARKERS.dividendDashboard.guidanceJs, 'guidance.js dividend');
});

test('OBSERVATION_STATIC_MARKERS cover stale-quote and today action wiring', () => {
  assert.ok(OBSERVATION_STATIC_MARKERS.positionStatusFilters.includes('data-watch-filter="stale-quote"'));
  assert.ok(OBSERVATION_STATIC_MARKERS.todayActionControls.includes('data-today-action-scroll-target'));
  assert.ok(OBSERVATION_STATIC_MARKERS.todayActionControls.includes('data-today-action-type'));
  assert.ok(OBSERVATION_STATIC_MARKERS.todayActionTypes.includes('kis-naver-compare-open'));
  assert.ok(OBSERVATION_STATIC_MARKERS.userHome.includes('todayActionPanel'));
});
