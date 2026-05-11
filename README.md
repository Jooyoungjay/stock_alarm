# Stock Alarm

Stock Alarm tracks the highest price after a user registers a stock and sends repeated Telegram sell alerts when the current price drops by a configured percentage from that high.

## Current MVP

- Web dashboard for watched stocks
- Highest-price tracking after registration
- Configurable drawdown percentage per stock
- Repeated Telegram alerts with a cooldown interval
- Manual "check now" action
- Local JSON storage
- Dependency-free Node.js server

## Run Locally

```powershell
Copy-Item .env.example .env
node src/server.js
```

Open:

```text
http://localhost:3000
```

## Telegram Setup

1. Create a bot with Telegram BotFather.
2. Put the bot token in `.env`.
3. Send any message to the bot from your Telegram account.
4. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`.
5. Put the `chat.id` value in `.env`.

Required `.env` values:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## Stock Symbols

The MVP uses Yahoo Finance quote symbols.

- US stocks: `AAPL`, `TSLA`, `NVDA`
- Korea KOSPI examples: `005930.KS`, `000660.KS`
- Korea KOSDAQ examples: `035720.KQ`, `247540.KQ`

For production, replace the quote provider with a licensed market data API.

## Scripts

```powershell
node src/server.js
node --test
```

## Long-Term Goal

- Launch on the Apple App Store and Google Play Store
- Support account-based watchlists and push notifications
- Provide stable stock price data integration
- Add payments, operations dashboards, and production monitoring

## Suggested Build Order

1. Telegram-based MVP
2. Web dashboard for stock and alert management
3. Mobile app with push notifications
4. Store release and operations tooling
