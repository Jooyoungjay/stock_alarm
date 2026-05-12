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
    content = stripBom(await fs.readFile(sourcePath, 'utf8'));
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

export async function restoreBackup(dataDir, target, options = {}) {
  const maxBackups = normalizeBackupLimit(options.maxBackups);
  const backup = await resolveBackup(dataDir, target);
  const content = stripBom(await fs.readFile(backup.path, 'utf8'));

  validateStoreContent(content);

  const safetyBackup =
    options.safetyBackup === false
      ? null
      : await createBackup(dataDir, {
          reason: 'before-restore',
          maxBackups
        });

  const storePath = path.join(dataDir, 'store.json');
  const tempPath = `${storePath}.restore.tmp`;

  await fs.writeFile(tempPath, ensureTrailingNewline(content), 'utf8');
  await fs.rename(tempPath, storePath);

  return {
    restored: true,
    backup,
    safetyBackup
  };
}

export async function resolveBackup(dataDir, target) {
  const rawTarget = String(target || '').trim();

  if (!rawTarget) {
    throw new Error('복구할 백업 파일명 또는 번호를 입력하세요.');
  }

  if (/^\d+$/.test(rawTarget)) {
    const index = Number(rawTarget) - 1;
    const backups = await listBackups(dataDir, { limit: 1000 });

    if (!Number.isInteger(index) || index < 0 || index >= backups.length) {
      throw new Error(`백업 번호를 찾을 수 없습니다: ${rawTarget}`);
    }

    return backups[index];
  }

  if (
    path.isAbsolute(rawTarget) ||
    rawTarget !== path.basename(rawTarget) ||
    rawTarget.includes('..') ||
    !rawTarget.endsWith('.json')
  ) {
    throw new Error('백업 파일명만 입력할 수 있습니다.');
  }

  const backupDir = getBackupDir(dataDir);
  const backupPath = path.join(backupDir, rawTarget);
  const relative = path.relative(backupDir, backupPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('백업 파일명만 입력할 수 있습니다.');
  }

  let stat;

  try {
    stat = await fs.stat(backupPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`백업 파일을 찾을 수 없습니다: ${rawTarget}`);
    }

    throw error;
  }

  if (!stat.isFile()) {
    throw new Error(`백업 파일을 찾을 수 없습니다: ${rawTarget}`);
  }

  return {
    name: rawTarget,
    path: backupPath,
    size: stat.size,
    createdAt: stat.mtime.toISOString(),
    reason: parseBackupReason(rawTarget)
  };
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

function validateStoreContent(content) {
  let data;

  try {
    data = JSON.parse(stripBom(content));
  } catch {
    throw new Error('백업 파일의 JSON 형식이 올바르지 않습니다.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('백업 파일의 데이터 구조가 올바르지 않습니다.');
  }

  if (!Array.isArray(data.stocks)) {
    throw new Error('백업 파일에 stocks 배열이 없습니다.');
  }

  if (!Array.isArray(data.alerts)) {
    throw new Error('백업 파일에 alerts 배열이 없습니다.');
  }

  if (data.meta !== undefined && (!data.meta || typeof data.meta !== 'object' || Array.isArray(data.meta))) {
    throw new Error('백업 파일의 meta 구조가 올바르지 않습니다.');
  }

  return data;
}

function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
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
