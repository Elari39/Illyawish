# 1Panel 部署说明已迁移

详细的 1Panel 部署内容已经合并到新的主文档入口中：

- 英文入口：[`../README.md`](../README.md)
- 中文完整说明：[`README.zh-CN.md`](README.zh-CN.md)
- 日文完整说明：[`README.ja-JP.md`](README.ja-JP.md)

如需查看 1Panel 相关步骤，请重点阅读：

- `编排模式`
- `Git 克隆直启模式`

部署约定保持不变：

- 反向代理目标是 `http://127.0.0.1:10170`
- 后端 `5721` 仅在容器内部使用
- 浏览器流量必须先进入前端，不能直接指向后端
