# 星冶样品舱部署与鲁班猫4迁移指南

## 1. 文档目的

本文档用于说明当前项目的部署结构、运行方式，以及如何将服务端迁移到鲁班猫4长期运行。

内容包括：

- 项目结构说明
- Windows 本机开发/测试方式
- Android APK 打包方式
- 外网穿透方式
- 为什么 Windows 笔记本不适合长期做服务机
- 为什么鲁班猫4更适合长期运行
- 迁移到鲁班猫4的详细清单

本文档已去除个人信息、设备专属用户名、邮箱、临时公网域名、具体账号密码等敏感信息。

---

## 2. 当前项目结构

项目根目录：

`<项目根目录>`

主要目录：

- `apps/server`
  - `NestJS` 后端服务
  - 负责登录、样品单、工序、附件、权限等 API
- `apps/admin`
  - `Vue 3 + Element Plus` 管理后台
  - 供管理员在浏览器中管理样品、用户、流程
- `apps/miniprogram/src`
  - `uni-app` 移动端项目
  - 当前目标平台为 **Android App**
- `packages/shared`
  - 前后端共享状态、类型定义
- `docs`
  - 项目说明文档

---

## 3. 当前功能状态

### 3.1 已完成功能

- 管理员登录
- 操作员登录
- 样品单创建
- 工序配置
- 工序开始 / 完成
- 样品进度展示
- 图纸附件查看
- 任务按样品聚合展示
- 完成后自动进入“已归档”
- 移动端管理员入口
- 移动端新建样品
- 移动端删除样品
- Android APK 云打包成功
- 外网穿透调试成功

### 3.2 账号说明

当前系统包含两类账号：

- 管理员账号
- 操作员账号

正式交付或上架前，建议：

- 删除测试账号提示
- 重置默认密码
- 为每位正式使用者创建独立账号

---

## 4. 当前本机运行方式

### 4.1 后端

在 Windows PowerShell 中进入项目目录：

```powershell
cd <项目根目录>
npm.cmd run dev:server
```

默认后端地址：

`http://localhost:3000/api`

### 4.2 后台管理端

```powershell
cd <项目根目录>
npm.cmd run dev:admin
```

后台地址：

`http://localhost:5173`

### 4.3 SQLite 数据库

当前数据库文件：

`apps/server/prisma/dev.db`

该文件保存当前系统的核心业务数据。

### 4.4 上传文件目录

图纸等附件默认存放在：

`uploads/`

---

## 5. 当前 Android App 说明

### 5.1 移动端源码目录

`apps/miniprogram/src`

### 5.2 App 名称

当前 App 名称：

`星冶样品舱`

### 5.3 图标资源

当前图标文件：

- `apps/miniprogram/src/static/branding/icon-192.png`
- `apps/miniprogram/src/static/branding/icon-512.png`
- `apps/miniprogram/src/static/branding/icon-1024.png`

### 5.4 APK 输出目录

APK 一般输出在：

`apps/miniprogram/src/unpackage/release/apk/`

---

## 6. 外网穿透方案

### 6.1 作用

外网穿透用于把本地后端：

`http://localhost:3000`

暴露为公网地址，让 Android App 在外网也能访问。

### 6.2 典型命令

以 `ngrok` 为例：

```powershell
ngrok http 3000
```

### 6.3 App 配置文件

公网地址配置文件：

`apps/miniprogram/src/utils/config.js`

示例：

```js
export const API_BASE_URL = 'https://your-public-domain/api'
export const FILE_BASE_URL = 'https://your-public-domain'
```

### 6.4 使用注意

使用外网穿透时，必须同时保持以下进程运行：

1. 后端服务
2. 穿透工具

任意一个关闭，外网访问都会失效。

### 6.5 风险说明

免费穿透服务通常存在以下问题：

- 域名重启后可能变化
- 免费额度有限
- 不适合长期正式生产使用

---

## 7. 为什么 Windows 笔记本不适合长期做服务机

当前 Windows 笔记本适合：

- 开发
- 调试
- 内测演示
- 临时小范围使用

但不适合长期作为正式服务端，原因包括：

