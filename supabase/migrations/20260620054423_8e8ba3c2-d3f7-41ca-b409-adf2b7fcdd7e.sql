CREATE TABLE public.users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  password_hash text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  provider text CHECK (provider IN ('keplr', 'leap', 'metamask')),
  connected boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL
);
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wallet_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('keplr', 'leap', 'metamask')),
  address text NOT NULL,
  balances jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
GRANT ALL ON public.wallet_sessions TO service_role;
ALTER TABLE public.wallet_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX wallet_sessions_user_id_idx ON public.wallet_sessions(user_id);
CREATE INDEX wallet_sessions_address_idx ON public.wallet_sessions(address);

CREATE TABLE public.vouchers (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  token text NOT NULL,
  amount double precision NOT NULL CHECK (amount > 0),
  owner_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'transferred', 'burned')),
  transferred_to text,
  created_at bigint NOT NULL,
  redeemed_at bigint,
  note text
);
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE INDEX vouchers_owner_id_idx ON public.vouchers(owner_id);
CREATE INDEX vouchers_code_idx ON public.vouchers(code);

CREATE TABLE public.transactions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('mint', 'burn', 'swap', 'redeem', 'transfer', 'voucher', 'send', 'lend', 'borrow', 'repay', 'airdrop')),
  token text NOT NULL,
  amount double precision NOT NULL DEFAULT 0,
  from_token text,
  to_token text,
  from_address text,
  to_address text,
  hash text NOT NULL,
  timestamp bigint NOT NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'pending', 'failed'))
);
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX transactions_user_id_idx ON public.transactions(user_id);
CREATE INDEX transactions_timestamp_idx ON public.transactions(timestamp DESC);

CREATE TABLE public.audit_logs (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp bigint NOT NULL
);
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_logs_timestamp_idx ON public.audit_logs(timestamp DESC);
CREATE INDEX audit_logs_user_id_idx ON public.audit_logs(user_id);

CREATE TABLE public.lending_positions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  type text NOT NULL CHECK (type IN ('supply', 'borrow')),
  amount double precision NOT NULL CHECK (amount > 0),
  apy double precision NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
GRANT ALL ON public.lending_positions TO service_role;
ALTER TABLE public.lending_positions ENABLE ROW LEVEL SECURITY;
CREATE INDEX lending_positions_user_id_idx ON public.lending_positions(user_id);