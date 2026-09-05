-- PAROKH GOLD payments Source of Truth (V1.31)
create table if not exists public.payments (
  payment_id text primary key,
  order_id text not null,
  user_id uuid,
  amount numeric not null,
  currency text not null default 'USDT',
  network text not null default 'TRON',
  wallet_address text not null,
  txid text,
  status text not null,
  created_at timestamptz default now(),
  submitted_at timestamptz,
  paid_at timestamptz,
  sender_address text,
  block_number bigint,
  amount_raw text,
  verification_result text,
  verification_attempts int default 0,
  last_verified_at timestamptz
);

-- unique txid (only when present)
create unique index if not exists payments_txid_unique on public.payments (txid) where txid is not null;

-- optional RLS: service role writes; authenticated read own
alter table public.payments enable row level security;
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (auth.uid() = user_id);
