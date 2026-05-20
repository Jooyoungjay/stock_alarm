import { randomUUID } from 'node:crypto';
import {
  createBackup as createFileBackup,
  deleteBackup as deleteFileBackup,
  listBackups as listFileBackups,
  restoreBackup as restoreFileBackup
} from './backups.js';
import { buildDataModelInfo, normalizeStoreEnvelope, touchStoreEnvelope } from './dataModel.js';
import {
  applyStockPatch,
  appendKisNaverCompareHistory,
  buildKisNaverCompareHistorySnapshot,
  buildQuoteProviderStatsSnapshot,
  createDeviceSecret,
  hashDeviceSecret,
  normalizeDevice,
  normalizeDeviceId,
  normalizePushToken,
  normalizeStock,
  normalizeStoredDevice,
  normalizeStoredStock,
  sanitizeDevice,
  stockMatchesDevice,
  updateQuoteProviderStats
} from './storage.js';
import { STORAGE_ENGINES } from './storageContract.js';

export const POSTGRES_STORE_STAGE = 'jsonb-query-adapter';

const STORE_ROW_KEY = 'store';
const emptyStore = {
  devices: [],
  stocks: [],
  alerts: [],
  meta: {}
};

export class PostgresStore {
  constructor(options = {}) {
    this.engine = STORAGE_ENGINES.POSTGRES;
    this.databaseUrl = String(options.databaseUrl || '').trim();
    this.schema = normalizeIdentifier(options.schema || 'public', 'schema');
    this.tableName = normalizeIdentifier(options.tableName || 'stock_alarm_store', 'tableName');
    this.qualifiedTableName = `${quoteIdentifier(this.schema)}.${quoteIdentifier(this.tableName)}`;
    this.dataDir = options.dataDir || '';
    this.defaults = {
      defaultAlertCooldownMinutes: options.defaultAlertCooldownMinutes || 30,
      ...(options.defaults || {})
    };
    this.backups = {
      enabled: Boolean(options.backups?.enabled),
      maxBackups: options.backups?.maxBackups
    };
    this.implementationStage = POSTGRES_STORE_STAGE;
    this.queryClient = normalizeQueryClient(options);
    this.createPool = options.createPool;
    this.ownsQueryClient = false;
    this.runtimeEnabled = Boolean(this.queryClient || this.databaseUrl);
    this.ready = null;
  }

  getConnectionInfo() {
    return {
      engine: this.engine,
      implementationStage: this.implementationStage,
      runtimeEnabled: this.runtimeEnabled,
      configured: Boolean(this.databaseUrl || this.queryClient),
      databaseUrl: maskDatabaseUrl(this.databaseUrl),
      schema: this.schema,
      tableName: this.tableName
    };
  }

  unavailable(method) {
    throw createPostgresStoreUnavailableError(method, this);
  }

  async read() {
    await this.ensureReady();
    const result = await this.query(
      `SELECT payload FROM ${this.qualifiedTableName} WHERE key = $1`,
      [STORE_ROW_KEY]
    );
    const payload = parsePayload(result.rows?.[0]?.payload ?? emptyStore);
    const data = normalizeStoreEnvelope(payload);

    return {
      devices: Array.isArray(data.devices) ? data.devices.map(normalizeStoredDevice) : [],
      stocks: Array.isArray(data.stocks) ? data.stocks.map(normalizeStoredStock) : [],
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      meta: data.meta
    };
  }

  async write(data) {
    await this.ensureReady();
    await this.writeSnapshot(touchStoreEnvelope(data));
  }

  async getDataModelInfo() {
    const data = await this.read();
    const info = buildDataModelInfo(data);

    return {
      ...info,
      storageEngine: this.engine,
      store: {
        ...info.store,
        storageEngine: this.engine
      }
    };
  }

