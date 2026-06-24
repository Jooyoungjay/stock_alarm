export function stripLegacyStoreFields(input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const now = options.now || new Date().toISOString();
  const meta =
    source.meta && typeof source.meta === 'object' && !Array.isArray(source.meta)
      ? { ...source.meta }
      : {};
  const schemaVersion = options.schemaVersion ?? meta.schemaVersion ?? 1;

  return {
    stocks: (Array.isArray(source.stocks) ? source.stocks : []).map(stripStockLegacyFields),
    alerts: (Array.isArray(source.alerts) ? source.alerts : []).map(stripAlertLegacyFields),
    meta: {
      ...meta,
      schemaVersion,
      updatedAt: now
    }
  };
}

export function migrateStoreToSchemaV2(input = {}, options = {}) {
  const stripped = stripLegacyStoreFields(input, {
    now: options.now,
    schemaVersion: 2
  });

  return stripped;
}

export function countLegacyStoreFields(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const devices = Array.isArray(source.devices) ? source.devices : [];
  const stocks = Array.isArray(source.stocks) ? source.stocks : [];
  const alerts = Array.isArray(source.alerts) ? source.alerts : [];

  return {
    devices: devices.length,
    pushTokens: devices.reduce(
      (sum, device) => sum + (Array.isArray(device?.pushTokens) ? device.pushTokens.length : 0),
      0
    ),
    stockDeviceIds: stocks.filter((stock) => stock?.deviceId).length,
    alertDeviceIds: alerts.filter((alert) => alert?.deviceId).length,
    pushDeliveryFields: alerts.filter(
      (alert) =>
        alert?.pushDeliveryStatus ||
        alert?.pushDeliveryError ||
        alert?.pushDeliverySent ||
        alert?.pushDeliveryFailed
    ).length
  };
}

function stripStockLegacyFields(stock) {
  if (!stock || typeof stock !== 'object') {
    return stock;
  }

  const { deviceId, ...rest } = stock;
  return rest;
}

function stripAlertLegacyFields(alert) {
  if (!alert || typeof alert !== 'object') {
    return alert;
  }

  const {
    deviceId,
    pushDeliveryStatus,
    pushDeliveryError,
    pushDeliverySent,
    pushDeliveryFailed,
    ...rest
  } = alert;

  return rest;
}
