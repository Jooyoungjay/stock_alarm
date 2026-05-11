import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const defaultBackupLimit = 30;

export function getBackupDir(dataDir) {
  return path.join(dataDir, 'backups');
}

export async function createBackup(dataDir, options = {}) {
  const reason = sanitizeReason(options.reason || 'manual');
  const maxBackups = normalizeBackupLimit(options.maxBackups);
  const sourcePath = path.join(dataDir, 'store.json');
  const backupDir = getBackupDir(dataDir);
  const createdAt = new Date();
  const name = `store-${formatBackupTimestamp(createdAt)}-${reason}-${randomUUID().slice(0, 8)}.json`;
  const backupPath = path.join(backupDir, name);

  let content;

  try {
    content = await fs.readFile(sourcePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        created: false,
        reason: 'store_missing'
      };
    }

    throw error;
  }

  JSON.parse(content);
  await fs.mkdir(backupDir, { recursive: true });

  const tempPath = `${backupPath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, backupPath);
  await pruneBackups(dataDir, { maxBackups });

  const stat = await fs.stat(backupPath);

  return {
    created: true,
    name,
    path: backupPath,
    reason,
    size: stat.size,
    createdAt: createdAt.toISOString()
  };
}

export async function listBackups(dataDir, options = {}) {
  const backupDir = getBackupDir(dataDir);
  const limit = normalizeBackupLimit(options.limit || defaultBackupLimit);
  let names;

  try {
    names = await fs.readdir(backupDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const backups = [];

  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }

    const backupPath = path.join(backupDir, name);
    const stat = await fs.stat(backupPath);

    if (!stat.isFile()) {
      continue;
    }

    backups.push({
      name,
      path: backupPath,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      reason: parseBackupReason(name)
    });
  }

  return backups
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function pruneBackups(dataDir, options = {}) {
  const maxBackups = normalizeBackupLimit(options.maxBackups);
  const backups = await listBackups(dataDir, { limit: 10000 });
  const staleBackups = backups.slice(maxBackups);

  await Promise.all(
    staleBackups.map((backup) =>
      fs.unlink(backup.path).catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      })
    )
  );

  return {
    removed: staleBackups.length
  };
}

function normalizeBackupLimit(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    return defaultBackupLimit;
  }

  return number;
}

function sanitizeReason(value) {
  const reason = String(value || 'manual')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return reason || 'manual';
}

function formatBackupTimestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace('Z', '')
    .replace('.', '-');
}

function parseBackupReason(name) {
  const match = name.match(/^store-\d{8}-\d{6}-\d{3}-(.+)-[a-f0-9]{8}\.json$/);

  return match ? match[1] : '';
}
