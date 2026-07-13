-- Nocker - Tabelas faltando no schema original
-- Estas tabelas sao usadas por backend/server.py mas nao existiam em
-- supabase_schema.sql nem em open_finance_schema.sql.
--
-- Rode este script no SQL Editor do Supabase (depois de já ter rodado
-- supabase_schema.sql e open_finance_schema.sql).
-- Nota: no projeto "nocker" já em uso, essas tabelas já foram criadas
-- diretamente no banco (e com RLS ativado). Este script serve para
-- recriar o ambiente do zero em outro projeto Supabase, se precisar.

CREATE TABLE IF NOT EXISTS financial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  monthly_income DECIMAL(10, 2) NOT NULL DEFAULT 0,
  monthly_limit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  monthly_limit DECIMAL(10, 2) NOT NULL,
  color TEXT DEFAULT '#16A34A',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, category_name)
);

CREATE TABLE IF NOT EXISTS spending_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('monthly_limit', 'category_limit', 'income_goal')),
  threshold_pct INTEGER NOT NULL CHECK (threshold_pct BETWEEN 1 AND 100),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, type)
);

CREATE TABLE IF NOT EXISTS scanned_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  ocr_text TEXT,
  transaction_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_settings_user_id ON financial_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_category_limits_user_id ON category_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_spending_alerts_user_id ON spending_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_scanned_documents_user_id ON scanned_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_scanned_documents_created_at ON scanned_documents(created_at);

-- Fecha a brecha de seguranca (RLS) nas tabelas do app. O backend usa a
-- service_role key (ignora RLS), e o frontend so usa o Supabase client
-- para autenticacao, nunca para ler/escrever dados diretamente.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanned_documents ENABLE ROW LEVEL SECURITY;
