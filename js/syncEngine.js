// EduSync Smart Differential Synchronization Engine
// Handles differential comparison, Bluetooth stream reconciliation, and IndexedDB persistence

class EduSyncEngine {
  constructor(db, transport) {
    this.db = db;
    this.transport = transport;
    this.latestTeacherManifest = null;

    this.initIncomingListeners();
  }

  // Listen for incoming data packets and persist them to local IndexedDB
  initIncomingListeners() {
    // When teacher receives manifest or student receives teacher manifest
    this.transport.on('manifestReceived', async (manifest) => {
      console.log(`[SyncEngine] Processing received manifest (${manifest.length} items)...`);
      this.latestTeacherManifest = manifest;
      if (window.eduApp && window.eduApp.onPeerManifestReceived) {
        window.eduApp.onPeerManifestReceived(manifest);
      }
    });

    // When complete resource data is reassembled over Bluetooth
    this.transport.on('chunkReceived', async (data) => {
      if (data && data.resource) {
        console.log('[SyncEngine] Received complete educational resource:', data.resource.title);
        const resourceToSave = {
          ...data.resource,
          isAvailableOffline: true,
          syncedAt: new Date().toISOString()
        };
        await this.db.addResource(resourceToSave);
        console.log('[SyncEngine] Resource persisted to local IndexedDB successfully.');

        if (window.eduApp && window.eduApp.onResourceReceived) {
          window.eduApp.onResourceReceived(resourceToSave);
        }
      }
    });

    // When teacher receives student quiz submissions
    this.transport.on('resultsReceived', async (submissions) => {
      if (Array.isArray(submissions)) {
        console.log(`[SyncEngine] Teacher received ${submissions.length} student quiz submissions.`);
        for (const sub of submissions) {
          await this.db.saveQuizSubmission({
            ...sub,
            syncStatus: 'synced',
            syncedAt: new Date().toISOString()
          });
        }
        console.log('[SyncEngine] Submissions saved to teacher analytics database.');
        if (window.eduApp && window.eduApp.refreshCurrentScreen) {
          window.eduApp.refreshCurrentScreen();
        }
      }
    });
  }

  // Compare local manifest with teacher manifest to determine missing or updated files
  calculateDifferential(localManifest, peerManifest) {
    const localMap = new Map();
    localManifest.forEach(item => {
      if (item.isAvailableOffline) {
        localMap.set(item.resourceId, item);
      }
    });

    const missingOnLocal = [];
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
      upToDate,
      totalPeerResources: peerManifest.length,
      totalLocalResources: localManifest.length
    };
  }

  // Teacher side: Streams all requested missing resources to the student
  async streamRequestedResourcesToStudent(resourceIds, onProgressCallback) {
    console.log(`[Teacher Sync] Streaming ${resourceIds.length} requested resources to student...`);
    const transferred = [];

    for (let i = 0; i < resourceIds.length; i++) {
      const id = resourceIds[i];
      const fullRes = await this.db.getResource(id);
      if (fullRes) {
        console.log(`[Teacher Sync] Sending (${i + 1}/${resourceIds.length}): ${fullRes.title}...`);
        await this.transport.transferResourceChunks(fullRes, (progress) => {
          if (onProgressCallback) {
            onProgressCallback({
              ...progress,
              itemIndex: i + 1,
              totalItems: resourceIds.length,
              currentResource: fullRes
            });
          }
        });
        transferred.push(fullRes);
      }
    }

    // Send completion acknowledgment
    await this.transport.sendPacketOverTransport({
      type: 'SYNC_COMPLETE_ACK',
      transferredCount: transferred.length
    });

    console.log('[Teacher Sync] All requested resources transferred successfully.');
    return transferred;
  }

  // Student side: Request missing items and execute two-way sync
  async executeTwoWaySync(missingResources, onProgressCallback, testInterruption = false) {
    const missingIds = missingResources.map(r => r.resourceId);

    // 1. Request missing resources from teacher
    await this.transport.requestMissingResources(missingIds);

    // 2. Also send any pending offline quiz submissions back to teacher
    const pendingSubmissions = await this.db.getPendingSubmissions();
    if (pendingSubmissions.length > 0) {
      console.log(`[SyncEngine] Uploading ${pendingSubmissions.length} pending quiz submissions to Teacher...`);
      await this.transport.sendQuizResults(pendingSubmissions);
      const syncedIds = pendingSubmissions.map(s => s.id);
      await this.db.markSubmissionsAsSynced(syncedIds);
    }

    return {
      success: true,
      requestedCount: missingIds.length,
      syncedQuizResultsCount: pendingSubmissions.length
    };
  }
}

window.eduSyncEngine = new EduSyncEngine(window.eduDB, window.eduTransport);
