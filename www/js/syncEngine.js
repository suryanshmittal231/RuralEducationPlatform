// EduSync Smart Differential Synchronization Engine
// Handles true peer-to-peer data exchange, chunked serialization, and IndexedDB reconciliation

class EduSyncEngine {
  constructor(db, transport) {
    this.db = db;
    this.transport = transport;

    this.initIncomingListeners();
  }

  // Listen for incoming data packets and persist them to local IndexedDB
  initIncomingListeners() {
    // When incoming resource data is completely reassembled
    this.transport.on('chunkReceived', async (data) => {
      if (data && data.resource) {
        console.log('[SyncEngine] Received complete resource over transport:', data.resource.title);
        const resourceToSave = {
          ...data.resource,
          isAvailableOffline: true,
          syncedAt: new Date().toISOString()
        };
        await this.db.addResource(resourceToSave);
        console.log('[SyncEngine] Resource persisted to local IndexedDB successfully.');
      }
    });

    // When teacher receives student quiz submissions
    this.transport.on('resultsReceived', async (submissions) => {
      if (Array.isArray(submissions)) {
        console.log(`[SyncEngine] Received ${submissions.length} student quiz submissions over transport.`);
        for (const sub of submissions) {
          await this.db.saveQuizSubmission({
            ...sub,
            syncStatus: 'synced',
            syncedAt: new Date().toISOString()
          });
        }
        console.log('[SyncEngine] Submissions persisted to teacher analytics database.');
      }
    });
  }

  // Compare local manifest with peer manifest to determine missing or updated files
  calculateDifferential(localManifest, peerManifest) {
    const localMap = new Map();
    localManifest.forEach(item => {
      if (item.isAvailableOffline) {
        localMap.set(item.resourceId, item);
      }
    });

    const missingOnLocal = [];
    const missingOnPeer = [];
    const upToDate = [];

    peerManifest.forEach(peerItem => {
      const localItem = localMap.get(peerItem.resourceId);
      if (!localItem) {
        missingOnLocal.push(peerItem);
      } else if (localItem.version < peerItem.version || localItem.hash !== peerItem.hash) {
        missingOnLocal.push({ ...peerItem, isUpdate: true });
      } else {
        upToDate.push(localItem);
      }
    });

    return {
      missingOnLocal,
      missingOnPeer,
      upToDate,
      totalPeerResources: peerManifest.length,
      totalLocalResources: localManifest.length
    };
  }

  // Execute two-way sync: transfers missing resources AND syncs student quiz submissions
  async executeTwoWaySync(missingResources, onProgressCallback, testInterruption = false) {
    const transferred = [];

    // 1. Sync Educational Resources (Send each resource in MTU-friendly chunks)
    for (let i = 0; i < missingResources.length; i++) {
      const res = missingResources[i];

      // Fetch the complete resource data with content and attachments from DB if available
      const fullRes = await this.db.getResource(res.resourceId) || res;

      // Transfer over Bluetooth LE transport
      await this.transport.transferResourceChunks(
        fullRes,
        (progress) => {
          if (onProgressCallback) {
            onProgressCallback({
              ...progress,
              itemIndex: i + 1,
              totalItems: missingResources.length,
              currentResource: fullRes
            });
          }
        },
        testInterruption && i === 0 ? 60 : null
      );

      // Persist as available offline
      await this.db.updateResourceOfflineStatus(res.resourceId, true);
      transferred.push(fullRes);
    }

    // 2. Sync Offline Quiz Submissions back to Teacher
    const pendingSubmissions = await this.db.getPendingSubmissions();
    if (pendingSubmissions.length > 0) {
      console.log(`[SyncEngine] Syncing ${pendingSubmissions.length} pending quiz submissions...`);
      await this.transport.sendQuizResults(pendingSubmissions);
      const syncedIds = pendingSubmissions.map(s => s.id);
      await this.db.markSubmissionsAsSynced(syncedIds);
    }

    return {
      success: true,
      transferredCount: transferred.length,
      syncedQuizResultsCount: pendingSubmissions.length,
      transferredResources: transferred
    };
  }
}

window.eduSyncEngine = new EduSyncEngine(window.eduDB, window.eduTransport);
