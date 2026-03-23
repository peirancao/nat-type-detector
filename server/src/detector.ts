import { EventEmitter } from 'events';
import { StunServer } from './stun';
import { WebSocketServerModule } from './websocket';
import { NatType, DetectionResult, NatInfo } from './types';

/**
 * Main detection engine that orchestrates STUN and WebSocket servers
 */
export class NatDetector extends EventEmitter {
  private stunServer: StunServer;
  private wsServer: WebSocketServerModule;
  private detectionHistory: Map<string, DetectionResult> = new Map();

  constructor(
    stunPort: number = 3478,
    wsPort: number = 8080
  ) {
    super();
    this.stunServer = new StunServer(stunPort, stunPort + 1);
    this.wsServer = new WebSocketServerModule(wsPort);

    this.setupEventHandlers();
  }

  /**
   * Set up internal event handlers
   */
  private setupEventHandlers(): void {
    // Forward STUN events to WebSocket
    this.stunServer.on('clientProbe', (data) => {
      this.emit('clientProbe', data);
    });

    // Handle detection completion
    this.wsServer.on('detectionComplete', (result: DetectionResult) => {
      this.detectionHistory.set(result.clientId, result);
      this.emit('detectionComplete', result);
    });

    // Handle new detection start
    this.wsServer.on('detectionStart', (clientId: string) => {
      this.emit('detectionStart', clientId);
    });
  }

  /**
   * Start both STUN and WebSocket servers
   */
  async start(): Promise<void> {
    console.log('[Detector] Starting NAT Type Detection Server...');
    
    await this.stunServer.start();
    await this.wsServer.start();
    
    console.log('[Detector] All servers started successfully');
    console.log('[Detector] STUN Server: UDP port 3478, 3479');
    console.log('[Detector] WebSocket Server: TCP port 8080');
    console.log('[Detector] Ready to accept connections');
  }

  /**
   * Stop all servers
   */
  stop(): void {
    this.stunServer.stop();
    this.wsServer.stop();
    console.log('[Detector] Servers stopped');
  }

  /**
   * Get detection history
   */
  getHistory(): DetectionResult[] {
    return Array.from(this.detectionHistory.values());
  }

  /**
   * Get detection result for specific client
   */
  getClientResult(clientId: string): DetectionResult | undefined {
    return this.detectionHistory.get(clientId);
  }

  /**
   * Get detailed NAT info
   */
  static getNatInfo(natType: NatType): NatInfo {
    return WebSocketServerModule.getNatInfo(natType);
  }
}

export { NatType, NatInfo, DetectionResult };
