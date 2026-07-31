# TODO / 待办

本文件记录**已知但还没做**的工作。做完一项就从这里删掉或勾掉，并在对应代码/迁移里落实。

---

## 已完成 ✅

### 1. 内容去重迁移 `006_document_content_dedup.sql` —— 已应用（2026-07-31）
- 把非唯一的 `idx_documents_hash` 换成**部分唯一索引** `uq_documents_hash (tax_year_id, file_hash) WHERE file_hash IS NOT NULL AND extraction_status <> 'failed'`。
- 已在 Supabase SQL Editor 执行。

### 2. `extraction_status` 补 `queued` 枚举 `007_extraction_status_queued.sql` —— 已应用（2026-07-31）
- `ALTER TYPE extraction_status ADD VALUE IF NOT EXISTS 'queued';`
- 已在 Supabase SQL Editor 执行，队列写状态不再报 enum 错。

---

## 已实现，待端到端验证

### 3. 内容去重（前端 SHA-256）
- 已完成：`lib/files.ts#sha256Hex`、上传组件发 `fileHash`、`route.ts` 上传前查重 + 竞态 409、`documents.ts#findDocumentByHash` / `DuplicateDocumentError`。
- 待验证：同一文件二次上传被拦（提示"已上传过…"）；改一个字节后可正常上传；并发双击只入库一条。

### 4. W-2 抽取优化（算术自检 / Box 12 码校验 / 选择性二次通过）
- 已完成：`reconcile-extraction.ts` 的 `applyW2ArithmeticChecks` + `applyBox12CodeValidation`；`run-extraction.ts#warrantsVerification`；`config.ts#selectiveVerify`（`LLM_SELECTIVE_VERIFY`，默认开）。
- 待验证：数值不自洽的 W-2 会被 flag；Box 12 非法码被标记；只有"可疑"文档才触发第二次 LLM 通过。

---

## 推迟做（有设计，未实现）

### 5. 按内容重命名文档（display name）
- 目标：`scan001.pdf` → 可读名，如 `Zhang W-2 Regeneron 2026.pdf`。
- 关键约束：
  - **只改显示名**（`file_name` 或新列 `display_name`），**绝不动 `file_path`**（带 UUID，被下载/去重引用）。
  - 命名发生在**抽取完成之后**（finalize / `persistExtraction`），因为那时才知道 form type、owner、employer/payer、税年。
  - 模板：`{Owner姓} {FormType} {Employer/Payer} {TaxYear}`；素材缺失优雅降级；**低置信度保留原名**。
  - 新增 `original_file_name` 列保存客户原始名（可追溯）。
  - 生成重名时复用去重后缀逻辑（` (2)`）。
- 依赖：置信度门槛（已有 review 阈值）；见 #6 的多表单情况。

### 6. 单个 PDF 内多表单的文档分割（segmentation）
- 场景：一次扫描里既有 W-2 又有 1099，当成一个文件上传。
- 现状：整份当一个文档抽取，无法分别识别/命名/入库。
- 需要：先做页面/表单分割，再对每一份分别分类、抽取、命名。属于比 #5 更底层的能力，单独排期。

---

## 想法 / 待定（未排期）
- 上传前置 DB 行的孤儿清理：`route.ts` 在客户端 PUT 完成前就建了 `documents` 行；PUT 失败会留孤儿 `pending` 行。考虑定时清理或改为上传成功后再建行。
- 服务端哈希复算（方案 B）作为加固：目前信任前端算的 hash；若要防篡改，可在 worker 里下载复算并纠正 `file_hash`。
