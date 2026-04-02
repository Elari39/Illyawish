# Confirmed Bug Review Plan

## Summary
当前根目录 `PLAN.md` 已过期，应整文件替换，不追加旧内容。

现有 `PLAN.md` 中记录的 3 项问题已经在当前仓库实现和测试中落地；本文件只保留这次代码审查确认、但仍未修复的 3 个缺陷。

本次确认基于源码审查和以下已执行验证：
- `cd backend && GOCACHE=/tmp/go-build go test ./...`
- `cd backend && GOCACHE=/tmp/go-build go test -race ./...`
- `cd frontend && pnpm test:run`
- `cd frontend && pnpm lint`
- `cd frontend && pnpm build && pnpm bundle:check`

## Confirmed Findings
### 1. 高优先级: DNS rebinding 仍可绕过当前 SSRF 校验
- 问题描述:
  当前 URL 安全校验会先解析域名并确认解析结果均为公网地址，但真正发起请求时仍使用普通 `client.Do`，没有把“已校验的 IP”绑定到实际连接。若攻击者在校验后重绑 DNS，仍可能把请求导向回环或内网地址。
- 影响范围:
  `agent` URL 抓取和复用同一抓取器的 RAG URL 拉取路径都受影响。
- 源码证据:
  [`backend/internal/network/public_url.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/network/public_url.go#L24) 只负责解析并校验 host。
  [`backend/internal/agent/tools.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/agent/tools.go#L45) 在校验后继续走普通 HTTP 客户端请求。
  [`backend/internal/agent/tools.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/agent/tools.go#L71) 实际连接阶段没有锁定经过校验的目标 IP。
- 建议修复方向:
  将策略从“先校验域名”升级为“逐跳解析并锁定实际拨号 IP”。
  每次首跳和每次重定向都应重新解析目标主机，筛出允许的公网 IP，并让 transport 只连接本次校验通过的 IP。
  TLS 场景保持原始 Host/SNI，不要因为锁定 IP 破坏证书校验。
- 需要补的测试:
  增加“校验后 DNS rebinding 到私网/回环地址仍被拒绝”的测试。
  覆盖首跳请求和重定向后的目标切换两条路径。

### 2. 中高优先级: 登录限流在反向代理部署下会按代理出口聚合
- 问题描述:
  登录限流 key 直接使用 `c.ClientIP()`，但应用初始化时显式关闭了 Gin 的 trusted proxies。这样在反向代理部署下，后端只会看到代理出口地址，多个真实用户会共享同一个限流桶，导致误伤。
- 影响范围:
  所有通过 Nginx、1Panel 或其他反向代理访问的登录流量。
- 源码证据:
  [`backend/internal/app/app.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/app/app.go#L104) 显式调用 `router.SetTrustedProxies(nil)`。
  [`backend/internal/auth/handler.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/auth/handler.go#L67) 使用 `loginAttemptKey(c.ClientIP(), username)` 构造限流键。
  [`backend/internal/auth/rate_limit.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/auth/rate_limit.go#L35) 说明限流桶按 `clientIP + username` 聚合。
  [`README.md`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/README.md#L29) 又把反向代理列为标准部署路径。
- 建议修复方向:
  增加受控 trusted proxies 配置，只信任明确配置的代理网段。
  登录限流应改为基于“可信代理解析后的真实客户端 IP”，而不是无条件使用当前连接来源。
  默认配置保持安全，不允许信任任意 `X-Forwarded-For`。
- 需要补的测试:
  增加“反向代理场景下，不同真实客户端 IP 不共享同一个限流桶”的测试。
  增加“未信任代理时，不使用伪造的转发头”的测试。

### 3. 中优先级: 聊天设置中的 `0` 值被后端静默折叠成 `null`
- 问题描述:
  前端把 `maxTokens` 和 `contextWindowTurns` 定义为可空非负整数，`0` 属于合法输入；但后端在清洗设置时只保留 `> 0` 的值，导致用户保存 `0` 后重新读取会变成 `null`，前后端语义不一致。
- 影响范围:
  全局聊天设置和会话级覆盖设置。
- 源码证据:
  [`frontend/src/lib/numeric-input.ts`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/frontend/src/lib/numeric-input.ts#L32) 允许非负整数输入，因此 `0` 合法。
  [`backend/internal/chat/settings.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/chat/settings.go#L22) 会话设置在 `> 0` 时才持久化整数值。
  [`backend/internal/chat/settings.go`](/home/elaina/workspace/AICoding/ReactGo/Illyawish/backend/internal/chat/settings.go#L57) 全局聊天设置也采用相同逻辑。
- 建议修复方向:
  统一前后端语义，默认选择“既然前端允许 `0`，后端也应保留 `0`”。
  如果产品语义其实不允许 `0`，则必须反向收紧前端校验和文案；本轮默认不采用这一路线。
- 需要补的测试:
  增加“保存 `maxTokens: 0` 与 `contextWindowTurns: 0` 后读取仍为 `0`”的后端回归测试。
  增加对应前端集成测试，确认保存后 UI 不会把 `0` 回显成空值。

## Validation Checklist
- 已完成审查验证:
  `cd backend && GOCACHE=/tmp/go-build go test ./...`
  `cd backend && GOCACHE=/tmp/go-build go test -race ./...`
  `cd frontend && pnpm test:run`
  `cd frontend && pnpm lint`
  `cd frontend && pnpm build && pnpm bundle:check`
- 修复完成后必须重跑:
  `cd backend && GOCACHE=/tmp/go-build go test ./...`
  `cd backend && GOCACHE=/tmp/go-build go test -race ./...`
  `cd frontend && pnpm test:run`
  `cd frontend && pnpm lint`
  `cd frontend && pnpm build && pnpm bundle:check`

## Assumptions
- 根目录 `PLAN.md` 应整文件替换，不是追加。
- 本轮只记录已确认缺陷，不写入证据不足的风险猜测。
- 旧 `PLAN.md` 中的 3 项问题不再保留，因为对应修复已经体现在当前代码与测试中。
