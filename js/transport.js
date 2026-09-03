// EduSync Transport Layer & Chunked Sync Protocol
// Abstraction supporting WebRTC DataChannel, BroadcastChannel (Local Mesh), & Simulated BLE Transport

class EduSyncTransport {
  constructor() {
    this.transportName = 'P2P Hybrid Transport (WebRTC / Mesh)';
    this.broadcastChannel = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.connectedPeer = null;
    this.isConnected = false;
    this.isTransferring = false;
    this.isPaused = false;
    this.transferProgress = 0;
    this.listeners = {
      peerDiscovered: [],
      peerConnected: [],
      peerDisconnected: [],
      manifestReceived: [],
      chunkReceived: [],
      transferProgress: [],
      transferComplete: [],
      resultsReceived: []
    };

    this.initBroadcastMesh();
  }

  // Multi-tab / Local mesh discovery channel
  initBroadcastMesh() {
    try {
      this.broadcastChannel = new BroadcastChannel('edusync_p2p_mesh');
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingMessage(event.data);
      };
    } catch (e) {
      console.warn('[Transport] BroadcastChannel not supported in this browser:', e);
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  // Device Discovery Protocol
  startDiscovery(myRole = 'teacher', myClass = '8', myDeviceName = 'My Device') {
    const announceMsg = {
      type: 'DISCOVERY_ANNOUNCE',
      senderId: 'dev_' + Math.random().toString(36).substring(2, 8),
      role: myRole,
      class: myClass,
      deviceName: myDeviceName,
      pairingCode: Math.floor(1000 + Math.random() * 9000).toString(),
      timestamp: Date.now()
    };

    this.myDeviceInfo = announceMsg;

    // Broadcast announcement
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(announceMsg);
    }

    return announceMsg;
  }

  // Handle incoming peer packets
  handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'DISCOVERY_ANNOUNCE':
        // Don't discover self
        if (this.myDeviceInfo && msg.senderId === this.myDeviceInfo.senderId) return;
        this.emit('peerDiscovered', msg);
        break;

      case 'PAIR_REQUEST':
        if (this.myDeviceInfo && msg.targetId === this.myDeviceInfo.senderId) {
          if (msg.pairingCode === this.myDeviceInfo.pairingCode) {
            // Pairing approved
            const ack = {
              type: 'PAIR_ACK',
              targetId: msg.senderId,
              senderId: this.myDeviceInfo.senderId,
              success: true
            };
            this.broadcastChannel.postMessage(ack);
            this.setConnectedPeer({
              id: msg.senderId,
              name: msg.senderName,
              role: msg.senderRole,
              class: msg.senderClass
            });
          }
        }
        break;

      case 'PAIR_ACK':
        if (this.myDeviceInfo && msg.targetId === this.myDeviceInfo.senderId && msg.success) {
          this.setConnectedPeer(this.pendingPeer);
        }
        break;

      case 'MANIFEST_EXCHANGE':
        if (this.connectedPeer && msg.senderId === this.connectedPeer.id) {
          this.emit('manifestReceived', msg.manifest);
        }
        break;

      case 'CHUNK_TRANSFER':
        if (this.connectedPeer && msg.senderId === this.connectedPeer.id) {
          this.handleChunkReceived(msg);
        }
        break;

      case 'SUBMISSION_SYNC':
        if (this.connectedPeer && msg.senderId === this.connectedPeer.id) {
          this.emit('resultsReceived', msg.submissions);
        }
        break;

