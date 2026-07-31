# 绑定正式域名(对外访问)Checklist

当你买了一个正式域名、要对外提供访问时(不再只用 `xxx.vercel.app`),按下面这份清单操作即可。
核心结论:**后台队列(Inngest)不用动**,真正要跟着改的是"发给客户的链接/邮件"那几处。

---

## 0. Inngest 队列:不用改

- serve 路径是相对的 `/api/inngest`,生产域名没有硬编码在代码里。
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` 与域名无关。
- 绑了自定义域名后,`xxx.vercel.app` 依然有效,Vercel 集成继续自动 sync。
- 可选:若想让 Inngest 显式走新域名,去 Inngest 面板 **Apps** 重新 sync 到
  `https://<新域名>/api/inngest`(非必需)。

详见 `docs/deploy-inngest.md`。

---

## 1. 在 Vercel 绑定域名

1. Vercel 项目 → **Settings → Domains** → 添加你买的域名。
2. 按提示在域名注册商处配置 DNS(A / CNAME 记录)。
3. 等待生效,SSL 证书由 Vercel 自动签发。

---

## 2. `NEXT_PUBLIC_APP_URL`(**必须改**)

代码里发给客户的链接就是用它拼的,默认回退是 `http://localhost:3000`。相关位置:

- `app/api/clients/[id]/send-otp/route.ts`
- `app/api/clients/route.ts`
- `app/api/portal/resend/route.ts`

操作:

1. Vercel → **Settings → Environment Variables**
2. 设 `NEXT_PUBLIC_APP_URL = https://<你的域名>`(Environment 勾 **Production**)
3. **Redeploy**

> 不改的话,客户收到的 portal 登录 / OTP 邮件里的链接会指向错误地址(localhost 或旧 URL)。

---

## 3. `RESEND_FROM_EMAIL`(上线发邮件**建议改**)

现在默认从 `onboarding@resend.dev` 发件。正式对外时:

1. 在 [Resend](https://resend.com) 里 **验证你的新域名**(加 DNS 记录:SPF / DKIM)。
2. 把 `RESEND_FROM_EMAIL` 改成你域名下的地址,如
   `Before Tax <noreply@你的域名>`。
3. Redeploy。

好处:邮件更可信、不易进垃圾箱。

---

## 4. 暂时不用管 / 视情况

- **Gmail / Outlook OAuth 回调**(`GOOGLE_REDIRECT_URI` / `MICROSOFT_REDIRECT_URI`):
  目前只在 `.env.example` 和规则文档里出现,**代码还没接**,现在无需改。
  等真正接入邮箱抓取时,再把回调地址在 Google / Microsoft 控制台和环境变量里换成新域名。
- **Supabase Auth**(若 CPA 端登录用到跳转):
  去 Supabase → Authentication → URL Configuration,把新域名加进 **Site URL** 和
  **Redirect URLs**。

---

## 5. 验证

- 浏览器访问 `https://<你的域名>` 能正常打开、HTTPS 生效。
- 给一个测试客户发 OTP,检查邮件里的链接是不是指向**新域名**。
- 上传一个文档,确认后台提取照常(Inngest 面板 **Runs** 有记录)。

---

## 一句话总结

**队列不用动;把域名绑到 Vercel + 改 `NEXT_PUBLIC_APP_URL`(必要)+ 验证 Resend 发件域名(建议)** 就齐了。
