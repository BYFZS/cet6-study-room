# 加密同步服务

Worker 使用 Cloudflare D1，应用部署前先应用 `drizzle/0000_sync.sql`。Sites 托管清单需要设置项目 ID 和 `"d1": "DB"`，运行 `node build.mjs` 打包。其他 Worker 服务可以直接以 `worker/index.js` 为入口并绑定 `DB`。自部署时同步修改 Worker 的客户端 Origin、`dist/sync-client.mjs` 里的服务地址，以及 Android WebView 的服务域名。

在项目根目录运行 `node check-sync.mjs`（Node.js 24+），用内存 SQLite 验证一次性配对、加密、并发写入和离线进度合并。测试使用模拟词汇记录。
