import { JsonStore } from './storage.js';
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

  throw createUnsupportedStorageError(engine);
}
