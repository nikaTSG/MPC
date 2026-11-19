import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  constants,
  copyFileSync,
  existsSync,
  linkSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  databasePathFromUrl,
  defaultDatabasePath,
  localDatabasePath,
} from './databasePath.js';

type UpdateResult = {
  ok?: boolean;
  mode?: string;
  plan?: {
    operations?: Array<{ operationClass?: string }>;
  };
  dataLoss?: unknown[];
  accessChanges?: unknown[];
};

type UpdateEvent = {
  kind?: string;
  envelope?: {
    ok?: boolean;
    result?: UpdateResult;
  };
};

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const serverDirectory = resolve(prismaDirectory, '..');
const prismaCli = resolve(serverDirectory, 'node_modules/prisma/dist/prisma.js');

function parseResultEvent(output: string): UpdateResult | undefined {
  const lines = output.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;

    try {
      const event = JSON.parse(line) as UpdateEvent;
      if (event.kind === 'result' && event.envelope?.ok) {
        return event.envelope.result;
      }
    } catch {
      // Prisma emits JSONL progress events and may include non-JSON diagnostics.
    }
  }

  return undefined;
}

function runDatabaseUpdate(databaseUrl: string, preview: boolean): UpdateResult {
  const args = ['db', 'update', '--db', databaseUrl, '--json'];
  if (preview) args.push('--dry-run');

  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: serverDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`Prisma database ${preview ? 'preview' : 'update'} failed: ${detail}`);
  }

  const summary = parseResultEvent(result.stdout);
  if (!summary?.ok) {
    throw new Error(`Prisma database ${preview ? 'preview' : 'update'} returned no successful result.`);
  }

  return summary;
}

function assertAdditiveUpdate(summary: UpdateResult): void {
  const operations = summary.plan?.operations;
  const isAdditive = operations?.every((operation) => operation.operationClass === 'additive');

  if (
    !isAdditive ||
    (summary.dataLoss?.length ?? 0) > 0 ||
    (summary.accessChanges?.length ?? 0) > 0
  ) {
    throw new Error(
      'The default demo database needs a non-additive schema change. Review it manually; MPC did not apply it.',
    );
  }
}

function removeStagingFiles(stagingPath: string): void {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    rmSync(`${stagingPath}${suffix}`, { force: true });
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production') process.exit(0);

const configuredPath = databaseUrl ? databasePathFromUrl(databaseUrl) : undefined;
const isDefaultDatabase =
  !databaseUrl || configuredPath === defaultDatabasePath || configuredPath === localDatabasePath;

if (!isDefaultDatabase || existsSync(localDatabasePath)) process.exit(0);

const stagingName = `dev.db.local-init-${process.pid}-${randomBytes(5).toString('hex')}`;
const stagingPath = resolve(prismaDirectory, stagingName);
const stagingUrl = pathToFileURL(stagingPath).href;

try {
  copyFileSync(defaultDatabasePath, stagingPath, constants.COPYFILE_EXCL);
  chmodSync(stagingPath, 0o600);

  const preview = runDatabaseUpdate(stagingUrl, true);
  assertAdditiveUpdate(preview);

  const applied = runDatabaseUpdate(stagingUrl, false);
  assertAdditiveUpdate(applied);
  if (applied.mode !== 'apply') {
    throw new Error('Prisma did not apply the initial demo database schema update.');
  }

  const sidecars = ['-journal', '-shm', '-wal'];
  if (sidecars.some((suffix) => existsSync(`${stagingPath}${suffix}`))) {
    throw new Error('SQLite left a journal sidecar after setup; the initial database was not published.');
  }

  let published = false;
  try {
    linkSync(stagingPath, localDatabasePath);
    published = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  if (published) {
    process.stdout.write('Initialized the ignored local demo database from the committed seed.\n');
  }
} finally {
  removeStagingFiles(stagingPath);
}
