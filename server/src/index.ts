import { NatDetector } from './detector';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '..', '..', 'web');

/**
 * NAT Type Detection Server
 * 
 * Combines STUN server and WebSocket server to detect
 * client's NAT type through probing and analysis.
 */

// Configuration
const CONFIG = {
  STUN_PORT: parseInt(process.env.STUN_PORT || '3478', 10),
  WS_PORT: parseInt(process.env.WS_PORT || '8080', 10),
  HTTP_PORT: parseInt(process.env.HTTP_PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0'
};

// Create detector instance
const detector = new NatDetector(CONFIG.STUN_PORT, CONFIG.WS_PORT);

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

// Serve static files
function serveStatic(filePath: string, res: http.ServerResponse): void {
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// HTTP server
const httpServer = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  if (req.method === 'GET') {
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          stun: 'running',
          websocket: 'running'
        },
        uptime: process.uptime()
      }));
    } else if (url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const history = detector.getHistory();
      res.end(JSON.stringify({
        status: 'running',
        detectionCount: history.length,
        recentDetections: history.slice(-10).map(r => ({
          clientId: r.clientId,
          natType: r.natType,
          publicIP: r.publicIP,
          timestamp: new Date(r.timestamp).toISOString()
        }))
      }));
    } else if (url === '/' || url === '/client') {
      // Redirect to /client/ for the detection UI
      res.writeHead(302, { 'Location': '/client/' });
      res.end();
    } else if (url.startsWith('/client/')) {
      // Serve client files from web directory
      let filePath = url.slice(8); // Remove '/client/'
      if (filePath === '' || filePath === '/') {
        filePath = 'index.html';
      }
      const fullPath = path.join(WEB_ROOT, filePath);
      serveStatic(fullPath, res);
    } else if (url === '/status' || url === '/admin') {
      // Server status page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const history = detector.getHistory();
      res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NAT Type Detector - Server Status</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 30px; }
    .status { display: flex; gap: 20px; margin-bottom: 20px; }
    .card { flex: 1; background: #f8f9fa; padding: 20px; border-radius: 8px; }
    .card h3 { margin: 0 0 10px 0; color: #666; font-size: 14px; }
    .card .value { font-size: 24px; font-weight: bold; color: #28a745; }
    .info { background: #e7f3ff; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .info h4 { margin: 0 0 10px 0; color: #0066cc; }
    .info p { margin: 5px 0; color: #333; font-size: 14px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .back-link { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; }
    .back-link:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🌐 NAT Type Detection Server - Status</h1>
    <div class="status">
      <div class="card">
        <h3>Status</h3>
        <div class="value">🟢 Running</div>
      </div>
      <div class="card">
        <h3>Total Detections</h3>
        <div class="value" id="count">${history.length}</div>
      </div>
    </div>
    <div class="info">
      <h4>📡 Server Ports</h4>
      <p><strong>STUN Server:</strong> <code>UDP ${CONFIG.STUN_PORT}</code>, <code>UDP ${CONFIG.STUN_PORT + 1}</code></p>
      <p><strong>WebSocket:</strong> <code>TCP ${CONFIG.WS_PORT}</code></p>
      <p><strong>HTTP API:</strong> <code>TCP ${CONFIG.HTTP_PORT}</code></p>
    </div>
    <div class="info">
      <h4>🔧 API Endpoints</h4>
      <p><code>GET /health</code> - Health check</p>
      <p><code>GET /api/status</code> - Server status & recent detections</p>
    </div>
    <a href="/client/" class="back-link">🔍 Open Detection Client</a>
  </div>
  <script>
    fetch('/api/status')
      .then(r => r.json())
      .then(d => {
        document.getElementById('count').textContent = d.detectionCount;
      });
  </script>
</body>
</html>`);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } else {
    res.writeHead(405);
    res.end('Method Not Allowed');
  }
});

// Event handlers
detector.on('clientProbe', (data) => {
  console.log(`[Event] Client probe: ${data.clientId} from ${data.ip}:${data.port}`);
});

detector.on('detectionComplete', (result) => {
  console.log(`[Event] Detection complete: ${result.clientId} -> ${result.natType}`);
  console.log(`         Public IP: ${result.publicIP}:${result.publicPort}`);
  console.log(`         Confidence: ${(result.confidence * 100).toFixed(0)}%`);
});

detector.on('detectionStart', (clientId) => {
  console.log(`[Event] Detection started for: ${clientId}`);
});

// Graceful shutdown
function shutdown(): void {
  console.log('\n[Server] Shutting down...');
  detector.stop();
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function main(): Promise<void> {
  try {
    // Start HTTP server first
    httpServer.listen(CONFIG.HTTP_PORT, CONFIG.HOST, () => {
      console.log(`[HTTP] Server running on http://${CONFIG.HOST}:${CONFIG.HTTP_PORT}`);
    });

    // Start NAT detector (STUN + WebSocket)
    await detector.start();

    console.log('\n========================================');
    console.log('  NAT Type Detection Server Started!');
    console.log('========================================');
    console.log('');
    console.log('  Detection UI: http://localhost:' + CONFIG.HTTP_PORT + '/client/');
    console.log('  Server Status: http://localhost:' + CONFIG.HTTP_PORT + '/status');
    console.log('');
    console.log('  Use WebSocket on port ' + CONFIG.WS_PORT + ' for client connections');
    console.log('  STUN listening on UDP ports ' + CONFIG.STUN_PORT + ', ' + (CONFIG.STUN_PORT + 1));
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('========================================\n');
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

main();
