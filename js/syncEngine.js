// EduSync Smart Differential Synchronization Engine
class EduSyncEngine {
  constructor(db, transport) {
    this.db = db;
    this.transport = transport;
  }

  // Compare local manifest with peer manifest to find missing resources
  calculateDifferential(localManifest, peerManifest) {
    const localMap = new Map();
    localManifest.forEach(item => {
      // If student has item and is marked available offline
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

  // Execute full two-way sync sequence
  async executeTwoWaySync(missingResources, onProgressCallback, testInterruption = false) {
    const transferred = [];
    
    // 1. Sync Educational Resources (Peer -> Local)
    for (let i = 0; i < missingResources.length; i++) {
      const res = missingResources[i];
      
      // Transfer in chunks
      await this.transport.transferResourceChunks(
        res,
        (progress) => {
          if (onProgressCallback) {
            onProgressCallback({
              ...progress,
              itemIndex: i + 1,
              totalItems: missingResources.length,
              currentResource: res
            });
          }
        },
        testInterruption && i === 0 ? 60 : null // test pause at 60% if requested
      );

      // Save to local database
      await this.db.updateResourceOfflineStatus(res.resourceId, true);
      transferred.push(res);
    }

    // 2. Sync Offline Quiz Submissions (Local -> Peer)
    const pendingSubmissions = await this.db.getPendingSubmissions();
    if (pendingSubmissions.length > 0) {
      this.transport.sendQuizResults(pendingSubmissions);
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
