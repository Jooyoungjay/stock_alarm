import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.js';
import {
  handleTelegramMessage,
  parseAddArgs,
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
