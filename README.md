# NAT Type Detector

一个用于检测用户 NAT 网络类型的服务，包含服务端与 Web 客户端。

## 🌐 项目概述

本项目帮助用户检测其所处网络的 NAT 类型，服务于 P2P、游戏、VoIP 等场景的连接优化。

## 📁 项目结构

```
NAT-Type-Detector/
├── server/                 # 服务端 (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts       # 入口 & HTTP 服务器
│   │   ├── stun.ts        # STUN 服务器实现
│   │   ├── websocket.ts   # WebSocket 服务器
│   │   ├── detector.ts    # 检测引擎
│   │   └── types.ts       # 类型定义
│   ├── package.json
│   └── tsconfig.json
├── web/                   # Web 客户端
│   ├── index.html         # 主页面
│   ├── css/
│   │   └── style.css      # 样式
│   └── js/
│       └── detector.js    # 客户端逻辑
├── tools/                 # 工具脚本
└── README.md
```

## 🚀 快速开始

### 1. 安装服务端依赖

```bash
cd server
npm install
```

### 2. 启动服务端

```bash
# 开发模式 (ts-node)
npm run dev

# 或编译后运行
npm run build
npm start
```

### 3. 访问 Web 界面

打开浏览器访问: `http://localhost:3000`

## ☁️ 一键部署（Railway）

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

### 部署步骤

1. 点击上方按钮，或访问 [Railway](https://railway.app) 注册账号
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择你的 GitHub 仓库
4. Railway 会自动检测 Node.js 项目并部署

### 环境变量配置

在 Railway 项目设置中配置以下环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `STUN_PORT` | `3478` | STUN 主服务器端口 |
| `WS_PORT` | `8080` | WebSocket 端口 |
| `HTTP_PORT` | `3000` | HTTP 端口 |
| `PORT` | `3000` | Railway 需要的端口 |

> ⚠️ Railway 免费版支持 TCP，但 STUN 需要 UDP。请确保你的 Railway 项目支持 UDP 或使用其他支持 UDP 的平台。

## 🐳 Docker 部署（推荐）

### 1. 构建 Docker 镜像

```bash
docker build -t nat-type-detector .
```

### 2. 运行容器

```bash
docker run -d \
  --name nat-detector \
  -p 3000:3000 \
  -p 8080:8080 \
  -p 3478:3478/udp \
  -p 3479:3479/udp \
  nat-type-detector
```

### 3. 使用 Docker Compose

创建 `docker-compose.yml`:

```yaml
version: '3.8'
services:
  nat-detector:
    build: .
    container_name: nat-detector
    ports:
      - "3000:3000"      # HTTP
      - "8080:8080"      # WebSocket
      - "3478:3478/udp"  # STUN 主
      - "3479:3479/udp"  # STUN 备用
    restart: unless-stopped
```

启动：
```bash
docker-compose up -d
```

## 🌐 前端单独部署（GitHub Pages）

如果只需要部署前端静态页面（需要连接远程后端）：

1. 修改 `web/js/detector.js` 中的服务器地址：
   ```javascript
   const CONFIG = {
     WS_URL: 'wss://your-server.com:8080',  // 改为你的后端地址
     // ...
   };
   ```

2. 上传 `web/` 文件夹内容到 GitHub Pages

3. 访问你的 GitHub Pages 地址即可

## ⚙️ 配置

服务端默认端口:
- **STUN**: UDP `3478`, `3479`
- **WebSocket**: TCP `8080`
- **HTTP**: TCP `3000`

可通过环境变量修改:
```bash
STUN_PORT=3478 WS_PORT=8080 HTTP_PORT=3000 npm start
```

## 🔧 工作原理

### 检测流程

1. **客户端连接**: 浏览器通过 WebSocket 连接到服务端
2. **发送探针**: 客户端通过不同端口向 STUN 服务器发送 UDP 包
3. **分析响应**: 服务器记录每个探针的源 IP:Port
4. **判断类型**: 根据端口映射一致性判断 NAT 类型

### NAT 类型说明

| 类型 | 难度 | 说明 |
|------|------|------|
| Open Internet | ⭐ | 无 NAT，直接暴露公网 IP |
| Full Cone NAT | ⭐ | 全锥型，最易穿透 |
| Restricted Cone | ⭐⭐ | 受限锥型，需 IP 限制 |
| Port Restricted Cone | ⭐⭐⭐ | 端口受限锥型 |
| Symmetric NAT | ⭐⭐⭐⭐ | 对称型，最难穿透 |

### 穿透建议

| NAT 类型 | 穿透方式 |
|---------|---------|
| Open Internet | 无需穿透 |
| Full Cone | 简单 UDP 打洞 |
| Restricted Cone | 双向 UDP 打洞 |
| Port Restricted Cone | 建议配合 TURN 中继 |
| Symmetric NAT | 必须使用 TURN 中继（如 coturn） |

## 📡 API 端点

- `GET /health` - 健康检查
- `GET /api/status` - 服务器状态与检测历史

## 🛠️ 技术栈

- **服务端**: Node.js, TypeScript, ws (WebSocket), dgram (UDP)
- **客户端**: 原生 HTML/CSS/JavaScript, WebSocket, WebRTC (ICE)

## 📝 注意事项

1. 服务端建议部署在 **多线 BGP 服务器** 上，避免单线机房导致误判
2. WebRTC 需要 HTTPS 才能在生产环境正常使用
3. STUN 需要 UDP 端口，确保防火墙开放 3478、3479 UDP
4. 本项目为演示用途，生产环境请添加更多错误处理和安全措施

## 📄 License

MIT
