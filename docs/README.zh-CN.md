# Illyawish 中文说明

Illyawish 是一个本地 AI 聊天工作区，后端使用 Go，前端使用 React/Vite。本文档是中文主入口，覆盖本地开发、Docker 启动、1Panel 部署，以及在 1Panel 环境下的两种常见启动方式。

## 1. 项目结构与运行约定

- 前端对外入口默认是 `http://localhost:10170`
- 后端只在内部监听 `5721`
- 浏览器始终应该访问前端入口，由前端把 `/api` 反向代理到后端
- 持久化数据保存在项目根目录 `data/` 下

关键运行数据：

- `data/app.json`：应用配置与自动生成的密钥
- `data/aichat.db`：SQLite 数据库
- `data/uploads/`：上传文件目录

首次启动后，后端会自动创建这些运行时文件。

## 2. 功能概览

- 基于 Session 的认证与首用户初始化
- SSE 流式聊天响应
- SQLite 持久化会话与设置
- OpenAI 兼容接口的 Provider 预设管理
- 图片/附件上传与鉴权访问
- 对话归档、置顶、导出、重试、重新生成和编辑

## 3. 前置条件

本地开发需要：

- Go
- Node.js
- `pnpm`

Docker / 服务器部署需要：

- Docker
- Docker Compose
- 具备执行 `docker` 和 `docker compose` 的权限

如果使用 1Panel，还需要：

- 一台可联网的 Linux 服务器
- 已安装 1Panel，或准备执行官方安装脚本
- 如需域名访问，先准备 DNS 解析

## 4. 本地开发

启动后端：

```bash
cd backend
go run ./cmd/server
```

启动前端：

```bash
cd frontend
pnpm install
pnpm dev
```

开发环境默认行为：

- 前端地址：`http://localhost:10170`
- 后端地址：`http://localhost:5721`
- Vite 会把相对 `/api` 请求代理到 `http://localhost:5721`

如果你升级的是旧版本本地数据，并且旧的 `data/aichat.db` 不包含 conversation UUID 支持，只删除 `data/aichat.db` 后再启动后端即可，不要删除 `data/app.json` 和 `data/uploads/`。

## 5. 本地或服务器直接用 Docker Compose 启动

如果你只需要最快速地跑起来，无论是在本地机器还是远程服务器，都可以直接使用仓库自带的 Compose 文件。

获取代码：

```bash
git clone https://github.com/Elari39/Illyawish.git
cd Illyawish
```

启动：

```bash
docker compose up -d --build
```

访问：

```text
http://localhost:10170
```

如果是在远程服务器直启，则把 `localhost` 替换成服务器 IP 或后续反代域名。

常用命令：

```bash
docker compose ps
docker compose logs -f
docker compose down
docker compose up -d --build
```

健康检查：

```bash
curl http://127.0.0.1:10170/api/health
```

如果返回 `{"ok":true}`，说明前后端链路已通。

## 6. 1Panel 部署概览

这个项目适合用 1Panel 承载，但请先理解它的运行模型：

- `frontend` 对外发布宿主机端口 `10170`
- `backend` 只在 Docker 内部暴露 `5721`
- 1Panel 网站或浏览器访问入口都应该指向前端，而不是后端
- HTTPS 若由 1Panel 网站层终止，则反向代理目标应始终是 `http://127.0.0.1:10170`

不要把后端端口 `5721` 暴露到公网。

如果服务器尚未安装 1Panel，可参考官方在线安装命令：

```bash
bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"
```

安装完成后可通过 `1pctl user-info` 查看面板地址。

## 7. 1Panel 两种启动方式

### 7.1 编排模式

这是更贴合 1Panel 使用习惯的方式，由 1Panel 托管 Compose 栈。

推荐目录：

```bash
mkdir -p /opt/illyawish
cd /opt/illyawish
git clone https://github.com/Elari39/Illyawish.git .
```

然后在 1Panel 中：

1. 进入 `容器 -> 编排`
2. 点击 `创建`
3. 选择 `路径`
4. 选择 `/opt/illyawish/docker-compose.yml`
5. 保存并启动

首次启动后确认：

- `frontend` 已运行并发布 `10170`
- `backend` 已运行但没有映射到宿主机
- 项目根目录下已生成 `data/app.json`、`data/aichat.db`、`data/uploads/`

