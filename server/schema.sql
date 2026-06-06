-- Run this in Supabase: SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS app_collections (
  name       TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_collections (name, data) VALUES
  ('inventory', '[]'::jsonb),
  ('purchases', '[]'::jsonb),
  ('sales', '[]'::jsonb),
  ('quotations', '[]'::jsonb),
  ('invoices', '[]'::jsonb),
  ('comboTemplates', '[]'::jsonb),
  ('profitLogs', '[]'::jsonb)
ON CONFLICT (name) DO NOTHING;
