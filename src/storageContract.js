export const STORAGE_ENGINES = Object.freeze({
  JSON: 'json',
  POSTGRES: 'postgres'
});

export const STORE_CONTRACT_METHODS = Object.freeze([
  'read',
  'write',
  'getDataModelInfo',
  'createDevice',
  'authenticateDevice',
  'upsertDevicePushToken',
  'listDevicePushTokens',
  'listStocks',
  'addStock',
  'updateStock',
  'replaceStock',
  'deleteStock',
  'listAlerts',
  'getMetaValue',
  'setMetaValue',
  'getQuoteProviderStats',
  'recordQuoteProviderAttempt',
  'appendAlert',
  'createBackup',
  'listBackups',
  'restoreBackup',
  'deleteBackup',
  'exportBackupSnapshot',
  'importBackupSnapshot'
]);

export function normalizeStorageEngine(value) {
  const engine = String(value || STORAGE_ENGINES.JSON).trim().toLowerCase();

  if (Object.values(STORAGE_ENGINES).includes(engine)) {
    return engine;
  }

  throw new Error(
    `지원하지 않는 저장소 엔진입니다: ${engine}. 사용 가능: ${Object.values(STORAGE_ENGINES).join(', ')}`
  );
}

export function assertStoreContract(store, options = {}) {
  const snapshot = getStoreContractSnapshot(store, options);

  if (snapshot.missingMethods.length) {
    throw new Error(
      `${snapshot.name} 저장소가 필수 계약을 만족하지 않습니다: ${snapshot.missingMethods.join(', ')}`
    );
  }

  return store;
}

export function getStoreContractSnapshot(store, options = {}) {
  const name = options.name || store?.constructor?.name || 'UnknownStore';
  const engine = store?.engine || options.engine || 'unknown';
  const methods = STORE_CONTRACT_METHODS.map((method) => ({
    name: method,
    implemented: typeof store?.[method] === 'function'
  }));

  return {
    name,
    engine,
    requiredMethodCount: STORE_CONTRACT_METHODS.length,
    methods,
    missingMethods: methods.filter((method) => !method.implemented).map((method) => method.name),
    ready: methods.every((method) => method.implemented)
  };
}

export function createUnsupportedStorageError(engine) {
  return new Error(
    `STORAGE_ENGINE=${engine} 저장소는 아직 구현되지 않았습니다. 현재 실행 가능한 저장소는 STORAGE_ENGINE=json 입니다.`
  );
}