  async createDevice(input = {}) {
    const data = await this.read();
    const secret = createDeviceSecret();
    const device = {
      ...normalizeDevice(input),
      secretHash: hashDeviceSecret(secret)
    };

    if (data.devices.some((item) => item.id === device.id)) {
      throw new Error('이미 등록된 기기입니다.');
    }

    data.devices.push(device);
    await this.write(data);

    return {
      device: sanitizeDevice(device),
      deviceSecret: secret
    };
  }

  async authenticateDevice(deviceId, deviceSecret) {
    const data = await this.read();
    const id = String(deviceId || '').trim();
    const secretHash = hashDeviceSecret(deviceSecret);
    const index = data.devices.findIndex((device) => device.id === id);

    if (index === -1 || data.devices[index].secretHash !== secretHash) {
      throw new Error('기기 인증에 실패했습니다.');
    }

    const now = new Date().toISOString();
    data.devices[index] = {
      ...data.devices[index],
      lastSeenAt: now,
      updatedAt: now
    };
    await this.write(data);

    return sanitizeDevice(data.devices[index]);
  }

  async upsertDevicePushToken(deviceId, input) {
    const data = await this.read();
    const index = data.devices.findIndex((device) => device.id === deviceId);

    if (index === -1) {
      throw new Error('기기를 찾을 수 없습니다.');
    }

    const now = new Date().toISOString();
    const pushToken = normalizePushToken({
      ...input,
      updatedAt: now
    });

    if (!pushToken.token) {
      throw new Error('푸시 토큰을 입력하세요.');
    }

    const device = data.devices[index];
    const tokenIndex = device.pushTokens.findIndex(
      (item) => item.provider === pushToken.provider && item.token === pushToken.token
    );

    if (tokenIndex === -1) {
      device.pushTokens.push(pushToken);
    } else {
      device.pushTokens[tokenIndex] = {
        ...device.pushTokens[tokenIndex],
        ...pushToken
      };
    }

    device.platform = pushToken.platform === 'unknown' ? device.platform : pushToken.platform;
    device.updatedAt = now;
    device.lastSeenAt = now;
    data.devices[index] = device;
    await this.write(data);

    return sanitizeDevice(device);
  }

  async listDevicePushTokens(deviceId, options = {}) {
    const data = await this.read();
    const id = String(deviceId || '').trim();
    const provider = String(options.provider || '').trim().toLowerCase();
    const enabledOnly = options.enabledOnly !== false;
    const device = data.devices.find((item) => item.id === id);

    if (!device) {
      return [];
    }

    return device.pushTokens
      .map(normalizePushToken)
      .filter((token) => token.token)
      .filter((token) => !provider || token.provider === provider)
      .filter((token) => !enabledOnly || token.enabled)
      .map((token) => ({
        ...token,
        deviceId: device.id,
        deviceLabel: device.label
      }));
  }

  async listStocks(options = {}) {
    const data = await this.read();
    const deviceId = normalizeDeviceId(options.deviceId);

    if (!deviceId) {
      return data.stocks;
    }

    return data.stocks.filter((stock) => normalizeDeviceId(stock.deviceId) === deviceId);
  }

  async addStock(input) {
    const data = await this.read();
    const stock = normalizeStock(input, this.defaults);

    if (
      data.stocks.some(
        (item) =>
          item.symbol === stock.symbol &&
          normalizeDeviceId(item.deviceId) === normalizeDeviceId(stock.deviceId)
      )
    ) {
      throw new Error('이미 등록된 종목입니다.');
    }

    await this.createBackup('before-add-stock');
    data.stocks.push(stock);
    await this.write(data);
    await this.createBackup('after-add-stock');
    return stock;
  }

  async updateStock(id, patch, options = {}) {
    const data = await this.read();
    const index = data.stocks.findIndex((stock) => stock.id === id);

    if (index === -1 || !stockMatchesDevice(data.stocks[index], options.deviceId)) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    await this.createBackup('before-update-stock');
    const updated = applyStockPatch(data.stocks[index], patch);
    data.stocks[index] = updated;
    await this.write(data);
    await this.createBackup('after-update-stock');
    return updated;
  }

