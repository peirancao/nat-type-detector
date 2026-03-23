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

## 📡 API 端点

- `GET /health` - 健康检查
- `GET /api/status` - 服务器状态与检测历史

## 🛠️ 技术栈

- **服务端**: Node.js, TypeScript, ws (WebSocket), dgram (UDP)
- **客户端**: 原生 HTML/CSS/JavaScript, WebSocket, WebRTC (ICE)

## 📝 注意事项

1. 服务端建议部署在 **多线 BGP 服务器** 上，避免单线机房导致误判
2. WebRTC 需要 HTTPS 才能在生产环境正常使用
3. 本项目为演示用途，生产环境请添加更多错误处理和安全措施

## 📄 License

MIT
