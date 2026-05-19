export function createFakePostgresClient(options = {}) {
  const rows = new Map();
  const queryLog = [];

  if (options.initialSnapshot) {
    rows.set('store', cloneJson(options.initialSnapshot));
  }

  return {
    rows,
    queryLog,
    async query(text, params = []) {
      const sql = normalizeSql(text);
      queryLog.push({
        sql,
        params: cloneJson(params)
      });

      if (sql.startsWith('CREATE SCHEMA ') || sql.startsWith('CREATE TABLE ')) {
        return {
          rows: [],
          rowCount: 0
        };
      }

      if (sql.startsWith('SELECT payload ')) {
        const payload = rows.get(params[0]);

        return {
          rows: payload === undefined ? [] : [{ payload: cloneJson(payload) }],
          rowCount: payload === undefined ? 0 : 1
        };
      }

      if (sql.startsWith('INSERT INTO ') && sql.includes(' DO NOTHING')) {
        if (!rows.has(params[0])) {
          rows.set(params[0], parsePayload(params[1]));
        }

        return {
          rows: [],
          rowCount: 1
        };
      }

      if (sql.startsWith('INSERT INTO ') && sql.includes(' DO UPDATE ')) {
        rows.set(params[0], parsePayload(params[1]));

        return {
          rows: [],
          rowCount: 1
        };
      }

      throw new Error(`테스트용 Postgres client가 처리하지 못한 SQL입니다: ${sql}`);
    }
  };
}

function normalizeSql(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parsePayload(value) {
  return typeof value === 'string' ? JSON.parse(value) : cloneJson(value);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
