import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { MongoClient, ObjectId } from 'mongodb';
import mysql from 'mysql2/promise';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type SummaryRow = {
  entity_name: string;
  mongo_count: number;
  mysql_count: number;
  matched: 0 | 1;
};

const EXCLUDED_COLLECTIONS = new Set(['system.profile', 'system.js', 'system.views']);

function ensure(v: string | undefined, key: string): string {
  if (!v || !v.trim()) throw new Error(`Missing env: ${key}`);
  return v;
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

function qNullable(v: string | null | undefined) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return qStr(v);
}

function qBool(v: any) {
  return v ? '1' : '0';
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

function qJson(v: any) {
  const safe = toJsonSafe(v);
  return qStr(JSON.stringify(safe ?? null));
}

function toId(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof ObjectId) return v.toHexString();
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof v.toString === 'function') return String(v.toString());
  return String(v);
}

function toDateSql(v: any): string {
  if (!v) return 'NULL';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return 'NULL';
  return qStr(d.toISOString().slice(0, 19).replace('T', ' '));
}

function toNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function discoverCollections(mongoDb: any): Promise<string[]> {
  const listed = await mongoDb.listCollections({}, { nameOnly: true }).toArray();
  return listed
    .map((c: any) => String(c.name))
    .filter((name: string) => !EXCLUDED_COLLECTIONS.has(name));
}

async function readCollection(mongoDb: any, available: Set<string>, candidates: string[]): Promise<any[]> {
  const found = candidates.find((n) => available.has(n));
  if (!found) return [];
  return mongoDb.collection(found).find({}).toArray();
}

