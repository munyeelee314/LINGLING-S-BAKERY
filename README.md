# 烘焙工作台

原型（`window.storage`）迁移到 Supabase + Vercel 的正式版本，无需登录，纯静态前端。

## 1. 建 Supabase 项目

1. 去 [supabase.com](https://supabase.com) 新建项目（Region 选 Southeast Asia (Singapore)）
2. 项目建好后，打开左侧 **SQL Editor**，粘贴 [`schema.sql`](./schema.sql) 的全部内容并执行一次
   - 这会建好 5 张表（activities / products / purchases / orders / business_profile），并打开公开读写权限（不需要登录）
3. 打开 **Project Settings → API**，复制：
   - **Project URL**
   - **anon public** key（不是 `service_role`，那个是后台密钥，不能放前端）

## 2. 填入连接信息

编辑 [`config.js`](./config.js)：

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJxxxxxxxx...";
```

保存后本地直接打开 `index.html` 就能测试（或用任意静态服务器 `npx serve .`）。

## 3. 部署到 Vercel

1. 把这个文件夹推到 GitHub（新建一个 repo）
2. 去 [vercel.com](https://vercel.com) → New Project → 选这个 repo → Framework Preset 选 **Other**（纯静态，不需要 build command）→ Deploy
3. 部署完成后打开域名即可使用，数据是所有访问者共用的一份（不分账号，不需要登录）

之后每次改 `config.js` / `index.html` / `app.js` 推到 GitHub，Vercel 会自动重新部署。

## 文件说明

- `index.html` — 页面结构 + 样式（跟原型一致）
- `app.js` — 业务逻辑，数据读写换成了 Supabase JS client（原型里是 `window.storage`）
- `config.js` — Supabase 连接信息（Project URL + anon key，这两个本来就是给前端公开用的，不是密钥）
- `schema.sql` — 建表 + 权限设置，在 Supabase SQL Editor 跑一次即可
