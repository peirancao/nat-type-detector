/**
 * NAT Type Detector - Client
 * 
 * Detects client's NAT type by connecting to detection server
 * and performing STUN-based probing.
 */

// Configuration
const CONFIG = {
  WS_URL: `ws://${window.location.hostname}:8080`,
  STUN_SERVER: window.location.hostname,
  STUN_PORTS: [3478, 3479],
  DETECTION_TIMEOUT: 30000,
  PROBE_INTERVAL: 1000
};

// State
const state = {
  ws: null,
  clientId: null,
  isConnected: false,
  isDetecting: false,
  probeResults: [],
  startTime: null,
  probeTimer: null
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connection-status'),
  statusIndicator: document.querySelector('.status-indicator'),
  statusText: document.querySelector('.status-text'),
  startView: document.getElementById('start-view'),
  progressView: document.getElementById('progress-view'),
  resultView: document.getElementById('result-view'),
  startBtn: document.getElementById('start-btn'),
  retryBtn: document.getElementById('retry-btn'),
  progressPercent: document.getElementById('progress-percent'),
  progressTitle: document.getElementById('progress-title'),
  progressDesc: document.getElementById('progress-desc'),
  progressRing: document.getElementById('progress-ring'),
  probeCount: document.getElementById('probe-count'),
  timeElapsed: document.getElementById('time-elapsed'),
  resultIcon: document.getElementById('result-icon'),
  resultType: document.getElementById('result-type'),
  resultDifficulty: document.getElementById('result-difficulty'),
  resultIP: document.getElementById('result-ip'),
  resultPort: document.getElementById('result-port'),
  resultConfidence: document.getElementById('result-confidence'),
  resultDescText: document.getElementById('result-desc-text'),
  resultAdviceText: document.getElementById('result-advice-text'),
  resultScenariosList: document.getElementById('result-scenarios-list')
};

// NAT Type definitions
const NAT_INFO = {
  'Open Internet': {
    icon: '🟢',
    difficulty: 'easy',
    difficultyText: '⭐ 最佳',
    description: '你的网络直接暴露在公网，没有NAT转换。这是最理想的网络环境，P2P连接最容易成功。',
    advice: '无需任何穿透操作，直接建立连接即可。',
    scenarios: ['P2P文件分享', '视频通话', '在线游戏', '任何需要端到端连接的应用']
  },
  'Full Cone NAT': {
    icon: '🟢',
    difficulty: 'easy',
    difficultyText: '⭐ 容易',
    description: '全锥型NAT，任何外部主机都可以通过映射的公网IP:Port发送数据到你的设备。穿透相对容易。',
    advice: '简单的UDP打洞即可建立连接，成功率很高。',
    scenarios: ['P2P连接', '游戏', '视频通话']
  },
  'Restricted Cone NAT': {
    icon: '🟡',
    difficulty: 'medium',
    difficultyText: '⭐⭐ 中等',
    description: '受限锥型NAT，只有你之前发送过请求的IP才能向你发送数据。需要双向UDP打洞。',
    advice: '需要进行UDP打洞，客户端双方都需要主动发起连接。',
    scenarios: ['P2P连接', '游戏', '视频通话（可能需要中继）']
  },
  'Port Restricted Cone NAT': {
    icon: '🟠',
    difficulty: 'hard',
    difficultyText: '⭐⭐⭐ 较难',
    description: '端口受限锥型NAT，不仅限制IP还限制端口。只能向之前通信过的IP:Port发送数据。',
    advice: '打洞难度较高，建议配合TURN中继服务器使用。',
    scenarios: ['需要中继的通信', '对延迟要求不高的应用']
  },
  'Symmetric NAT': {
    icon: '🔴',
    difficulty: 'very-hard',
    difficultyText: '⭐⭐⭐⭐ 极难',
    description: '对称型NAT，每个目标IP:Port组合都会分配不同的映射端口。最难穿透的NAT类型。',
    advice: '几乎无法直接打洞，建议使用TURN中继服务器（如coturn）作为通信中转。',
    scenarios: ['必须使用中继服务', '对带宽/低延迟要求不高的场景']
  },
  'Unknown': {
    icon: '❓',
    difficulty: 'medium',
    difficultyText: '未知',
    description: '无法确定NAT类型，可能是因为检测探针不足或网络环境复杂。',
    advice: '建议重试检测或联系网络管理员。',
    scenarios: ['使用中继服务', '联系技术支持']
  }
};

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  connectWebSocket();
});