  async replaceStock(stock) {
    const data = await this.read();
    const index = data.stocks.findIndex((item) => item.id === stock.id);

    if (index === -1) {
      return null;
    }

    data.stocks[index] = {
      ...stock,
      updatedAt: new Date().toISOString()
    };

    await this.write(data);
    return data.stocks[index];
  }

  async deleteStock(id, options = {}) {
    const data = await this.read();
    const beforeCount = data.stocks.length;
    await this.createBackup('before-delete-stock');
    data.stocks = data.stocks.filter(
      (stock) => stock.id !== id || !stockMatchesDevice(stock, options.deviceId)
    );

    if (data.stocks.length === beforeCount) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    await this.write(data);
    await this.createBackup('after-delete-stock');
  }

  async listAlerts(limit = 50, options = {}) {
    const data = await this.read();
    const deviceId = normalizeDeviceId(options.deviceId);
    const alerts = deviceId
      ? data.alerts.filter((alert) => normalizeDeviceId(alert.deviceId) === deviceId)
      : data.alerts;

    return alerts.slice(-limit).reverse();
  }

  async getMetaValue(key, fallback = null) {
    const data = await this.read();
    return data.meta[key] ?? fallback;
  }

  async setMetaValue(key, value) {
    const data = await this.read();
    data.meta = {
      ...data.meta,
      [key]: value
    };
    await this.write(data);
    return value;
  }

  async getQuoteProviderStats() {
    const data = await this.read();
    return buildQuoteProviderStatsSnapshot(data.meta.quoteProviderStats);
  }

  async recordQuoteProviderAttempt(attempt) {
    const data = await this.read();
    data.meta = {
      ...data.meta,
      quoteProviderStats: updateQuoteProviderStats(data.meta.quoteProviderStats, attempt)
    };
    await this.write(data);
    return buildQuoteProviderStatsSnapshot(data.meta.quoteProviderStats);
  }

  async getKisNaverCompareHistory(limit = 20) {
    const data = await this.read();
    return buildKisNaverCompareHistorySnapshot(data.meta.kisNaverCompareHistory, limit);
  }

  async recordKisNaverCompareHistory(entry, options = {}) {
    const data = await this.read();
    data.meta = {
      ...data.meta,
      kisNaverCompareHistory: appendKisNaverCompareHistory(
        data.meta.kisNaverCompareHistory,
        entry,
        { limit: options.maxEntries || 100 }
      )
    };
    await this.write(data);
    return buildKisNaverCompareHistorySnapshot(
      data.meta.kisNaverCompareHistory,
      options.returnLimit || options.limit || 20
    );
  }

  async appendAlert(alert) {
    const data = await this.read();
    const item = {
      id: randomUUID(),
      ...alert,
      createdAt: alert.createdAt || new Date().toISOString()
    };

    data.alerts.push(item);
    data.alerts = data.alerts.slice(-500);
    await this.write(data);
    return item;
  }

  async createBackup(reason = 'manual') {
    if (!this.backups.enabled) {
      return {
        created: false,
        reason: 'disabled'
      };
    }

    if (!this.dataDir) {
      return {
        created: false,
        reason: 'data_dir_missing'
      };
    }

    await this.ensureReady();
    return createFileBackup(this.dataDir, {
      reason,
      maxBackups: this.backups.maxBackups,
      readSnapshot: () => this.exportBackupSnapshot()
    });
  }

  async listBackups(options = {}) {
    assertBackupDataDir(this.dataDir);
    return listFileBackups(this.dataDir, options);
  }

  async restoreBackup(target, options = {}) {
    assertBackupDataDir(this.dataDir);
    await this.ensureReady();
    return restoreFileBackup(this.dataDir, target, {
      ...options,
      maxBackups: options.maxBackups ?? this.backups.maxBackups,
      readSnapshot: () => this.exportBackupSnapshot(),
      applySnapshot: (snapshot) => this.importBackupSnapshot(snapshot)
    });
  }

  async deleteBackup(target) {
    assertBackupDataDir(this.dataDir);
    return deleteFileBackup(this.dataDir, target);
  }

