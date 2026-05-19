import { JsonStore } from './storage.js';
import { PostgresStore } from './postgresStore.js';
import {
  STORAGE_ENGINES,
  assertStoreContract,
  createUnsupportedStorageError,
  normalizeStorageEngine
} from './storageContract.js';

export function createStore(config, options = {}) {
  const engine = normalizeStorageEngine(config.storageEngine);
  const defaults = {
    defaultAlertCooldownMinutes: config.defaultAlertCooldownMinutes,
    backups: {
      enabled: options.backups?.enabled ?? true,
      maxBackups: config.backupRetention
    }
  };

  if (engine === STORAGE_ENGINES.JSON) {
    return assertStoreContract(new JsonStore(config.dataDir, defaults), {
      engine,
      name: 'JsonStore'
    });
  }

  if (engine === STORAGE_ENGINES.POSTGRES) {
    const store = assertStoreContract(
      new PostgresStore({
        databaseUrl: config.databaseUrl,
        backups: defaults.backups
      }),
      {
        engine,
        name: 'PostgresStore'
      }
    );

    if (options.allowExperimentalPostgres === true) {
      return store;
    }

    throw createPostgresRuntimeDisabledError(store);
  }

  throw createUnsupportedStorageError(engine);
}

function createPostgresRuntimeDisabledError(store) {
  const info = store.getConnectionInfo();
  const databaseState = info.configured ? 'DATABASE_URL 설정됨' : 'DATABASE_URL 미설정';

  return new Error(
    `STORAGE_ENGINE=postgres 저장소는 골격만 준비되어 있고 실제 런타임 전환은 아직 비활성화되어 있습니다. 현재 실행 가능한 저장소는 STORAGE_ENGINE=json 입니다. (${databaseState})`
  );
}
