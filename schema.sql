-- 烘焙工作台 数据库 schema
-- 在 Supabase 项目的 SQL Editor 里粘贴执行一次即可（新建项目后第一步）

create table if not exists activities (
  id text primary key,
  name text not null,
  icon text,
  color text,
  created_at timestamptz default now()
);

create table if not exists products (
  id text primary key,
  activity_id text references activities(id) on delete cascade,
  name text not null,
  price numeric default 0,
  pieces_per_unit integer default 1,
  flavor_options jsonb default '[]'::jsonb,
  note text,
  created_at timestamptz default now()
);

create table if not exists purchases (
  id text primary key,
  activity_id text references activities(id) on delete cascade,
  date date,
  supplier text,
  item text,
  qty numeric default 0,
  unit text,
  unit_price numeric default 0,
  total_cost numeric default 0,
  rmb_unit_price numeric default 0,
  rmb_total numeric default 0,
  items jsonb default '[]'::jsonb,
  note text,
  buyer text,
  is_advance boolean default false,
  repaid boolean default false,
  shop_name text,
  product_link text,
  product_photo text,
  product_pdf text,
  created_at timestamptz default now()
);

create table if not exists purchase_settlements (
  id text primary key,
  activity_id text references activities(id) on delete cascade,
  buyer text,
  purchase_ids jsonb default '[]'::jsonb,
  rmb_total numeric default 0,
  myr_amount numeric default 0,
  needs_repay boolean default false,
  repaid boolean default false,
  note text,
  created_at timestamptz default now()
);

alter table purchase_settlements add column if not exists needs_repay boolean default false;

-- 已经建过表的项目：重新执行下面几行把新栏位补上（新项目会被上面的 create table 直接建好，这几行不会重复出错）
alter table purchases add column if not exists buyer text;
alter table purchases add column if not exists is_advance boolean default false;
alter table purchases add column if not exists repaid boolean default false;
alter table purchases add column if not exists shop_name text;
alter table purchases add column if not exists product_link text;
alter table purchases add column if not exists product_photo text;
alter table purchases add column if not exists currency text default 'MYR';
alter table purchases add column if not exists rmb_unit_price numeric default 0;
alter table purchases add column if not exists rmb_total numeric default 0;
alter table purchases add column if not exists product_pdf text;
alter table purchases add column if not exists items jsonb default '[]'::jsonb;
alter table purchases alter column item drop not null;

create table if not exists orders (
  id text primary key,
  activity_id text references activities(id) on delete cascade,
  invoice_no text,
  customer_name text not null,
  contact_person text,
  phone text,
  items jsonb default '[]'::jsonb,
  total_price numeric default 0,
  order_date date,
  deliver_date date,
  deliver_time text,
  delivery_method text default 'pickup',
  address text,
  note text,
  payment_status text default 'unpaid',
  paid_amount numeric default 0,
  created_at timestamptz default now()
);

create table if not exists business_profile (
  id integer primary key default 1,
  biz_name text,
  reg_no text,
  phone text,
  address text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  terms text,
  qr_image text,
  logo_image text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

-- 不需要登录：用 anon key 直接公开读写（RLS 打开 + 全放行的 policy）
alter table activities enable row level security;
alter table products enable row level security;
alter table purchases enable row level security;
alter table purchase_settlements enable row level security;
alter table orders enable row level security;
alter table business_profile enable row level security;

create policy "public read" on activities for select using (true);
create policy "public insert" on activities for insert with check (true);
create policy "public update" on activities for update using (true);
create policy "public delete" on activities for delete using (true);

create policy "public read" on products for select using (true);
create policy "public insert" on products for insert with check (true);
create policy "public update" on products for update using (true);
create policy "public delete" on products for delete using (true);

create policy "public read" on purchases for select using (true);
create policy "public insert" on purchases for insert with check (true);
create policy "public update" on purchases for update using (true);
create policy "public delete" on purchases for delete using (true);

create policy "public read" on purchase_settlements for select using (true);
create policy "public insert" on purchase_settlements for insert with check (true);
create policy "public update" on purchase_settlements for update using (true);
create policy "public delete" on purchase_settlements for delete using (true);

create policy "public read" on orders for select using (true);
create policy "public insert" on orders for insert with check (true);
create policy "public update" on orders for update using (true);
create policy "public delete" on orders for delete using (true);

create policy "public read" on business_profile for select using (true);
create policy "public insert" on business_profile for insert with check (true);
create policy "public update" on business_profile for update using (true);
create policy "public delete" on business_profile for delete using (true);