### 7.1 睡眠 / 休眠 / 现代待机问题

按电源键、合盖、自动待机，容易导致：

- 后端暂停
- 穿透工具断开
- 手机端掉线

### 7.2 自动更新和重启

Windows 可能自动更新、自动重启，导致服务中断。

### 7.3 非专用服务设备

长期运行会面临：

- 电池老化
- 发热管理问题
- 依赖人工操作恢复

### 7.4 稳定性不足

正式给多人使用时，不应依赖：

- 手动开机
- 手动启动后端
- 手动启动穿透工具

---

## 8. 为什么鲁班猫4更适合

鲁班猫4更适合承担这套系统的长期服务端职责，原因包括：

- 功耗更低
- 更适合 24 小时运行
- 不易因误操作进入睡眠
- 适合运行 Linux 服务
- 更适合作为专用后端设备

迁移到鲁班猫4后，建议它承担：

- `NestJS` 后端
- `SQLite`
- `uploads` 附件目录
- `nginx` 静态文件服务
- 穿透工具或固定公网入口

Windows 电脑则保留：

- HBuilderX
- 后台开发
- APK 打包

也就是说：

- **开发保留在 Windows**
- **运行迁移到鲁班猫4**

---

## 9. 迁移到鲁班猫4的整体思路

### 9.1 建议迁移内容

迁移以下内容到鲁班猫4：

- `apps/server`
- `packages/shared`
- 根目录 `package.json`
- 根目录 `tsconfig.base.json`
- `apps/server/.env`
- `apps/server/prisma/dev.db`
- `uploads`
- 后台打包产物（可选）

### 9.2 不建议迁移的内容

这些不必迁移到鲁班猫4：

- HBuilderX
- 安卓打包环境
- Windows 桌面开发工具

---

## 10. 鲁班猫4部署准备清单

在鲁班猫4上建议准备：

- 已安装 `LubanCat OS` / Debian 系统
- 已联网
- 可通过 `SSH` 登录
- 已安装 `Node.js`
- 已安装 `npm`
- 可上传文件

建议先确认这些命令可用：

```bash
node -v
npm -v
uname -a
```

---

## 11. 鲁班猫4建议部署目录

建议部署目录：

```bash
/home/<user>/sample-system
```

例如：

- `/home/<user>/sample-system/apps/server`
- `/home/<user>/sample-system/packages/shared`
- `/home/<user>/sample-system/uploads`

---

## 12. 迁移文件清单

### 必须迁移

- `apps/server`
- `packages/shared`
- `package.json`
- `tsconfig.base.json`
- `apps/server/.env`

### 数据必须迁移

- `apps/server/prisma/dev.db`
- `uploads/`

### 可选迁移

- `apps/admin`（如果准备在鲁班猫上构建或托管后台）

---

## 13. 鲁班猫4上的后端安装步骤

假设项目已经上传到：

`/home/<user>/sample-system`

### 13.1 进入项目目录

```bash
cd /home/<user>/sample-system
```

### 13.2 安装依赖

```bash
npm install
```

### 13.3 检查环境变量

后端环境文件位置：

`apps/server/.env`

推荐内容：

```env
PORT=3000
JWT_SECRET=<replace-with-strong-secret>
DATABASE_URL="file:./dev.db"
UPLOAD_DIR=uploads
```

说明：

- `DATABASE_URL` 仍然使用 SQLite
- `UPLOAD_DIR` 仍然使用 `uploads`

### 13.4 生成 Prisma Client

```bash
npm run prisma:generate
```

### 13.5 启动后端

```bash
npm run dev:server
```

正式环境后续建议不要长期使用 `dev:server`，而应使用守护方式运行。

---

## 14. 数据迁移注意事项

### 14.1 SQLite

数据库文件：

`apps/server/prisma/dev.db`

这是最重要的数据文件之一。

### 14.2 附件

附件目录：

`uploads/`

如果不迁移该目录：

- 数据库中虽然有附件记录
- 但实际图纸文件会无法打开

### 14.3 备份建议

至少定期备份：

- `apps/server/prisma/dev.db`
- `uploads/`