  async exportBackupSnapshot() {
    return this.read();
  }

  async importBackupSnapshot(snapshot) {
    await this.ensureReady();
    const data = normalizeStoreEnvelope(snapshot);
    await this.writeSnapshot(data);
    return data;
  }

  async close() {
    if (this.ownsQueryClient && typeof this.queryClient?.end === 'function') {
      await this.queryClient.end();
    }

    this.queryClient = null;
    this.ready = null;
    this.ownsQueryClient = false;
  }

  async ensureReady() {
    if (!this.ready) {
      this.ready = this.initialize();
    }

    return this.ready;
  }

  async initialize() {
    await this.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(this.schema)}`);
    await this.query(
      `CREATE TABLE IF NOT EXISTS ${this.qualifiedTableName} (
        key text PRIMARY KEY,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`
    );
    await this.query(
      `INSERT INTO ${this.qualifiedTableName} (key, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO NOTHING`,
      [STORE_ROW_KEY, serializePayload(touchStoreEnvelope(emptyStore))]
    );
  }

  async writeSnapshot(snapshot) {
    await this.query(
      `INSERT INTO ${this.qualifiedTableName} (key, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = now()`,
      [STORE_ROW_KEY, serializePayload(snapshot)]
    );
  }

  async query(sql, params = []) {
    const client = await this.getQueryClient();
    return client.query(sql, params);
  }

  async getQueryClient() {
    if (this.queryClient) {
      return this.queryClient;
    }

    if (!this.databaseUrl) {
      this.unavailable('connect');
    }

    if (typeof this.createPool === 'function') {
      this.queryClient = this.createPool({
        connectionString: this.databaseUrl
      });
      this.ownsQueryClient = typeof this.queryClient?.end === 'function';
      return this.queryClient;
    }

    try {
      const { Pool } = await import('pg');
      this.queryClient = new Pool({
        connectionString: this.databaseUrl
      });
      this.ownsQueryClient = true;
      return this.queryClient;
    } catch (error) {
      throw new Error(
        `Postgres 연결 라이브러리(pg)를 불러오지 못했습니다. npm install pg 후 다시 실행하세요. 원인: ${error.message}`
      );
    }
  }
}

export function createPostgresStoreUnavailableError(method, store) {
  const connectionState =
    store?.databaseUrl || store?.queryClient
      ? 'Postgres 연결 설정은 있습니다.'
      : 'DATABASE_URL 또는 query client가 설정되지 않았습니다.';

  return new Error(
    `PostgresStore.${method}를 실행할 수 없습니다. ${connectionState} 로컬 기본 실행은 STORAGE_ENGINE=json을 사용하세요.`
  );
}

export function maskDatabaseUrl(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  try {
    const url = new URL(text);

    if (url.username) {
      url.username = '***';
    }

    if (url.password) {
      url.password = '***';
    }

    return url.toString();
  } catch {
    return text.replace(/\/\/([^:@/]+)(?::([^@/]*))?@/, '//***:***@');
  }
}

function normalizeQueryClient(options) {
  if (options.queryClient && typeof options.queryClient.query === 'function') {
    return options.queryClient;
  }

  if (options.client && typeof options.client.query === 'function') {
    return options.client;
  }

  if (options.pool && typeof options.pool.query === 'function') {
    return options.pool;
  }

  if (typeof options.query === 'function') {
    return {
      query: options.query
    };
  }

  return null;
}

function normalizeIdentifier(value, label) {
  const text = String(value || '').trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`Postgres ${label} 이름이 올바르지 않습니다: ${text}`);
  }

  return text;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function serializePayload(value) {
  return JSON.stringify(normalizeStoreEnvelope(value));
}

function parsePayload(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value && typeof value === 'object' ? value : emptyStore;
}

function assertBackupDataDir(dataDir) {
  if (!dataDir) {
    throw new Error('PostgresStore 백업 파일 폴더가 설정되지 않았습니다.');
  }
}
