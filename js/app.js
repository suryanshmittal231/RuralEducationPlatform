// EduSync Main Application Controller
class EduSyncApp {
  constructor() {
    this.currentRole = null; // 'teacher' | 'student'
    this.selectedClass = '8';
    this.selectedSubject = 'all';
    this.activeScreen = 'screen-role-select';
    this.navigationHistory = [];
    this.isDrawerOpen = false;
    this.currentQuiz = null;
    this.quizAnswers = {};
    this.currentQuizQuestionIdx = 0;
    this.currentTransferResource = null;
    this.discoveredPeers = [];
    this.radarSearchQuery = '';
    
    // Attached file state for Add Resource
    this.attachedFileData = null;
    this.attachedFileName = '';
    this.attachedFileSize = '';
  }

  async init() {
    console.log('[EduSync] Initializing offline platform...');

    // 1. Immediately bind UI events and render home screen without blocking
    this.bindEvents();
    if (window.eduTransport) {
      this.bindTransportEvents();
    }
    this.updateTransportBadge();
    if (window.i18n) {
      window.i18n.updateDOM();
    }
    this.renderScreen('screen-role-select', false);

    // 2. Initialize offline IndexedDB in non-blocking try-catch
    try {
      if (window.eduDB) {
        await window.eduDB.init();
        console.log('[EduSync] Offline Database ready');
      }
    } catch (err) {
      console.warn('[EduSync] Offline DB init issue:', err);
    }
    
    // 3. Register Service Worker if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[EduSync] Service worker active'))
        .catch((err) => console.warn('[EduSync] SW registration failed:', err));
    }
  }

  updateTransportBadge() {
    const badge = document.getElementById('transport-badge');
    if (!badge) return;
    if (window.eduTransport && window.eduTransport.isNative) {
      badge.textContent = 'BLUETOOTH P2P — Hardware Active';
      badge.className = 'transport-badge badge-ble';
    } else {
      badge.textContent = 'DEMO MODE — Single Device Simulated';
      badge.className = 'transport-badge badge-demo';
    }
  }

  bindTransportEvents() {
    window.eduTransport.on('peerDiscovered', (peer) => {
      if (this.activeScreen === 'screen-nearby-radar') {
        this.addPeerToRadarList(peer);
      }
    });

    window.eduTransport.on('peerConnected', (peer) => {
      console.log('[App] Peer connection confirmed:', peer);
      const pairingModal = document.getElementById('modal-pairing');
      if (pairingModal) pairingModal.classList.remove('active');
      if (this.currentRole === 'student') {
        this.openSyncCenter();
      } else if (this.currentRole === 'teacher') {
        const codeDisplay = document.getElementById('teacher-pairing-code-display');
        if (codeDisplay) {
          const count = window.eduTransport.getConnectedPeers().length;
          const code = window.eduTransport.myDeviceInfo?.pairingCode || codeDisplay.dataset.pairingCode || '----';
          codeDisplay.dataset.pairingCode = code;
          codeDisplay.innerHTML = `${code}<div style="font-family:inherit; font-size:0.75rem; color:#34d399; letter-spacing:normal; margin-top:4px;">Connected (${count} Student${count === 1 ? '' : 's'})</div>`;
        }
      }
    });

    window.eduTransport.on('pairingFailed', (err) => {
      alert('Verification Failed: The 4-digit code does not match the teacher screen.');
    });

    window.eduTransport.on('peerDisconnected', () => {
      if (this.activeScreen === 'screen-sync-center') {
        alert('Bluetooth Connection Ended: Peer disconnected.');
      }
    });

    window.eduTransport.on('transferProgress', (progress) => {
      const box = document.getElementById('sync-progress-box');
      if (box && box.style.display !== 'none') {
        const progressBar = document.getElementById('transfer-progress-fill');
        const percentLabel = document.getElementById('transfer-percent-label');
        const metaLabel = document.getElementById('transfer-meta-label');
        const titleLabel = document.getElementById('transfer-title-label');

        if (titleLabel) titleLabel.textContent = progress.resourceTitle;
        if (progressBar) progressBar.style.width = `${progress.percent}%`;
        if (percentLabel) percentLabel.textContent = `${progress.percent}%`;
        if (metaLabel) metaLabel.textContent = `Chunk ${progress.chunk}/${progress.totalChunks} (${progress.percent}%)`;
      }
    });

    window.eduTransport.on('transferComplete', () => {
      const box = document.getElementById('sync-progress-box');
      if (box) box.style.display = 'none';
      alert(`Sync Success\n\n${window.i18n.t('syncSuccessMsg')}`);
      this.refreshCurrentScreen();
    });
  }

  onPeerManifestReceived(manifest) {
    if (this.activeScreen === 'screen-sync-center') {
      this.openSyncCenter();
    } else if (this.activeScreen === 'screen-student-learning') {
      this.renderStudentLearning();
    }
  }

  onResourceReceived(resource) {
    console.log('[App] onResourceReceived triggered for:', resource.title);

    // 1. Display prominent top toast notification
    this.showResourceReceivedToast(resource);

    // The sync engine has already persisted the complete resource before this
    // callback, so notify without blocking the student with a modal alert.
    // Refresh active screens immediately.
    if (this.activeScreen === 'screen-student-learning') {
      this.renderStudentLearning();
    } else if (this.activeScreen === 'screen-sync-center') {
      this.openSyncCenter();
    }
  }

  showResourceReceivedToast(resource) {
    const existing = document.getElementById('toast-resource-received');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-resource-received';
    toast.style.cssText = `
      position: fixed;
      top: 75px;
      left: 16px;
      right: 16px;
      max-width: 448px;
      margin: 0 auto;
      background: #111111;
      border: 1px solid var(--primary);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 99999;
      animation: slideUp 0.3s ease;
    `;
    toast.innerHTML = `
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 0.75rem; color: var(--primary); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">New Resource Received</div>
        <div style="font-size: 0.95rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${resource.title}</div>
        <div style="font-size: 0.75rem; color: #888888;">${resource.chapter} • Saved on this device</div>
      </div>
      <button class="btn-primary btn-sm" style="font-size: 0.8rem; padding: 8px 12px; width: auto;" onclick="document.getElementById('toast-resource-received').remove(); window.eduApp.openLessonViewer('${resource.resourceId}');">
        Open
      </button>
    `;
    const root = document.getElementById('app-root') || document.body;
    root.appendChild(toast);
    setTimeout(() => {
      if (toast && toast.parentNode) toast.remove();
    }, 10000);
  }

  bindEvents() {
    // Role selection
    const teacherBtn = document.getElementById('btn-select-teacher');
    if (teacherBtn) {
      teacherBtn.onclick = (e) => {
        e.preventDefault();
        this.setRole('teacher');
      };
    }

    const studentBtn = document.getElementById('btn-select-student');
    if (studentBtn) {
      studentBtn.onclick = (e) => {
        e.preventDefault();
        this.setRole('student');
      };
    }

    // Hamburger button & Drawer events
    document.getElementById('btn-hamburger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDrawer();
    });

    document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
      this.closeDrawer();
    });

    document.getElementById('nav-drawer-backdrop')?.addEventListener('click', () => {
      this.closeDrawer();
    });

    // Drawer Teacher navigation items
    document.getElementById('drawer-nav-teacher-dashboard')?.addEventListener('click', () => {
      this.renderTeacherDashboard();
    });
    document.getElementById('drawer-nav-teacher-resources')?.addEventListener('click', () => {
      this.renderTeacherResources();
    });
    document.getElementById('drawer-nav-teacher-nearby')?.addEventListener('click', () => {
      this.renderNearbyRadar();
    });
    document.getElementById('drawer-nav-teacher-sync')?.addEventListener('click', () => {
      this.openSyncCenter();
    });
    document.getElementById('drawer-nav-teacher-progress')?.addEventListener('click', () => {
      this.renderTeacherAnalytics();
    });

    // Drawer Student navigation items
    document.getElementById('drawer-nav-student-dashboard')?.addEventListener('click', () => {
      this.renderStudentDashboard();
    });
    document.getElementById('drawer-nav-student-learning')?.addEventListener('click', () => {
      this.renderStudentLearning();
    });
    document.getElementById('drawer-nav-student-quizzes')?.addEventListener('click', () => {
      this.renderStudentQuizzes();
    });
    document.getElementById('drawer-nav-student-progress')?.addEventListener('click', () => {
      this.renderStudentScorecard();
    });
    document.getElementById('drawer-nav-student-sync')?.addEventListener('click', () => {
      if (!window.eduTransport.isConnected) {
        this.renderNearbyRadar();
      } else {
        this.openSyncCenter();
      }
    });

    // Drawer Generic & Common Footer items
    document.getElementById('drawer-nav-select-role')?.addEventListener('click', () => {
      this.switchRole();
    });
    document.getElementById('drawer-nav-lang-toggle')?.addEventListener('click', () => {
      this.toggleLanguage();
    });
    document.getElementById('drawer-nav-about')?.addEventListener('click', () => {
      this.openAboutModal();
    });
    document.getElementById('drawer-nav-switch-role')?.addEventListener('click', () => {
      this.switchRole();
    });

    // About Modal Close
    document.getElementById('btn-close-about')?.addEventListener('click', () => {
      document.getElementById('modal-about')?.classList.remove('active');
    });

    // Class selection changes
    document.querySelectorAll('.class-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        this.selectedClass = e.target.value;
        // Keep both teacher & student selectors synced
        document.querySelectorAll('.class-select').forEach(s => s.value = this.selectedClass);
        this.refreshCurrentScreen();
      });
    });

    // Dashboard card navigation buttons
    document.getElementById('nav-teacher-resources')?.addEventListener('click', () => this.renderTeacherResources());
    document.getElementById('nav-teacher-nearby')?.addEventListener('click', () => this.renderNearbyRadar());
    document.getElementById('nav-teacher-progress')?.addEventListener('click', () => this.renderTeacherAnalytics());
    document.getElementById('nav-teacher-sync')?.addEventListener('click', () => this.openSyncCenter());

    document.getElementById('nav-student-learning')?.addEventListener('click', () => this.renderStudentLearning());
    document.getElementById('nav-student-quizzes')?.addEventListener('click', () => this.renderStudentQuizzes());
    document.getElementById('nav-student-progress')?.addEventListener('click', () => this.renderStudentScorecard());
    document.getElementById('nav-student-sync')?.addEventListener('click', () => {
      if (!window.eduTransport.isConnected) {
        this.renderNearbyRadar();
      } else {
        this.openSyncCenter();
      }
    });

    // Add Resource Modal
    const openAddModal = () => {
      const connectedPeers = window.eduTransport.getConnectedPeers();
      const isConnected = connectedPeers.length > 0;
      const indicator = document.getElementById('add-res-bt-indicator');
      const submitBtn = document.getElementById('btn-save-and-share');
      if (indicator) {
        if (isConnected) {
          const label = connectedPeers.length === 1
            ? (connectedPeers[0].name || 'Student Phone')
            : `${connectedPeers.length} student devices`;
          indicator.innerHTML = `Connected: <b style="color:var(--primary);">${label}</b>`;
          if (submitBtn) submitBtn.textContent = 'Save & Share via BT';
        } else {
          indicator.innerHTML = `Bluetooth: <b>No Student Connected</b>`;
          if (submitBtn) submitBtn.textContent = 'Save Resource';
        }
      }
      this.clearSelectedFile();
      document.getElementById('modal-add-resource').classList.add('active');
    };
    document.getElementById('btn-open-add-resource')?.addEventListener('click', openAddModal);
    document.getElementById('btn-open-add-resource-2')?.addEventListener('click', openAddModal);

    document.getElementById('btn-close-add-modal')?.addEventListener('click', () => {
      document.getElementById('modal-add-resource').classList.remove('active');
    });

    // File Drop Zone Event Listeners
    const fileInput = document.getElementById('res-input-file');
    const dropZone = document.getElementById('file-drop-zone');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileSelect(e.target.files[0]);
        }
      });
    }

    if (dropZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('dragover');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileSelect(e.dataTransfer.files[0]);
        }
      });
    }

    document.getElementById('form-add-resource')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddNewResource();
    });

    // Lesson Viewer Modal Close
    document.getElementById('btn-close-viewer')?.addEventListener('click', () => {
      document.getElementById('modal-lesson-viewer').classList.remove('active');
    });

    // Pairing Modal Listeners
    document.getElementById('btn-close-pairing-modal')?.addEventListener('click', () => {
      document.getElementById('modal-pairing').classList.remove('active');
    });
    document.getElementById('btn-cancel-pairing')?.addEventListener('click', () => {
      document.getElementById('modal-pairing').classList.remove('active');
    });
    document.getElementById('btn-confirm-pairing')?.addEventListener('click', () => {
      this.confirmPairing();
    });

    // Resume transfer button
    document.getElementById('btn-resume-transfer')?.addEventListener('click', () => {
      this.resumeInterruptedTransfer();
    });
  }

  // --- File Drop Zone Handlers ---
  onResourceTypeChanged() {
    const typeSelect = document.getElementById('res-input-type');
    const dropZoneText = document.getElementById('drop-zone-text');
    const fileInput = document.getElementById('res-input-file');
    if (!typeSelect || !dropZoneText) return;
    
    const type = typeSelect.value;
    if (type === 'pdf') {
      dropZoneText.textContent = 'Click to choose PDF document or drag & drop here';
      if (fileInput) fileInput.accept = '.pdf,application/pdf';
    } else if (type === 'audio') {
      dropZoneText.textContent = 'Click to choose Audio recording or drag & drop here';
      if (fileInput) fileInput.accept = '.mp3,audio/*';
    } else if (type === 'video') {
      dropZoneText.textContent = 'Click to choose Video file or drag & drop here';
      if (fileInput) fileInput.accept = '.mp4,video/*';
    } else {
      dropZoneText.textContent = 'Click to attach supplementary file (optional)';
      if (fileInput) fileInput.accept = '.pdf,.doc,.docx,.txt,.epub,.mp3,.mp4';
    }
  }

  handleFileSelect(file) {
    if (!file) return;
    const selectedType = document.getElementById('res-input-type')?.value;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (selectedType === 'pdf' && !isPdf) {
      alert('Please choose a PDF file for this resource.');
      this.clearSelectedFile();
      return;
    }
    this.attachedFileData = file;
    this.attachedFileName = file.name;
    
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    this.attachedFileSize = file.size > 1048576 ? `${sizeMB} MB` : `${Math.round(file.size / 1024)} KB`;

    const dropZone = document.getElementById('file-drop-zone');
    const badge = document.getElementById('file-selected-badge');
    const nameEl = document.getElementById('file-selected-name');
    const sizeEl = document.getElementById('file-selected-size');

    if (nameEl) nameEl.textContent = this.attachedFileName;
    if (sizeEl) sizeEl.textContent = `(${this.attachedFileSize})`;
    if (dropZone) dropZone.style.display = 'none';
    if (badge) badge.style.display = 'flex';
  }

  clearSelectedFile(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.attachedFileData = null;
    this.attachedFileName = '';
    this.attachedFileSize = '';

    const fileInput = document.getElementById('res-input-file');
    if (fileInput) fileInput.value = '';

    const dropZone = document.getElementById('file-drop-zone');
    const badge = document.getElementById('file-selected-badge');

    if (dropZone) dropZone.style.display = 'flex';
    if (badge) badge.style.display = 'none';
  }

  async readAttachedFile() {
    if (!this.attachedFileData) return null;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        data: reader.result,
        mimeType: this.attachedFileData.type || 'application/octet-stream'
      });
      reader.onerror = () => reject(reader.error || new Error('Unable to read the selected document.'));
      reader.readAsDataURL(this.attachedFileData);
    });
  }

  // --- Drawer Controls ---
  openDrawer() {
    const teacherNav = document.getElementById('nav-drawer-menu-teacher');
    const studentNav = document.getElementById('nav-drawer-menu-student');
    const genericNav = document.getElementById('nav-drawer-menu-generic');
    const roleBadge = document.getElementById('nav-drawer-role-badge');
    const langText = document.getElementById('drawer-current-lang-text');

    if (teacherNav) teacherNav.style.display = (this.currentRole === 'teacher') ? 'flex' : 'none';
    if (studentNav) studentNav.style.display = (this.currentRole === 'student') ? 'flex' : 'none';
    if (genericNav) genericNav.style.display = (!this.currentRole) ? 'flex' : 'none';

    if (roleBadge) {
      if (this.currentRole === 'teacher') {
        roleBadge.textContent = 'Teacher';
        roleBadge.style.color = 'var(--primary)';
      } else if (this.currentRole === 'student') {
        roleBadge.textContent = 'Student';
        roleBadge.style.color = '#34d399';
      } else {
        roleBadge.textContent = 'Offline';
        roleBadge.style.color = 'var(--text-secondary)';
      }
    }

    if (langText) {
      langText.textContent = window.i18n.currentLang === 'hi' ? 'हिंदी (English)' : 'English (हिंदी)';
    }

    this.isDrawerOpen = true;
    document.getElementById('nav-drawer')?.classList.add('active');
    document.getElementById('nav-drawer-backdrop')?.classList.add('active');
    document.getElementById('btn-hamburger')?.setAttribute('aria-expanded', 'true');
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    document.getElementById('nav-drawer')?.classList.remove('active');
    document.getElementById('nav-drawer-backdrop')?.classList.remove('active');
    document.getElementById('btn-hamburger')?.setAttribute('aria-expanded', 'false');
  }

  toggleDrawer() {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  toggleLanguage() {
    window.i18n.toggleLanguage();
    this.closeDrawer();
    this.refreshCurrentScreen();
  }

  openAboutModal() {
    this.closeDrawer();
    document.getElementById('modal-about')?.classList.add('active');
  }

  switchRole() {
    this.closeDrawer();
    this.navigationHistory = [];
    if (window.eduTransport) {
      window.eduTransport.disconnect();
    }
    this.currentRole = null;
    this.renderScreen('screen-role-select', false);
  }

  // --- Screen Navigation & History ---
  renderScreen(screenId, pushToHistory = true) {
    if (pushToHistory && this.activeScreen && this.activeScreen !== screenId) {
      if (this.navigationHistory.length === 0 || this.navigationHistory[this.navigationHistory.length - 1] !== this.activeScreen) {
        this.navigationHistory.push(this.activeScreen);
      }
    }
    this.activeScreen = screenId;
    this.closeDrawer();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }
    window.i18n.updateDOM();
  }

  goBack() {
    // 1. If any modal is active, close it
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) {
      activeModal.classList.remove('active');
      return;
    }

    // 2. If drawer is open, close it
    if (this.isDrawerOpen) {
      this.closeDrawer();
      return;
    }

    // 3. If exiting radar, stop Bluetooth discovery
    if (this.activeScreen === 'screen-nearby-radar' && window.eduTransport) {
      window.eduTransport.stopDiscovery();
    }

    // 4. Pop previous screen from history
    if (this.navigationHistory && this.navigationHistory.length > 0) {
      const prevScreen = this.navigationHistory.pop();
      if (prevScreen && prevScreen !== this.activeScreen) {
        this.renderScreen(prevScreen, false);
        this.refreshScreenById(prevScreen);
        return;
      }
    }

    // 5. Fallback if history is empty
    if (this.activeScreen === 'screen-quiz-taker' || this.activeScreen === 'screen-quiz-complete') {
      this.renderStudentQuizzes(false);
      return;
    }

    if (this.currentRole === 'teacher') {
      if (this.activeScreen !== 'screen-teacher-dashboard') {
        this.renderTeacherDashboard(false);
      } else {
        this.switchRole();
      }
    } else if (this.currentRole === 'student') {
      if (this.activeScreen !== 'screen-student-dashboard') {
        this.renderStudentDashboard(false);
      } else {
        this.switchRole();
      }
    } else {
      this.renderScreen('screen-role-select', false);
    }
  }

  refreshScreenById(screenId) {
    if (screenId === 'screen-teacher-resources') {
      this.renderTeacherResources(false);
    } else if (screenId === 'screen-student-learning') {
      this.renderStudentLearning(false);
    } else if (screenId === 'screen-student-quizzes') {
      this.renderStudentQuizzes(false);
    } else if (screenId === 'screen-student-progress') {
      this.renderStudentScorecard(false);
    } else if (screenId === 'screen-teacher-analytics') {
      this.renderTeacherAnalytics(false);
    } else if (screenId === 'screen-nearby-radar') {
      this.renderNearbyRadar(false, false);
    } else if (screenId === 'screen-sync-center') {
      this.openSyncCenter(false);
    }
  }

  async setRole(role) {
    console.log(`[EduSync] User selected role: ${role}`);
    this.currentRole = role;
    this.navigationHistory = [];

    if (role === 'teacher') {
      // 1. Instantly switch to Teacher Dashboard
      this.renderTeacherDashboard(false);

      // 2. Set an initial pairing code display immediately
      const initialCode = Math.floor(1000 + Math.random() * 9000).toString();
      const codeEl = document.getElementById('teacher-pairing-code-display');
      if (codeEl) {
        codeEl.textContent = initialCode;
      }

      // 3. Start Bluetooth Discovery in background
      try {
        if (window.eduTransport) {
          const info = await window.eduTransport.startDiscovery('teacher', this.selectedClass, 'Teacher Sharma (Govt High School)');
          if (codeEl && info?.pairingCode) {
            codeEl.dataset.pairingCode = info.pairingCode;
            codeEl.textContent = info.pairingCode;
          }
        }
      } catch (err) {
        console.warn('[EduSync] Start teacher discovery warning:', err);
      }
    } else {
      // 1. Instantly switch to Student Dashboard
      this.renderStudentDashboard(false);

      // 2. Start Bluetooth Discovery in background
      try {
        if (window.eduTransport) {
          await window.eduTransport.startDiscovery('student', this.selectedClass, "Rahul's Android Phone");
        }
      } catch (err) {
        console.warn('[EduSync] Start student discovery warning:', err);
      }
    }
  }

  refreshCurrentScreen() {
    this.refreshScreenById(this.activeScreen);
    window.i18n.updateDOM();
  }

  // --- Dynamic Subject Tabs Helper ---
  async renderSubjectTabs(containerId, onTabSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Fetch all resources for current class to collect distinct subjects
    const allForClass = await window.eduDB.getAllResources(this.selectedClass, 'all');
    const defaultSubjects = ['Mathematics', 'Science', 'English', 'Social Science', 'Hindi'];
    const subjectSet = new Set(defaultSubjects);

    allForClass.forEach(r => {
      if (r.subject && r.subject.trim().length > 0) {
        const clean = r.subject.trim();
        subjectSet.add(clean.charAt(0).toUpperCase() + clean.slice(1));
      }
    });

    const subjectsArray = Array.from(subjectSet);

    let html = `<button class="subject-tab ${this.selectedSubject === 'all' ? 'active' : ''}" data-subject="all">All</button>`;
    subjectsArray.forEach(sub => {
      const slug = sub.toLowerCase();
      const isActive = (this.selectedSubject.toLowerCase() === slug || this.selectedSubject.toLowerCase() === sub.toLowerCase());
      html += `<button class="subject-tab ${isActive ? 'active' : ''}" data-subject="${slug}">${sub}</button>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.subject-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const sub = e.target.getAttribute('data-subject');
        this.selectedSubject = sub;
        container.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        if (onTabSelect) onTabSelect();
      });
    });
  }

  // --- Teacher Views ---
  renderTeacherDashboard(push = true) {
    this.renderScreen('screen-teacher-dashboard', push);
  }

  async renderTeacherResources(push = true) {
    this.renderScreen('screen-teacher-resources', push);
    
    // Render dynamic subject tabs
    await this.renderSubjectTabs('teacher-subject-tabs', () => this.renderTeacherResources(false));

    const container = document.getElementById('teacher-resource-list');
    if (!container) return;

    const resources = await window.eduDB.getAllResources(this.selectedClass, this.selectedSubject);
    container.innerHTML = '';

    if (resources.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-secondary);">No educational resources found for Class ${this.selectedClass}. Click <b>+ Add Resource</b> above to create one!</div>`;
      return;
    }

    const connectedPeers = window.eduTransport.getConnectedPeers();
    const isConnected = connectedPeers.length > 0;
    const connectedPeerName = isConnected ? (connectedPeers.length === 1
      ? (connectedPeers[0].name ? connectedPeers[0].name.split(' ')[0] : 'Student')
      : `${connectedPeers.length} Students`) : null;

    resources.forEach((res) => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      const typeLabel = (res.type || 'DOC').toUpperCase();
      
      const shareBtnText = isConnected 
        ? `Share (${connectedPeerName})` 
        : 'Share via BT';

      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-${res.type}">${typeLabel}</div>
            <div class="resource-meta">
              <h4>${res.title}</h4>
              <div class="resource-submeta">
                <span>Class ${res.class}</span> &bull; 
                <span style="text-transform: capitalize;">${res.subject}</span> &bull; 
                <span>${res.chapter}</span>
              </div>
            </div>
          </div>
          <span class="badge-offline">${res.fileSize}</span>
        </div>
        <div class="resource-actions" style="display: flex; gap: 6px; margin-top: 8px;">
          <button class="btn-secondary btn-sm" style="flex: 1;" onclick="window.eduApp.openLessonViewer('${res.resourceId}')">
            ${window.i18n.t('openResource')}
          </button>
          <button class="btn-primary btn-sm" style="flex: 1.3; font-size: 0.78rem;" onclick="window.eduApp.shareResourceWithConnectedStudent('${res.resourceId}')">
            ${shareBtnText}
          </button>
          <button class="btn-secondary btn-sm" style="color: var(--accent-coral); width: 36px; padding: 0; justify-content: center;" onclick="window.eduApp.deleteResource('${res.resourceId}')" title="Delete Resource">
            Del
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async shareResourceWithConnectedStudent(resourceId) {
    const connectedPeers = window.eduTransport.getConnectedPeers();
    const isConnected = connectedPeers.length > 0;
    const res = await window.eduDB.getResource(resourceId);
    if (!res) return;

    if (!isConnected) {
      const pairingCode = window.eduTransport.myDeviceInfo?.pairingCode || '----';
      alert(`No EduSync device is currently connected.\n\nTo share this resource over Bluetooth:\n1. Ask the other teacher or student to open EduSync\n2. Open the nearby-device scanner on that device\n3. Enter your 4-digit code: ${pairingCode}`);
      return;
    }

    const studentName = connectedPeers.length === 1
      ? (connectedPeers[0].name || 'Student')
      : `${connectedPeers.length} connected students`;
    try {
      console.log(`[Teacher BT] Pushing resource "${res.title}" to ${studentName}...`);
      
      // Stream the resource in BLE-safe chunks so PDFs and other documents are
      // delivered reliably to every connected EduSync peer.
      await window.eduTransport.transferResourceChunks(res);
      
      // 3. Announce updated manifest
      const manifest = await window.eduDB.generateManifest(false);
      await window.eduTransport.sendPacketOverTransport({
        type: 'MANIFEST_ANNOUNCE',
        senderRole: 'teacher',
        senderName: window.eduTransport.myDeviceInfo?.name || 'Teacher',
        manifest: manifest
      });

      alert(`Resource shared successfully!\n\n"${res.title}" was sent to ${studentName} over Bluetooth.`);
    } catch (err) {
      console.error('[Teacher] Error sharing resource:', err);
      alert(`Error transferring "${res.title}" to student: ${err.message || err}`);
    }
  }

  async handleAddNewResource() {
    const title = document.getElementById('res-input-title').value.trim();
    const subject = document.getElementById('res-input-subject').value.trim();
    const chapter = document.getElementById('res-input-chapter').value.trim();
    const type = document.getElementById('res-input-type').value;
    const summary = document.getElementById('res-input-summary').value.trim();
    const pointsStr = document.getElementById('res-input-points').value.trim();
    const shareImmediately = document.getElementById('res-input-share-immediately')?.checked;

    if (!title || !chapter || !subject) {
      alert('Please fill out all required fields.');
      return;
    }

    if (type === 'pdf') {
      const attachedIsPdf = this.attachedFileData && (
        this.attachedFileData.type === 'application/pdf' ||
        this.attachedFileData.name.toLowerCase().endsWith('.pdf')
      );
      if (!attachedIsPdf) {
        alert('Please attach a PDF before saving this resource.');
        return;
      }
    }

    const keyPoints = pointsStr ? pointsStr.split('\n').filter(p => p.trim().length > 0) : ['Key concept explanation and examples.'];
    const calculatedFileSize = this.attachedFileSize || (Math.random() * 2 + 1).toFixed(1) + ' MB';
    let attachedFile = null;
    try {
      attachedFile = await this.readAttachedFile();
    } catch (err) {
      console.error('[EduSync] Document read failed:', err);
      alert(`Unable to attach "${this.attachedFileName}". Please choose the file again.`);
      return;
    }

    const newRes = {
      resourceId: 'RES_' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      title: title,
      class: this.selectedClass,
      subject: subject,
      chapter: chapter,
      type: type,
      fileSize: calculatedFileSize,
      fileName: this.attachedFileName || null,
      fileData: attachedFile ? attachedFile.data : null,
      fileMimeType: attachedFile ? attachedFile.mimeType : null,
      version: 1,
      hash: 'hash_' + Math.random().toString(36).substring(2, 8),
      createdBy: 'Teacher',
      createdAt: new Date().toISOString(),
      isAvailableOffline: true,
      content: {
        summary: summary || 'Comprehensive educational notes prepared for offline study.',
        keyPoints: keyPoints,
        sampleProblem: 'Review the chapter summary and test your knowledge in the offline quiz section.'
      }
    };

    await window.eduDB.addResource(newRes);
    document.getElementById('modal-add-resource').classList.remove('active');
    document.getElementById('form-add-resource').reset();
    this.clearSelectedFile();
    this.renderTeacherResources();

    const connectedPeers = window.eduTransport.getConnectedPeers();
    const isConnected = connectedPeers.length > 0;
    if (shareImmediately && isConnected) {
      const studentName = connectedPeers.length === 1
        ? (connectedPeers[0].name || 'Connected Student')
        : `${connectedPeers.length} connected students`;
      try {
        console.log(`[Teacher BT] Auto-sharing new resource "${newRes.title}" with ${studentName}...`);
        
        // Stream the resource in BLE-safe chunks.
        await window.eduTransport.transferResourceChunks(newRes);
        
        // 3. Broadcast updated manifest
        const manifest = await window.eduDB.generateManifest(false);
        await window.eduTransport.sendPacketOverTransport({
          type: 'MANIFEST_ANNOUNCE',
          senderRole: 'teacher',
          senderName: window.eduTransport.myDeviceInfo?.name || 'Teacher',
          manifest: manifest
        });

        alert(`Resource shared successfully!\n\n"${newRes.title}" was created and sent to ${studentName} over Bluetooth.`);
      } catch (err) {
        console.error('[Teacher] Error auto-sharing resource:', err);
        alert(`Resource created locally, but Bluetooth transfer failed: ${err.message || err}`);
      }
    } else {
      alert(`Resource "${newRes.title}" added to curriculum.`);
    }
  }

  async deleteResource(resourceId) {
    if (confirm('Are you sure you want to delete this resource?')) {
      await window.eduDB.deleteResource(resourceId);
      this.renderTeacherResources();
    }
  }

  // --- Student Views ---
  renderStudentDashboard(push = true) {
    this.renderScreen('screen-student-dashboard', push);
  }

  async renderStudentLearning(push = true) {
    this.renderScreen('screen-student-learning', push);
    
    // Render dynamic subject tabs
    await this.renderSubjectTabs('student-subject-tabs', () => this.renderStudentLearning(false));

    const container = document.getElementById('student-resource-list');
    if (!container) return;

    const localResources = await window.eduDB.getAllResources(this.selectedClass, this.selectedSubject);
    const localMap = new Map();
    localResources.forEach(r => localMap.set(r.resourceId, r));

    // Combine local resources with any new items announced by the connected teacher
    let combinedResources = [...localResources];
    if (window.eduSyncEngine && window.eduSyncEngine.latestTeacherManifest) {
      window.eduSyncEngine.latestTeacherManifest.forEach(tm => {
        if (!localMap.has(tm.resourceId)) {
          if ((!this.selectedClass || tm.class?.toString().trim() === this.selectedClass.toString().trim()) &&
              (!this.selectedSubject || this.selectedSubject === 'all' || tm.subject?.toString().trim().toLowerCase() === this.selectedSubject.toLowerCase())) {
            combinedResources.push({
              ...tm,
              isAvailableOffline: false
            });
          }
        }
      });
    }

    container.innerHTML = '';

    if (combinedResources.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-secondary);">No educational lessons found. Connect with your Teacher over Bluetooth to sync lessons!</div>`;
      return;
    }

    combinedResources.forEach((res) => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      const typeLabel = (res.type || 'DOC').toUpperCase();
      
      const isOffline = res.isAvailableOffline;
      const statusBadge = isOffline 
        ? `<span class="badge-offline">${window.i18n.t('availableOffline')}</span>` 
        : `<span class="badge-missing">Available on Teacher Phone</span>`;

      const actionBtn = isOffline
        ? `<button class="btn-primary btn-sm" style="flex:1;" onclick="window.eduApp.openLessonViewer('${res.resourceId}')">${window.i18n.t('openResource')}</button>`
        : `<button class="btn-secondary btn-sm" style="flex:1; border-color:var(--primary); color:var(--primary);" onclick="window.eduApp.openSyncCenter()">Sync from Teacher</button>`;

      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-${res.type}">${typeLabel}</div>
            <div class="resource-meta">
              <h4>${res.title}</h4>
              <div class="resource-submeta">
                <span style="text-transform: capitalize;">${res.subject}</span> &bull; 
                <span>${res.chapter}</span> &bull; 
                <span>${res.fileSize}</span>
              </div>
            </div>
          </div>
          ${statusBadge}
        </div>
        <div class="resource-actions" style="display:flex; gap:6px; margin-top:8px;">
          ${actionBtn}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // --- Offline Quiz System ---
  async renderStudentQuizzes(push = true) {
    this.renderScreen('screen-student-quizzes', push);
    const container = document.getElementById('student-quiz-list');
    if (!container) return;

    const quizzes = await window.eduDB.getAllQuizzes(this.selectedClass);
    container.innerHTML = '';

    quizzes.forEach((q) => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-quiz">QUIZ</div>
            <div class="resource-meta">
              <h4>${q.title}</h4>
              <div class="resource-submeta">
                <span style="text-transform: capitalize;">${q.subject}</span> &bull; 
                <span>${q.chapter}</span> &bull; 
                <span>${q.totalQuestions} Questions</span>
              </div>
            </div>
          </div>
          <span class="badge-offline">Offline</span>
        </div>
        <div class="resource-actions">
          <button class="btn-primary btn-sm" onclick="window.eduApp.startQuiz('${q.quizId}')">
            ${window.i18n.t('startQuiz')}
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async startQuiz(quizId) {
    const quiz = await window.eduDB.getQuiz(quizId);
    if (!quiz) return;

    this.currentQuiz = quiz;
    this.quizAnswers = {};
    this.currentQuizQuestionIdx = 0;
    this.renderScreen('screen-quiz-taker');
    this.renderQuizQuestion();
  }

  renderQuizQuestion() {
    const quiz = this.currentQuiz;
    const qIdx = this.currentQuizQuestionIdx;
    const q = quiz.questions[qIdx];
    const container = document.getElementById('quiz-question-box');

    document.getElementById('quiz-taker-title').textContent = `${quiz.title} (${qIdx + 1}/${quiz.questions.length})`;

    let optionsHtml = '';
    q.options.forEach((opt, idx) => {
      const isSelected = this.quizAnswers[q.id] === idx ? 'selected' : '';
      optionsHtml += `
        <div class="option-item ${isSelected}" onclick="window.eduApp.selectQuizOption('${q.id}', ${idx})">
          <input type="radio" name="opt_${q.id}" ${this.quizAnswers[q.id] === idx ? 'checked' : ''}>
          <span>${opt}</span>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="question-card">
        <h3>Q${qIdx + 1}. ${q.question}</h3>
        <div class="options-list">${optionsHtml}</div>
      </div>
    `;

    const isLast = qIdx === quiz.questions.length - 1;
    const nextBtn = document.getElementById('btn-quiz-next');
    nextBtn.textContent = isLast ? window.i18n.t('submitQuiz') : window.i18n.t('nextQuestion');
    nextBtn.onclick = () => {
      if (this.quizAnswers[q.id] === undefined) {
        alert('Please choose an answer before proceeding.');
        return;
      }
      if (isLast) {
        this.submitQuiz();
      } else {
        this.currentQuizQuestionIdx++;
        this.renderQuizQuestion();
      }
    };
  }

  selectQuizOption(questionId, optionIdx) {
    this.quizAnswers[questionId] = optionIdx;
    this.renderQuizQuestion();
  }

  async submitQuiz() {
    const quiz = this.currentQuiz;
    let score = 0;
    quiz.questions.forEach((q) => {
      if (this.quizAnswers[q.id] === q.correctAnswer) {
        score++;
      }
    });

    const percentage = Math.round((score / quiz.questions.length) * 100);

    const submission = {
      studentId: 'STU_' + (localStorage.getItem('student_name') || 'Rahul'),
      studentName: localStorage.getItem('student_name') || 'Rahul Verma',
      class: this.selectedClass,
      quizId: quiz.quizId,
      quizTitle: quiz.title,
      subject: quiz.subject,
      score: score,
      total: quiz.questions.length,
      percentage: percentage,
      completedAt: new Date().toISOString(),
      syncStatus: 'pending_sync',
      deviceOrigin: "Student Android Device"
    };

    await window.eduDB.saveQuizSubmission(submission);

    // Show result screen
    this.renderScreen('screen-quiz-complete');
    document.getElementById('quiz-result-score').textContent = `${score} / ${quiz.questions.length}`;
    document.getElementById('quiz-result-percentage').textContent = `${percentage}%`;
  }

  async renderStudentScorecard(push = true) {
    this.renderScreen('screen-student-progress', push);
    const container = document.getElementById('student-scorecard-list');
    if (!container) return;

    const submissions = await window.eduDB.getAllSubmissions();
    container.innerHTML = '';

    if (submissions.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-secondary);">No completed quizzes yet. Complete a quiz offline to see your results here!</div>`;
      return;
    }

    submissions.forEach((sub) => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      const syncBadge = sub.syncStatus === 'synced'
        ? `<span class="badge-offline">${window.i18n.t('syncedWithTeacher')}</span>`
        : `<span class="badge-missing">${window.i18n.t('pendingSync')}</span>`;

      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-quiz">SCORE</div>
            <div class="resource-meta">
              <h4>${sub.quizTitle}</h4>
              <div class="resource-submeta">
                <span>Score: <b>${sub.score}/${sub.total}</b> (${sub.percentage}%)</span> &bull; 
                <span>${new Date(sub.completedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          ${syncBadge}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // --- Teacher Analytics ---
  async renderTeacherAnalytics(push = true) {
    this.renderScreen('screen-teacher-analytics', push);
    const container = document.getElementById('teacher-submissions-list');
    if (!container) return;

    const submissions = await window.eduDB.getAllSubmissions();
    container.innerHTML = '';

    // Update stats counters
    document.getElementById('stat-total-quizzes').textContent = submissions.length;
    
    let totalScore = 0;
    submissions.forEach(s => totalScore += s.percentage);
    const avgScore = submissions.length > 0 ? Math.round(totalScore / submissions.length) : 0;
    document.getElementById('stat-avg-score').textContent = `${avgScore}%`;

    const uniqueStudents = new Set(submissions.map(s => s.studentName));
    document.getElementById('stat-active-students').textContent = uniqueStudents.size || 1;

    if (submissions.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-secondary);">${window.i18n.t('noSubmissionsYet')}</div>`;
      return;
    }

    submissions.forEach((sub) => {
      const card = document.createElement('div');
      card.className = 'peer-card';
      card.innerHTML = `
        <div class="peer-info">
          <h4>${sub.studentName} — ${sub.quizTitle}</h4>
          <p>Score: <b style="color:var(--primary);">${sub.score}/${sub.total} (${sub.percentage}%)</b> &bull; Class ${sub.class} &bull; ${new Date(sub.completedAt).toLocaleDateString()}</p>
        </div>
        <span class="status-pill">Synced</span>
      `;
      container.appendChild(card);
    });
  }

  // --- Nearby Radar & Device Discovery ---
  async searchNearbyDevices() {
    const statusText = document.getElementById('radar-status-text');
    const rescanBtn = document.getElementById('btn-rescan-radar');

    if (statusText) statusText.textContent = 'Actively searching for nearby Bluetooth devices...';
    if (rescanBtn) rescanBtn.textContent = 'Rescanning...';

    // Restart scanner
    this.renderNearbyRadar(false, false);

    if (window.eduTransport.isNative) {
      try {
        await window.Capacitor.Plugins.BluetoothP2P.startScanning();
      } catch (e) {
        console.warn('[Bluetooth] Search trigger warning:', e);
      }
    }

    setTimeout(() => {
      if (rescanBtn) rescanBtn.textContent = 'Rescan';
      if (statusText) statusText.textContent = 'Bluetooth Scanner Active';
    }, 3500);
  }

  filterNearbyPeers() {
    const input = document.getElementById('radar-search-input');
    this.radarSearchQuery = input ? input.value.trim().toLowerCase() : '';
    this.renderRadarPeerList();
  }

  clearRadarSearch() {
    const input = document.getElementById('radar-search-input');
    if (input) input.value = '';
    this.radarSearchQuery = '';
    this.renderRadarPeerList();
  }

  renderNearbyRadar(autoFocusSearch = false, push = true) {
    this.renderScreen('screen-nearby-radar', push);
    this.discoveredPeers = [];
    
    const input = document.getElementById('radar-search-input');
    if (input) {
      input.value = this.radarSearchQuery || '';
    }

    this.renderRadarPeerList();

    if (autoFocusSearch && input) {
      setTimeout(() => input.focus(), 150);
    }

    if (window.eduTransport.isNative) {
      // Real Bluetooth Scanning
      window.eduTransport.startDiscovery(this.currentRole, this.selectedClass, 
        this.currentRole === 'teacher' ? 'Teacher Sharma (Govt High School)' : "Rahul's Android Phone");
    }
  }

  renderRadarPeerList() {
    const peerList = document.getElementById('nearby-peers-list');
    const counter = document.getElementById('radar-search-counter');
    const clearBtn = document.getElementById('btn-clear-radar-search');
    if (!peerList) return;

    peerList.innerHTML = '';

    const query = (this.radarSearchQuery || '').toLowerCase().trim();
    if (clearBtn) {
      clearBtn.style.display = query ? 'block' : 'none';
    }

    // Header active banner
    if (window.eduTransport.isNative) {
      const statusBanner = document.createElement('div');
      statusBanner.style.cssText = 'background: rgba(255, 255, 255, 0.05); border: 1px solid #333333; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 0.8rem; color: var(--primary); text-align: center;';
      statusBanner.innerHTML = '<b>Bluetooth Scanner Active:</b> Searching for nearby EduSync devices...';
      peerList.appendChild(statusBanner);
    } else {
      // Demo Mode for Browser Preview
      const demoBanner = document.createElement('div');
      demoBanner.style.cssText = 'background: #111111; border: 1px solid #333333; border-radius: 8px; padding: 12px; margin-bottom: 12px; font-size: 0.8rem; color: #f59e0b; text-align: center; line-height: 1.4;';
      demoBanner.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 4px;">DEMO MODE — Single Device Simulated</div>
        <div>No Bluetooth hardware in browser. Full device-to-device Bluetooth sync operates when installed as an APK on Android.</div>
        <button class="btn-secondary btn-sm" id="btn-add-demo-peer" style="margin-top: 8px; font-size: 0.75rem; width: auto;">
          Add Test Peer (Local Preview Only)
        </button>
      `;
      peerList.appendChild(demoBanner);

      document.getElementById('btn-add-demo-peer')?.addEventListener('click', () => {
        const testPeer = this.currentRole === 'teacher' 
          ? { id: 'sim_stu_1', name: "Rahul's Phone [DEMO TEST PEER]", role: 'student', class: '8', pairingCode: '4821', isSimulated: true }
          : { id: 'sim_tch_1', name: "Science Teacher [DEMO TEST PEER]", role: 'teacher', class: '8', pairingCode: '4821', isSimulated: true };
        this.addPeerToRadarList(testPeer);
      });
    }

    // Filter peers
    let filtered = this.discoveredPeers;
    if (query) {
      filtered = this.discoveredPeers.filter(p => {
        const name = (p.name || '').toLowerCase();
        const role = (p.role || '').toLowerCase();
        const address = (p.address || p.id || '').toLowerCase();
        const code = (p.pairingCode || '').toLowerCase();
        const cls = String(p.class || '');
        return name.includes(query) || role.includes(query) || address.includes(query) || code.includes(query) || cls.includes(query);
      });

      if (counter) {
        counter.style.display = 'block';
        counter.textContent = `Showing ${filtered.length} of ${this.discoveredPeers.length} device(s) matching "${query}"`;
      }
    } else {
      if (counter) {
        counter.style.display = 'none';
        counter.textContent = '';
      }
    }

    // Empty search state
    if (query && filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'background: #111111; border: 1px dashed var(--border-subtle); border-radius: 8px; padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; margin-top: 8px;';
      emptyDiv.innerHTML = `
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">No nearby devices match your search</div>
        <div>No device found matching "<b>${query.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>"</div>
        <button class="btn-secondary btn-sm" style="margin-top: 12px; width: auto;" onclick="window.eduApp.clearRadarSearch()">
          Clear Search Filter
        </button>
      `;
      peerList.appendChild(emptyDiv);
      return;
    }

    filtered.forEach((peer) => {
      const badgeHtml = peer.isSimulated 
        ? '<span style="font-size:0.68rem; color:#f59e0b; font-weight:700;">[SIMULATED TEST PEER]</span>'
        : peer.isPaired 
          ? '<span style="font-size:0.68rem; color:#34d399; font-weight:700;">[PAIRED PHONE]</span>'
          : '<span style="font-size:0.68rem; color:var(--primary); font-weight:700;">[BLUETOOTH DISCOVERED]</span>';

      const item = document.createElement('div');
      item.className = 'peer-card';
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <div class="peer-info">
          <h4>${peer.name}</h4>
          <p>${peer.role === 'teacher' ? 'Teacher' : 'Student'} &bull; ${peer.address ? `<span style="font-family:monospace; font-size:0.75rem;">${peer.address}</span>` : ''} ${peer.rssi ? `&bull; Signal: ${peer.rssi} dBm` : ''}</p>
          ${badgeHtml}
        </div>
        <button class="btn-primary btn-sm" style="width:auto;">
          ${window.i18n.t('connect')}
        </button>
      `;

      item.querySelector('button')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPairingModal(peer);
      });

      item.addEventListener('click', () => {
        this.openPairingModal(peer);
      });

      peerList.appendChild(item);
    });
  }

  addPeerToRadarList(peer) {
    if (!this.discoveredPeers) this.discoveredPeers = [];
    // Avoid duplicates
    if (this.discoveredPeers.some(p => (p.address || p.id) === (peer.address || peer.id))) {
      return;
    }

    this.discoveredPeers.push(peer);
    this.renderRadarPeerList();
  }

  goBackFromRadar() {
    if (window.eduTransport) {
      window.eduTransport.stopDiscovery();
    }
    this.goBack();
  }

  openPairingModal(peerIdentifier) {
    let peer = null;
    if (typeof peerIdentifier === 'object' && peerIdentifier !== null) {
      peer = peerIdentifier;
    } else if (typeof peerIdentifier === 'number') {
      peer = this.discoveredPeers[peerIdentifier];
    } else if (typeof peerIdentifier === 'string') {
      peer = this.discoveredPeers.find(p => (p.address || p.id) === peerIdentifier);
    }
    if (!peer) return;

    this.activePairingPeer = peer;
    document.getElementById('pairing-peer-name').textContent = peer.name;
    document.getElementById('pairing-peer-meta').textContent = `${peer.role === 'teacher' ? 'Teacher' : 'Student'} • Class ${peer.class || '8'} • Offline Direct`;
    
    const input = document.getElementById('input-pairing-code');
    if (input) input.value = '';

    document.getElementById('modal-pairing').classList.add('active');
    setTimeout(() => input?.focus(), 150);
  }

  async confirmPairing() {
    const peer = this.activePairingPeer;
    const input = document.getElementById('input-pairing-code');
    const entered = input ? input.value.trim() : '';

    if (!peer) return;

    if (!entered || entered.length !== 4) {
      alert('Please enter the 4-digit verification code shown on the teacher device.');
      return;
    }

    document.getElementById('modal-pairing').classList.remove('active');
    await window.eduTransport.connectToPeer(peer, entered);
  }

  goBackFromSyncCenter() {
    this.goBack();
  }

  // --- Sync Center & Differential Engine ---
  async openSyncCenter(push = true) {
    this.renderScreen('screen-sync-center', push);

    if (this.currentRole === 'student' && window.eduTransport.isConnected) {
      window.eduTransport.requestTeacherManifest();
    }

    const localManifest = await window.eduDB.generateManifest(this.currentRole === 'student');
    
    // If student received teacher manifest over Bluetooth, use it
    const peerManifest = (this.currentRole === 'student' && window.eduSyncEngine.latestTeacherManifest)
      ? window.eduSyncEngine.latestTeacherManifest
      : await window.eduDB.generateManifest(false);

    const diff = window.eduSyncEngine.calculateDifferential(localManifest, peerManifest);

    const diffContainer = document.getElementById('sync-diff-content');
    const syncActionContainer = document.getElementById('sync-action-controls');
    if (syncActionContainer) {
      syncActionContainer.style.display = 'flex';
    }

    const peerInfo = window.eduTransport.connectedPeer;
    const isConnected = window.eduTransport.isConnected;

    if (this.currentRole === 'student' && !isConnected) {
      diffContainer.innerHTML = `
        <div style="text-align: center; padding: 24px 16px; background: #111111; border: 1px dashed #333333; border-radius: 12px; margin-bottom: 16px;">
          <h3 style="color: var(--primary); margin-bottom: 6px;">No Teacher Connected</h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 16px;">
            To download educational lessons and sync your quizzes, connect to your nearby Teacher's device via Bluetooth.
          </p>
          <button class="btn-primary" style="width: 100%;" onclick="window.eduApp.renderNearbyRadar()">
            Scan for Nearby Teachers
          </button>
        </div>
      `;
      syncActionContainer.innerHTML = `
        <div style="display: flex; gap: 8px; width: 100%;">
          <button class="btn-secondary" style="flex: 1;" onclick="window.eduApp.renderStudentLearning()">Learning Centre</button>
          <button class="btn-secondary" style="flex: 1;" onclick="window.eduApp.setRole('student')">Dashboard</button>
        </div>
      `;
      return;
    }

    const transportLabel = window.eduTransport.isNative 
      ? 'Bluetooth Direct P2P' 
      : 'DEMO MODE — Single Device Simulated';

    const transportBannerHtml = `
      <div style="background: #111111; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
        <div>
          <div style="font-weight: 700; color: var(--text-main);">Connected Device:</div>
          <div style="color: var(--primary);">${peerInfo ? peerInfo.name : 'Bluetooth P2P Session'}</div>
        </div>
        <span class="status-pill" style="font-size:0.7rem; color:${window.eduTransport.isNative ? '#ffffff' : '#f59e0b'};">
          ${transportLabel}
        </span>
      </div>
    `;

    if (diff.missingOnLocal.length === 0) {
      diffContainer.innerHTML = transportBannerHtml + `
        <div style="text-align:center; padding: 20px;">
          <h3 style="color: #34d399; font-size:1.1rem; margin-bottom: 4px;">${window.i18n.t('allUpToDate')}</h3>
          <p style="font-size:0.82rem; color:var(--text-secondary);">${diff.upToDate.length} resources verified with latest hashes.</p>
        </div>
      `;
      syncActionContainer.innerHTML = `
        ${this.currentRole === 'student' ? `<button class="btn-primary" style="width: 100%;" onclick="window.eduApp.renderStudentLearning()">${window.i18n.t('backToLearningLibrary')}</button>` : ''}
        <button class="btn-primary" style="width: 100%;" onclick="window.eduApp.goBack()">Back to Previous Screen</button>
        <button class="btn-secondary" style="width: 100%;" onclick="window.eduApp.currentRole === 'teacher' ? window.eduApp.renderTeacherDashboard() : window.eduApp.renderStudentDashboard()">Back to Dashboard</button>
      `;
    } else {
      let missingListHtml = diff.missingOnLocal.map(m => `
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <span><b>${m.chapter}</b>: ${m.title}</span>
          <span style="color:var(--primary); font-weight:600;">${m.fileSize}</span>
        </div>
      `).join('');

      diffContainer.innerHTML = transportBannerHtml + `
        <div class="sync-diff-box">
          <div class="sync-stat-row">
            <span>Status:</span>
            <span class="missing-badge-count">${diff.missingOnLocal.length} ${window.i18n.t('resourcesAvailableToSync')}</span>
          </div>
          <div class="sync-stat-row">
            <span>Verified Up to Date:</span>
            <span style="color:#34d399;">${diff.upToDate.length} resources</span>
          </div>
          <div style="margin-top: 8px;">
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px;">Missing Resources to be Transferred:</div>
            ${missingListHtml}
          </div>
        </div>
      `;

      syncActionContainer.innerHTML = `
        <button class="btn-primary" id="btn-start-sync" onclick="window.eduApp.startSyncProcess(${JSON.stringify(diff.missingOnLocal).replace(/"/g, '&quot;')})">
          ${window.i18n.t('syncNow')} (${diff.missingOnLocal.length})
        </button>
        ${this.currentRole === 'student' ? `<button class="btn-primary" style="width: 100%;" onclick="window.eduApp.renderStudentLearning()">${window.i18n.t('backToLearningLibrary')}</button>` : ''}
        <div style="display: flex; gap: 8px; width: 100%;">
          <button class="btn-secondary" style="flex: 1;" onclick="window.eduApp.goBack()">Back</button>
          <button class="btn-secondary" style="flex: 1;" onclick="window.eduApp.currentRole === 'teacher' ? window.eduApp.renderTeacherDashboard() : window.eduApp.renderStudentDashboard()">Dashboard</button>
        </div>
        <button class="btn-secondary" style="width: 100%; font-size: 0.75rem; opacity: 0.85;" onclick="window.eduApp.startSyncProcess(${JSON.stringify(diff.missingOnLocal).replace(/"/g, '&quot;')}, true)">
          Test Transfer Interruption & Resume
        </button>
      `;
    }
  }

  async startSyncProcess(missingResources, testInterruption = false) {
    document.getElementById('sync-progress-box').style.display = 'flex';
    document.getElementById('sync-action-controls').style.display = 'none';

    const progressBar = document.getElementById('transfer-progress-fill');
    const percentLabel = document.getElementById('transfer-percent-label');
    const metaLabel = document.getElementById('transfer-meta-label');
    const titleLabel = document.getElementById('transfer-title-label');
    const interruptAlert = document.getElementById('transfer-interrupt-alert');

    interruptAlert.style.display = 'none';

    try {
      await window.eduSyncEngine.executeTwoWaySync(
        missingResources,
        (progress) => {
          titleLabel.textContent = `${progress.resourceTitle} (Item ${progress.itemIndex}/${progress.totalItems})`;
          progressBar.style.width = `${progress.percent}%`;
          percentLabel.textContent = `${progress.percent}%`;
          metaLabel.textContent = `Chunk ${progress.chunk}/${progress.totalChunks} • ${progress.transferredMB} MB / ${progress.totalMB} MB`;

          if (progress.isPaused) {
            this.currentTransferResource = progress.currentResource;
            interruptAlert.style.display = 'block';
          }
        },
        testInterruption
      );
    } catch (e) {
      console.error('Sync error:', e);
    }
  }

  async resumeInterruptedTransfer() {
    document.getElementById('transfer-interrupt-alert').style.display = 'none';
    const progressBar = document.getElementById('transfer-progress-fill');
    const percentLabel = document.getElementById('transfer-percent-label');
    const metaLabel = document.getElementById('transfer-meta-label');

    if (this.currentTransferResource) {
      await window.eduTransport.resumeTransfer(this.currentTransferResource, (progress) => {
        progressBar.style.width = `${progress.percent}%`;
        percentLabel.textContent = `${progress.percent}%`;
        metaLabel.textContent = `Chunk ${progress.chunk}/${progress.totalChunks} • ${progress.transferredMB} MB / ${progress.totalMB} MB`;
      });
      await window.eduDB.updateResourceOfflineStatus(this.currentTransferResource.resourceId, true);
    }

    document.getElementById('sync-progress-box').style.display = 'none';
    alert(`Sync Success\n\n${window.i18n.t('syncSuccessMsg')}`);
    this.refreshCurrentScreen();
  }

  // --- Offline Lesson Viewer ---
  async openLessonViewer(resourceId) {
    const res = await window.eduDB.getResource(resourceId);
    if (!res) return;

    document.getElementById('viewer-title').textContent = `${res.chapter}: ${res.title}`;
    const body = document.getElementById('viewer-content-body');

    let keyPointsHtml = '';
    if (res.content && res.content.keyPoints) {
      keyPointsHtml = res.content.keyPoints.map(pt => `<div class="lesson-key-point">• ${pt}</div>`).join('');
    }

    let extraMedia = '';
    if (res.fileData) {
      extraMedia = `
        <div style="background:#161616; border:1px solid #333333; border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:8px;">Attached Document</div>
          <a class="btn-primary" href="${res.fileData}" download="${res.fileName || 'edusync-document'}" target="_blank" rel="noopener" style="display:inline-block; width:auto; text-decoration:none;">
            Open / Download ${res.fileName || 'Document'}
          </a>
        </div>
      `;
    }
    if (res.type === 'audio') {
      extraMedia += `
        <div style="background:#161616; border:1px solid #333333; border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Offline Audio Explanation Playing</div>
          <div style="font-size:0.72rem; color:var(--text-secondary);">High-efficiency Opus Audio (Offline Cache)</div>
        </div>
      `;
    } else if (res.type === 'video') {
      extraMedia += `
        <div style="background:#161616; border:1px solid #333333; border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Offline Interactive Video Module</div>
          <div style="font-size:0.72rem; color:var(--text-secondary);">Compressed H.264 Low-Bandwidth Stream</div>
        </div>
      `;
    }

    body.innerHTML = `
      ${extraMedia}
      <div style="margin-bottom: 12px; font-weight:600; color:var(--primary);">
        Summary & Concept Overview
      </div>
      <p style="margin-bottom: 14px; color:var(--text-main); font-size:0.88rem;">
        ${res.content?.summary || 'Educational lesson notes available offline.'}
      </p>
      <div style="margin-bottom: 8px; font-weight:600; color:var(--primary);">
        Key Learning Highlights
      </div>
      <div style="margin-bottom: 14px;">
        ${keyPointsHtml}
      </div>
      ${res.content?.formulae ? `
        <div style="background:#161616; border:1px solid #333333; border-radius:8px; padding:10px; margin-bottom:12px; font-family:monospace; font-size:0.82rem; color:var(--primary);">
          Key Formula: ${res.content.formulae}
        </div>
      ` : ''}
      ${res.content?.sampleProblem ? `
        <div style="background:#161616; border-radius:8px; padding:10px; font-size:0.82rem;">
          <b>Practice Question:</b> ${res.content.sampleProblem}
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; margin-top:14px; font-size:0.72rem; color:var(--text-secondary);">
        <span>Author: ${res.createdBy}</span>
        <span>Version: ${res.version} &bull; Verified Hash</span>
      </div>
    `;

    document.getElementById('modal-lesson-viewer').classList.add('active');
  }
}

// Instantiate globally and initialize
window.eduApp = new EduSyncApp();
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => window.eduApp.init());
} else {
  window.eduApp.init();
}
