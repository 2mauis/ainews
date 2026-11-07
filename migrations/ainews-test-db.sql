-- 从 src/index.js 的 SQL 语句推断的空库结构，不是生产库导出。
-- 只在新建且为空的 D1 `ainews-test-db` 上执行。不要对生产库执行。
-- 本文件随 PR 提交，但本 PR 不创建数据库，也不执行本文件。

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  note TEXT,
  html_url TEXT,
  source TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source TEXT,
  title TEXT,
  original_title TEXT,
  url TEXT,
  summary_zh TEXT,
  why_it_matters TEXT,
  tags TEXT,
  published_at TEXT,
  raw_key TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS feed_articles (
  id TEXT PRIMARY KEY,
  subscription_id TEXT,
  source TEXT,
  title TEXT,
  original_title TEXT,
  url TEXT,
  summary_zh TEXT,
  why_it_matters TEXT,
  tags TEXT,
  published_at TEXT,
  raw_key TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS run_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
