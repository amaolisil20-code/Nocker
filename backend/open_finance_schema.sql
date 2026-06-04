-- Open Finance schema for Nocker
-- Run this script in Supabase SQL Editor before using Open Finance endpoints.

CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_item_id TEXT,
  last_sync TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_cards (
  id TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  card_brand TEXT NOT NULL,
  limit_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  limit_available DECIMAL(14,2) NOT NULL DEFAULT 0,
  invoice_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Links imported bank transactions to existing transactions table rows.
CREATE TABLE IF NOT EXISTS bank_transaction_links (
  id TEXT PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_user ON bank_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection ON bank_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_bank_cards_connection ON bank_cards(connection_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_links_user ON bank_transaction_links(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_links_account ON bank_transaction_links(bank_account_id);
