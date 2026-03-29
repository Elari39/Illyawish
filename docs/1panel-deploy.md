# 1Panel Deployment Guide Moved

The detailed 1Panel deployment guide has been consolidated into the primary language entry documents:

- English project entry: [`../README.md`](../README.md)
- Chinese full guide: [`README.zh-CN.md`](README.zh-CN.md)
- Japanese full guide: [`README.ja-JP.md`](README.ja-JP.md)

For 1Panel-specific instructions, see the sections covering:

- `1Panel Orchestration Mode`
- `Direct Git Clone + Docker Compose`

The deployment facts remain unchanged:

- Public entrypoint: `127.0.0.1:10170` behind reverse proxy
- Backend stays internal on `5721`
- Browser traffic must enter through the frontend, not the backend
