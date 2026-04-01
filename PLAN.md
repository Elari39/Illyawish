# Confirmed Bug Fixes Plan

## Summary
将仓库根目录的 `PLAN.md` 整文件替换为本计划，然后按单批次执行 3 个已确认缺陷的修复与验证，不再混入旧的 5 项历史内容。

旧的 5 项计划已作废，不再作为本轮执行依据。

本轮范围固定为：
1. URL 抓取/工具请求的 SSRF 重定向绕过
2. 管理页 workspace policy 跨 tab 提交串值
3. 前端数字输入在编辑中间态产生 `NaN` / `null` 的错误语义

默认策略采用“安全优先扩展修复”：对 URL 请求增加逐跳安全校验；前端以字符串编辑、提交时解析为准；管理页拆分保存链路，避免隐藏状态互相污染。

## Implementation Changes
### 1. 先更新计划文件
- 用新的 3 项修复计划完整替换根目录 `PLAN.md`。
- 明确标注旧 5 项计划作废，不再作为本轮执行依据。

### 2. 后端 URL 安全修复
- 修改 [`backend/internal/network/public_url.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/network/public_url.go) 保留现有公网校验规则，继续作为所有外部 URL 的统一入口。
- 修改 [`backend/internal/agent/tools.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/agent/tools.go) 的请求逻辑，不再信任默认自动重定向。
- 采用“逐跳校验 + 限制最大跳数”的实现：
  - 首次请求前校验原始 URL。
  - 每次 30x 跳转都解析 `Location`，按相对 URL 解析为绝对地址，再次调用 `ValidatePublicHTTPURL`。
  - 任一跳转落到 localhost、私网、保留地址、不可解析地址时立即终止。
  - 最大跳数固定为 5，超过返回错误。
- `rag` 文档 URL 抓取继续复用同一执行器，不新增第二套 HTTP 安全逻辑。
- 对外接口不变；行为变化是“公网 URL 但重定向到内网/保留地址”将被拒绝。

### 3. 管理页 workspace policy 状态隔离
- 修改 [`frontend/src/pages/admin-page/hooks/use-admin-page-data.ts`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/pages/admin-page/hooks/use-admin-page-data.ts)。
- 保留“默认用户策略”和“附件保留策略”两条独立保存链路：
  - `handleSavePolicy` 只提交默认角色/默认配额字段。
  - 新增独立的 `handleSaveAttachmentPolicy`，只提交 retention days。
- 新增独立的附件页 draft，避免附件 tab 直接写 `workspacePolicy` 已保存态。
- 两个保存入口都以“最后一次成功加载/保存的 `workspacePolicy`”为基底组装完整 payload，未编辑字段取已保存值，绝不读取另一个 tab 的未保存草稿。
- 更新 admin attachments / admin policy 组件 props，使它们只消费各自对应的 draft 和保存函数。

### 4. 数字输入改为“字符串编辑，提交时解析”
- 管理页：
  - 继续沿用用户/策略页现有字符串 draft。
  - 将附件 retention days 也改为字符串 draft。
  - 所有管理页数值字段统一通过 helper 解析，非法中间态保持原样显示，不在 `onChange` 时做 `Number(...)`。
- 聊天设置页：
  - 修改 [`frontend/src/pages/chat-page/components/chat-settings-tab.tsx`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/pages/chat-page/components/chat-settings-tab.tsx)。
  - 温度、`maxTokens`、`contextWindowTurns` 改为局部字符串输入状态，和外层数值 draft 分离。
  - 只有输入为空或解析为有效值时，才同步到上层 `chatSettings` 数值状态。
  - 输入为 `-`、`1e`、`1.` 这类中间态时，界面保留原字符串，但不把 `NaN` 写入父状态。
  - 设置面板保存时若存在未解析成功的数字输入，则阻止提交并显示统一错误，而不是把 `NaN` 经过 JSON 变成 `null`。
- 抽公共解析 helper：
  - 可空正整数：给 admin 配额和 retention 用。
  - 可空非负整数 / 可空 0-2 浮点：给 chat settings 用。
- 不改后端 DTO 和接口字段名，只修前端输入语义和提交前校验。

## Interfaces
- 公共 HTTP API 路径不变。
- 外部行为变化：
  - URL 抓取现在会拒绝“安全首跳 + 不安全重定向目标”。
  - 管理页两个 tab 的保存互不挟带对方未保存改动。
  - 聊天设置和管理页数字输入不再把非法中间态静默提交成 `null`。
- 内部接口变化：
  - admin page data hook 新增独立 attachment policy draft / save handler。
  - chat settings tab 需要暴露数字输入有效性到保存流程。

## Test Plan
- 后端：
  - 新增“公网 URL 302 到 `127.0.0.1` 被拒绝”的测试。
  - 新增“公网 URL 302 到保留/私网地址被拒绝”的测试。
  - 新增“公网 URL 逐跳仍为公网时允许成功”的测试。
  - 保持现有 unsafe URL 直连校验测试通过。
- 前端 admin：
  - 新增“在 policy tab 修改默认配额但未保存，再到 attachments tab 保存 retention，不会把默认配额一起提交”的测试。
  - 新增反向场景测试，确保 policy 保存不会带上附件页未保存字符串。
  - 新增 retention days 的非法中间输入测试，验证 UI 不出现 `NaN`，payload 不会静默变 `0` 或 `null`。
- 前端 chat：
  - 新增温度 / `maxTokens` / `contextWindowTurns` 的中间态输入测试，如 `-`、`1e`、空串。
  - 验证保存前非法输入会阻止提交并给出错误。
  - 验证合法输入仍能按原接口提交数值。
- 全量回归：
  - `cd backend && GOCACHE=/tmp/go-build go test ./...`
  - `cd backend && GOCACHE=/tmp/go-build go test -race ./...`
  - `cd frontend && pnpm test:run`
  - `cd frontend && pnpm lint`
  - `cd frontend && pnpm build && pnpm bundle:check`

## Assumptions
- `PLAN.md` 将被整文件替换，而不是追加。
- 本轮只修这 3 个已确认问题，不继续扩展新缺陷。
- URL 安全策略以“允许公网 http/https，逐跳拒绝内网/本机/保留地址，最多 5 次跳转”为默认实现。
- 管理页保留两个独立保存按钮和 tab，不做额外 UI 重构。
