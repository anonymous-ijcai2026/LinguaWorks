# LinguaWorks

LinguaWorks 是一个面向对话场景的 Prompt 优化系统（前后端分离），用于将「目标 prompt / 需求描述」组织成结构化结果，并在多轮反馈中完成生成与优化。

系统由三部分组成：

- 后端主服务（FastAPI）：澄清、分析、生成、优化、测试
- 数据库 API（Flask）：会话、消息、模板、分析方法、用户设置等数据接口
- 前端（React + Vite）：交互界面、模型配置入口、会话与测试管理

## 特性

- 结构化需求收集与检查（多轮对话与反馈）
- 元素分析（默认方法 + 自定义方法）
- Prompt 生成与优化工作流
- 系统 Prompt 测试与版本对比
- 模型配置存储在数据库（通过前端 Settings 配置）

## 技术栈

- Backend: FastAPI, Flask, SQLAlchemy, MySQL
- Frontend: React, Vite, TypeScript, Ant Design

## 项目结构

```
.
├── src/                          # 后端代码
│   ├── api/                      # FastAPI 主服务 + Flask 数据库 API
│   ├── core/                     # 处理器（结构检查/生成/优化等）
│   ├── infrastructure/           # 配置、模型、迁移等基础设施
│   └── agent_prompt/             # Agent 提示词资源
├── frontend/                     # 前端项目（Vite）
├── prompt_optimizer_database.sql # MySQL 初始化脚本
├── .env                          # 后端环境变量（本地开发）
├── requirements.txt              # Python 依赖
├── start_main_app.py             # 启动 FastAPI 主服务
└── start_database.py             # 启动 Flask 数据库 API
```

## 快速开始（本地开发）

### 依赖

- Python：建议 3.12
- Node.js：>=16（见 [package.json](file:///e:/PycharmProjects/LinguaWorks/frontend/package.json)）
- MySQL：建议 8.x

### 1) 初始化数据库

1. 创建数据库（名称需与 `.env` 的 `DB_NAME` 一致，例如 `prompt_optimizer`）
2. 导入初始化脚本：

```bash
mysql -u root -p prompt_optimizer < prompt_optimizer_database.sql
```

### 2) 配置后端环境变量（根目录 .env）

后端通过 [AppConfig](file:///e:/PycharmProjects/LinguaWorks/src/infrastructure/config/base.py) 读取根目录 `.env`。

本项目当前实际用到的配置项如下（示例）：

```env
APP_ENV=development
DEBUG=true
LOG_LEVEL=INFO

FASTAPI_HOST=127.0.0.1
FASTAPI_PORT=8000
FLASK_HOST=127.0.0.1
FLASK_PORT=5001

DB_HOST=localhost
DB_PORT=3306
DB_NAME=prompt_optimizer
DB_USER=root
DB_PASSWORD=root
DB_CHARSET=utf8mb4
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600
DB_POOL_NAME=prompt_pool

CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

UPLOAD_PATH=./uploads
STATIC_PATH=./static
LOG_FILE_PATH=./logs/app.log
```

### 3) 安装并启动后端

在项目根目录创建并激活虚拟环境后：

```bash
pip install -r requirements.txt
python start_database.py
python start_main_app.py
```

默认地址：

- FastAPI 文档：`http://localhost:8000/docs`
- 数据库 API：`http://localhost:5001/api`

### 4) 配置前端环境变量（Vite）

前端通过 Vite 环境变量配置后端地址（可在 `frontend/.env.local` 或命令行环境变量设置）：

- `VITE_API_BASE_URL`：FastAPI 主服务基址（默认 `http://localhost:8000`）
- `VITE_DB_API_BASE_URL`：数据库 API 基址（默认 `http://localhost:5001/api`）

示例：

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_DB_API_BASE_URL=http://localhost:5001/api
```

对应实现：

- 主服务地址读取：[api.ts](file:///e:/PycharmProjects/LinguaWorks/frontend/src/services/api.ts)
- 数据库 API 地址读取：[databaseService.ts](file:///e:/PycharmProjects/LinguaWorks/frontend/src/services/databaseService.ts)

### 5) 安装并启动前端

在 `frontend/` 目录：

```bash
npm install
npm run dev
```

打开：`http://localhost:3000`

## 配置自检

后端提供配置验证命令（检查 `.env`、数据库 URL 构建、目录创建、端口冲突等）：

```bash
python -m src.infrastructure.config.validation
```

实现见 [validation.py](file:///e:/PycharmProjects/LinguaWorks/src/infrastructure/config/validation.py)。

## 主要模块

- FastAPI 主服务入口：[app.py](file:///e:/PycharmProjects/LinguaWorks/src/api/app.py)
- 工作流接口：[workflow.py](file:///e:/PycharmProjects/LinguaWorks/src/api/routers/workflow.py)
- 元信息接口（agent mapping / reload ai config 等）：[meta.py](file:///e:/PycharmProjects/LinguaWorks/src/api/routers/meta.py)
- 数据库 API：[database_api.py](file:///e:/PycharmProjects/LinguaWorks/src/api/database_api.py)

## 开发

### 后端

```bash
python -m pytest
python -m black --check src tests start_database.py start_main_app.py
```

### 前端

在 `frontend/` 目录：

```bash
npm run lint
npm run type-check
```

## 常见问题

- 无法连接数据库：确认 MySQL 运行中、`.env` 的 `DB_*` 正确、已导入 SQL 初始化脚本
- 跨域错误：确认 `CORS_ORIGINS` 包含前端访问地址，且 FastAPI 正在运行
- 前端请求地址不对：检查 `VITE_API_BASE_URL / VITE_DB_API_BASE_URL` 是否正确

