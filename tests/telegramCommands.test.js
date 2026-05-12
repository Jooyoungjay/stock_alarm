import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.js';
import {
  handleTelegramMessage,
  parseAddArgs,
  parseEditArgs,
  pollTelegramCommands
} from '../src/telegramCommands.js';

const config = {
  telegramBotToken: 'token',
  telegramChatId: '5863355323',
  defaultAlertCooldownMinutes: 30,
  quoteTimeoutMs: 1000,
  quoteProviders: 'naver'
};

test('parseAddArgs supports the simple high-drawdown command format', () => {
  const input = parseAddArgs(['336260', '두산퓨얼셀', '88779', '2026-05-11', 'high', '10']);

  assert.equal(input.symbol, '336260');
  assert.equal(input.displayName, '두산퓨얼셀');
  assert.equal(input.purchasePrice, '88779');
  assert.equal(input.purchaseDate, '2026-05-11');
  assert.equal(input.alertType, 'high_drawdown');
  assert.equal(input.thresholdPercent, '10');
});

test('parseAddArgs supports direct target price commands', () => {
  const input = parseAddArgs(['336260', '두산퓨얼셀', '88779', '2026-05-11', 'target', '93000']);

  assert.equal(input.alertType, 'target_price');
  assert.equal(input.targetPrice, '93000');
  assert.equal(input.thresholdPercent, 5);
});

test('parseAddArgs supports keyed quantity commands', () => {
  const input = parseAddArgs([
    'symbol=336260',
    'name=두산퓨얼셀',
    'price=88779',
    'qty=10',
    'date=2026-05-11',
    'type=high',
    'rate=10'
  ]);

  assert.equal(input.symbol, '336260');
  assert.equal(input.quantity, '10');
});

test('parseEditArgs supports alert rule and metadata edits', () => {
  assert.deepEqual(parseEditArgs(['336260', 'high', '8']), {
    query: '336260',
    label: '최고가 대비 하락률',
    patch: {
      alertType: 'high_drawdown',
      thresholdPercent: '8',
      targetPrice: null
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'target', '93000']), {
    query: '336260',
    label: '직접 기준가',
    patch: {
      alertType: 'target_price',
      targetPrice: '93000'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'name', '두산', '퓨얼셀']), {
    query: '336260',
    label: '표시 이름',
    patch: {
      displayName: '두산 퓨얼셀'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'cooldown', '60']), {
    query: '336260',
    label: '반복 알림 간격',
    patch: {
      alertCooldownMinutes: '60'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'qty', '10']), {
    query: '336260',
    label: '보유 수량',
    patch: {
      quantity: '10'
    }
  });
});

test('handleTelegramMessage can add, pause, resume, and delete a stock', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text, sendOptions) => {
      sent.push({ text, chatId: sendOptions.chatId });
    },
    initializeHighFromPurchaseDate: async (_store, _config, stock) => stock
  };

  await handleTelegramMessage(
    store,
    config,
    message('/add 336260 두산퓨얼셀 88779 2026-05-11 loss 5'),
    options
  );

  let stocks = await store.listStocks();
  assert.equal(stocks.length, 1);
  assert.equal(stocks[0].symbol, '336260');
  assert.equal(stocks[0].alertType, 'purchase_loss');
  assert.equal(stocks[0].thresholdPercent, 5);

  await handleTelegramMessage(store, config, message('/pause 336260'), options);
  stocks = await store.listStocks();
  assert.equal(stocks[0].active, false);

  await handleTelegramMessage(store, config, message('/resume 336260'), options);
  stocks = await store.listStocks();
  assert.equal(stocks[0].active, true);

  await handleTelegramMessage(store, config, message('/delete 336260'), options);
  stocks = await store.listStocks();
  assert.equal(stocks.length, 0);
  assert.equal(sent.length, 4);
  assert.equal(sent[0].chatId, config.telegramChatId);
});

test('handleTelegramMessage can edit stock alert settings', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    },
    initializeHighFromPurchaseDate: async (_store, _config, stock) => ({
      ...stock,
      highPrice: Number(stock.purchasePrice || 0) + 100,
      highPriceAt: stock.purchaseDate,
      highPriceSource: 'purchase_price'
    })
  };

  await handleTelegramMessage(
    store,
    config,
    message('/add 336260 두산퓨얼셀 88779 2026-05-11 high 10'),
    options
  );
  await handleTelegramMessage(store, config, message('/edit 336260 loss 5'), options);
  await handleTelegramMessage(store, config, message('/edit 336260 target 93000'), options);
  await handleTelegramMessage(store, config, message('/edit 336260 cooldown 60'), options);
  await handleTelegramMessage(store, config, message('/edit 336260 name 두산 퓨얼셀'), options);

  const stocks = await store.listStocks();
  assert.equal(stocks.length, 1);
  assert.equal(stocks[0].alertType, 'target_price');
  assert.equal(stocks[0].targetPrice, 93000);
  assert.equal(stocks[0].alertCooldownMinutes, 60);
  assert.equal(stocks[0].displayName, '두산 퓨얼셀');
  assert.match(sent.at(-1), /종목 정보를 수정했습니다/);
});

test('pollTelegramCommands stores the next Telegram update offset', async () => {
  const store = await createStore();
  const sent = [];

  const result = await pollTelegramCommands(store, config, {
    fetchTelegramUpdates: async (_config, offset) => {
      assert.equal(offset, null);
      return [
        {
          update_id: 10,
          message: message('/help')
        },
        {
          update_id: 11,
          message: message('/list')
        }
      ];
    },
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    }
  });

  assert.equal(result.processed, 2);
  assert.equal(await store.getMetaValue('telegramUpdateOffset'), 12);
  assert.equal(sent.length, 2);
});

test('handleTelegramMessage supports backup commands', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    },
    createBackup: async () => ({
      created: true,
      name: 'store-20260511-120000-000-telegram-manual-12345678.json',
      size: 2048
    }),
    listBackups: async () => [
      {
        name: 'store-20260511-120000-000-telegram-manual-12345678.json',
        size: 2048,
        createdAt: '2026-05-11T12:00:00.000Z'
      }
    ]
  };

  await handleTelegramMessage(store, config, message('/backup'), options);
  await handleTelegramMessage(store, config, message('/backups'), options);

  assert.match(sent[0], /백업을 생성했습니다/);
  assert.match(sent[0], /2.0 KB/);
  assert.match(sent[1], /최근 백업 1개/);
  assert.match(sent[1], /telegram-manual/);
});

test('handleTelegramMessage supports restore command', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    },
    restoreBackup: async (_dataDir, target, restoreOptions) => {
      assert.equal(target, '1');
      assert.equal(restoreOptions.maxBackups, undefined);
      return {
        restored: true,
        backup: {
          name: 'store-20260511-120000-000-manual-12345678.json'
        },
        safetyBackup: {
          created: true,
          name: 'store-20260511-120001-000-before-restore-87654321.json'
        }
      };
    }
  };

  await handleTelegramMessage(store, config, message('/restore 1'), options);

  assert.match(sent[0], /백업을 복구했습니다/);
  assert.match(sent[0], /복구 전 안전 백업/);
});

async function createStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-test-'));
  return new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30
  });
}

function message(text) {
  return {
    message_id: 1,
    chat: {
      id: config.telegramChatId,
      type: 'private'
    },
    text
  };
}
