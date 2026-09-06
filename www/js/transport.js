// EduSync Transport Layer — Real Bluetooth P2P Engine (Dual-layer RFCOMM SPP + BLE)
// Compliant with EduSync Specifications

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
      pairingFailed: [],
      bluetoothState: []
    };

    this.connectedPeer = null;
    this.isConnected = false;
    this.isTransferring = false;
    this.isPaused = false;
    this.transferProgress = 0;
    this.myDeviceInfo = null;
    this.activeTransfer = null;

    // Native Capacitor Bluetooth plugin detection
    this.isNative = typeof window.Capacitor !== 'undefined' && 
                    window.Capacitor.isPluginAvailable && 
                    window.Capacitor.isPluginAvailable('BluetoothP2P');

    this.transportMode = this.isNative ? 'REAL_BLUETOOTH_P2P' : 'BROWSER_DEMO_SIMULATED';
    this.transportLabel = this.isNative 
      ? 'Real Bluetooth Hardware (Direct P2P)' 
      : 'DEMO MODE — Single Device Simulated (Test Only)';

    console.log(`[EduSync Transport] Initialized: ${this.transportMode}`);

    // In-flight chunk reassembly buffers
    this.incomingTransfers = new Map(); // transferId -> { meta, totalChunks, receivedChunks }

    this.initTransport();
  }

  initTransport() {
    if (this.isNative) {
      this.initNativeBLEListeners();
    } else {
      // BROWSER PREVIEW ONLY (Local multi-tab simulation)
      this.initBrowserTestMesh();
    }
  }

  // =========================================================================
  // REAL NATIVE BLUETOOTH LISTENERS
  // =========================================================================
  initNativeBLEListeners() {
    const bt = window.Capacitor.Plugins.BluetoothP2P;

    bt.addListener('peerDiscovered', (peer) => {
      console.log('[Bluetooth] Peer Discovered:', peer);
      this.emit('peerDiscovered', {
        id: peer.id || peer.address,
        address: peer.address,
        name: peer.name || `EduSync Device (${peer.address})`,
        role: peer.role || 'teacher',
        class: peer.classLevel || '8',
        rssi: peer.rssi || -60,
        isRealBT: true
      });
    });

    bt.addListener('peerConnected', async (data) => {
      console.log('[Bluetooth] Peer Connected:', data);
      this.setConnectedPeer({
        id: data.address || data.peerAddress,
        address: data.address || data.peerAddress,
        name: data.name || 'Connected Peer (Bluetooth)',
        role: data.role || (this.myDeviceInfo?.role === 'teacher' ? 'student' : 'teacher'),
        isRealBT: true,
        isRFCOMM: data.isRFCOMM || false
      });

      // If Teacher: automatically send our full educational manifest to the student
      const isTeacher = this.myDeviceInfo?.role === 'teacher' || (window.eduApp && window.eduApp.currentRole === 'teacher');
      if (isTeacher && window.eduDB) {
        try {
          const manifest = await window.eduDB.generateManifest(false);
          console.log(`[Teacher BT] Broadcasting manifest (${manifest.length} items) to student...`);
          await this.sendPacketOverTransport({
            type: 'MANIFEST_ANNOUNCE',
            senderRole: 'teacher',
            senderName: this.myDeviceInfo?.name || 'Teacher',
            manifest: manifest
          });
        } catch (err) {
          console.error('[Teacher BT] Error sending initial manifest:', err);
        }
      } else {
        // If Student: request teacher's manifest
        setTimeout(() => this.requestTeacherManifest(), 400);
      }
    });

    bt.addListener('pairingFailed', (data) => {
      console.warn('[Bluetooth] Pairing verification failed:', data);
      this.emit('pairingFailed', data);
    });

    bt.addListener('peerDisconnected', (data) => {
      console.log('[Bluetooth] Peer Disconnected:', data);
      this.disconnect(false);
    });

    bt.addListener('chunkReceived', (data) => {
      console.log('[Bluetooth] Native chunkReceived event payload received:', data);
      const payload = (data && typeof data.payload !== 'undefined') ? data.payload : data;
      this.handleIncomingRawChunk(payload);
    });
  }

  // =========================================================================
  // BROWSER DEMO MODE (TEST PREVIEW ONLY)
  // =========================================================================
  initBrowserTestMesh() {
    try {
      this.broadcastChannel = new BroadcastChannel('edusync_p2p_mesh_test_only');
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingRawChunk(JSON.stringify(event.data));
      };
      console.warn('[EduSync Transport] Running in BROWSER DEMO MODE. BroadcastChannel active for single-device preview.');
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

  // Request native permissions & enable Bluetooth
  async prepareBluetooth() {
    if (this.isNative) {
      const bt = window.Capacitor.Plugins.BluetoothP2P;
      try {
        await bt.requestDevicePermissions();
      } catch (err) {
        console.warn('[Bluetooth] Permissions prompt notice:', err);
      }
      try {
        await bt.enableBluetooth();
      } catch (err) {
        console.warn('[Bluetooth] Enable BT prompt notice:', err);
      }
    }
  }

  async fetchPairedDevices() {
    if (this.isNative) {
      try {
        const res = await window.Capacitor.Plugins.BluetoothP2P.getPairedDevices();
        if (res && Array.isArray(res.devices)) {
          res.devices.forEach(d => {
            this.emit('peerDiscovered', {
              id: d.id || d.address,
              address: d.address,
              name: d.name || `Paired (${d.address})`,
              role: 'teacher',
              class: '8',
              rssi: -45,
              isPaired: true,
              isRealBT: true
            });
          });
        }
      } catch (err) {
        console.warn('[Bluetooth] Error fetching paired devices:', err);
      }
    }
  }

  // Start Discovery (Teacher Advertises, Student Scans)
  async startDiscovery(myRole = 'teacher', myClass = '8', myDeviceName = 'My Device') {
    await this.prepareBluetooth();

    const pairingCode = Math.floor(1000 + Math.random() * 9000).toString();
    this.myDeviceInfo = {
      role: myRole,
      classLevel: myClass,
      name: myDeviceName,
      pairingCode: pairingCode,
      senderId: 'dev_' + Math.random().toString(36).substring(2, 8)
    };

    if (this.isNative) {
      const bt = window.Capacitor.Plugins.BluetoothP2P;

      if (myRole === 'teacher') {
        // Teacher starts advertising & RFCOMM SPP Server
        try {
          await bt.startAdvertising({
            name: myDeviceName,
            role: myRole,
            classLevel: myClass,
            pairingCode: pairingCode
          });
          console.log(`[Bluetooth] Teacher Server active. 4-Digit Code: ${pairingCode}`);
        } catch (e) {
          console.error('[Bluetooth] Failed to start advertising:', e);
        }
      } else {
        // Student starts scanning for nearby Teacher devices (BLE + Classic)
        try {
          await this.fetchPairedDevices();
          await bt.startScanning();
          console.log('[Bluetooth] Student Scanner active (BLE + Classic Discovery)...');
        } catch (e) {
          console.error('[Bluetooth] Failed to start scanning:', e);
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
      const bt = window.Capacitor.Plugins.BluetoothP2P;
      try {
        await bt.stopAdvertising();
        await bt.stopScanning();
      } catch (e) {
        console.warn('[Bluetooth] Stop discovery error:', e);
      }
    }
  }

  // Student connects to Teacher with 4-digit verification code
  async connectToPeer(peer, enteredPairingCode) {
    this.pendingPeer = peer;

    if (this.isNative) {
      const bt = window.Capacitor.Plugins.BluetoothP2P;
      try {
        await bt.connectToPeer({
          address: peer.address || peer.id,
          pairingCode: enteredPairingCode,
          studentName: this.myDeviceInfo?.name || "Student's Phone"
        });
      } catch (e) {
        console.error('[Bluetooth] Connection initiation failed:', e);
        alert('Bluetooth Connection Failed: ' + (e.message || e));
      }
    } else {
      // Browser Demo Mode pairing
      if (peer.pairingCode === enteredPairingCode || peer.isSimulated) {
        setTimeout(async () => {
          this.setConnectedPeer({
            id: peer.id || peer.senderId,
            name: peer.name || peer.deviceName,
            role: peer.role,
            class: peer.class,
            isDemoSimulated: true
          });

          // In browser demo mode, simulate manifest exchange
          if (window.eduDB) {
            const manifest = await window.eduDB.generateManifest(false);
            this.emit('manifestReceived', manifest);
          }
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
        console.warn('[Bluetooth] Disconnect error:', e);
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

  // =========================================================================
  // PACKET SERIALIZATION & DISPATCH
  // =========================================================================
  async sendPacketOverTransport(packetObj) {
    try {
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
    } catch (err) {
      console.warn('[Transport] Error sending packet over transport:', err);
    }
  }

  // Handle incoming raw string or JSON packet
  async handleIncomingRawChunk(rawPayload) {
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

      case 'MANIFEST_ANNOUNCE':
      case 'MANIFEST_RESPONSE':
        console.log('[Transport] Received Educational Manifest:', msg.manifest);
        this.emit('manifestReceived', msg.manifest || []);
        break;

      case 'REQUEST_MANIFEST':
        console.log('[Teacher BT] Received REQUEST_MANIFEST from student.');
        if ((!this.myDeviceInfo || this.myDeviceInfo.role === 'teacher' || window.eduApp?.currentRole === 'teacher') && window.eduDB) {
          try {
            const manifest = await window.eduDB.generateManifest(false);
            console.log(`[Teacher BT] Dispatching MANIFEST_RESPONSE (${manifest.length} items)...`);
            await this.sendPacketOverTransport({
              type: 'MANIFEST_RESPONSE',
              senderRole: 'teacher',
              senderName: this.myDeviceInfo?.name || 'Teacher',
              manifest: manifest
            });
          } catch (err) {
            console.error('[Teacher BT] Error sending manifest response:', err);
          }
        }
        break;

      case 'REQUEST_RESOURCES':
        // Teacher receives request from student for specific missing resource IDs
        console.log('[Teacher BT] Student requested missing resources:', msg.resourceIds);
        if ((!this.myDeviceInfo || this.myDeviceInfo.role === 'teacher' || window.eduApp?.currentRole === 'teacher') && window.eduSyncEngine) {
          window.eduSyncEngine.streamRequestedResourcesToStudent(msg.resourceIds);
        }
        break;

      case 'DIRECT_RESOURCE':
        console.log('[Transport] Received DIRECT_RESOURCE packet:', msg.resource?.title);
        if (msg.resource) {
          this.emit('chunkReceived', { resource: msg.resource });
        }
        break;

      case 'DATA_CHUNK':
        this.processIncomingChunkPacket(msg);
        break;

      case 'QUIZ_RESULTS':
        console.log('[Transport] Received Student Quiz Submissions:', msg.submissions);
        this.emit('resultsReceived', msg.submissions);
        break;

      case 'SYNC_COMPLETE_ACK':
        console.log('[Transport] Peer confirmed sync complete.');
        this.emit('transferComplete', msg);
        break;

      case 'DISCONNECT':
        this.disconnect(false);
        break;
    }
  }

  // Reassemble incoming chunked resource streams
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
      resourceTitle: meta.title || 'Educational Resource',
      isComplete: transfer.receivedChunks.size === totalChunks
    });

    // Check if all chunks received
    if (transfer.receivedChunks.size === totalChunks) {
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
        }
      } catch (err) {
        console.error('[Transport] Failed to parse reassembled JSON:', err);
      }
    }
  }

  // High-speed chunked transmission over Bluetooth
  async transferResourceChunks(resource, onProgress, interruptAtPercent = null) {
    this.isTransferring = true;
    this.isPaused = false;

    const fullPayload = JSON.stringify(resource);
    // 4KB chunks for RFCOMM SPP socket streaming / 400B for BLE
    const CHUNK_SIZE = 4096;
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

    for (let currentIdx = startChunk; currentIdx < totalChunks; currentIdx++) {
      if (this.isPaused) {
        break;
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
        console.error('[Bluetooth] Packet send failed:', err);
      }

      const percent = Math.min(100, Math.round(((currentIdx + 1) / totalChunks) * 100));
      this.transferProgress = percent;

      if (onProgress) {
        onProgress({
          percent: percent,
          chunk: currentIdx + 1,
          totalChunks: totalChunks,
          transferredMB: (((currentIdx + 1) * CHUNK_SIZE) / 1024).toFixed(1),
          totalMB: (fullPayload.length / 1024).toFixed(1),
          resourceTitle: resource.title,
          isPaused: false
        });
      }

      // Small 15ms buffer sleep between packets for socket reliability
      await new Promise(r => setTimeout(r, 15));
    }

    this.isTransferring = false;
    this.transferProgress = 0;
    this.activeTransfer = null;
    return resource;
  }

  async resumeTransfer(resource, onProgress) {
    this.isPaused = false;
    if (this.activeTransfer) this.activeTransfer.interrupted = false;
    return this.transferResourceChunks(resource, onProgress, null);
  }

  // Send offline quiz results back to teacher
  async sendQuizResults(submissions) {
    await this.sendPacketOverTransport({
      type: 'QUIZ_RESULTS',
      submissions: submissions
    });
    console.log('[Transport] Quiz results dispatched to Teacher.');
  }

  // Request teacher to send specified missing resource IDs
  async requestMissingResources(resourceIds) {
    await this.sendPacketOverTransport({
      type: 'REQUEST_RESOURCES',
      resourceIds: resourceIds
    });
  }

  // Request teacher to send latest manifest
  async requestTeacherManifest() {
    if (this.isConnected) {
      await this.sendPacketOverTransport({
        type: 'REQUEST_MANIFEST',
        senderRole: 'student'
      });
      console.log('[Student] Sent REQUEST_MANIFEST to Teacher.');
    }
  }
}

window.eduTransport = new EduSyncTransport();
