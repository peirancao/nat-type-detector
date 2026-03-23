/**
 * NAT Type definitions
 */
export enum NatType {
  OPEN_INTERNET = 'Open Internet',
  FULL_CONE = 'Full Cone NAT',
  RESTRICTED_CONE = 'Restricted Cone NAT',
  PORT_RESTRICTED_CONE = 'Port Restricted Cone NAT',
  SYMMETRIC_NAT = 'Symmetric NAT',
  UNKNOWN = 'Unknown'
}

export enum NatDifficulty {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
  VERY_HARD = 4
}

export interface NatInfo {
  type: NatType;
  difficulty: NatDifficulty;
  description: string;
 穿透建议: string;
  适用场景: string[];
}

export interface ClientInfo {
  id: string;
  ip: string;
  port: number;
  firstSeen: number;
  lastSeen: number;
  observedPorts: Set<number>;
  observedIPs: Set<string>;
}

export interface DetectionResult {
  clientId: string;
  natType: NatType;
  publicIP: string;
  publicPort: number;
  timestamp: number;
  confidence: number;
}

export interface StunMessage {
  type: 'binding_request' | 'binding_response' | 'binding_error';
  transactionId: Buffer;
  attributes: Map<number, Buffer>;
}

// STUN Message Types
export const STUN_BINDING_REQUEST = 0x0001;
export const STUN_BINDING_RESPONSE = 0x0101;
export const STUN_BINDING_ERROR = 0x0111;

// STUN Attributes
export const STUN_ATTR_MAPPED_ADDRESS = 0x0001;
export const STUN_ATTR_SOURCE_ADDRESS = 0x0004;
export const STUN_ATTR_CHANGED_ADDRESS = 0x0005;
export const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;

// STUN Ports
export const STUN_PORT = 3478;
export const STUN_ALT_PORT = 3479;