function initEventListeners() {
  elements.startBtn.addEventListener('click', startDetection);
  elements.retryBtn.addEventListener('click', resetAndRetry);
}

// ========================================
// WebSocket Connection
// ========================================

function connectWebSocket() {
  updateConnectionStatus('connecting');
  
  try {
    state.ws = new WebSocket(CONFIG.WS_URL);
    
    state.ws.onopen = () => {
      console.log('[WS] Connected');
      state.isConnected = true;
      updateConnectionStatus('connected');
    };
    
    state.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('[WS] Error parsing message:', err);
      }
    };
    
    state.ws.onclose = () => {
      console.log('[WS] Disconnected');
      state.isConnected = false;
      updateConnectionStatus('disconnected');
      
      // Attempt reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };
    
    state.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      updateConnectionStatus('error');
    };
  } catch (err) {
    console.error('[WS] Connection failed:', err);
    updateConnectionStatus('error');
  }
}

function sendMessage(type, payload = {}) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type, payload }));
  }
}

// ========================================
// Message Handlers
// ========================================

function handleServerMessage(message) {
  console.log('[WS] Received:', message.type, message.payload);
  
  switch (message.type) {
    case 'welcome':
      state.clientId = message.payload.clientId;
      console.log('[WS] Client ID:', state.clientId);
      break;
      
    case 'detection_start':
      startProbing();
      break;
      
    case 'probe_acknowledged':
      updateProbeProgress(message.payload.count, message.payload.required);
      break;
      
    case 'detection_complete':
      showResult(message.payload);
      break;
      
    case 'error':
      console.error('[WS] Server error:', message.payload);
      alert('检测出错: ' + message.payload.message);
      resetToStart();
      break;
  }
}

// ========================================
// Detection Flow
// ========================================

function startDetection() {
  if (!state.isConnected) {
    alert('请等待连接到服务器');
    return;
  }
  
  state.isDetecting = true;
  state.probeResults = [];
  state.startTime = Date.now();
  
  showView('progress');
  updateProgressUI(0, '正在启动检测...', '准备连接服务器');
  elements.startBtn.disabled = true;
  
  sendMessage('start_detection');
}

function startProbing() {
  updateProgressUI(10, '正在发送探针...', '第一阶段：基础连接测试');
  
  // Simulate STUN probing - in real implementation, use RTCPeerConnection
  // to gather candidate information
  performStunProbes();
}

async function performStunProbes() {
  const probeCount = 4;
  
  for (let i = 0; i < probeCount; i++) {
    if (!state.isDetecting) break;
    
    await sleep(CONFIG.PROBE_INTERVAL);
    
    // Simulate probe result
    const probeResult = {
      ip: '203.0.113.' + Math.floor(Math.random() * 255),
      port: 40000 + Math.floor(Math.random() * 10000),
      timestamp: Date.now()
    };
    
    state.probeResults.push(probeResult);
    
    const progress = 20 + Math.floor((i + 1) / probeCount * 60);
    const messages = [
      '正在发送探针...',
      '分析端口映射...',
      '检查IP一致性...',
      '完成最终分析...'
    ];
    
    updateProgressUI(progress, messages[i], `探针 ${i + 1}/${probeCount} 已发送`);
    sendMessage('probe_result', probeResult);
  }
}

function updateProbeProgress(count, required) {
  const progress = 20 + Math.floor((count / required) * 60);
  updateProgressUI(progress, '等待服务器分析...', `收到 ${count}/${required} 个探针响应`);
}

// ========================================
// UI Updates
// ========================================

