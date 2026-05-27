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

test('parseAddArgs supports profit retracement commands', () => {
  const input = parseAddArgs(['336260', '두산퓨얼셀', '88779', '2026-05-11', 'profit', '10']);

  assert.equal(input.alertType, 'profit_retracement');
  assert.equal(input.thresholdPercent, '10');
});

test('parseAddArgs supports commands without a purchase date', () => {
  const input = parseAddArgs(['336260', '두산퓨얼셀', '88779', 'profit', '10']);

  assert.equal(input.symbol, '336260');
  assert.equal(input.displayName, '두산퓨얼셀');
  assert.equal(input.purchasePrice, '88779');
  assert.equal(input.purchaseDate, '');
  assert.equal(input.alertType, 'profit_retracement');
  assert.equal(input.thresholdPercent, '10');
});

test('parseAddArgs supports keyed quantity commands', () => {
  const input = parseAddArgs([
    'symbol=336260',
    'name=두산퓨얼셀',
    'price=88779',
    'qty=10',
    'dividend=1200',
    'frequency=quarterly',
    'months=3,6,9,12',
    'date=2026-05-11',
    'market=NX',
    'type=high',
    'rate=10'
  ]);

  assert.equal(input.symbol, '336260');
  assert.equal(input.quantity, '10');
  assert.equal(input.annualDividendPerShare, '1200');
  assert.equal(input.dividendFrequency, 'quarterly');
  assert.equal(input.dividendMonths, '3,6,9,12');
  assert.equal(input.kisMarketDivCode, 'NX');
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

  assert.deepEqual(parseEditArgs(['336260', 'profit', '15']), {
    query: '336260',
    label: '이익금 반납률',
    patch: {
      alertType: 'profit_retracement',
      thresholdPercent: '15',
      targetPrice: null
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

  assert.deepEqual(parseEditArgs(['336260', 'dividend', '1200']), {
    query: '336260',
    label: '주당 연 배당금',
    patch: {
      annualDividendPerShare: '1200'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'dividendfreq', 'quarterly']), {
    query: '336260',
    label: '배당 주기',
    patch: {
      dividendFrequency: 'quarterly'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'dividendmonths', '3,6,9,12']), {
    query: '336260',
    label: '배당 지급월',
    patch: {
      dividendMonths: '3,6,9,12'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'kis', 'NX']), {
    query: '336260',
    label: 'KIS 시장 기준',
    reinitializeHigh: true,
    patch: {
      kisMarketDivCode: 'NX',
      resetHighPrice: true
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'reason', '수소', '밸류체인', '성장']), {
    query: '336260',
    label: '매수 이유',
    patch: {
      investmentReason: '수소 밸류체인 성장'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'goal', '120000']), {
    query: '336260',
    label: '투자 목표가',
    patch: {
      investmentTargetPrice: '120000'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'sell', '분기', '적자', '확대']), {
    query: '336260',
    label: '매도 조건',
    patch: {
      sellCondition: '분기 적자 확대'
    }
  });

  assert.deepEqual(parseEditArgs(['336260', 'review', '2026-08-15']), {
    query: '336260',
    label: '실적 체크일',
    patch: {
      reviewDate: '2026-08-15'
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

test('handleTelegramMessage can report status, snooze alerts, and change position status', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    }
  };

  let stock = await store.addStock({
    symbol: '336260',
    displayName: '두산퓨얼셀',
    purchasePrice: 90000,
    quantity: 3,
    alertType: 'profit_retracement',
    thresholdPercent: 10
  });
  stock = await store.replaceStock({
    ...stock,
    lastPrice: 95000,
    highPrice: 100000,
    highPriceAt: '2026-05-12T00:00:00.000Z',
    currency: 'KRW'
  });

  await handleTelegramMessage(store, config, message('/status 336260'), options);
  assert.match(sent.at(-1), /종목 상태/);
  assert.match(sent.at(-1), /보유중/);
  assert.match(sent.at(-1), /알림: 켜짐/);

  await handleTelegramMessage(store, config, message('/snooze 336260 60'), options);
  let stocks = await store.listStocks();
  assert.equal(stocks[0].active, true);
  assert.ok(stocks[0].alertSnoozedUntil);
  assert.match(sent.at(-1), /일시정지/);

  await handleTelegramMessage(store, config, message('/snooze 336260 clear'), options);
  stocks = await store.listStocks();
  assert.equal(stocks[0].alertSnoozedUntil, null);
  assert.equal(stocks[0].active, true);

  await handleTelegramMessage(store, config, message('/sold 336260'), options);
  stocks = await store.listStocks();
  assert.equal(stocks[0].positionStatus, 'sold');
  assert.equal(stocks[0].active, false);
  assert.match(stocks[0].soldAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(sent.at(-1), /매도 완료/);

  await handleTelegramMessage(store, config, message('/resume 336260'), options);
  assert.match(sent.at(-1), /보유 상태로 바꾼 뒤/);

  await handleTelegramMessage(store, config, message('/watch 336260'), options);
  stocks = await store.listStocks();
  assert.equal(stocks[0].positionStatus, 'watch');
  assert.equal(stocks[0].active, false);
  assert.equal(stocks[0].soldAt, '');

  await handleTelegramMessage(store, config, message('/holding 336260'), options);
  stocks = await store.listStocks();
  assert.equal(stocks[0].positionStatus, 'holding');
  assert.equal(stocks[0].active, true);
  assert.equal(stocks[0].soldAt, '');
  assert.match(sent.at(-1), /보유중/);
  assert.match(sent.at(-1), /알림: 켜짐/);
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

test('handleTelegramMessage can send a risk briefing', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    },
    initializeHighFromPurchaseDate: async (_store, _config, stock) => stock
  };

  let stock = await store.addStock({
    symbol: '336260',
    displayName: '두산퓨얼셀',
    purchasePrice: 90000,
    purchaseDate: '2026-05-11',
    alertType: 'high_drawdown',
    thresholdPercent: 5
  });
  stock = await store.replaceStock({
    ...stock,
    highPrice: 100000,
    highPriceAt: '2026-05-12T00:00:00.000Z',
    lastPrice: 94000,
    lastCheckedAt: '2026-05-13T06:00:00.000Z',
    alertState: 'triggered',
    currency: 'KRW'
  });

  await handleTelegramMessage(store, config, message('/brief'), options);

  assert.match(sent[0], /일일 브리핑/);
  assert.match(sent[0], /위험도 순위/);
  assert.match(sent[0], /두산퓨얼셀/);
  assert.match(sent[0], /알림/);
});

test('handleTelegramMessage can report dividend diagnostics', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    }
  };

  const samsung = await store.addStock({
    symbol: '005930',
    displayName: '삼성전자',
    purchasePrice: 70000,
    quantity: 10,
    annualDividendPerShare: 1200,
    dividendFrequency: 'quarterly',
    dividendMonths: '3,6,9,12'
  });
  await store.replaceStock({
    ...samsung,
    dividendProvider: 'publicdata',
    dividendCurrency: 'KRW',
    lastDividendValue: 300,
    exDividendDate: '2026-03-31T00:00:00.000Z',
    dividendDate: '2026-04-20T00:00:00.000Z',
    dividendLastDiagnostic: {
      checkedAt: '2026-05-12T00:00:00.000Z',
      status: 'updated',
      provider: 'publicdata',
      sourceSymbol: '005930',
      currency: 'KRW',
      annualDividendPerShare: 1200,
      previousAnnualDividendPerShare: 1100,
      lastDividendValue: 300,
      exDividendDate: '2026-03-31T00:00:00.000Z',
      dividendDate: '2026-04-20T00:00:00.000Z',
      attempts: [
        {
          provider: 'publicdata',
          status: 'success',
          annualDividendPerShare: 1200,
          lastDividendValue: 300,
          currency: 'KRW'
        }
      ]
    }
  });

  const preferred = await store.addStock({
    symbol: '33626L',
    displayName: '두산퓨얼셀우',
    purchasePrice: 10000,
    annualDividendPerShare: 500
  });
  await store.replaceStock({
    ...preferred,
    dividendLastError: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
    dividendLastDiagnostic: {
      checkedAt: '2026-05-12T00:05:00.000Z',
      status: 'error',
      error: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
      currency: 'KRW',
      preservedAnnualDividendPerShare: 500,
      attempts: [
        {
          provider: 'publicdata',
          status: 'error',
          error: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'
        },
        {
          provider: 'opendart',
          status: 'error',
          error: '배당 정보를 찾을 수 없습니다.'
        }
      ]
    }
  });

  await handleTelegramMessage(store, config, message('/dividend-status'), options);
  await handleTelegramMessage(store, config, message('/dividend-status 33626L'), options);

  assert.match(sent[0], /배당 API 진단/);
  assert.match(sent[0], /업데이트 1개/);
  assert.match(sent[0], /실패 1개/);
  assert.match(sent[0], /삼성전자/);
  assert.match(sent[0], /두산퓨얼셀우/);
  assert.match(sent[0], /공공데이터 실패/);
  assert.match(sent[1], /배당 API 진단: 두산퓨얼셀우/);
  assert.match(sent[1], /500 KRW 유지/);
  assert.match(sent[1], /Provider 시도/);
  assert.match(sent[1], /OpenDART: 실패/);
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

test('handleTelegramMessage supports backup delete command', async () => {
  const store = await createStore();
  const sent = [];
  const options = {
    sendTelegramMessage: async (_config, text) => {
      sent.push(text);
    },
    deleteBackup: async (_dataDir, target) => {
      assert.equal(target, '1');
      return {
        deleted: true,
        backup: {
          name: 'store-20260511-120000-000-manual-12345678.json'
        }
      };
    }
  };

  await handleTelegramMessage(store, config, message('/delete-backup 1'), options);

  assert.match(sent[0], /백업을 삭제했습니다/);
  assert.match(sent[0], /현재 데이터에는 영향이 없습니다/);
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
