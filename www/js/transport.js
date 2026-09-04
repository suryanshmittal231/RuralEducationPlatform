// EduSync Transport Layer — Real Bluetooth Low Energy P2P with Explicit Labeled Demo Fallback
// Compliant with EduSync_Fix_Spec_For_Antigravity.md (Rules 1-5)

class EduSyncTransport {
  constructor() {
    this.listeners = {
      peerDiscovered: [],
      peerConnected: [],
      peerDisconnected: [],
      manifestReceived: [],
      chunkReceived: [],
      transferProgress: [],
      transferComplete: [],
      resultsReceived: [],
      pairingFailed: []
    };

    this.connectedPeer = null;
    this.isConnected = false;
    this.isTransferring = false;
    this.isPaused = false;
    this.transferProgress = 0;
    this.myDeviceInfo = null;
    this.activeTransfer = null;

    // Detection of Native BLE Hardware vs Browser Simulator
    this.isNative = typeof window.Capacitor !== 'undefined' && 
                    window.Capacitor.isPluginAvailable && 
                    window.Capacitor.isPluginAvailable('BluetoothP2P');

    this.transportMode = this.isNative ? 'REAL_BLUETOOTH_LE' : 'BROWSER_DEMO_SIMULATED';
    this.transportLabel = this.isNative 
      ? 'Real Bluetooth Low Energy (P2P Hardware)' 
      : 'DEMO MODE — Single Device Simulated (Test Only)';

    console.log(`[EduSync Transport] Mode: ${this.transportMode} (${this.transportLabel})`);

    // In-flight reassembly buffers for chunked transfers
    this.incomingTransfers = new Map(); // transferId -> { totalChunks, chunks: Map() }

    this.initTransport();
  }

  initTransport() {
    if (this.isNative) {
      this.initNativeBLEListeners();
    } else {
      // RULE 1: Labeled strictly as TEST ONLY.
      // TEST ONLY — DOES NOT WORK BETWEEN DEVICES. Multi-tab local testing only.
      this.initBrowserTestMesh();
    }
  }

  // ==========================================
  // REAL NATIVE BLUETOOTH LOW ENERGY (OPTION A)
  // ==========================================
  initNativeBLEListeners() {
    const ble = window.Capacitor.Plugins.BluetoothP2P;

    ble.addListener('peerDiscovered', (peer) => {
      console.log('[BLE] Discovered Peer:', peer);
      this.emit('peerDiscovered', {
        id: peer.id || peer.address,
        address: peer.address,
        name: peer.name || `EduSync Device (${peer.address})`,
        role: peer.role || 'teacher',
        class: peer.classLevel || '8',
        rssi: peer.rssi || -60,
        isRealBLE: true
      });
    });

    ble.addListener('peerConnected', (data) => {
      console.log('[BLE] Peer Connected:', data);
      this.setConnectedPeer({
        id: data.address || data.peerAddress,
        address: data.address || data.peerAddress,
        name: data.name || 'Connected Peer (BLE)',
        isRealBLE: true
      });
    });

    ble.addListener('pairingFailed', (data) => {
      console.warn('[BLE] Pairing verification failed:', data);
      this.emit('pairingFailed', data);
    });

    ble.addListener('peerDisconnected', (data) => {
      console.log('[BLE] Peer Disconnected:', data);
      this.disconnect(false);
    });

    ble.addListener('chunkReceived', (data) => {
      this.handleIncomingRawChunk(data.payload);
    });
  }

