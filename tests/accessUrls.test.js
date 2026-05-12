import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccessUrls } from '../src/accessUrls.js';

test('buildAccessUrls returns a local URL for localhost mode', () => {
  const urls = buildAccessUrls({ host: '127.0.0.1', port: 3000 }, {});

  assert.equal(urls.local, 'http://127.0.0.1:3000');
  assert.deepEqual(urls.lan, []);
});

test('buildAccessUrls returns LAN URLs when the server listens on every interface', () => {
  const urls = buildAccessUrls(
    { host: '0.0.0.0', port: 3000 },
    {
      Ethernet: [
        { family: 'IPv4', address: '192.168.0.15', internal: false },
        { family: 'IPv4', address: '127.0.0.1', internal: true }
      ],
      WiFi: [{ family: 'IPv6', address: 'fe80::1', internal: false }]
    }
  );

  assert.equal(urls.local, 'http://127.0.0.1:3000');
  assert.deepEqual(urls.lan, ['http://192.168.0.15:3000']);
});
