import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import {
  NatType,
  ClientInfo,
  DetectionResult,
  STUN_PORT,
  STUN_BINDING_REQUEST,
  STUN_BINDING_RESPONSE,
  STUN_BINDING_ERROR,
  STUN_ATTR_MAPPED_ADDRESS,
  STUN_ATTR_SOURCE_ADDRESS,
  STUN_ATTR_XOR_MAPPED_ADDRESS
} from './types';
// UUID generation helper
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface StunPacket {
  type: number;
  transactionId: Buffer;
  attributes: Map<number, Buffer>;
}

/**
 * STUN Server implementation
 * Handles STUN binding requests and analyzes client behavior
 */
export class StunServer extends EventEmitter {
  private server: dgram.Socket | null = null;
  private altServer: dgram.Socket | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private transactions: Map<string, { clientIp: string; clientPort: number; timestamp: number }> = new Map();

  constructor(
    private primaryPort: number = STUN_PORT,
    private altPort: number = STUN_PORT + 1
  ) {
    super();
  }

  /**
   * Start the STUN server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let primaryReady = false;
      let altReady = false;
      const checkReady = () => {
        if (primaryReady && altReady) {
          console.log('[STUN] STUN servers started successfully');
          resolve();
        }
      };

      this.server = dgram.createSocket('udp4');
      this.altServer = dgram.createSocket('udp4');

      this.server.on('error', (err) => {
        console.error('[STUN] Primary server error:', err);
        reject(err);
      });

      this.server.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo, this.server!);
      });

      this.server.on('listening', () => {
        const address = this.server!.address();
        console.log(`[STUN] Primary server listening on ${address.address}:${address.port}`);
        primaryReady = true;
        checkReady();
      });

      this.altServer.on('error', (err) => {
        console.error('[STUN] Alt server error:', err);
      });

      this.altServer.on('message', (msg, rinfo) => {
        this.handleAltMessage(msg, rinfo);
      });

      this.altServer.on('listening', () => {
        const address = this.altServer!.address();
        console.log(`[STUN] Alt server listening on ${address.address}:${address.port}`);
        altReady = true;
        checkReady();
      });

      this.server.bind(this.primaryPort);
      this.altServer.bind(this.altPort);
    });
  }

  /**
   * Handle incoming STUN message
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo, server: dgram.Socket): void {
    try {
      const packet = this.parseStunMessage(msg);
      
      if (packet.type === STUN_BINDING_REQUEST) {
        this.handleBindingRequest(packet, rinfo, server);
      }
    } catch (err) {
      console.error('[STUN] Error handling message:', err);
    }
  }

  /**
   * Handle alternate server message (for NAT type testing)
   */
  private handleAltMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const packet = this.parseStunMessage(msg);
      
