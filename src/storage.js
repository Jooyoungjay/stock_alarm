import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const emptyStore = {
  stocks: [],
  alerts: []
};

async function ensureDataDir(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

function normalizeStock(input, defaults) {
  const now = new Date().toISOString();
  const symbol = String(input.symbol || '').trim().toUpperCase();

  if (!symbol) {
    throw new Error('종목 코드를 입력하세요.');
  }

  const thresholdPercent = Number(input.thresholdPercent);

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new Error('하락률은 0보다 크고 100보다 작은 숫자여야 합니다.');
  }

  const alertCooldownMinutes = Number(
    input.alertCooldownMinutes || defaults.defaultAlertCooldownMinutes
  );

  if (!Number.isFinite(alertCooldownMinutes) || alertCooldownMinutes < 1) {
    throw new Error('반복 알림 간격은 1분 이상이어야 합니다.');
  }

  return {
    id: randomUUID(),
    symbol,
    displayName: String(input.displayName || '').trim(),
    thresholdPercent,
    alertCooldownMinutes,
    active: true,
    highPrice: null,
    highPriceAt: null,
    lastPrice: null,
    lastCheckedAt: null,
    lastCheckStatus: 'pending',
    lastError: '',
    lastErrorAt: null,
    lastAlertAt: null,
    currency: '',
    exchange: '',
    marketState: '',
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now
  };
}

function applyStockPatch(stock, patch) {
  const next = {
    ...stock,
    updatedAt: new Date().toISOString()
  };

  if (patch.displayName !== undefined) {
    next.displayName = String(patch.displayName || '').trim();
  }

  if (patch.notes !== undefined) {
    next.notes = String(patch.notes || '').trim();
  }

  if (patch.thresholdPercent !== undefined) {
    const thresholdPercent = Number(patch.thresholdPercent);

    if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
      throw new Error('하락률은 0보다 크고 100보다 작은 숫자여야 합니다.');
    }

    next.thresholdPercent = thresholdPercent;
  }

  if (patch.alertCooldownMinutes !== undefined) {
    const alertCooldownMinutes = Number(patch.alertCooldownMinutes);

    if (!Number.isFinite(alertCooldownMinutes) || alertCooldownMinutes < 1) {
      throw new Error('반복 알림 간격은 1분 이상이어야 합니다.');
    }

    next.alertCooldownMinutes = alertCooldownMinutes;
  }

  if (patch.active !== undefined) {
    next.active = Boolean(patch.active);
  }

  if (patch.resetHighPrice) {
    next.highPrice = null;
    next.highPriceAt = null;
    next.lastAlertAt = null;
  }

  return next;
}

function normalizeStoredStock(stock) {
  return {
    ...stock,
    lastCheckStatus: stock.lastCheckStatus || (stock.lastCheckedAt ? 'checked' : 'pending'),
    lastError: stock.lastError || '',
    lastErrorAt: stock.lastErrorAt || null
  };
}

export class JsonStore {
  constructor(dataDir, defaults = {}) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'store.json');
    this.defaults = defaults;
    this.ready = ensureDataDir(dataDir);
  }

  async read() {
    await this.ready;
    const data = await readJson(this.filePath, emptyStore);

    return {
      stocks: Array.isArray(data.stocks) ? data.stocks.map(normalizeStoredStock) : [],
      alerts: Array.isArray(data.alerts) ? data.alerts : []
    };
  }

  async write(data) {
    await this.ready;
    await writeJson(this.filePath, data);
  }

  async listStocks() {
    const data = await this.read();
    return data.stocks;
  }

  async addStock(input) {
    const data = await this.read();
    const stock = normalizeStock(input, this.defaults);

    if (data.stocks.some((item) => item.symbol === stock.symbol)) {
      throw new Error('이미 등록된 종목입니다.');
    }

    data.stocks.push(stock);
    await this.write(data);
    return stock;
  }

  async updateStock(id, patch) {
    const data = await this.read();
    const index = data.stocks.findIndex((stock) => stock.id === id);

    if (index === -1) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    const updated = applyStockPatch(data.stocks[index], patch);
    data.stocks[index] = updated;
    await this.write(data);
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

  async deleteStock(id) {
    const data = await this.read();
    const beforeCount = data.stocks.length;
    data.stocks = data.stocks.filter((stock) => stock.id !== id);

    if (data.stocks.length === beforeCount) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    await this.write(data);
  }

  async listAlerts(limit = 50) {
    const data = await this.read();
    return data.alerts.slice(-limit).reverse();
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
}