如果要配置域名和 HTTPS：

1. 进入 `网站 -> 创建网站`
2. 选择 `反向代理`
3. 域名指向你的站点
4. 反向代理目标填写 `http://127.0.0.1:10170`
5. 申请或上传证书并启用 HTTPS

这里必须代理到前端入口，不能代理到 `5721`。

### 7.2 Git 克隆直启模式

这种方式适合你更习惯通过 SSH、Git 和 shell 直接维护服务，而不是让 1Panel 负责容器编排生命周期。

在服务器上：

```bash
mkdir -p /opt/illyawish
cd /opt/illyawish
git clone https://github.com/Elari39/Illyawish.git .
docker compose up -d --build
```

后续更新：

```bash
cd /opt/illyawish
git pull
docker compose up -d --build
```

这种模式下，你仍然可以使用 1Panel 的网站功能做反向代理和 HTTPS，但不要再把同一套服务重复导入到 `容器 -> 编排` 中管理。

## 8. 反向代理与 HTTPS 注意事项

如果你通过 1Panel 网站或其他受信任的 HTTPS 反向代理，把外部 HTTPS 转成内部 HTTP，再转发给本项目，需要在首次启动后编辑 `data/app.json`：

```json
{
  "trustProxyHeadersForSecureCookies": true
}
```

它的作用是让后端信任 `X-Forwarded-Proto` / `X-Forwarded-Ssl`，从而正确决定 Session Cookie 是否带 `Secure` 标记。

以下场景应保持为 `false`：

- 本地直接通过 `http://localhost:10170` 访问
- 没有受信任反向代理的纯 HTTP 访问

## 9. 配置与持久化说明

所有运行时数据都在项目根目录 `data/` 中，因此无论是本地 Docker、服务器直启，还是 1Panel 编排模式，都应尽量保持项目目录稳定，例如：

```text
/opt/illyawish
```

如果你更换部署目录，请整体迁移整个项目目录，避免 `./data` 内容丢失。

可选配置示例：

```json
{
  "openAIBaseURL": "https://api.openai.com/v1",
  "openAIApiKey": "sk-...",
  "model": "gpt-4.1-mini",
  "bootstrapUsername": "admin",
  "bootstrapPassword": "change-me"
}
```

如果这些字段为空，用户仍然可以在前端 UI 中自行配置 provider 预设。

## 10. 更新、回滚与排错

更新建议：

- 编排模式：先在服务器更新代码，再由 1Panel 管理启停和日志
- Git 克隆直启模式：通过 SSH 执行 `git pull` 和 `docker compose up -d --build`

回滚的基本思路：

- 回到目标 Git 提交
- 重新执行 `docker compose up -d --build`
- 不要删除 `data/`，除非你的任务本身就是处理数据迁移或清库

常见检查命令：

```bash
docker compose ps
docker compose logs -f
curl http://127.0.0.1:10170/api/health
```

常见问题：

1. 域名返回 `502` 或 `504`

通常是反向代理目标填错了，正确值应是 `http://127.0.0.1:10170`。

2. 页面能打开，但接口失败

通常是你绕过了前端入口，或把反代错误指向了 `5721`。

3. 重建后聊天记录丢失

通常是项目目录变更，或 `./data:/data` 对应的数据目录不一致。

4. 后端端口被公网访问

说明某处错误暴露了 `5721`，应立即收回。

5. 不确定该选哪种 1Panel 方式

如果希望全部生命周期在 1Panel 中可见，选“编排模式”；如果更习惯 SSH 和 Git 运维，选“Git 克隆直启模式”。

## 11. 验证命令

- 后端测试：`cd backend && GOCACHE=/tmp/go-build go test ./...`
- 前端检查：`cd frontend && pnpm lint`
- 前端测试：`cd frontend && pnpm test:run`
- 前端构建：`cd frontend && pnpm build`
- Compose 校验：`docker compose config`

## 12. 相关入口

- English: [`../README.md`](../README.md)
- 日本語: [`README.ja-JP.md`](README.ja-JP.md)
- 旧版 1Panel 兼容入口: [`1panel-deploy.zh-CN.md`](1panel-deploy.zh-CN.md)
- 旧版本地 Docker 兼容入口: [`local-docker-run.zh-CN.md`](local-docker-run.zh-CN.md)
