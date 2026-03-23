import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { NatType, NatInfo, NatDifficulty, DetectionResult } from './types';

interface WSMessage {
  type: string;
  payload?: any;
}

interface ClientState {
  id: string;
  ws: WebSocket;
  stunClientKey: string;
  ip: string;
  port: number;
  probeCount: number;
  startTime: number;
  phase: 'init' | 'probing' | 'analyzing' | 'done';
  probeHistory: ProbeResult[];
}

interface ProbeResult {
  ip: string;
  port: number;
  timestamp: number;
}

/**
 * WebSocket Server for real-time communication with clients
 */
export class WebSocketServerModule extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientState> = new Map();
  private port: number;

  constructor(port: number = 8080) {
    super();
    this.port = port;
  }

  /**
   * Start WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('listening', () => {
        console.log(`[WS] WebSocket server listening on port ${this.port}`);
        resolve();
      });

      this.wss.on('error', (err) => {
        console.error('[WS] Server error:', err);
        reject(err);
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const clientIp = req.socket.remoteAddress || 'unknown';
    const clientPort = req.socket.remotePort || 0;
    const clientId = this.generateClientId();

    console.log(`[WS] New client: ${clientId} from ${clientIp}:${clientPort}`);

    const clientState: ClientState = {
      id: clientId,
      ws,
      stunClientKey: `${clientIp}:${clientPort}`,
      ip: clientIp,
      port: clientPort,
      probeCount: 0,
      startTime: Date.now(),
      phase: 'init',
      probeHistory: []
    };

    this.clients.set(clientId, clientState);

    // Send welcome message
    this.send(ws, {
      type: 'welcome',
      payload: {
        clientId,
        message: 'Connected to NAT Type Detector'
      }
    });

    // Set up message handler
    ws.on('message', (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (err) {
        console.error('[WS] Error parsing message:', err);
      }
    });

    // Handle close
    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`[WS] Client ${clientId} error:`, err);
    });
  }

  /**
   * Handle message from client
   */
  private handleMessage(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`[WS] Message from ${clientId}:`, message.type);

    switch (message.type) {
      case 'start_detection':
        this.handleStartDetection(clientId);
        break;

      case 'probe_result':
        this.handleProbeResult(clientId, message.payload);
        break;

      case 'get_status':
        this.sendStatus(clientId);
        break;

      default:
        console.log(`[WS] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle start detection request
   */
  private handleStartDetection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`[WS] Starting detection for ${clientId}`);
    client.phase = 'probing';
    client.probeCount = 0;
    client.startTime = Date.now();

    // Notify client to start probing
    this.send(client.ws, {
      type: 'detection_start',
      payload: {
        stunServers: [
          { host: '127.0.0.1', port: 3478 },
          { host: '127.0.0.1', port: 3479 }
        ],
        instructions: [
          'Send STUN binding request to primary server',
          'Send STUN binding request to alternate port',
          'Wait for responses and report back'
        ]
      }
    });

    // Emit event for integration with STUN server
    this.emit('detectionStart', clientId);
  }

  /**
   * Handle probe result from client
   */
  private handleProbeResult(clientId: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.phase !== 'probing') return;

    const { ip, port, timestamp } = payload;
    client.probeHistory.push({ ip, port, timestamp });
    client.probeCount++;

    console.log(`[WS] Probe ${client.probeCount} from ${clientId}: ${ip}:${port}`);

    // After collecting enough probes, analyze
    if (client.probeCount >= 4) {
      client.phase = 'analyzing';
      const result = this.analyzeResults(client);
      client.phase = 'done';

      this.send(client.ws, {
        type: 'detection_complete',
        payload: result
      });

      this.emit('detectionComplete', result);
    } else {
      // Request more probes
      this.send(client.ws, {
        type: 'probe_acknowledged',
        payload: {
          count: client.probeCount,
          required: 4
        }
      });
    }
  }

  /**
   * Analyze probe results to determine NAT type
   */
  private analyzeResults(client: ClientState): DetectionResult {
    const probes = client.probeHistory;
    const uniquePorts = new Set(probes.map(p => p.port));
    const uniqueIPs = new Set(probes.map(p => p.ip));

    let natType: NatType;
    let confidence = 0.9;

    // Analysis based on port/address consistency
    if (probes.length === 1 && uniquePorts.size === 1) {
      natType = NatType.OPEN_INTERNET;
    } else if (uniquePorts.size === 1) {
      // Same port different IPs
      natType = NatType.RESTRICTED_CONE;
    } else if (uniquePorts.size === probes.length) {
      // All different ports - could be symmetric
      if (probes.every(p => Math.abs(p.port - probes[0].port) > 10)) {
        natType = NatType.SYMMETRIC_NAT;
        confidence = 0.8;
      } else {
        natType = NatType.PORT_RESTRICTED_CONE;
      }
    } else {
      natType = NatType.FULL_CONE;
    }

    const publicIP = probes[0]?.ip || client.ip;
    const publicPort = probes[0]?.port || client.port;

    const result: DetectionResult = {
      clientId: client.id,
      natType,
      publicIP,
      publicPort,
      timestamp: Date.now(),
      confidence
    };

    console.log(`[WS] Detection result for ${client.id}:`, natType);

    return result;
  }

  /**
   * Send status to client
   */
  private sendStatus(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.send(client.ws, {
      type: 'status',
      payload: {
        phase: client.phase,
        probeCount: client.probeCount,
        uptime: Date.now() - client.startTime
      }
    });
  }

  /**
   * Send message to client
   */
  private send(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: WSMessage): void {
    this.clients.forEach(client => {
      this.send(client.ws, message);
    });
  }

  /**
   * Get NAT info for a result
   */
  static getNatInfo(natType: NatType): NatInfo {
    const infoMap: Record<NatType, NatInfo> = {
      [NatType.OPEN_INTERNET]: {
        type: NatType.OPEN_INTERNET,
        difficulty: NatDifficulty.EASY,
        description: '你的网络直接暴露在公网，没有NAT转换。这是最理想的网络环境，P2P连接最容易成功。',
        穿透建议: '无需任何穿透操作，直接建立连接即可。',
        适用场景: ['P2P文件分享', '视频通话', '在线游戏', '任何需要端到端连接的应用']
      },
      [NatType.FULL_CONE]: {
        type: NatType.FULL_CONE,
        difficulty: NatDifficulty.EASY,
        description: '全锥型NAT，任何外部主机都可以通过映射的公网IP:Port发送数据到你的设备。穿透相对容易。',
        穿透建议: '简单的UDP打洞即可建立连接，成功率很高。',
        适用场景: ['P2P连接', '游戏', '视频通话']
      },
      [NatType.RESTRICTED_CONE]: {
        type: NatType.RESTRICTED_CONE,
        difficulty: NatDifficulty.MEDIUM,
        description: '受限锥型NAT，只有你之前发送过请求的IP才能向你发送数据。需要双向UDP打洞。',
        穿透建议: '需要进行UDP打洞，客户端双方都需要主动发起连接。',
        适用场景: ['P2P连接', '游戏', '视频通话（可能需要中继）']
      },
      [NatType.PORT_RESTRICTED_CONE]: {
        type: NatType.PORT_RESTRICTED_CONE,
        difficulty: NatDifficulty.HARD,
        description: '端口受限锥型NAT，不仅限制IP还限制端口。只能向之前通信过的IP:Port发送数据。',
        穿透建议: '打洞难度较高，建议配合TURN中继服务器使用。',
        适用场景: ['需要中继的通信', '对延迟要求不高的应用']
      },
      [NatType.SYMMETRIC_NAT]: {
        type: NatType.SYMMETRIC_NAT,
        difficulty: NatDifficulty.VERY_HARD,
        description: '对称型NAT，每个目标IP:Port组合都会分配不同的映射端口。最难穿透的NAT类型。',
        穿透建议: '几乎无法直接打洞，建议使用TURN中继服务器（如coturn）作为通信中转。',
        适用场景: ['必须使用中继服务', '对等宽/低延迟要求不高的场景']
      },
      [NatType.UNKNOWN]: {
        type: NatType.UNKNOWN,
        difficulty: NatDifficulty.VERY_HARD,
        description: '无法确定NAT类型，可能是因为检测探针不足或网络环境复杂。',
        穿透建议: '建议重试检测或联系网络管理员。',
        适用场景: ['使用中继服务', '联系技术支持']
      }
    };

    return infoMap[natType] || infoMap[NatType.UNKNOWN];
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.clients.forEach(client => {
      client.ws.close();
    });
    if (this.wss) {
      this.wss.close();
    }
    console.log('[WS] WebSocket server stopped');
  }
}
