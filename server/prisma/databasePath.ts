import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const prismaDirectory = dirname(fileURLToPath(import.meta.url));

export const defaultDatabasePath = resolve(prismaDirectory, 'dev.db');
export const localDatabasePath = resolve(prismaDirectory, 'dev.db.local');

export function databasePathFromUrl(databaseUrl: string): string | undefined {
  if (!databaseUrl.startsWith('file:')) return undefined;

  if (databaseUrl.startsWith('file://')) {
    return fileURLToPath(databaseUrl);
  }

  return resolve(databaseUrl.slice('file:'.length));
}