      case 'DISCONNECT':
        if (this.connectedPeer && msg.senderId === this.connectedPeer.id) {
          this.disconnect();
        }
        break;
    }
  }

  // Pair with discovered peer
  connectToPeer(peer, pairingCodeEntered) {
    this.pendingPeer = peer;
    const pairMsg = {
      type: 'PAIR_REQUEST',
      senderId: this.myDeviceInfo ? this.myDeviceInfo.senderId : 'local_device',
      senderName: this.myDeviceInfo ? this.myDeviceInfo.deviceName : 'EduSync User',
      senderRole: this.myDeviceInfo ? this.myDeviceInfo.role : 'student',
      senderClass: this.myDeviceInfo ? this.myDeviceInfo.class : '8',
      targetId: peer.senderId || peer.id,
      pairingCode: pairingCodeEntered
    };

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(pairMsg);
    }

    // If pairing with simulated nearby peer directly
    if (peer.isSimulated || peer.pairingCode === pairingCodeEntered) {
      setTimeout(() => {
        this.setConnectedPeer({
          id: peer.senderId || peer.id,
          name: peer.deviceName || peer.name,
          role: peer.role,
          class: peer.class,
          school: peer.school || 'Government High School'
        });
      }, 400);
    }
  }

  setConnectedPeer(peer) {
    this.connectedPeer = peer;
    this.isConnected = true;
    this.emit('peerConnected', peer);
  }

  disconnect() {
    if (this.connectedPeer) {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'DISCONNECT',
          senderId: this.myDeviceInfo ? this.myDeviceInfo.senderId : 'dev'
        });
      }
    }
    this.connectedPeer = null;
    this.isConnected = false;
    this.isTransferring = false;
    this.emit('peerDisconnected');
  }

  // Send Manifest to connected peer
  sendManifest(manifest) {
    if (!this.isConnected) return;
    const msg = {
      type: 'MANIFEST_EXCHANGE',
      senderId: this.myDeviceInfo ? this.myDeviceInfo.senderId : 'dev',
      manifest: manifest
    };
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(msg);
    }
  }

  // Transfer missing resource in reliable chunks with interrupt/resume capability
  async transferResourceChunks(resource, onProgress, interruptAtPercent = null) {
    this.isTransferring = true;
    this.isPaused = false;
    const totalChunks = 10;
    const chunkSizeMB = parseFloat(resource.fileSize) / totalChunks;
    
    // Resume from current progress if any
    let startChunk = Math.floor((this.transferProgress / 100) * totalChunks);

    return new Promise((resolve, reject) => {
      let currentChunk = startChunk;

      const transferInterval = setInterval(() => {
        if (this.isPaused) {
          clearInterval(transferInterval);
          return;
        }

        currentChunk++;
        const percent = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
        const transferredMB = (currentChunk * chunkSizeMB).toFixed(1);
        const totalMB = parseFloat(resource.fileSize).toFixed(1);

        this.transferProgress = percent;

        if (onProgress) {
          onProgress({
            percent: percent,
            chunk: currentChunk,
            totalChunks: totalChunks,
            transferredMB: transferredMB,
            totalMB: totalMB,
            resourceTitle: resource.title,
            isPaused: false
          });
        }

        // Test Interruption simulation if requested
        if (interruptAtPercent && percent >= interruptAtPercent && !this.simulatedInterruptionTriggered) {
          this.simulatedInterruptionTriggered = true;
          this.isPaused = true;
          clearInterval(transferInterval);
          if (onProgress) {
            onProgress({
              percent: percent,
              chunk: currentChunk,
              totalChunks: totalChunks,
              transferredMB: transferredMB,
              totalMB: totalMB,
              resourceTitle: resource.title,
              isPaused: true,
              error: 'Connection interrupted. Transfer paused.'
            });
          }
          return;
        }

        if (currentChunk >= totalChunks) {
          clearInterval(transferInterval);
          this.isTransferring = false;
          this.transferProgress = 0;
          this.simulatedInterruptionTriggered = false;
          resolve(resource);
        }
      }, 250);
    });
  }

  resumeTransfer(resource, onProgress) {
    this.isPaused = false;
    this.simulatedInterruptionTriggered = false;
    return this.transferResourceChunks(resource, onProgress, null);
  }

  // Send quiz results back to teacher
  sendQuizResults(submissions) {
    if (!this.isConnected) return;
    const msg = {
      type: 'SUBMISSION_SYNC',
      senderId: this.myDeviceInfo ? this.myDeviceInfo.senderId : 'dev',
      submissions: submissions
    };
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(msg);
    }
  }
}

window.eduTransport = new EduSyncTransport();