function showView(viewName) {
  elements.startView.classList.remove('active');
  elements.progressView.classList.remove('active');
  elements.resultView.classList.remove('active');
  
  switch (viewName) {
    case 'start':
      elements.startView.classList.add('active');
      break;
    case 'progress':
      elements.progressView.classList.add('active');
      break;
    case 'result':
      elements.resultView.classList.add('active');
      break;
  }
}

function updateProgressUI(percent, title, desc) {
  elements.progressPercent.textContent = percent;
  elements.progressTitle.textContent = title;
  elements.progressDesc.textContent = desc;
  
  // Update progress ring
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (percent / 100) * circumference;
  elements.progressRing.style.strokeDashoffset = offset;
  
  // Update probe count
  elements.probeCount.textContent = `${state.probeResults.length} / 4`;
  
  // Update elapsed time
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  elements.timeElapsed.textContent = `${elapsed}s`;
  
  // Schedule UI update during detection
  if (state.isDetecting && percent < 90) {
    setTimeout(() => {
      if (state.isDetecting) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        elements.timeElapsed.textContent = `${elapsed}s`;
      }
    }, 1000);
  }
}

function showResult(result) {
  state.isDetecting = false;
  
  // Stop timers
  if (state.probeTimer) {
    clearInterval(state.probeTimer);
  }
  
  showView('result');
  
  const natInfo = NAT_INFO[result.natType] || NAT_INFO['Unknown'];
  
  // Update result UI
  elements.resultIcon.textContent = natInfo.icon;
  elements.resultType.textContent = result.natType;
  elements.resultDifficulty.textContent = natInfo.difficultyText;
  elements.resultDifficulty.className = `difficulty-badge ${natInfo.difficulty}`;
  
  elements.resultIP.textContent = result.publicIP;
  elements.resultPort.textContent = result.publicPort;
  elements.resultConfidence.textContent = `${(result.confidence * 100).toFixed(0)}%`;
  
  elements.resultDescText.textContent = natInfo.description;
  elements.resultAdviceText.textContent = natInfo.advice;
  
  // Update scenarios list
  elements.resultScenariosList.innerHTML = '';
  natInfo.scenarios.forEach(scenario => {
    const li = document.createElement('li');
    li.textContent = scenario;
    elements.resultScenariosList.appendChild(li);
  });
  
  elements.startBtn.disabled = false;
}

function resetToStart() {
  state.isDetecting = false;
  state.probeResults = [];
  showView('start');
  elements.startBtn.disabled = false;
}

function resetAndRetry() {
  resetToStart();
  setTimeout(startDetection, 100);
}

// ========================================
// Connection Status
// ========================================

function updateConnectionStatus(status) {
  const indicator = elements.statusIndicator;
  const text = elements.statusText;
  
  indicator.className = 'status-indicator';
  
  switch (status) {
    case 'connecting':
      indicator.classList.add('offline');
      text.textContent = '正在连接服务器...';
      break;
    case 'connected':
      indicator.classList.add('online');
      text.textContent = '已连接到服务器';
      break;
    case 'disconnected':
    case 'error':
      indicator.classList.add('offline');
      text.textContent = '连接断开，正在重连...';
      break;
  }
}

// ========================================
// Utilities
// ========================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// STUN Client (Simplified for demo)
// ========================================

/**
 * In a real implementation, this would use RTCPeerConnection
 * to gather ICE candidates and analyze them.
 * 
 * For this demo, we simulate the STUN behavior.
 */
class StunClient {
  constructor(server, ports) {
    this.server = server;
    this.ports = ports;
    this.results = [];
  }
  
  async gatherCandidates() {
    // This is a simplified demo implementation
    // Real implementation would use WebRTC ICE gathering
    
    const candidates = [];
    
    // Simulate gathering ICE candidates
    for (const port of this.ports) {
      candidates.push({
        type: 'candidate',
        foundation: '1',
        component: '1',
        protocol: 'UDP',
        port: port,
        priority: 100
      });
    }
    
    return candidates;
  }
}

// Export for potential module use
window.NatDetector = {
  CONFIG,
  state,
  startDetection,
  resetAndRetry
};
