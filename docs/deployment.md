# 部署说明

## 1. 环境准备
- 安装 `Node.js 20+`
- 安装 `HBuilderX`

## 2. 初始化项目
```bash
npm install
copy apps\\server\\.env.example apps\\server\\.env
```

填写 `apps/server/.env`：
```env
PORT=3000
JWT_SECRET=replace-with-a-strong-secret
DATABASE_URL="file:./dev.db"
UPLOAD_DIR=uploads
```

## 3. 初始化 SQLite 数据库
```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

执行后会自动生成本地数据库文件：
- `apps/server/prisma/dev.db`

初始化后请根据实际需要创建或重置测试账号，不建议在文档中保留明文账号密码。

## 4. 启动服务
```bash
npm run dev:server
npm run dev:admin
```

## 5. 小程序调试
## 5. Android App 调试
- 用 `HBuilderX` 打开 `apps/miniprogram`
- 修改 `apps/miniprogram/src/utils/config.js`，把地址改成你的电脑局域网 IP 或服务器地址
- Android 真机和后端电脑保持在同一局域网，或改成外网可访问地址
- 在 `HBuilderX` 中选择“运行 -> 运行到手机或模拟器 -> Android”
- 如果要安装到真机，可使用 USB 调试或 `HBuilderX` 云打包生成 `apk`

## 6. 内网穿透建议
- 推荐给后端单独配置固定域名
- 局域网调试可先用 `http://电脑IP:3000`
- 外网访问仍建议使用 `HTTPS`
- Windows 主机要关闭自动休眠
- 定期备份 `apps/server/prisma/dev.db` 和 `uploads/`
