# 部署文档提取队列(Inngest)

文档提取（classify + extract + persist）在后台由 **Inngest** 队列执行，所以上传请求会立即返回，
并发/限流/重试都交给 Inngest。本文件记录本地开发与生产部署的步骤。

- 提取入口（被 Inngest 回调）：`app/api/inngest/route.ts`（`runtime=nodejs`，`maxDuration=300`）
- 队列函数（并发/限流/重试配置）：`lib/inngest/functions/process-document.ts`
- 入队点：`app/api/portal/documents/[id]/process/route.ts`（标记 `queued` 后发事件，返回 `202`）

---

## 本地开发

一条命令同时启动 Next.js 和 Inngest Dev Server（无需任何 key）：

```bash
npm run dev
```

- `next dev` → http://localhost:3000
- `inngest-cli dev` → http://localhost:8288 （自动发现 `/api/inngest`）

在 http://localhost:8288 可以看到每次上传触发的任务、重试次数、耗时和日志。

---

## 生产部署（Vercel）

### 方式 A（推荐）：安装 Inngest 的 Vercel 集成

装一次即可，之后 `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` **自动注入 Vercel**，
并且**每次部署自动 sync** 应用，无需手动复制 key。

1. 用 GitHub 登录 Inngest：https://app.inngest.com
2. 打开集成页：https://app.inngest.com/settings/integrations/vercel
3. 点 **Connect / Install**，授权并选择 Vercel 项目（beforetax）
4. 回 Vercel 重新部署一次（或再 push 一次）让变量生效

### 方式 B（手动填 key）

1. **Event Key**：Inngest 面板环境切到 **Production** → 钥匙图标 → **Event Keys**
   （https://app.inngest.com/env/production/manage/keys）→ **+ Create Event Key** → 复制 → `INNGEST_EVENT_KEY`
2. **Signing Key**：**Manage → Signing Key**
   （https://app.inngest.com/env/production/manage/signing-key）→ 复制 → `INNGEST_SIGNING_KEY`
3. Vercel 项目 → **Settings → Environment Variables** 新增这两条（勾 **Production**）→ **Redeploy**
4. 手动 sync 一次：Inngest 面板 **Apps → Sync new app**，填线上地址：
   `https://<你的域名>/api/inngest`

### 验证成功

- 浏览器访问 `https://<你的域名>/api/inngest` 应返回一段 JSON（app 已注册、函数 `process-document` 在列）
- Inngest 面板 **Functions / Runs** 能看到上传触发的任务

---

## 可调参数（环境变量）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `EXTRACTION_CONCURRENCY` | 5 | 同时提取的文档数上限（贴合 OpenAI 速率/成本）|
| `EXTRACTION_THROTTLE_PER_MIN` | 30 | 每分钟启动的提取任务上限 |
| `EXTRACTION_RETRIES` | 3 | 瞬时错误的重试次数（0–20）|
| `LLM_MAX_RETRIES` | 3 | LLM 客户端对 429/5xx/网络错误的退避重试次数 |

---

## 换域名了要改什么？

**代码不用改。** serve 路径是相对的 `/api/inngest`，生产域名没有硬编码在代码里
（`package.json` 里的 `localhost:3000` 只用于本地 dev）。环境变量（两个 key）也和域名无关。

唯一和域名相关的是 **Inngest 用哪个 URL 回调你的 app（App 的 sync URL）**：

- **方式 A（Vercel 集成）**：每次部署会自动重新 sync，通常**无需手动操作**。
  换自定义域名后建议去 Inngest **Apps** 里确认同步到的 URL 仍可访问即可。
- **方式 B（手动 sync）**：需要去 Inngest **Apps** 把 app 重新 sync 到新的
  `https://<新域名>/api/inngest`（旧 URL 若仍可访问，其实也能继续工作）。

> 小结:换域名 = 代码/变量都不动，最多在 Inngest 面板重新 sync 一下新地址(方式 A 一般连这步都自动)。
