# PLAN.md

## Summary
修复并验证 5 个按优先级排序的问题，执行顺序固定为：
1. RAG 多文件上传原子性
2. URL 知识文档内容与来源失配
3. URL 抓取 SSRF 防护
4. 聊天页知识库切换竞态
5. 管理页数值输入语义错误

实现策略是先补失败测试，再做最小修复，再跑对应模块测试，最后跑受影响的全量校验。优先修后端数据一致性与安全边界，再修前端状态和表单问题，避免前端改完后又被后端行为变化打回。

## Key Changes
### 1. RAG 上传接口改为批量原子提交
- 修改 [`backend/internal/rag/upload_http.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/rag/upload_http.go) 和相关 service 流程，先校验并准备整批文件，再统一落库；任一文件失败时整批不创建任何 `KnowledgeDocument`。
- 如果现有 `KnowledgeDocumentService.CreateDocument` 无法直接支持批量事务，就新增一个仅供上传接口使用的批量创建入口；不要在 handler 里手工做半事务逻辑。
- 保持接口路径不变，但 `/api/knowledge/spaces/:spaceId/documents/upload` 的语义变为“all-or-nothing”。

### 2. URL 文档在仅修改 `sourceUri` 时自动重抓内容
- 修改 [`backend/internal/rag/knowledge_http.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/rag/knowledge_http.go) 和 [`backend/internal/rag/knowledge_document_service.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/rag/knowledge_document_service.go)，当 URL 类型文档更新时：
  - 如果 `sourceUri` 变化且请求未显式提供新内容，则后端自动抓取新 URL 内容。
  - 如果前端发送的是旧内容，不允许无条件覆盖；优先以后端判断“URI 是否变化”为准，避免保存“新 URL + 旧内容”。
- 修改前端知识文档编辑提交流程，URL 模式下当用户只改 `sourceUri` 时，不再盲目回传旧 `content`；让请求表达“请以后端抓取为准”。

### 3. URL 抓取加 SSRF 防护
- 在后端新增 URL 校验层，供创建/更新 URL 文档共用。
- 默认允许 `http` 和 `https`，拒绝：
  - 空 host
  - localhost / loopback
  - 私网、链路本地、保留地址
  - 非法或不可解析 URL
- 校验发生在真正发请求前；不安全 URL 返回 400。
- 对外接口不变，但 `/api/knowledge/spaces/:spaceId/documents` 的 URL 文档创建/更新会新增“unsafe URL”类校验失败。

### 4. 修复聊天页知识库切换竞态
- 修改 [`frontend/src/pages/chat-page/hooks/use-chat-settings-state.ts`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/pages/chat-page/hooks/use-chat-settings-state.ts)，切换逻辑必须以最新 draft 状态为基准，而不是优先读取 `currentConversation` 的旧快照。
- 为并发点击建立明确规则：
  - 本地 UI 立即基于当前 draft 更新。
  - 每次请求只回滚自己引入的变更，不能把后续成功切换一起回滚掉。
  - 服务端返回后仅在响应仍匹配当前预期时同步 `pendingConversation` / draft。
- 不改接口协议，只修前端状态管理。

### 5. 管理页数值输入改为“字符串编辑，提交时解析”
- 修改 [`frontend/src/pages/admin-page/components/admin-users-tab.tsx`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/pages/admin-page/components/admin-users-tab.tsx) 和 [`frontend/src/pages/admin-page/components/admin-policy-tab.tsx`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/pages/admin-page/components/admin-policy-tab.tsx) 和 [`frontend/src/pages/admin-page/admin-page-helpers.ts`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/pages/admin-page/admin-page-helpers.ts)。
- 统一规则：
  - 输入框 state 全程保存字符串，不在 `onChange` 时做 `Number(value)`。
  - 只有提交时才解析。
  - 非法值保持原样显示，并阻止提交或给出一致错误，不再静默变成 `null`、`0` 或 `"NaN"`。
- 创建用户、编辑用户、保存默认策略三条链路都使用同一套解析/校验辅助函数。

## Public APIs / Interfaces
- 保持现有前端路由、主要 TS 类型和后端路径不变。
- 行为变化：
  - `POST /api/knowledge/spaces/:spaceId/documents/upload`：批量上传改为原子提交。
  - URL 文档创建/更新：新增 unsafe URL 校验错误。
  - URL 文档更新：当 `sourceUri` 改变且未显式提供新内容时，后端自动重抓内容。
- 如需新增后端内部 helper 或 service 方法，优先做内部接口，不新增无必要的公开 DTO 字段。

## Test Plan
- 后端 RAG：
  - 新增测试覆盖“批量上传第二个文件失败时，一个文档也不会落库”。
  - 新增测试覆盖“URL 文档仅修改 `sourceUri` 时会抓取新内容，而不是保留旧内容”。
  - 新增测试覆盖“不安全 URL 被拒绝，安全公网 URL 允许继续处理”。
- 前端聊天：
  - 在 `use-chat-settings-state` 测试中新增“连续快速切换两个 knowledge space，最终 draft 和提交 payload 都保留两次变更”。
  - 新增“先后两个请求交错返回/其中一个失败时，不会把后一个成功切换回滚掉”。
- 前端管理页：
  - 在管理页或 helper 测试中新增非法中间输入场景，如 `-`、`1e`、空串、前导空格。
  - 验证 UI 不显示 `"NaN"`，提交 payload 不会把非法值静默转成 `null`。
- 回归验证：
  - `cd backend && GOCACHE=/tmp/go-build go test ./...`
  - `cd backend && GOCACHE=/tmp/go-build go test -race ./...`
  - `cd frontend && pnpm test:run`
  - `cd frontend && pnpm lint`
  - `cd frontend && pnpm build && pnpm bundle:check`

## Assumptions
- 计划文件目标位置是仓库根目录 `PLAN.md`。
- 第一轮不继续扩展新缺陷，只处理这 5 项。
- SSRF 防护默认按“拒绝内网/本机，只允许公网 http/https”执行；如果后续产品明确需要抓取内网地址，再单独设计白名单机制。
- 不引入数据库 schema 变更；所有修复应通过事务、校验和状态管理完成。
