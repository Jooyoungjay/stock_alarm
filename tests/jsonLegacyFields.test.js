import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { buildDataModelInfo, getDataModelSnapshot } from '../src/dataModel.js';
import {
  JSON_LEGACY_FIELDS,
  getJsonLegacyFieldsPolicy,
  isLegacyEntityName,
  isLegacyFieldPath
} from '../src/jsonLegacyFields.js';

test('json legacy fields policy lists devices push and alert delivery placeholders', () => {
  const policy = getJsonLegacyFieldsPolicy();

  assert.equal(policy.policyVersion, 1);
  assert.equal(policy.currentPhase, 'removed');
  assert.ok(policy.phases.some((phase) => phase.id === 'documented' && phase.status === 'completed'));
  assert.ok(policy.phases.some((phase) => phase.id === 'removed' && phase.status === 'completed'));
  assert.equal(policy.entities.length, 2);
  assert.equal(policy.fields.length, 6);
  assert.equal(policy.storeMethods.length, 4);
  assert.ok(policy.fields.some((field) => field.name === 'pushDeliveryStatus'));
  assert.ok(isLegacyEntityName('devices'));
  assert.ok(isLegacyFieldPath('alerts[].pushDeliveryFailed'));
  assert.equal(isLegacyEntityName('stocks'), false);
});

test('data model snapshot exposes legacy policy without active device entities', () => {
  const snapshot = getDataModelSnapshot();

  assert.ok(snapshot.legacy);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.summary.legacyEntityCount, 2);
  assert.equal(snapshot.summary.legacyFieldCount, JSON_LEGACY_FIELDS.length);
  assert.equal(snapshot.entities.some((entity) => entity.name === 'devices'), false);

  const stocks = snapshot.entities.find((entity) => entity.name === 'stocks');
  assert.ok(stocks);
  assert.equal(stocks.fields.some((field) => field.name === 'deviceId'), false);
});

test('buildDataModelInfo includes legacy block for migrated store responses', () => {
  const info = buildDataModelInfo({
    stocks: [],
    alerts: [],
    meta: { schemaVersion: 2 }
  });

  assert.equal(info.legacy.summary.entityCount, 2);
  assert.equal(info.store.counts.stocks, 0);
});

test('json legacy fields deprecation doc matches policy registry', async () => {
  const markdown = await fs.readFile(
    new URL('../docs/json-legacy-fields-deprecation.md', import.meta.url),
    'utf8'
  );

  assert.match(markdown, /WBS 14\.8/);
  assert.match(markdown, /pushDeliveryStatus/);
  assert.match(markdown, /optional_migration/);
  assert.match(markdown, /LF-01/);
  assert.match(markdown, /jsonLegacyFields\.js/);
});
