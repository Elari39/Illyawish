# Illyawish 本地 Docker 运行指南

本文介绍如何在本地机器上通过 Docker Compose 运行 Illyawish，适用于普通 Linux、WSL2 或已经具备 Docker 权限的终端环境。

仓库地址：

- `https://github.com/Elari39/Illyawish`

## 运行方式概览

当前项目的 Docker Compose 约定如下：

- 前端对外发布到本机 `10170`
- 后端只在 Docker 内部监听 `5721`
- 浏览器请求应访问前端入口，由前端把 `/api` 转发到后端
- 所有持久化数据都保存到项目根目录 `data/`

本地运行时请记住：

- 正确访问地址是 `http://localhost:10170`
- 不需要直接访问 `5721`

## 1. 前置条件

开始前请确认：

- 已安装 Docker
- 已安装 Docker Compose
- 当前终端用户有权限执行 `docker` 和 `docker compose`

可先执行：

```bash
docker version
docker compose version
```

如果你在 WSL2 中运行，且遇到 Docker 权限问题，请先确认：

- Docker Desktop 已启动
- 当前 WSL 发行版已启用 Docker Desktop 集成
- 当前用户已具备访问 Docker socket 的权限

## 2. 获取项目并进入目录

如果你还没有项目代码，可以执行：

```bash
git clone https://github.com/Elari39/Illyawish.git
cd Illyawish
```

如果项目已经在本地，只需要进入项目根目录，确保这里能看到：

- `docker-compose.yml`
- `backend/`
- `frontend/`

## 3. 启动项目

在项目根目录执行：

```bash
docker compose up -d --build
```

这条命令会：

- 构建后端镜像
- 构建前端镜像
- 创建并启动 `backend` 和 `frontend` 容器
- 将前端发布到本机 `10170`

启动完成后，在浏览器打开：

```text
http://localhost:10170
```

## 4. 首次启动会生成什么

第一次启动成功后，项目根目录下会自动生成 `data/` 持久化目录，其中通常包括：

- `data/app.json`
- `data/aichat.db`
- `data/uploads/`

它们分别用于：

- `app.json`：应用配置和自动生成的密钥
- `aichat.db`：SQLite 数据库
- `uploads/`：上传文件目录

这些数据保存在宿主机上，不在容器镜像里。

## 5. 如何验证是否运行成功

先查看容器状态：

```bash
docker compose ps
```

正常情况下你会看到：

- `backend` 运行中，并通过健康检查
- `frontend` 运行中

再看运行日志：

```bash
docker compose logs -f
```

你还可以直接验证健康接口：

```bash
curl http://127.0.0.1:10170/api/health
```

如果返回：

```json
{"ok":true}
```

说明前后端链路已经通了。

你也可以在浏览器里直接访问：

```text
http://localhost:10170
```

## 6. 常用运维命令

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

停止容器：

```bash
docker compose down
```

重新启动：

```bash
docker compose up -d
```

重新构建并启动：

```bash
docker compose up -d --build
```

如果只是重启某个服务，也可以执行：

```bash
docker compose restart backend
docker compose restart frontend
```

## 7. 可选配置

如果你想配置服务器级别的 OpenAI 兼容 fallback，可以先启动一次项目，再编辑：

```text
data/app.json
```

例如：

```json
{
  "openAIBaseURL": "https://api.openai.com/v1",
  "openAIApiKey": "sk-...",
  "model": "gpt-4.1-mini"
}
```

如果这些字段留空，用户仍然可以在界面里自行创建 provider preset。

你也可以可选地预置首个管理员账号：

```json
{
  "bootstrapUsername": "admin",
  "bootstrapPassword": "change-me"
}
```

注意：

- `bootstrapUsername` 和 `bootstrapPassword` 必须同时填写
- 不能只填其中一个，否则后端会启动失败

修改 `data/app.json` 后，重启容器使配置生效：

```bash
docker compose restart backend
```

## 8. 常见问题

### 1. 端口 `10170` 被占用

如果启动时报端口占用，说明本机已有其他程序占用了 `10170`。

可以先排查：

```bash
ss -ltnp | grep 10170
```

处理方式：

- 停掉占用该端口的程序
- 或修改 Compose 中前端映射端口后重新启动

### 2. `docker` 命令提示权限不足

常见报错包括：

- `permission denied while trying to connect to the docker daemon socket`

这通常说明当前用户没有 Docker 权限。请先修复本机 Docker 权限，再重新运行。

如果你在 WSL2 中运行，也要确认 Docker Desktop 集成已经打开。

### 3. 浏览器打不开页面

先确认容器是否真的启动成功：

```bash
docker compose ps
docker compose logs -f
```

再检查健康接口：

```bash
curl http://127.0.0.1:10170/api/health
```

如果这里不通，优先检查：

- Docker 是否正常运行
- `frontend` 容器是否已启动
- `backend` 容器是否健康
- 本机 `10170` 是否被防火墙或其他程序影响

### 4. `data/` 目录权限或内容异常

如果后端启动失败，或数据库、上传目录无法正常创建，请检查项目根目录下的：

```text
data/
```

重点确认：

- 目录是否存在
- 当前 Docker 运行用户是否能写入
- `data/app.json` 是否是合法 JSON

如果 `app.json` 被手动改坏，也可能导致后端启动失败。

### 5. 为什么不能直接访问 `5721`

这是正常设计，不是故障。

当前项目中：

- `5721` 只供 Docker 内部网络使用
- 浏览器应该始终访问 `http://localhost:10170`
- `/api` 会由前端 Nginx 自动代理到后端

所以本地使用时，不需要手动访问 `http://localhost:5721`

## 9. 目录与数据说明

本地 Docker 运行时，重要目录和文件如下：

- `docker-compose.yml`：整体编排入口
- `data/app.json`：运行配置和生成密钥
- `data/aichat.db`：SQLite 数据库
- `data/uploads/`：上传文件

删除容器不会自动删除这些宿主机数据，但如果你删除了项目根目录下的 `data/`，对应的数据也会丢失。