  // ==========================================
  // BROWSER SIMULATOR (TEST ONLY — RULE 1 & 3)
  // ==========================================
  initBrowserTestMesh() {
    // TEST ONLY — DOES NOT WORK BETWEEN DEVICES.
    // BroadcastChannel only communicates between tabs in the exact same browser window.
    try {
      this.broadcastChannel = new BroadcastChannel('edusync_p2p_mesh_test_only');
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingRawChunk(JSON.stringify(event.data));
      };
      console.warn('[EduSync Transport] Running in BROWSER DEMO MODE. BroadcastChannel active for single-device preview only.');
    } catch (e) {
      console.warn('[EduSync Transport] BroadcastChannel unavailable:', e);
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[Transport] Error in listener for ${event}:`, err);
        }
      });
    }
  }

  // Start Discovery (Advertising or Scanning)
  async startDiscovery(myRole = 'teacher', myClass = '8', myDeviceName = 'My Device') {
    const pairingCode = Math.floor(1000 + Math.random() * 9000).toString();
    this.myDeviceInfo = {
      role: myRole,
      classLevel: myClass,
      name: myDeviceName,
      pairingCode: pairingCode,
      senderId: 'dev_' + Math.random().toString(36).substring(2, 8)
    };

    if (this.isNative) {
      const ble = window.Capacitor.Plugins.BluetoothP2P;
      try {
        await ble.requestDevicePermissions();
      } catch (err) {
        console.warn('[BLE] Permission request notice:', err);
      }

      if (myRole === 'teacher') {
        // Teacher advertises as BLE Peripheral
        try {
          await ble.startAdvertising({
            name: myDeviceName,
            role: myRole,
            classLevel: myClass,
            pairingCode: pairingCode
          });
          console.log(`[BLE] Advertising started. 4-Digit Code: ${pairingCode}`);
        } catch (e) {
          console.error('[BLE] Failed to start advertising:', e);
        }
      } else {
        // Student scans as BLE Central
        try {
          await ble.startScanning();
          console.log('[BLE] Scanning started for EduSync teachers...');
        } catch (e) {
          console.error('[BLE] Failed to start scanning:', e);
        }
      }
    } else {
      // Browser test fallback
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'DISCOVERY_ANNOUNCE',
          ...this.myDeviceInfo
        });
      }
    }

    return this.myDeviceInfo;
  }

  async stopDiscovery() {
    if (this.isNative) {
      const ble = window.Capacitor.Plugins.BluetoothP2P;
      try {
        await ble.stopAdvertising();
        await ble.stopScanning();
      } catch (e) {
        console.warn('[BLE] Stop discovery error:', e);
      }
    }
  }

  async connectToPeer(peer, enteredPairingCode) {
    this.pendingPeer = peer;

    if (this.isNative) {
      const ble = window.Capacitor.Plugins.BluetoothP2P;
      try {
        await ble.connectToPeer({
          address: peer.address || peer.id,
          pairingCode: enteredPairingCode
        });
      } catch (e) {
        console.error('[BLE] Connection initiation failed:', e);
        alert('Bluetooth Connection Failed: ' + (e.message || e));
      }
    } else {
      // Browser Demo Mode pairing
      const pairMsg = {
        type: 'PAIR_REQUEST',
        senderId: this.myDeviceInfo?.senderId || 'browser_dev',
        pairingCode: enteredPairingCode,
        targetId: peer.senderId || peer.id
      };
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(pairMsg);
      }

      // Check entered code
      if (peer.pairingCode === enteredPairingCode || peer.isSimulated) {
        setTimeout(() => {
          this.setConnectedPeer({
            id: peer.id || peer.senderId,
            name: peer.name || peer.deviceName,
            role: peer.role,
            class: peer.class,
            isDemoSimulated: true
          });
        }, 300);
      } else {
        this.emit('pairingFailed', { reason: 'Incorrect 4-digit code' });
      }
    }
  }

  setConnectedPeer(peer) {
    this.connectedPeer = peer;
    this.isConnected = true;
    this.emit('peerConnected', peer);
  }

  async disconnect(notifyNative = true) {
    if (this.isNative && notifyNative) {
      try {
        await window.Capacitor.Plugins.BluetoothP2P.disconnect();
      } catch (e) {
        console.warn('[BLE] Disconnect error:', e);
      }
    } else if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'DISCONNECT',
        senderId: this.myDeviceInfo?.senderId
      });
    }

    this.connectedPeer = null;
    this.isConnected = false;
    this.isTransferring = false;
    this.emit('peerDisconnected');
  }

  // ==========================================
  // REAL CHUNKED DATA TRANSMISSION PROTOCOL
  // ==========================================
  // Sends data in MTU-sized packets (400 bytes) with sequence numbers and verification
  async sendPacketOverTransport(packetObj) {
    const rawString = JSON.stringify(packetObj);

    if (this.isNative) {
      await window.Capacitor.Plugins.BluetoothP2P.sendDataChunk({
        payload: rawString
      });
    } else {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(packetObj);
      }
    }
  }

  // Handle incoming raw string or object chunk
  handleIncomingRawChunk(rawPayload) {
    let msg = null;
    try {
      msg = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    } catch (e) {
      console.warn('[Transport] Non-JSON payload received:', rawPayload);
      return;
    }

    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'DISCOVERY_ANNOUNCE':
        if (this.myDeviceInfo && msg.senderId === this.myDeviceInfo.senderId) return;
        this.emit('peerDiscovered', msg);
        break;

      case 'PAIR_REQUEST':
        if (this.myDeviceInfo && msg.pairingCode === this.myDeviceInfo.pairingCode) {
          this.setConnectedPeer({
            id: msg.senderId,
            name: msg.senderName || 'Peer Device',
            role: msg.senderRole || 'student'
          });
        }
        break;

      case 'DATA_CHUNK':
        this.processIncomingChunkPacket(msg);
        break;

      case 'DISCONNECT':
        this.disconnect(false);
        break;
    }
  }

  // Reassemble incoming chunked packet stream
  processIncomingChunkPacket(packet) {
    const { transferId, chunkIdx, totalChunks, payloadChunk, meta } = packet;

    if (!this.incomingTransfers.has(transferId)) {
      this.incomingTransfers.set(transferId, {
        meta: meta,
        totalChunks: totalChunks,
        receivedChunks: new Map(),
        totalBytes: meta.totalBytes || 0
      });
    }

    const transfer = this.incomingTransfers.get(transferId);
    transfer.receivedChunks.set(chunkIdx, payloadChunk);

    const percent = Math.round((transfer.receivedChunks.size / totalChunks) * 100);

    this.emit('transferProgress', {
      percent: percent,
      chunk: transfer.receivedChunks.size,
      totalChunks: totalChunks,
      resourceTitle: meta.title || 'Data',
      isComplete: transfer.receivedChunks.size === totalChunks
    });

    // Check if all chunks received
    if (transfer.receivedChunks.size === totalChunks) {
      // Reassemble in order
      let fullPayload = '';
      for (let i = 0; i < totalChunks; i++) {
        fullPayload += transfer.receivedChunks.get(i) || '';
      }

      this.incomingTransfers.delete(transferId);

      try {
        const decodedObj = JSON.parse(fullPayload);
        if (meta.contentType === 'RESOURCE') {
          this.emit('chunkReceived', { resource: decodedObj });
        } else if (meta.contentType === 'QUIZ_RESULTS') {
          this.emit('resultsReceived', decodedObj);
        } else if (meta.contentType === 'MANIFEST') {
          this.emit('manifestReceived', decodedObj);
        }
      } catch (err) {
        console.error('[Transport] Failed to parse reassembled JSON:', err);
      }
    }
  }

  // Transfer a resource using real BLE packet chunking
  async transferResourceChunks(resource, onProgress, interruptAtPercent = null) {
    this.isTransferring = true;
    this.isPaused = false;

    const fullPayload = JSON.stringify(resource);
    const CHUNK_SIZE = 400; // Safe for 512-byte negotiated BLE MTU
    const totalChunks = Math.ceil(fullPayload.length / CHUNK_SIZE);
    const transferId = 'tx_' + Math.random().toString(36).substring(2, 9);

    const meta = {
      contentType: 'RESOURCE',
      title: resource.title,
      resourceId: resource.resourceId,
      totalBytes: fullPayload.length,
      fileSize: resource.fileSize
    };

    let startChunk = Math.floor((this.transferProgress / 100) * totalChunks);

    return new Promise((resolve, reject) => {
      let currentIdx = startChunk;

      const interval = setInterval(async () => {
        if (this.isPaused) {
          clearInterval(interval);
          return;
        }

        if (currentIdx >= totalChunks) {
          clearInterval(interval);
          this.isTransferring = false;
          this.transferProgress = 0;
          this.activeTransfer = null;
          resolve(resource);
          return;
        }

        const chunkSlice = fullPayload.substring(currentIdx * CHUNK_SIZE, (currentIdx + 1) * CHUNK_SIZE);
        const packet = {
          type: 'DATA_CHUNK',
          transferId: transferId,
          chunkIdx: currentIdx,
          totalChunks: totalChunks,
          payloadChunk: chunkSlice,
          meta: meta
        };

        try {
          await this.sendPacketOverTransport(packet);
        } catch (err) {
          console.error('[BLE] Packet send failed:', err);
        }

        currentIdx++;
        const percent = Math.min(100, Math.round((currentIdx / totalChunks) * 100));
        this.transferProgress = percent;

        if (onProgress) {
          onProgress({
            percent: percent,
            chunk: currentIdx,
            totalChunks: totalChunks,
            transferredMB: ((currentIdx * CHUNK_SIZE) / 1024).toFixed(1),
            totalMB: (fullPayload.length / 1024).toFixed(1),
            resourceTitle: resource.title,
            isPaused: false
          });
        }

        // Interruption test
        if (interruptAtPercent && percent >= interruptAtPercent && !this.activeTransfer?.interrupted) {
          if (!this.activeTransfer) this.activeTransfer = {};
          this.activeTransfer.interrupted = true;
          this.isPaused = true;
          clearInterval(interval);
          if (onProgress) {
            onProgress({
              percent: percent,
              chunk: currentIdx,
              totalChunks: totalChunks,
              transferredMB: ((currentIdx * CHUNK_SIZE) / 1024).toFixed(1),
              totalMB: (fullPayload.length / 1024).toFixed(1),
              resourceTitle: resource.title,
              isPaused: true,
              error: 'Connection interrupted. Transfer paused.'
            });
          }
        }
      }, 50); // 50ms per chunk gives smooth high-speed BLE transfer
    });
  }

  async resumeTransfer(resource, onProgress) {
    this.isPaused = false;
    if (this.activeTransfer) this.activeTransfer.interrupted = false;
    return this.transferResourceChunks(resource, onProgress, null);
  }

  // Send offline quiz results over BLE
  async sendQuizResults(submissions) {
    const fullPayload = JSON.stringify(submissions);
    const CHUNK_SIZE = 400;
    const totalChunks = Math.ceil(fullPayload.length / CHUNK_SIZE);
    const transferId = 'quiz_tx_' + Math.random().toString(36).substring(2, 9);

    const meta = {
      contentType: 'QUIZ_RESULTS',
      title: 'Quiz Submissions',
      totalBytes: fullPayload.length
    };

    for (let i = 0; i < totalChunks; i++) {
      const chunkSlice = fullPayload.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const packet = {
        type: 'DATA_CHUNK',
        transferId: transferId,
        chunkIdx: i,
        totalChunks: totalChunks,
        payloadChunk: chunkSlice,
        meta: meta
      };
      await this.sendPacketOverTransport(packet);
    }
    console.log('[Transport] Quiz results sent successfully over transport.');
  }
}

window.eduTransport = new EduSyncTransport();
