# Illyawish 在 1Panel 上的部署指南

本文介绍如何在 Linux 服务器上通过 1Panel 使用仓库现有的 Docker Compose 结构部署 Illyawish。

仓库地址：

- `https://github.com/Elari39/Illyawish`

## 部署模型

当前项目的 Compose 配置已经符合较适合生产环境的结构：

- `frontend` 对外发布宿主机端口 `10170`
- `backend` 只在 Docker 内部监听 `5721`
- 所有持久化数据都存放在项目根目录的 `data/` 下
- 浏览器请求应始终先进入前端，再由前端把 `/api` 反向代理到后端

因此推荐的 1Panel 架构是：

- 在 `容器 -> 编排` 中导入现有 `docker-compose.yml`
- 在 `网站 -> 反向代理` 中把域名指向 `http://127.0.0.1:10170`
- HTTPS 由 1Panel 网站侧终止

不要将后端端口 `5721` 暴露到公网。

## 1. 准备服务器

如果服务器还没有安装 1Panel，可以使用官方在线安装脚本：

```bash
bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"
```

安装完成后：

- 运行 `1pctl user-info` 获取面板访问地址
- 在防火墙或云服务器安全组中放行 1Panel 面板端口
- 如果准备使用域名，先把域名解析到服务器 IP

官方参考文档：

- `https://1panel.cn/docs/v2/installation/online_installation/`
- `https://1panel.cn/docs/v1/user_manual/containers/compose/`
- `https://1panel.cn/docs/v2/user_manual/websites/website_create/`
- `https://1panel.cn/docs/v2/user_manual/websites/website_config_basic/`

## 2. 将项目上传到固定目录

建议把项目放到固定目录，避免 `./data` 在重建后丢失或迁移位置。

推荐路径：

```bash
mkdir -p /opt/illyawish
cd /opt/illyawish
git clone https://github.com/Elari39/Illyawish.git .
```

如果你是手动上传仓库，也建议最终项目根目录固定为：

```bash
/opt/illyawish
```

这样在 1Panel 中导入的 Compose 文件就是：

```bash
/opt/illyawish/docker-compose.yml
```

## 3. 理解 1Panel 实际会运行什么

当前仓库中的 Compose 行为如下：

- 从 `./backend` 构建 `backend`
- 后端端口 `5721` 只在 Docker 内部可用
- 挂载 `./data:/data`
- 从 `./frontend` 构建 `frontend`
- 前端发布为 `10170:80`
- 前端会等待后端健康检查通过后再启动

这意味着：

- 对外访问入口是前端 `10170`
- 后端不应该单独对外发布
- `data/app.json`、`data/aichat.db` 和 `data/uploads/` 都会保存在项目根目录下

## 4. 在 1Panel 中导入 Compose

在 1Panel 中按下面步骤操作：

1. 进入 `容器 -> 编排`
2. 点击 `创建`
3. 选择 `路径`
4. 选择 `/opt/illyawish/docker-compose.yml`
5. 保存编排
6. 启动该编排

这样 1Panel 就会直接使用仓库现有的 Compose 定义，而不是让你在应用商店里重新手工拼装服务。

## 5. 首次启动后的检查项

启动完成后，在编排详情页确认：

- `frontend` 已运行
- `backend` 已运行
- `frontend` 已发布宿主机端口 `10170`
- `backend` 没有映射到宿主机
- 数据卷正确挂载到了项目根目录 `data/`

首次启动后，后端应该自动生成：

- `data/app.json`
- `data/aichat.db`
- `data/uploads/`

这些文件和目录分别表示：

- `app.json`：自动生成的应用配置和密钥
- `aichat.db`：SQLite 数据库
- `uploads/`：上传文件存储目录

## 6. 访问方式

### 方案 A：直接通过 IP 和端口访问

适合测试、内网或个人使用。

你需要：

- 在防火墙或云服务器安全组中放行 `10170/tcp`
- 访问 `http://服务器IP:10170`

注意：

- 不要开放 `5721`
- 浏览器不应该直接访问后端容器

### 方案 B：通过 1Panel 做域名和 HTTPS

这是更推荐的正式部署方式。

开始前请确认：

- 域名已经解析到服务器
- 1Panel 的网站功能已经可用
- 如有需要，先在 1Panel 中准备好 OpenResty 网站环境

然后在 1Panel 中操作：

1. 进入 `网站 -> 创建网站`
2. 选择 `反向代理`
3. 填写域名，例如 `chat.example.com`
4. 将代理目标设置为 `http://127.0.0.1:10170`
5. 保存网站
6. 进入该网站的基础设置
7. 申请或上传 HTTPS 证书
8. 启用 HTTPS

反向代理目标必须是：

```text
http://127.0.0.1:10170
```

不要代理到：

```text
http://127.0.0.1:5721
```

因为前端容器才是这个项目的正确入口，它既负责提供页面，也负责把 `/api` 转发到后端。如果你把域名直接代理到后端，前端页面会无法正常工作。

## 7. 后续更新方式

后续更新项目时，推荐在服务器上执行：

```bash
cd /opt/illyawish
git pull
docker compose build
docker compose up -d
```

更稳妥的职责分工是：

- 通过 SSH 更新代码
- 通过 1Panel 管理启动、停止、日志和运行状态
- 除非你明确要替换现有编排，否则不要同时在 1Panel 内外频繁重复创建同名 Compose 项目

## 运行约定

部署时请保持以下约定不变：

- 对外入口：前端宿主机端口 `10170`，或 1Panel 网站的 `80/443`
- 后端内部端口：仅 Docker 内部 `5721`
- 持久化路径：项目根目录 `./data`
- 反向代理目标：`http://127.0.0.1:10170`

如果你后续把项目从 `/opt/illyawish` 移动到别的目录，请把整个项目目录一起迁移，这样相对路径 `./data` 才会保留原有数据。

## 验证与排错

推荐在服务器上执行：

```bash
cd /opt/illyawish
docker compose ps
docker compose logs -f
```

还可以额外检查：

- `data/app.json` 是否存在
- `data/uploads/` 是否在上传后产生新文件
- 网站反向代理目标是否仍然是 `127.0.0.1:10170`

常见问题：

1. 域名访问返回 `502` 或 `504`

通常是反向代理目标填错了，改成 `http://127.0.0.1:10170`。

2. 页面能打开但接口请求失败

通常是因为请求绕过了前端入口，或者你把反向代理错误地指向了后端。

3. 重建后聊天记录丢失

通常是项目目录变了，或者 `./data:/data` 挂载错误。数据保存在宿主机项目根目录，不在容器镜像里。

4. 后端端口能被公网直接访问

说明某处错误地暴露了 `5721`。

5. 域名不通但 `IP:10170` 正常

优先检查：

- DNS 解析
- 防火墙或安全组规则
- 网站反向代理目标
- HTTPS 证书状态