function pushInserts(sqlLines: string[], table: string, columns: string[], rows: string[][], chunkSize = 500) {
  if (!rows.length) return;
  for (const c of chunk(rows, chunkSize)) {
    const values = c.map((r) => `(${r.join(', ')})`).join(',\n');
    sqlLines.push(`INSERT INTO ${qIdent(table)} (${columns.map(qIdent).join(', ')}) VALUES\n${values};`);
  }
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
  const sqlPath = path.join(sqlDir(), `mongo-to-mysql-relational-${tsToken()}.sql`);

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const dbName = new URL(mongoUri).pathname.replace(/^\//, '') || 'nemark_dev';
  const mongoDb = mongo.db(dbName);

  const collectionNames = await discoverCollections(mongoDb);
  const collectionSet = new Set(collectionNames);
  console.log(`[DISCOVER] Found ${collectionNames.length} collections.`);

  if (doBackup) {
    for (const name of collectionNames) {
      const docs = await mongoDb.collection(name).find({}).toArray();
      fs.writeFileSync(path.join(backupPath, `${name}.json`), JSON.stringify(docs.map(toJsonSafe), null, 2), 'utf8');
    }
  }

  const users = await readCollection(mongoDb, collectionSet, ['users', 'user']);
  const workspaces = await readCollection(mongoDb, collectionSet, ['workspaces', 'workspace']);
  const visitors = await readCollection(mongoDb, collectionSet, ['visitors', 'visitor']);
  const conversations = await readCollection(mongoDb, collectionSet, ['conversations', 'conversation']);
  const messages = await readCollection(mongoDb, collectionSet, ['messages', 'message']);
  const leads = await readCollection(mongoDb, collectionSet, ['leads', 'lead']);
  const subscriptions = await readCollection(mongoDb, collectionSet, ['subscriptions', 'subscription']);
  const invoices = await readCollection(mongoDb, collectionSet, ['invoices', 'invoice']);

  const workspaceMemberRows: string[][] = [];
  const workspaceLabelRows: string[][] = [];
  const leadNoteRows: string[][] = [];

  const sqlLines: string[] = [];
  const summaryRows: SummaryRow[] = [];

  const pushSummary = (entity_name: string, mongo_count: number, mysql_count: number) => {
    summaryRows.push({
      entity_name,
      mongo_count,
      mysql_count,
      matched: mongo_count === mysql_count ? 1 : 0,
    });
  };

  sqlLines.push('-- Auto-generated MongoDB -> MySQL RELATIONAL migration SQL');
  sqlLines.push(`-- Generated at ${new Date().toISOString()}`);
  sqlLines.push(`CREATE DATABASE IF NOT EXISTS ${qIdent(mysqlDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  sqlLines.push(`USE ${qIdent(mysqlDb)};`);
  sqlLines.push('SET NAMES utf8mb4;');
  sqlLines.push('SET FOREIGN_KEY_CHECKS = 0;');
  sqlLines.push('');

  sqlLines.push('DROP TABLE IF EXISTS `_migration_relational_metadata`;');
  sqlLines.push('CREATE TABLE `_migration_relational_metadata` (');
  sqlLines.push('  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
  sqlLines.push('  `entity_name` VARCHAR(120) NOT NULL,');
  sqlLines.push('  `mongo_count` BIGINT NOT NULL DEFAULT 0,');
  sqlLines.push('  `mysql_count` BIGINT NOT NULL DEFAULT 0,');
  sqlLines.push('  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,');
  sqlLines.push('  INDEX `idx_entity_name` (`entity_name`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('DROP TABLE IF EXISTS `r_lead_notes`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_leads`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_messages`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_conversations`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_visitors`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_workspace_labels`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_workspace_members`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_invoices`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_subscriptions`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_workspaces`;');
  sqlLines.push('DROP TABLE IF EXISTS `r_users`;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_users` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `email` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `password_hash` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `name` VARCHAR(255) NOT NULL,');
  sqlLines.push("  `role` VARCHAR(32) NOT NULL DEFAULT 'agent',");
  sqlLines.push('  `avatar_url` VARCHAR(1024) NULL,');
  sqlLines.push('  `is_active` TINYINT(1) NOT NULL DEFAULT 1,');
  sqlLines.push('  `reset_password_token` VARCHAR(255) NULL,');
  sqlLines.push('  `reset_password_expires` DATETIME NULL,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_users_email` (`email`),');
  sqlLines.push('  KEY `idx_r_users_role` (`role`),');
  sqlLines.push('  KEY `idx_r_users_is_active` (`is_active`),');
  sqlLines.push('  KEY `idx_r_users_created_at` (`created_at`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_workspaces` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `name` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `slug` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `logo_url` VARCHAR(1024) NULL,');
  sqlLines.push('  `owner_id` VARCHAR(24) NOT NULL,');
  sqlLines.push("  `plan` VARCHAR(32) NOT NULL DEFAULT 'free',");
  sqlLines.push('  `timezone` VARCHAR(64) NOT NULL,');
  sqlLines.push('  `language` VARCHAR(32) NOT NULL,');
  sqlLines.push('  `business_hours_enabled` TINYINT(1) NOT NULL DEFAULT 0,');
  sqlLines.push('  `business_hours_json` LONGTEXT NULL,');
  sqlLines.push('  `tags_json` LONGTEXT NULL,');
  sqlLines.push('  `is_active` TINYINT(1) NOT NULL DEFAULT 1,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_workspaces_slug` (`slug`),');
  sqlLines.push('  KEY `idx_r_workspaces_owner_id` (`owner_id`),');
  sqlLines.push('  KEY `idx_r_workspaces_active_created` (`is_active`, `created_at`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_workspace_members` (');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `user_id` VARCHAR(24) NOT NULL,');
  sqlLines.push("  `role` VARCHAR(32) NOT NULL DEFAULT 'member',");
  sqlLines.push('  `joined_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`workspace_id`, `user_id`),');
  sqlLines.push('  KEY `idx_r_workspace_members_user_id` (`user_id`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_workspace_labels` (');
  sqlLines.push('  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `name` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `color` VARCHAR(64) NOT NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_workspace_labels_workspace_name` (`workspace_id`, `name`),');
  sqlLines.push('  KEY `idx_r_workspace_labels_workspace_id` (`workspace_id`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_visitors` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `visitor_id` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `widget_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `name` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `email` VARCHAR(255) NULL,');
  sqlLines.push('  `phone` VARCHAR(64) NULL,');
  sqlLines.push('  `first_seen_at` DATETIME NULL,');
  sqlLines.push('  `last_seen_at` DATETIME NULL,');
  sqlLines.push('  `total_conversations` INT NOT NULL DEFAULT 0,');
  sqlLines.push('  `attributes_json` LONGTEXT NULL,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_visitors_visitor_widget` (`visitor_id`, `widget_id`),');
  sqlLines.push('  KEY `idx_r_visitors_workspace_seen` (`workspace_id`, `last_seen_at`),');
  sqlLines.push('  KEY `idx_r_visitors_email_workspace` (`email`, `workspace_id`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_conversations` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `widget_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `visitor_id` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `status` VARCHAR(32) NOT NULL,');
  sqlLines.push('  `priority` VARCHAR(32) NOT NULL,');
  sqlLines.push('  `sla_deadline` DATETIME NULL,');
  sqlLines.push('  `assigned_to` VARCHAR(24) NULL,');
  sqlLines.push('  `tags_json` LONGTEXT NULL,');
  sqlLines.push('  `channel` VARCHAR(64) NOT NULL,');
  sqlLines.push('  `last_message_at` DATETIME NULL,');
  sqlLines.push('  `last_message_snippet` TEXT NULL,');
  sqlLines.push('  `last_sender_type` VARCHAR(32) NULL,');
  sqlLines.push('  `last_sender_name` VARCHAR(255) NULL,');
  sqlLines.push('  `unread_count` INT NOT NULL DEFAULT 0,');
  sqlLines.push('  `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,');
  sqlLines.push('  `visitor_info_json` LONGTEXT NULL,');
  sqlLines.push('  `read_context_json` LONGTEXT NULL,');
  sqlLines.push('  `metadata_json` LONGTEXT NULL,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  KEY `idx_r_conversations_visitor_widget_status` (`visitor_id`, `widget_id`, `status`),');
  sqlLines.push('  KEY `idx_r_conversations_workspace_status_last` (`workspace_id`, `status`, `last_message_at`),');
  sqlLines.push('  KEY `idx_r_conversations_assigned_status` (`assigned_to`, `status`),');
  sqlLines.push('  KEY `idx_r_conversations_widget_created` (`widget_id`, `created_at`),');
  sqlLines.push('  KEY `idx_r_conversations_sla_status` (`sla_deadline`, `status`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_messages` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `conversation_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `client_message_id` VARCHAR(255) NULL,');
  sqlLines.push('  `sender_type` VARCHAR(32) NOT NULL,');
  sqlLines.push('  `sender_id` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `sender_name` VARCHAR(255) NULL,');
  sqlLines.push('  `content` LONGTEXT NULL,');
  sqlLines.push("  `message_type` VARCHAR(32) NOT NULL DEFAULT 'text',");
  sqlLines.push("  `status` VARCHAR(32) NOT NULL DEFAULT 'sent',");
  sqlLines.push('  `reply_to_message_id` VARCHAR(255) NULL,');
  sqlLines.push('  `reply_to_content` TEXT NULL,');
  sqlLines.push('  `reply_to_sender_name` VARCHAR(255) NULL,');
  sqlLines.push('  `edited_at` DATETIME NULL,');
  sqlLines.push('  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,');
  sqlLines.push('  `original_content` LONGTEXT NULL,');
  sqlLines.push('  `attachments_json` LONGTEXT NULL,');
  sqlLines.push('  `sanitize_flags_json` LONGTEXT NULL,');
  sqlLines.push('  `is_internal` TINYINT(1) NOT NULL DEFAULT 0,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_messages_conv_client` (`conversation_id`, `client_message_id`),');
  sqlLines.push('  KEY `idx_r_messages_conversation_created` (`conversation_id`, `created_at`),');
  sqlLines.push('  KEY `idx_r_messages_conversation_created_desc` (`conversation_id`, `created_at` DESC),');
  sqlLines.push('  FULLTEXT KEY `ftx_r_messages_content` (`content`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_leads` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `name` VARCHAR(255) NOT NULL,');
  sqlLines.push('  `phone` VARCHAR(64) NULL,');
  sqlLines.push('  `email` VARCHAR(255) NULL,');
  sqlLines.push('  `avatar` VARCHAR(1024) NULL,');
  sqlLines.push("  `stage` VARCHAR(64) NOT NULL DEFAULT 'mới',");
  sqlLines.push("  `source` VARCHAR(32) NOT NULL DEFAULT 'manual',");
  sqlLines.push('  `tags_json` LONGTEXT NULL,');
  sqlLines.push('  `assigned_to` VARCHAR(24) NULL,');
  sqlLines.push('  `score` INT NOT NULL DEFAULT 0,');
  sqlLines.push('  `zalo_user_id` VARCHAR(255) NULL,');
  sqlLines.push('  `fb_user_id` VARCHAR(255) NULL,');
  sqlLines.push('  `last_contacted_at` DATETIME NULL,');
  sqlLines.push('  `conversation_count` INT NOT NULL DEFAULT 0,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  KEY `idx_r_leads_workspace_stage` (`workspace_id`, `stage`),');
  sqlLines.push('  KEY `idx_r_leads_workspace_source` (`workspace_id`, `source`),');
  sqlLines.push('  KEY `idx_r_leads_workspace_created` (`workspace_id`, `created_at`),');
  sqlLines.push('  KEY `idx_r_leads_workspace_zalo` (`workspace_id`, `zalo_user_id`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_lead_notes` (');
  sqlLines.push('  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,');
  sqlLines.push('  `lead_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `text` LONGTEXT NOT NULL,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `created_by` VARCHAR(24) NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  KEY `idx_r_lead_notes_lead_created` (`lead_id`, `created_at`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_subscriptions` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push("  `plan_id` VARCHAR(64) NOT NULL DEFAULT 'trial',");
  sqlLines.push("  `status` VARCHAR(32) NOT NULL DEFAULT 'active',");
  sqlLines.push('  `current_period_start` DATETIME NULL,');
  sqlLines.push('  `current_period_end` DATETIME NULL,');
  sqlLines.push('  `trial_ends_at` DATETIME NULL,');
  sqlLines.push('  `cancelled_at` DATETIME NULL,');
  sqlLines.push("  `billing_cycle` VARCHAR(32) NOT NULL DEFAULT 'monthly',");
  sqlLines.push('  `metadata_json` LONGTEXT NULL,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_subscriptions_workspace_id` (`workspace_id`),');
  sqlLines.push('  KEY `idx_r_subscriptions_status_period_end` (`status`, `current_period_end`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  sqlLines.push('CREATE TABLE `r_invoices` (');
  sqlLines.push('  `id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `workspace_id` VARCHAR(24) NOT NULL,');
  sqlLines.push('  `invoice_number` VARCHAR(128) NOT NULL,');
  sqlLines.push('  `plan_id` VARCHAR(64) NOT NULL,');
  sqlLines.push('  `amount` DECIMAL(18,2) NOT NULL,');
  sqlLines.push("  `currency` VARCHAR(16) NOT NULL DEFAULT 'VND',");
  sqlLines.push("  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',");
  sqlLines.push("  `billing_cycle` VARCHAR(32) NOT NULL DEFAULT 'monthly',");
  sqlLines.push('  `paid_at` DATETIME NULL,');
  sqlLines.push('  `payment_method` VARCHAR(64) NULL,');
  sqlLines.push('  `payment_reference` VARCHAR(255) NULL,');
  sqlLines.push('  `description` LONGTEXT NULL,');
  sqlLines.push('  `created_at` DATETIME NULL,');
  sqlLines.push('  `updated_at` DATETIME NULL,');
  sqlLines.push('  PRIMARY KEY (`id`),');
  sqlLines.push('  UNIQUE KEY `uniq_r_invoices_invoice_number` (`invoice_number`),');
  sqlLines.push('  KEY `idx_r_invoices_workspace_created` (`workspace_id`, `created_at`)');
  sqlLines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  sqlLines.push('');

  const userRows = users.map((u) => [
    qStr(toId(u._id)),
    qStr(String(u.email ?? '')),
    qStr(String(u.passwordHash ?? '')),
    qStr(String(u.name ?? '')),
    qStr(String(u.role ?? 'agent')),
    qNullable(u.avatarUrl ? String(u.avatarUrl) : null),
    qBool(u.isActive !== false),
    qNullable(u.resetPasswordToken ? String(u.resetPasswordToken) : null),
    toDateSql(u.resetPasswordExpires),
    toDateSql(u.createdAt),
    toDateSql(u.updatedAt),
  ]);
  pushInserts(
    sqlLines,
    'r_users',
    ['id', 'email', 'password_hash', 'name', 'role', 'avatar_url', 'is_active', 'reset_password_token', 'reset_password_expires', 'created_at', 'updated_at'],
    userRows,
  );
  pushSummary('r_users', users.length, userRows.length);

  const workspaceRows = workspaces.map((w) => {
    const members = Array.isArray(w.members) ? w.members : [];
    for (const m of members) {
      workspaceMemberRows.push([
        qStr(toId(w._id)),
        qStr(toId(m?.userId)),
        qStr(String(m?.role ?? 'member')),
        toDateSql(m?.joinedAt),
      ]);
    }

    const labels = Array.isArray(w.labels) ? w.labels : [];
    for (const l of labels) {
      workspaceLabelRows.push([
        qStr(toId(w._id)),
        qStr(String(l?.name ?? '')),
        qStr(String(l?.color ?? '')),
      ]);
    }

    const businessHours = w?.settings?.businessHours ?? null;

    return [
      qStr(toId(w._id)),
      qStr(String(w.name ?? '')),
      qStr(String(w.slug ?? '')),
      qNullable(w.logoUrl ? String(w.logoUrl) : null),
      qStr(toId(w.ownerId)),
      qStr(String(w.plan ?? 'free')),
      qStr(String(w?.settings?.timezone ?? 'Asia/Ho_Chi_Minh')),
      qStr(String(w?.settings?.language ?? 'vi')),
      qBool(Boolean(businessHours?.enabled)),
      qJson(businessHours),
      qJson(Array.isArray(w.tags) ? w.tags : []),
      qBool(w.isActive !== false),
      toDateSql(w.createdAt),
      toDateSql(w.updatedAt),
    ];
  });
  pushInserts(
    sqlLines,
    'r_workspaces',
    ['id', 'name', 'slug', 'logo_url', 'owner_id', 'plan', 'timezone', 'language', 'business_hours_enabled', 'business_hours_json', 'tags_json', 'is_active', 'created_at', 'updated_at'],
    workspaceRows,
  );
  pushSummary('r_workspaces', workspaces.length, workspaceRows.length);

  pushInserts(sqlLines, 'r_workspace_members', ['workspace_id', 'user_id', 'role', 'joined_at'], workspaceMemberRows);
  pushSummary('r_workspace_members', workspaceMemberRows.length, workspaceMemberRows.length);

  pushInserts(sqlLines, 'r_workspace_labels', ['workspace_id', 'name', 'color'], workspaceLabelRows);
  pushSummary('r_workspace_labels', workspaceLabelRows.length, workspaceLabelRows.length);

  const visitorRows = visitors.map((v) => [
    qStr(toId(v._id)),
    qStr(String(v.visitorId ?? '')),
    qStr(toId(v.widgetId)),
    qStr(toId(v.workspaceId)),
    qStr(String(v.name ?? '')),
    qNullable(v.email ? String(v.email) : null),
    qNullable(v.phone ? String(v.phone) : null),
    toDateSql(v.firstSeenAt),
    toDateSql(v.lastSeenAt),
    String(toNumber(v.totalConversations, 0)),
    qJson(v.attributes ?? {}),
    toDateSql(v.createdAt),
    toDateSql(v.updatedAt),
  ]);
  pushInserts(
    sqlLines,
    'r_visitors',
    ['id', 'visitor_id', 'widget_id', 'workspace_id', 'name', 'email', 'phone', 'first_seen_at', 'last_seen_at', 'total_conversations', 'attributes_json', 'created_at', 'updated_at'],
    visitorRows,
  );
  pushSummary('r_visitors', visitors.length, visitorRows.length);

  const conversationRows = conversations.map((c) => [
    qStr(toId(c._id)),
    qStr(toId(c.workspaceId)),
    qStr(toId(c.widgetId)),
    qStr(String(c.visitorId ?? '')),
    qStr(String(c.status ?? 'open')),
    qStr(String(c.priority ?? 'normal')),
    toDateSql(c.slaDeadline),
    qNullable(c.assignedTo ? toId(c.assignedTo) : null),
    qJson(Array.isArray(c.tags) ? c.tags : []),
    qStr(String(c.channel ?? 'widget')),
    toDateSql(c.lastMessageAt),
    qNullable(c.lastMessageSnippet ? String(c.lastMessageSnippet) : null),
    qNullable(c?.lastSender?.type ? String(c.lastSender.type) : null),
    qNullable(c?.lastSender?.name ? String(c.lastSender.name) : null),
    String(toNumber(c.unreadCount, 0)),
    qBool(Boolean(c.isPinned)),
    qJson(c.visitorInfo ?? {}),
    qJson(Array.isArray(c.readContext) ? c.readContext : []),
    qJson(c.metadata ?? null),
    toDateSql(c.createdAt),
    toDateSql(c.updatedAt),
  ]);
  pushInserts(
    sqlLines,
    'r_conversations',
    [
      'id',
      'workspace_id',
      'widget_id',
      'visitor_id',
      'status',
      'priority',
      'sla_deadline',
      'assigned_to',
      'tags_json',
      'channel',
      'last_message_at',
      'last_message_snippet',
      'last_sender_type',
      'last_sender_name',
      'unread_count',
      'is_pinned',
      'visitor_info_json',
      'read_context_json',
      'metadata_json',
      'created_at',
      'updated_at',
    ],
    conversationRows,
  );
  pushSummary('r_conversations', conversations.length, conversationRows.length);

  const messageRows = messages.map((m) => [
    qStr(toId(m._id)),
    qStr(toId(m.conversationId)),
    qNullable(m.clientMessageId ? String(m.clientMessageId) : null),
    qStr(String(m?.sender?.type ?? 'system')),
    qStr(String(m?.sender?.id ?? '')),
    qNullable(m?.sender?.name ? String(m.sender.name) : null),
    qNullable(m.content ? String(m.content) : null),
    qStr(String(m.type ?? 'text')),
    qStr(String(m.status ?? 'sent')),
    qNullable(m?.replyTo?.messageId ? String(m.replyTo.messageId) : null),
    qNullable(m?.replyTo?.content ? String(m.replyTo.content) : null),
    qNullable(m?.replyTo?.senderName ? String(m.replyTo.senderName) : null),
    toDateSql(m.editedAt),
    qBool(Boolean(m.isDeleted)),
    qNullable(m.originalContent ? String(m.originalContent) : null),
    qJson(Array.isArray(m.attachments) ? m.attachments : []),
    qJson(Array.isArray(m.sanitizeFlags) ? m.sanitizeFlags : []),
    qBool(Boolean(m.isInternal)),
    toDateSql(m.createdAt),
    toDateSql(m.updatedAt),
  ]);
  pushInserts(
    sqlLines,
    'r_messages',
    [
      'id',
      'conversation_id',
      'client_message_id',
      'sender_type',
      'sender_id',
      'sender_name',
      'content',
      'message_type',
      'status',
      'reply_to_message_id',
      'reply_to_content',
      'reply_to_sender_name',
      'edited_at',
      'is_deleted',
      'original_content',
      'attachments_json',
      'sanitize_flags_json',
      'is_internal',
      'created_at',
      'updated_at',
    ],
    messageRows,
  );
  pushSummary('r_messages', messages.length, messageRows.length);

  const leadRows = leads.map((l) => {
    const notes = Array.isArray(l.notes) ? l.notes : [];
    for (const n of notes) {
      leadNoteRows.push([
        qStr(toId(l._id)),
        qStr(String(n?.text ?? '')),
        toDateSql(n?.createdAt),
        qNullable(n?.createdBy ? toId(n.createdBy) : null),
      ]);
    }

    return [
      qStr(toId(l._id)),
      qStr(toId(l.workspaceId)),
      qStr(String(l.name ?? '')),
      qNullable(l.phone ? String(l.phone) : null),
      qNullable(l.email ? String(l.email) : null),
      qNullable(l.avatar ? String(l.avatar) : null),
      qStr(String(l.stage ?? 'mới')),
      qStr(String(l.source ?? 'manual')),
      qJson(Array.isArray(l.tags) ? l.tags : []),
      qNullable(l.assignedTo ? toId(l.assignedTo) : null),
      String(toNumber(l.score, 0)),
      qNullable(l.zaloUserId ? String(l.zaloUserId) : null),
      qNullable(l.fbUserId ? String(l.fbUserId) : null),
      toDateSql(l.lastContactedAt),
      String(toNumber(l.conversationCount, 0)),
      toDateSql(l.createdAt),
      toDateSql(l.updatedAt),
    ];
  });
  pushInserts(
    sqlLines,
    'r_leads',
    [
      'id',
      'workspace_id',
      'name',
      'phone',
      'email',
      'avatar',
      'stage',
      'source',
      'tags_json',
      'assigned_to',
      'score',
      'zalo_user_id',
      'fb_user_id',
      'last_contacted_at',
      'conversation_count',
      'created_at',
      'updated_at',
    ],
    leadRows,
  );
  pushSummary('r_leads', leads.length, leadRows.length);

  pushInserts(sqlLines, 'r_lead_notes', ['lead_id', 'text', 'created_at', 'created_by'], leadNoteRows);
  pushSummary('r_lead_notes', leadNoteRows.length, leadNoteRows.length);

  const subscriptionRows = subscriptions.map((s) => [
    qStr(toId(s._id)),
    qStr(toId(s.workspaceId)),
    qStr(String(s.planId ?? 'trial')),
    qStr(String(s.status ?? 'active')),
    toDateSql(s.currentPeriodStart),
    toDateSql(s.currentPeriodEnd),
    toDateSql(s.trialEndsAt),
    toDateSql(s.cancelledAt),
    qStr(String(s.billingCycle ?? 'monthly')),
    qJson(s.metadata ?? {}),
    toDateSql(s.createdAt),
    toDateSql(s.updatedAt),
  ]);
  pushInserts(
    sqlLines,
    'r_subscriptions',
    ['id', 'workspace_id', 'plan_id', 'status', 'current_period_start', 'current_period_end', 'trial_ends_at', 'cancelled_at', 'billing_cycle', 'metadata_json', 'created_at', 'updated_at'],
    subscriptionRows,
  );
  pushSummary('r_subscriptions', subscriptions.length, subscriptionRows.length);

  const invoiceRows = invoices.map((i) => [
    qStr(toId(i._id)),
    qStr(toId(i.workspaceId)),
    qStr(String(i.invoiceNumber ?? '')),
    qStr(String(i.planId ?? '')),
    String(toNumber(i.amount, 0)),
    qStr(String(i.currency ?? 'VND')),
    qStr(String(i.status ?? 'pending')),
    qStr(String(i.billingCycle ?? 'monthly')),
    toDateSql(i.paidAt),
    qNullable(i.paymentMethod ? String(i.paymentMethod) : null),
    qNullable(i.paymentReference ? String(i.paymentReference) : null),
    qNullable(i.description ? String(i.description) : null),
    toDateSql(i.createdAt),
    toDateSql(i.updatedAt),
  ]);
  pushInserts(
    sqlLines,
    'r_invoices',
    ['id', 'workspace_id', 'invoice_number', 'plan_id', 'amount', 'currency', 'status', 'billing_cycle', 'paid_at', 'payment_method', 'payment_reference', 'description', 'created_at', 'updated_at'],
    invoiceRows,
  );
  pushSummary('r_invoices', invoices.length, invoiceRows.length);

  for (const row of summaryRows) {
    sqlLines.push(
      `INSERT INTO _migration_relational_metadata (entity_name, mongo_count, mysql_count) VALUES (${qStr(row.entity_name)}, ${row.mongo_count}, ${row.mysql_count});`,
    );
  }

  sqlLines.push('');
  sqlLines.push('SET FOREIGN_KEY_CHECKS = 1;');

  fs.writeFileSync(sqlPath, sqlLines.join('\n'), 'utf8');
  console.log(`[SQL] Generated relational import file: ${sqlPath}`);

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
        'SELECT entity_name, mongo_count, mysql_count, (mongo_count = mysql_count) AS matched FROM _migration_relational_metadata ORDER BY id',
      );
      console.table(summary);
      console.log('[DONE] Direct MySQL relational import completed successfully.');
    } catch (err) {
      console.error('[WARN] Direct MySQL relational import failed. You can still import generated SQL via phpMyAdmin.', err);
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
    console.log('[DONE] SQL-only relational mode completed. Import the SQL file in phpMyAdmin.');
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
