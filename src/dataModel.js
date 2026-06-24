import { getJsonLegacyFieldsPolicy } from './jsonLegacyFields.js';
import { migrateStoreToSchemaV2 } from './legacyStoreCleanup.js';

export const DATA_SCHEMA_VERSION = 2;

const entities = [
  {
    name: 'stocks',
    storagePath: 'stocks[]',
    primaryKey: 'id',
    description: '사용자가 감시하는 보유 종목과 알림 기준입니다.',
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'accountType', type: 'general | isa | pension | other', required: true },
      { name: 'accountName', type: 'string', required: false },
      { name: 'symbol', type: 'string', required: true },
      { name: 'displayName', type: 'string', required: false },
      { name: 'purchasePrice', type: 'number | null', required: false },
      { name: 'quantity', type: 'number | null', required: false },
      { name: 'purchaseDate', type: 'date | empty', required: false },
      { name: 'kisMarketDivCode', type: 'J | NX | UN | empty', required: false },
      { name: 'alertType', type: 'high_drawdown | profit_retracement | purchase_loss | target_price', required: true },
      { name: 'thresholdPercent', type: 'number', required: true },
      { name: 'targetPrice', type: 'number | null', required: false },
      { name: 'investmentReason', type: 'string', required: false },
      { name: 'investmentTargetPrice', type: 'number | null', required: false },
      { name: 'sellCondition', type: 'string', required: false },
      { name: 'reviewDate', type: 'date | empty', required: false },
      { name: 'notes', type: 'string', required: false },
      { name: 'highPrice', type: 'number | null', required: false },
      { name: 'lastPrice', type: 'number | null', required: false },
      { name: 'annualDividendPerShare', type: 'number | null', required: false },
      { name: 'dividendHistory', type: 'dividend_events[]', required: true },
      { name: 'active', type: 'boolean', required: true },
      { name: 'createdAt', type: 'datetime', required: true },
      { name: 'updatedAt', type: 'datetime', required: true }
    ]
  },
  {
    name: 'alerts',
    storagePath: 'alerts[]',
    primaryKey: 'id',
    description: '텔레그램 또는 앱으로 보낸 알림 기록입니다.',
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'stockId', type: 'uuid | empty', required: false },
      { name: 'symbol', type: 'string', required: true },
      { name: 'alertType', type: 'string', required: false },
      { name: 'price', type: 'number | null', required: false },
      { name: 'metricPercent', type: 'number | null', required: false },
      { name: 'maximumProfitAmount', type: 'number | null', required: false },
      { name: 'retracedProfitAmount', type: 'number | null', required: false },
      { name: 'dividendEventType', type: 'ex_dividend | payment | empty', required: false },
      { name: 'dividendEventDate', type: 'date | empty', required: false },
      { name: 'dividendEventOffsetDays', type: 'integer | null', required: false },
      { name: 'expectedDividendAmount', type: 'number | null', required: false },
      { name: 'deliveryStatus', type: 'sent | failed | not_configured | none', required: false },
      { name: 'sent', type: 'boolean', required: false },
      { name: 'createdAt', type: 'datetime', required: true }
    ]
  },
  {
    name: 'dividend_events',
    storagePath: 'stocks[].dividendHistory[]',
    primaryKey: 'stockId + checkedAt + provider',
    description: '배당금, 배당락일, 지급일 변경 이력입니다.',
    fields: [
      { name: 'checkedAt', type: 'datetime', required: true },
      { name: 'reason', type: 'string', required: false },
      { name: 'provider', type: 'string', required: false },
      { name: 'sourceSymbol', type: 'string', required: false },
      { name: 'annualDividendPerShare', type: 'number | null', required: false },
      { name: 'lastDividendValue', type: 'number | null', required: false },
      { name: 'exDividendDate', type: 'date | empty', required: false },
      { name: 'dividendDate', type: 'date | empty', required: false }
    ]
  },
  {
    name: 'quote_provider_stats',
    storagePath: 'meta.quoteProviderStats',
    primaryKey: 'provider',
    description: '시세 provider 성공률과 실패 사유 진단용 통계입니다.',
    fields: [
      { name: 'provider', type: 'string', required: true },
      { name: 'attempts', type: 'number', required: true },
      { name: 'success', type: 'number', required: true },
      { name: 'error', type: 'number', required: true },
      { name: 'skipped', type: 'number', required: true },
      { name: 'averageDurationMs', type: 'number', required: true },
      { name: 'failureRatePercent', type: 'number', required: true },
      { name: 'lastCheckedAt', type: 'datetime | null', required: false }
    ]
  },
  {
    name: 'kis_naver_compare_history',
    storagePath: 'meta.kisNaverCompareHistory[]',
    primaryKey: 'id',
    description: 'KIS/Naver 가격 비교 결과와 이상치 판정 이력입니다.',
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'symbol', type: 'string', required: true },
      { name: 'generatedAt', type: 'datetime', required: true },
      { name: 'createdAt', type: 'datetime', required: true },
      { name: 'ok', type: 'boolean', required: true },
      { name: 'drift.status', type: 'normal | warning | critical | not_comparable', required: true },
      { name: 'drift.thresholdPercent', type: 'number | null', required: false },
      { name: 'drift.maxAbsoluteDifferencePercent', type: 'number | null', required: false },
      { name: 'recommendation.market', type: 'J | NX | UN | null', required: false },
      { name: 'results', type: 'kis_naver_compare_market_results[]', required: true }
    ]
  }
];

