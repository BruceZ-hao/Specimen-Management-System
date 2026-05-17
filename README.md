# 粉末冶金样品制作系统

这是一个面向粉末冶金样品制作流程的全栈项目，包含：
- `apps/server`：`NestJS + Prisma + SQLite`
- `apps/admin`：`Vue 3 + Element Plus` 管理后台
- `apps/miniprogram`：`uni-app` Android App
- `packages/shared`：共享类型与枚举

## 当前实现
- 账号密码登录
- 管理员创建样品单、配置工序、上传图纸、管理用户
- 操作员在 Android App 查看我的任务、开始工序、完成工序
- 工序串行控制与样品状态自动汇总

## 快速开始
见 `docs/deployment.md`
