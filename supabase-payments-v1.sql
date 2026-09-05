-- Optional Supabase table for Payment System V1 (KV is used by Worker by default)
create table if not exists payments (
  payment_id text primary key,
  order_id text not null,
  user_id uuid,
  amount numeric not null,
  currency text not null default 'USDT',
  network text not null default 'TRON',
  wallet_address text not null,
  txid text unique,
  status text not null,
  created_at timestamptz default now(),
  submitted_at timestamptz,
  paid_at timestamptz,
  sender_address text,
  blockchain_amount numeric,
  block_number bigint,
  verification_reason text,
  verification_attempts int default 0,
  last_verified_at timestamptz
);
create unique index if not exists payments_txid_uidx on payments (txid) where txid is not null;
