import { STORAGE_ENGINES } from './storageContract.js';

export const POSTGRES_STORE_STAGE = 'scaffold';

export class PostgresStore {
  constructor(options = {}) {
    this.engine = STORAGE_ENGINES.POSTGRES;
    this.databaseUrl = String(options.databaseUrl || '').trim();
    this.schema = String(options.schema || 'public').trim() || 'public';
    this.backups = {
      enabled: Boolean(options.backups?.enabled),
      maxBackups: options.backups?.maxBackups
    };
    this.implementationStage = POSTGRES_STORE_STAGE;
    this.runtimeEnabled = false;
  }

  getConnectionInfo() {
    return {
      engine: this.engine,
      implementationStage: this.implementationStage,
      runtimeEnabled: this.runtimeEnabled,
      configured: Boolean(this.databaseUrl),
      databaseUrl: maskDatabaseUrl(this.databaseUrl),
      schema: this.schema
    };
  }

  unavailable(method) {
    throw createPostgresStoreUnavailableError(method, this);
  }

  async read() {
    this.unavailable('read');
  }

  async write(_data) {
    this.unavailable('write');
  }

  async getDataModelInfo() {
    this.unavailable('getDataModelInfo');
  }

  async createDevice(_input) {
    this.unavailable('createDevice');
  }

  async authenticateDevice(_deviceId, _deviceSecret) {
    this.unavailable('authenticateDevice');
  }

  async upsertDevicePushToken(_deviceId, _input) {
    this.unavailable('upsertDevicePushToken');
  }

  async listDevicePushTokens(_deviceId) {
    this.unavailable('listDevicePushTokens');
  }

  async listStocks(_options) {
    this.unavailable('listStocks');
  }

  async addStock(_input) {
    this.unavailable('addStock');
  }

  async updateStock(_id, _patch, _options) {
    this.unavailable('updateStock');
  }

  async replaceStock(_stock) {
    this.unavailable('replaceStock');
  }

  async deleteStock(_id, _options) {
    this.unavailable('deleteStock');
  }

  async listAlerts(_limit, _options) {
    this.unavailable('listAlerts');
  }

  async getMetaValue(_key, _fallback) {
    this.unavailable('getMetaValue');
  }

  async setMetaValue(_key, _value) {
    this.unavailable('setMetaValue');
  }

  async getQuoteProviderStats() {
    this.unavailable('getQuoteProviderStats');
  }

  async recordQuoteProviderAttempt(_attempt) {
    this.unavailable('recordQuoteProviderAttempt');
  }

  async appendAlert(_alert) {
    this.unavailable('appendAlert');
  }

  async createBackup(_reason) {
    this.unavailable('createBackup');
  }

  async listBackups(_options) {
    this.unavailable('listBackups');
  }

  async restoreBackup(_target, _options) {
    this.unavailable('restoreBackup');
  }

  async deleteBackup(_target) {
    this.unavailable('deleteBackup');
  }

  async exportBackupSnapshot() {
    this.unavailable('exportBackupSnapshot');
  }

  async importBackupSnapshot(_snapshot) {
    this.unavailable('importBackupSnapshot');
  }
}

export function createPostgresStoreUnavailableError(method, store) {
  const connectionState = store?.databaseUrl ? 'DATABASE_URL은 설정되어 있습니다.' : 'DATABASE_URL이 설정되지 않았습니다.';

  return new Error(
    `PostgresStore.${method}는 아직 실행 가능하지 않습니다. 현재 PostgresStore는 저장소 계약 검증용 골격 단계이며, 로컬 실행은 STORAGE_ENGINE=json을 사용해야 합니다. ${connectionState}`
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
