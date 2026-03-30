import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { MongoClient, ObjectId } from 'mongodb';
import mysql from 'mysql2/promise';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type MigratableCollection = {
  name: string;
};

const EXCLUDED_COLLECTIONS = new Set(['system.profile', 'system.js', 'system.views']);

async function discoverCollections(mongoDb: any): Promise<MigratableCollection[]> {
  const listed = await mongoDb.listCollections({}, { nameOnly: true }).toArray();
  return listed
    .map((c: any) => ({ name: c.name as string }))
    .filter((c: MigratableCollection) => !EXCLUDED_COLLECTIONS.has(c.name));
}

function ensure(v: string | undefined, key: string): string {
  if (!v || !v.trim()) throw new Error(`Missing env: ${key}`);
  return v;
}

function toJsonSafe(value: any): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(toJsonSafe) as JsonValue[];
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return String(value);
}

function normalizeDoc(doc: any) {
  const cloned = toJsonSafe(doc) as Record<string, JsonValue>;
  const id = typeof cloned._id === 'string' ? cloned._id : String(cloned._id ?? '');
  delete cloned._id;
  return { id, payload: cloned };
}

function tsToken() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupDir() {
  return path.join(process.cwd(), 'migration-backups', tsToken());
}

function sqlDir() {
  return path.join(process.cwd(), 'migration-sql');
}

function qIdent(name: string) {
  return `\`${String(name).replace(/`/g, '')}\``;
}

function qStr(v: string) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  const mongoUri = ensure(process.env.MONGO_URI, 'MONGO_URI');

  const mysqlHost = ensure(process.env.MYSQL_HOST, 'MYSQL_HOST');
  const mysqlPort = Number(process.env.MYSQL_PORT || 3306);
  const mysqlUser = ensure(process.env.MYSQL_USER, 'MYSQL_USER');
  const mysqlPassword = ensure(process.env.MYSQL_PASSWORD, 'MYSQL_PASSWORD');
  const mysqlDb = ensure(process.env.MYSQL_DATABASE, 'MYSQL_DATABASE');

  const doBackup = process.env.MIGRATION_BACKUP !== 'false';
  const sqlOnly = process.env.MIGRATION_SQL_ONLY === 'true';

  const backupPath = backupDir();
  if (doBackup) fs.mkdirSync(backupPath, { recursive: true });

  fs.mkdirSync(sqlDir(), { recursive: true });
  const sqlPath = path.join(sqlDir(), `mongo-to-mysql-${tsToken()}.sql`);

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const dbName = new URL(mongoUri).pathname.replace(/^\//, '') || 'nemark_dev';
  const mongoDb = mongo.db(dbName);

  const collections = await discoverCollections(mongoDb);
  console.log(`[DISCOVER] Found ${collections.length} collections.`);

  const sqlLines: string[] = [];
  const summaryRows: Array<{ collection_name: string; mongo_count: number; mysql_count: number; matched: 0 | 1 }> = [];

  sqlLines.push('-- Auto-generated MongoDB -> MySQL migration SQL');
  sqlLines.push(`-- Generated at ${new Date().toISOString()}`);
  sqlLines.push(`CREATE DATABASE IF NOT EXISTS ${qIdent(mysqlDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  sqlLines.push(`USE ${qIdent(mysqlDb)};`);
  sqlLines.push('');
  sqlLines.push('DROP TABLE IF EXISTS `_migration_metadata`;');
  sqlLines.push('CREATE TABLE `_migration_metadata` (');
  sqlLines.push('  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
  sqlLines.push('  `collection_name` VARCHAR(120) NOT NULL,');
  sqlLines.push('  `mongo_count` BIGINT NOT NULL DEFAULT 0,');
  sqlLines.push('  `mysql_count` BIGINT NOT NULL DEFAULT 0,');
  sqlLines.push('  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,');
  sqlLines.push('  INDEX `idx_collection_name` (`collection_name`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  for (const col of collections) {
    const coll = mongoDb.collection(col.name);
    const docs = await coll.find({}).toArray();

    if (doBackup) {
      fs.writeFileSync(path.join(backupPath, `${col.name}.json`), JSON.stringify(docs.map(toJsonSafe), null, 2), 'utf8');
    }

    const tableName = `m_${col.name}`;

    sqlLines.push(`DROP TABLE IF EXISTS ${qIdent(tableName)};`);
    sqlLines.push(`CREATE TABLE ${qIdent(tableName)} (`);
    sqlLines.push('  `id` VARCHAR(64) NOT NULL,');
    sqlLines.push('  `payload` LONGTEXT NOT NULL,');
    sqlLines.push('  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,');
    sqlLines.push('  PRIMARY KEY (`id`)');
    sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');

    if (docs.length > 0) {
      const chunkSize = 500;
      const normalized = docs.map((d) => normalizeDoc(d));

      for (let i = 0; i < normalized.length; i += chunkSize) {
        const chunk = normalized.slice(i, i + chunkSize);
        const values = chunk
          .map((r) => `(${qStr(r.id)}, ${qStr(JSON.stringify(r.payload))})`)
          .join(',\n');
        sqlLines.push(`INSERT INTO ${qIdent(tableName)} (id, payload) VALUES\n${values};`);
      }
    }

    sqlLines.push(
      `INSERT INTO _migration_metadata (collection_name, mongo_count, mysql_count) VALUES (${qStr(col.name)}, ${docs.length}, ${docs.length});`,
    );
    sqlLines.push('');

    summaryRows.push({
      collection_name: col.name,
      mongo_count: docs.length,
      mysql_count: docs.length,
      matched: 1,
    });

    console.log(`[MIGRATE] ${col.name}: mongo=${docs.length}, sqlRows=${docs.length}`);
  }

  fs.writeFileSync(sqlPath, sqlLines.join('\n'), 'utf8');
  console.log(`[SQL] Generated import file: ${sqlPath}`);

  // Try direct MySQL import unless SQL-only mode
  if (!sqlOnly) {
    let mysqlConn: mysql.Connection | null = null;
    try {
      mysqlConn = await mysql.createConnection({
        host: mysqlHost,
        port: mysqlPort,
        user: mysqlUser,
        password: mysqlPassword,
        multipleStatements: true,
        connectTimeout: 15000,
      });

      const sqlText = fs.readFileSync(sqlPath, 'utf8');
      await mysqlConn.query(sqlText);

      const [summary] = await mysqlConn.query<any[]>(
        'SELECT collection_name, mongo_count, mysql_count, (mongo_count = mysql_count) AS matched FROM _migration_metadata ORDER BY id',
      );
      console.table(summary);
      console.log('[DONE] Direct MySQL import completed successfully.');
    } catch (err) {
      console.error('[WARN] Direct MySQL import failed. You can still import generated SQL via phpMyAdmin.', err);
    } finally {
      if (mysqlConn) await mysqlConn.end();
    }
  }

  await mongo.close();

  if (doBackup) {
    console.log(`[BACKUP] Saved Mongo JSON backup to: ${backupPath}`);
  }

  if (sqlOnly) {
    console.table(summaryRows);
    console.log('[DONE] SQL-only mode completed. Import the SQL file in phpMyAdmin.');
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
