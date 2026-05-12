import os from 'node:os';

function normalizeHost(host) {
  return String(host || '').trim();
}

function formatUrlHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function isEveryInterfaceHost(host) {
  return host === '0.0.0.0' || host === '::';
}

export function buildAccessUrls(runtime, networkInterfaces = os.networkInterfaces()) {
  const host = normalizeHost(runtime?.host) || '127.0.0.1';
  const port = Number(runtime?.port);

  if (!Number.isInteger(port) || port <= 0) {
    return {
      local: '',
      lan: []
    };
  }

  const localHost = isEveryInterfaceHost(host) ? '127.0.0.1' : host;
  const lan = isEveryInterfaceHost(host)
    ? Object.values(networkInterfaces)
        .flat()
        .filter((item) => item && item.family === 'IPv4' && !item.internal)
        .map((item) => `http://${formatUrlHost(item.address)}:${port}`)
    : [];

  return {
    local: `http://${formatUrlHost(localHost)}:${port}`,
    lan: [...new Set(lan)]
  };
}