const relationships = [
  {
    from: 'alerts.stockId',
    to: 'stocks.id',
    type: 'many_to_one',
    required: false,
    description: '알림이 어떤 종목에서 발생했는지 연결합니다.'
  },
  {
    from: 'stocks.dividendHistory',
    to: 'dividend_events',
    type: 'embedded',
    required: false,
    description: '현재 JSON MVP에서는 배당 변경 이력을 종목 아래에 저장합니다.'
  }
];

export function getDataModelSnapshot() {
  const legacy = getJsonLegacyFieldsPolicy();

  return cloneJson({
    schemaVersion: DATA_SCHEMA_VERSION,
    storageEngine: 'json',
    entities,
    relationships,
    legacy: {
      ...legacy,
      note: 'schemaVersion 2부터 devices·push 필드는 저장소 envelope에서 제거됐습니다.'
    },
    summary: {
      entityCount: entities.length,
      relationshipCount: relationships.length,
      legacyEntityCount: legacy.summary.entityCount,
      legacyFieldCount: legacy.summary.fieldCount
    }
  });
}

export function buildDataModelInfo(data) {
  return {
    ...getDataModelSnapshot(),
    store: buildStoreSummary(data)
  };
}

export function buildStoreSummary(input = {}) {
  const data = normalizeStoreEnvelope(input);
  const stocks = data.stocks;
  const alerts = data.alerts;

  return {
    schemaVersion: data.meta.schemaVersion,
    storageEngine: 'json',
    meta: {
      createdAt: data.meta.createdAt,
      updatedAt: data.meta.updatedAt
    },
    counts: {
      stocks: stocks.length,
      activeStocks: stocks.filter((stock) => stock?.active !== false).length,
      alerts: alerts.length,
      dividendEvents: stocks.reduce(
        (sum, stock) => sum + (Array.isArray(stock?.dividendHistory) ? stock.dividendHistory.length : 0),
        0
      ),
      kisNaverCompareHistory: Array.isArray(data.meta.kisNaverCompareHistory)
        ? data.meta.kisNaverCompareHistory.length
        : 0
    }
  };
}

export function normalizeStoreEnvelope(input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const now = options.now || new Date().toISOString();
  const meta =
    source.meta && typeof source.meta === 'object' && !Array.isArray(source.meta)
      ? { ...source.meta }
      : {};
  const createdAt = normalizeIsoDateTime(meta.createdAt) || normalizeIsoDateTime(source.createdAt) || now;
  const updatedAt =
    normalizeIsoDateTime(meta.updatedAt) ||
    normalizeIsoDateTime(source.updatedAt) ||
    createdAt ||
    now;
  const schemaVersion = normalizeSchemaVersion(meta.schemaVersion);
  const envelope = {
    stocks: Array.isArray(source.stocks) ? source.stocks : [],
    alerts: Array.isArray(source.alerts) ? source.alerts : [],
    meta: {
      ...meta,
      schemaVersion,
      createdAt,
      updatedAt
    }
  };

  if (needsLegacyMigration(source, schemaVersion)) {
    return migrateStoreToSchemaV2(
      {
        ...source,
        ...envelope
      },
      { now }
    );
  }

  return {
    ...envelope,
    meta: {
      ...envelope.meta,
      schemaVersion: DATA_SCHEMA_VERSION,
      updatedAt
    }
  };
}

function needsLegacyMigration(source, schemaVersion) {
  if (schemaVersion < DATA_SCHEMA_VERSION) {
    return true;
  }

  if (Array.isArray(source.devices) && source.devices.length > 0) {
    return true;
  }

  const stocks = Array.isArray(source.stocks) ? source.stocks : [];
  const alerts = Array.isArray(source.alerts) ? source.alerts : [];

  return (
    stocks.some((stock) => stock?.deviceId) ||
    alerts.some(
      (alert) =>
        alert?.deviceId ||
        alert?.pushDeliveryStatus ||
        alert?.pushDeliveryError ||
        alert?.pushDeliverySent ||
        alert?.pushDeliveryFailed
    )
  );
}

export function touchStoreEnvelope(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const data = normalizeStoreEnvelope(input, { now });

  return {
    ...data,
    meta: {
      ...data.meta,
      schemaVersion: DATA_SCHEMA_VERSION,
      updatedAt: now
    }
  };
}

function normalizeSchemaVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : DATA_SCHEMA_VERSION;
}

function normalizeIsoDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