      if (packet.type === STUN_BINDING_REQUEST) {
        // This is a test from the same client on a different port
        // Record this behavior for NAT type analysis
        const clientKey = `${rinfo.address}:${rinfo.port}`;
        const client = this.clients.get(clientKey);
        
        if (client) {
          client.observedPorts.add(rinfo.port);
          client.lastSeen = Date.now();
        }
      }
    } catch (err) {
      // Ignore parsing errors on alt server
    }
  }

  /**
   * Handle STUN binding request
   */
  private handleBindingRequest(packet: StunPacket, rinfo: dgram.RemoteInfo, server: dgram.Socket): void {
    const transactionId = packet.transactionId.toString('hex');
    const clientKey = `${rinfo.address}:${rinfo.port}`;

    // Get or create client info
    let client = this.clients.get(clientKey);
    if (!client) {
      client = {
        id: this.generateClientId(),
        ip: rinfo.address,
        port: rinfo.port,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        observedPorts: new Set(),
        observedIPs: new Set()
      };
      this.clients.set(clientKey, client);
    }

    client.lastSeen = Date.now();
    client.observedPorts.add(rinfo.port);

    // Create binding response
    const response = this.createBindingResponse(transactionId, rinfo);

    server.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error('[STUN] Error sending response:', err);
      }
    });

    // Store transaction for potential follow-up tests
    this.transactions.set(transactionId, {
      clientIp: rinfo.address,
      clientPort: rinfo.port,
      timestamp: Date.now()
    });

    // Emit event for WebSocket server
    this.emit('clientProbe', {
      clientId: client.id,
      ip: rinfo.address,
      port: rinfo.port,
      transactionId
    });
  }

  /**
   * Parse STUN message
   */
  private parseStunMessage(msg: Buffer): StunPacket {
    if (msg.length < 20) {
      throw new Error('Message too short');
    }

    const type = msg.readUInt16BE(0);
    const length = msg.readUInt16BE(2);
    const transactionId = msg.slice(4, 20);

    const attributes = new Map<number, Buffer>();
    let offset = 20;

    while (offset < msg.length) {
      const attrType = msg.readUInt16BE(offset);
      const attrLength = msg.readUInt16BE(offset + 2);
      const attrValue = msg.slice(offset + 4, offset + 4 + attrLength);
      attributes.set(attrType, attrValue);
      offset += 4 + Math.ceil(attrLength / 4) * 4; // Align to 4 bytes
    }

    return { type, transactionId, attributes };
  }

  /**
   * Create STUN binding response
   */
  private createBindingResponse(transactionId: string, rinfo: dgram.RemoteInfo): Buffer {
    const msgType = Buffer.alloc(2);
    msgType.writeUInt16BE(STUN_BINDING_RESPONSE, 0);

    const transactionBytes = Buffer.from(transactionId, 'hex');
    
    // MAPPED-ADDRESS attribute (using XOR for newer clients)
    const mappedAddr = this.encodeAddress(rinfo.address, rinfo.port, STUN_ATTR_XOR_MAPPED_ADDRESS, transactionBytes);
    
    // SOURCE-ADDRESS attribute
    const sourceAddr = this.encodeAddress(rinfo.address, this.primaryPort, STUN_ATTR_SOURCE_ADDRESS, transactionBytes);

    const attributes = Buffer.concat([mappedAddr, sourceAddr]);
    
    const length = Buffer.alloc(2);
    length.writeUInt16BE(attributes.length, 0);

    return Buffer.concat([msgType, length, transactionBytes, attributes]);
  }

  /**
   * Encode address attribute
   */
  private encodeAddress(ip: string, port: number, attrType: number, transactionId: Buffer): Buffer {
    const parts = ip.split('.').map(Number);
    const addrBytes = Buffer.alloc(16);
    
    // IPv4 address
    addrBytes[0] = 0x00; // Reserved
    addrBytes[1] = 0x01; // IPv4
    addrBytes.writeUInt16BE(port ^ 0x2112, 2); // XOR with magic cookie
    addrBytes[4] = parts[0] ^ transactionId[0];
    addrBytes[5] = parts[1] ^ transactionId[1];
    addrBytes[6] = parts[2] ^ transactionId[2];
    addrBytes[7] = parts[3] ^ transactionId[3];

    const length = Buffer.alloc(2);
    length.writeUInt16BE(8, 0);

    const type = Buffer.alloc(2);
    type.writeUInt16BE(attrType, 0);

    return Buffer.concat([type, length, addrBytes]);
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Analyze NAT type based on observed behavior
   */
  analyzeNatType(clientKey: string): DetectionResult | null {
    const client = this.clients.get(clientKey);
    if (!client) {
      return null;
    }

    const publicIP = client.ip;
    const publicPort = client.port;
    const observedPorts = Array.from(client.observedPorts);

    let natType: NatType;
    let confidence = 0.95;

    // Analysis logic
    if (observedPorts.length === 1) {
      // Single port observation - could be Open Internet or Full Cone
      if (client.firstSeen === client.lastSeen) {
        natType = NatType.OPEN_INTERNET;
      } else {
        natType = NatType.FULL_CONE;
      }
    } else if (observedPorts.length === observedPorts.filter((p, i, arr) => arr.indexOf(p) === i).length) {
      // Ports are consistently mapped (possibly port-restricted)
      if (observedPorts.every(p => Math.abs(p - publicPort) < 10)) {
        natType = NatType.PORT_RESTRICTED_CONE;
      } else {
        natType = NatType.RESTRICTED_CONE;
      }
    } else {
      // Ports are not consistent - Symmetric NAT
      natType = NatType.SYMMETRIC_NAT;
      confidence = 0.85;
    }

    return {
      clientId: client.id,
      natType,
      publicIP,
      publicPort,
      timestamp: Date.now(),
      confidence
    };
  }

  /**
   * Get client info
   */
  getClient(clientKey: string): ClientInfo | undefined {
    return this.clients.get(clientKey);
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
    }
    if (this.altServer) {
      this.altServer.close();
    }
    console.log('[STUN] Servers stopped');
  }
}