---

## 15. 后端长期运行建议

迁移到鲁班猫4后，不建议长期手动挂终端。建议使用：

- `pm2`
  或
- `systemd`

### 15.1 推荐 `pm2`

安装：

```bash
npm install -g pm2
```

启动：

```bash
cd /home/<user>/sample-system
pm2 start "npm run dev:server" --name sample-server
```

查看状态：

```bash
pm2 list
```

保存开机启动：

```bash
pm2 save
pm2 startup
```

---

## 16. 后台管理端部署建议

### 方案 A：继续本机开发运行

在 Windows 上继续：

```powershell
npm.cmd run dev:admin
```

适合开发和日常维护。

### 方案 B：打包后放到鲁班猫4

先在项目根目录打包：

```powershell
npm.cmd --workspace apps/admin run build
```

然后把 `dist` 目录放到鲁班猫4，用 `nginx` 提供访问。

该方式更适合内部正式使用。

---

## 17. 外网访问的长期建议

### 当前测试方案

可以使用：

- `ngrok`
- 国内内网穿透服务

适合：

- 测试
- 演示
- 临时外网访问

### 长期正式方案建议

建议使用以下之一：

- 固定公网服务器
- 固定内网穿透服务
- 自建反向代理

若继续使用免费穿透服务：

- 域名可能变化
- 需要频繁修改 App 配置

因此不适合长期正式运营。

---

## 18. Android 上架前需要补的内容

正式上架前建议准备：

- 自有 Android 签名证书（keystore）
- 固定后端服务地址
- 隐私政策
- 应用截图
- 应用简介
- 权限说明
- 开发者实名认证

当前云端测试证书适合测试，不适合正式上架长期维护。

---

## 19. 当前项目存在的现实限制

### 19.1 管理员移动端图纸上传尚未接入

当前管理员移动端已支持：

- 新建样品
- 删除样品

但图纸上传功能仍建议后续补齐。

### 19.2 页面文案建议后续统一清理

当前功能已可用，但历史改动较多，建议后续统一清理页面文案与提示信息。

### 19.3 正式环境不应继续依赖本机 + 免费穿透

测试可以，正式不建议。

---

## 20. 推荐最终架构

### 20.1 开发环境

Windows 电脑：

- HBuilderX
- 后台调试
- APK 打包

### 20.2 运行环境

鲁班猫4：

- 后端 API
- SQLite
- uploads 附件
- 守护进程运行
- nginx
- 固定公网入口或稳定穿透

### 20.3 客户端

Android 手机安装 APK：

- 管理员登录使用管理员账号
- 操作员登录使用操作员账号

---

## 21. 推荐推进顺序

建议按以下顺序推进：

1. 在鲁班猫4上确认系统、网络、SSH、Node 环境
2. 将后端和 SQLite 迁移到鲁班猫4
3. 在鲁班猫4上启动后端并验证接口
4. 迁移 `uploads`
5. 用固定地址替换临时穿透地址
6. 重新打包 Android APK
7. 做正式环境稳定性测试

---

## 22. 迁移后验收清单

迁移完成后，至少验证：

- 管理员能登录
- 操作员能登录
- 管理员能创建样品
- 管理员能删除样品
- 操作员能看到任务
- 工序开始 / 完成正常
- 样品进度正常刷新
- 已归档样品显示正常
- 图纸附件可打开
- 外网访问正常

---

## 23. 当前关键信息速查

### 项目根目录

`<项目根目录>`

### SQLite 文件

`apps/server/prisma/dev.db`

### 附件目录

`uploads`

### Android 项目目录

`apps/miniprogram/src`

### APK 输出目录

`apps/miniprogram/src/unpackage/release/apk/`

### 账号信息

正式文档中不建议记录明文账号和密码。

---

## 24. 一句话结论

当前这套系统已经可以：

- 在 Windows 上开发和测试
- 在 Android 手机上安装使用
- 通过外网穿透进行远程访问

如果要长期稳定运行，**最合适的方向是将后端迁移到鲁班猫4**，让 Windows 负责开发和打包，让鲁班猫4负责长期在线服务。

