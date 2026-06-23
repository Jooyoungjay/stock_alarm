import { JsonStore } from './storage.js';
import { STORAGE_ENGINES, assertStoreContract } from './storageContract.js';

export function createStore(config, options = {}) {
  const defaults = {
    defaultAlertCooldownMinutes: config.defaultAlertCooldownMinutes,
    backups: {
      enabled: options.backups?.enabled ?? true,
      maxBackups: config.backupRetention
    }
  };

  return assertStoreContract(new JsonStore(config.dataDir, defaults), {
    engine: STORAGE_ENGINES.JSON,
    name: 'JsonStore'
  });
}
