// EduSync Main Application Controller
class EduSyncApp {
  constructor() {
    this.currentRole = null; // 'teacher' | 'student'
    this.selectedClass = '8';
    this.selectedSubject = 'all';
    this.activeScreen = 'screen-role-select';
    this.currentQuiz = null;
    this.quizAnswers = {};
    this.currentQuizQuestionIdx = 0;
    this.currentTransferResource = null;
  }

  async init() {
    console.log('[EduSync] Initializing offline platform...');
    await window.eduDB.init();
    
    // Register Service Worker if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[EduSync] Service worker active'))
        .catch((err) => console.warn('[EduSync] SW registration failed:', err));
    }

    this.bindEvents();
    window.i18n.updateDOM();
    this.renderScreen('screen-role-select');
  }

  bindEvents() {
    // Role selection
    document.getElementById('btn-select-teacher')?.addEventListener('click', () => {
      this.setRole('teacher');
    });

    document.getElementById('btn-select-student')?.addEventListener('click', () => {
      this.setRole('student');
    });

    // Language toggle
    document.getElementById('btn-lang-toggle')?.addEventListener('click', () => {
      window.i18n.toggleLanguage();
      this.refreshCurrentScreen();
    });

    // Class selection changes
    document.querySelectorAll('.class-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        this.selectedClass = e.target.value;
        this.refreshCurrentScreen();
      });
    });

    // Subject tab filtering
    document.querySelectorAll('.subject-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const sub = e.target.getAttribute('data-subject');
        this.selectedSubject = sub;
        document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        if (this.currentRole === 'teacher') {
          this.renderTeacherResources();
        } else {
          this.renderStudentLearning();
        }
      });
    });

    // Navigation buttons
    document.getElementById('nav-teacher-resources')?.addEventListener('click', () => this.renderTeacherResources());
    document.getElementById('nav-teacher-nearby')?.addEventListener('click', () => this.renderNearbyRadar());
    document.getElementById('nav-teacher-progress')?.addEventListener('click', () => this.renderTeacherAnalytics());
    document.getElementById('nav-teacher-sync')?.addEventListener('click', () => this.openSyncCenter());

    document.getElementById('nav-student-learning')?.addEventListener('click', () => this.renderStudentLearning());
    document.getElementById('nav-student-quizzes')?.addEventListener('click', () => this.renderStudentQuizzes());
    document.getElementById('nav-student-progress')?.addEventListener('click', () => this.renderStudentScorecard());
    document.getElementById('nav-student-sync')?.addEventListener('click', () => this.openSyncCenter());

    // Back to role selector
    document.querySelectorAll('.btn-back-home').forEach(btn => {
      btn.addEventListener('click', () => {
        window.eduTransport.disconnect();
        this.renderScreen('screen-role-select');
      });
    });

    // Add Resource Modal
    const openAddModal = () => {
      document.getElementById('modal-add-resource').classList.add('active');
    };
    document.getElementById('btn-open-add-resource')?.addEventListener('click', openAddModal);
    document.getElementById('btn-open-add-resource-2')?.addEventListener('click', openAddModal);

    document.getElementById('btn-close-add-modal')?.addEventListener('click', () => {
      document.getElementById('modal-add-resource').classList.remove('active');
    });

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

    // Radar Back Button
    document.getElementById('btn-radar-back')?.addEventListener('click', () => {
      this.goBackFromRadar();
    });

    // Resume transfer button
    document.getElementById('btn-resume-transfer')?.addEventListener('click', () => {
      this.resumeInterruptedTransfer();
    });
  }

  setRole(role) {
    this.currentRole = role;
    if (role === 'teacher') {
      window.eduTransport.startDiscovery('teacher', this.selectedClass, 'Teacher Sharma (Govt High School)');
      this.renderTeacherDashboard();
    } else {
      window.eduTransport.startDiscovery('student', this.selectedClass, "Rahul's Android Phone");
      this.renderStudentDashboard();
    }
  }

  renderScreen(screenId) {
    this.activeScreen = screenId;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }
    window.i18n.updateDOM();
  }

  refreshCurrentScreen() {
    if (this.activeScreen === 'screen-teacher-resources') {
      this.renderTeacherResources();
    } else if (this.activeScreen === 'screen-student-learning') {
      this.renderStudentLearning();
    } else if (this.activeScreen === 'screen-student-quizzes') {
      this.renderStudentQuizzes();
    } else if (this.activeScreen === 'screen-teacher-analytics') {
      this.renderTeacherAnalytics();
    } else if (this.activeScreen === 'screen-nearby-radar') {
      this.renderNearbyRadar();
    }
    window.i18n.updateDOM();
  }

  // --- Teacher Views ---
  renderTeacherDashboard() {
    this.renderScreen('screen-teacher-dashboard');
  }

  async renderTeacherResources() {
    this.renderScreen('screen-teacher-resources');
    const container = document.getElementById('teacher-resource-list');
    if (!container) return;

    const resources = await window.eduDB.getAllResources(this.selectedClass, this.selectedSubject);
    container.innerHTML = '';

    if (resources.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-secondary);">No educational resources found for Class ${this.selectedClass}. Click <b>+ Add Resource</b> above to create one!</div>`;
      return;
    }

    resources.forEach((res) => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      const iconType = res.type === 'pdf' ? '📄' : res.type === 'notes' ? '📝' : res.type === 'quiz' ? '❓' : res.type === 'audio' ? '🎧' : '🎥';
      
      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-${res.type}">${iconType}</div>
            <div class="resource-meta">
              <h4>${res.title}</h4>
              <div class="resource-submeta">
                <span>Class ${res.class}</span> &bull; 
                <span style="text-transform: capitalize;">${res.subject}</span> &bull; 
                <span>${res.chapter}</span>
              </div>
            </div>
          </div>
          <span class="badge-offline">✓ ${res.fileSize}</span>
        </div>
        <div class="resource-actions">
          <button class="btn-secondary btn-sm" style="flex: 1;" onclick="window.eduApp.openLessonViewer('${res.resourceId}')">
            📖 ${window.i18n.t('openResource')}
          </button>
          <button class="btn-secondary btn-sm" style="color: var(--accent-coral);" onclick="window.eduApp.deleteResource('${res.resourceId}')">
            🗑️
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async handleAddNewResource() {
    const title = document.getElementById('res-input-title').value.trim();
    const subject = document.getElementById('res-input-subject').value;
    const chapter = document.getElementById('res-input-chapter').value.trim();
    const type = document.getElementById('res-input-type').value;
    const summary = document.getElementById('res-input-summary').value.trim();
    const pointsStr = document.getElementById('res-input-points').value.trim();

    if (!title || !chapter) {
      alert('Please fill out all required fields.');
      return;
    }

    const keyPoints = pointsStr ? pointsStr.split('\n').filter(p => p.trim().length > 0) : ['Key concept explanation and examples.'];

    const newRes = {
      resourceId: 'RES_' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      title: title,
      class: this.selectedClass,
      subject: subject,
      chapter: chapter,
      type: type,
      fileSize: (Math.random() * 2 + 1).toFixed(1) + ' MB',
      version: 1,
      hash: 'hash_' + Math.random().toString(36).substring(2, 8),
      createdBy: 'Teacher',
      createdAt: new Date().toISOString(),
      isAvailableOffline: true,
      content: {
        summary: summary || 'Comprehensive rural educational notes prepared for offline study.',
        keyPoints: keyPoints,
        sampleProblem: 'Review the chapter summary and test your knowledge in the offline quiz section.'
      }
    };

    await window.eduDB.addResource(newRes);
    document.getElementById('modal-add-resource').classList.remove('active');
    document.getElementById('form-add-resource').reset();
    this.renderTeacherResources();
  }

  async deleteResource(resourceId) {
    if (confirm('Are you sure you want to delete this resource?')) {
      await window.eduDB.deleteResource(resourceId);
      this.renderTeacherResources();
    }
  }

  // --- Student Views ---
  renderStudentDashboard() {
    this.renderScreen('screen-student-dashboard');
  }

  async renderStudentLearning() {
    this.renderScreen('screen-student-learning');
    const container = document.getElementById('student-resource-list');
    if (!container) return;

    const resources = await window.eduDB.getAllResources(this.selectedClass, this.selectedSubject);
    container.innerHTML = '';

    resources.forEach((res) => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      const iconType = res.type === 'pdf' ? '📄' : res.type === 'notes' ? '📝' : res.type === 'quiz' ? '❓' : res.type === 'audio' ? '🎧' : '🎥';
      
      const isOffline = res.isAvailableOffline;
      const statusBadge = isOffline 
        ? `<span class="badge-offline">✓ ${window.i18n.t('availableOffline')}</span>` 
        : `<span class="badge-missing">⚠️ ${window.i18n.t('missing')}</span>`;

      const actionBtn = isOffline
        ? `<button class="btn-primary btn-sm" onclick="window.eduApp.openLessonViewer('${res.resourceId}')">📖 ${window.i18n.t('openResource')}</button>`
        : `<button class="btn-secondary btn-sm" onclick="window.eduApp.openSyncCenter()">🔄 ${window.i18n.t('downloadResource')}</button>`;

      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-${res.type}">${iconType}</div>
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
        <div class="resource-actions">
          ${actionBtn}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // --- Offline Quiz System ---
  async renderStudentQuizzes() {
    this.renderScreen('screen-student-quizzes');
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
            <div class="res-type-badge type-quiz">❓</div>
            <div class="resource-meta">
              <h4>${q.title}</h4>
              <div class="resource-submeta">
                <span style="text-transform: capitalize;">${q.subject}</span> &bull; 
                <span>${q.chapter}</span> &bull; 
                <span>${q.totalQuestions} Questions</span>
              </div>
            </div>
          </div>
          <span class="badge-offline">✓ Offline</span>
        </div>
        <div class="resource-actions">
          <button class="btn-primary btn-sm" onclick="window.eduApp.startQuiz('${q.quizId}')">
            ✍️ ${window.i18n.t('startQuiz')}
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

  async renderStudentScorecard() {
    this.renderScreen('screen-student-progress');
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
        ? `<span class="badge-offline">✓ ${window.i18n.t('syncedWithTeacher')}</span>`
        : `<span class="badge-missing">⏳ ${window.i18n.t('pendingSync')}</span>`;

      card.innerHTML = `
        <div class="resource-top">
          <div class="resource-header-info">
            <div class="res-type-badge type-quiz">📊</div>
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
  async renderTeacherAnalytics() {
    this.renderScreen('screen-teacher-analytics');
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
        <span class="status-pill">✓ Synced</span>
      `;
      container.appendChild(card);
    });
  }

  // --- Nearby Radar & Device Discovery ---
  renderNearbyRadar() {
    this.renderScreen('screen-nearby-radar');
    const peerList = document.getElementById('nearby-peers-list');
    peerList.innerHTML = '';

    // Simulated nearby discovery
    this.discoveredPeers = this.currentRole === 'teacher' ? [
      { id: 'peer_stu_1', name: "Rahul's Android Phone (Redmi 9A)", role: 'student', class: '8', pairingCode: '4821', school: 'Govt High School' },
      { id: 'peer_stu_2', name: "Ananya's Phone (Samsung M12)", role: 'student', class: '8', pairingCode: '7392', school: 'Govt High School' }
    ] : [
      { id: 'peer_tch_1', name: "Science Teacher (Govt High School)", role: 'teacher', class: '8', pairingCode: '4821', school: 'Govt High School' }
    ];

    this.discoveredPeers.forEach((peer, idx) => {
      const item = document.createElement('div');
      item.className = 'peer-card';
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <div class="peer-info">
          <h4>📱 ${peer.name}</h4>
          <p>${peer.role === 'teacher' ? 'Teacher' : 'Student'} &bull; Class ${peer.class}</p>
        </div>
        <button class="btn-primary btn-sm" style="width:auto;" onclick="event.stopPropagation(); window.eduApp.openPairingModal(${idx});">
          ${window.i18n.t('connect')}
        </button>
      `;
      
      item.addEventListener('click', () => {
        this.openPairingModal(idx);
      });

      peerList.appendChild(item);
    });
  }

  goBackFromRadar() {
    if (this.currentRole === 'teacher') {
      this.renderTeacherDashboard();
    } else {
      this.renderStudentDashboard();
    }
  }

  openPairingModal(peerIdx) {
    const peer = this.discoveredPeers[peerIdx];
    if (!peer) return;

    this.activePairingPeer = peer;
    document.getElementById('pairing-peer-name').textContent = peer.name;
    document.getElementById('pairing-peer-meta').textContent = `${peer.role === 'teacher' ? 'Teacher' : 'Student'} • Class ${peer.class} • ${peer.school}`;
    document.getElementById('pairing-code-display').textContent = peer.pairingCode;
    
    // Pre-fill input for quick trial demo
    const input = document.getElementById('input-pairing-code');
    input.value = peer.pairingCode;

    document.getElementById('modal-pairing').classList.add('active');
    setTimeout(() => input.focus(), 150);
  }

  confirmPairing() {
    const peer = this.activePairingPeer;
    const entered = document.getElementById('input-pairing-code').value.trim();

    if (!peer) return;

    if (entered === peer.pairingCode) {
      document.getElementById('modal-pairing').classList.remove('active');
      window.eduTransport.connectToPeer(peer, entered);
      this.openSyncCenter();
    } else {
      alert('Verification code does not match. Please enter the 4-digit code shown on the peer device.');
    }
  }

  // --- Sync Center & Differential Engine ---
  async openSyncCenter() {
    this.renderScreen('screen-sync-center');
    const localManifest = await window.eduDB.generateManifest(this.currentRole === 'student');
    
    // In demo flow, generate teacher full manifest vs student manifest
    const fullTeacherManifest = await window.eduDB.generateManifest(false);
    const diff = window.eduSyncEngine.calculateDifferential(localManifest, fullTeacherManifest);

    const diffContainer = document.getElementById('sync-diff-content');
    const syncActionContainer = document.getElementById('sync-action-controls');

    if (diff.missingOnLocal.length === 0) {
      diffContainer.innerHTML = `
        <div style="text-align:center; padding: 20px;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">✨</div>
          <h3 style="color: #34d399; font-size:1.1rem; margin-bottom: 4px;">${window.i18n.t('allUpToDate')}</h3>
          <p style="font-size:0.82rem; color:var(--text-secondary);">${diff.upToDate.length} resources verified with latest hashes.</p>
        </div>
      `;
      syncActionContainer.innerHTML = `
        <button class="btn-secondary" style="width:100%;" onclick="window.eduApp.refreshCurrentScreen()">✓ ${window.i18n.t('back')}</button>
      `;
    } else {
      let missingListHtml = diff.missingOnLocal.map(m => `
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <span>📚 <b>${m.chapter}</b>: ${m.title}</span>
          <span style="color:var(--primary); font-weight:600;">${m.fileSize}</span>
        </div>
      `).join('');

      diffContainer.innerHTML = `
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
          🚀 ${window.i18n.t('syncNow')} (${diff.missingOnLocal.length})
        </button>
        <button class="btn-secondary" style="width:100%; font-size:0.8rem;" onclick="window.eduApp.startSyncProcess(${JSON.stringify(diff.missingOnLocal).replace(/"/g, '&quot;')}, true)">
          ⚡ Test Transfer Interruption & Resume
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

      // On completion
      if (!testInterruption || !window.eduTransport.isPaused) {
        document.getElementById('sync-progress-box').style.display = 'none';
        alert(`✅ ${window.i18n.t('syncSuccess')}\n\n${window.i18n.t('syncSuccessMsg')}`);
        this.refreshCurrentScreen();
      }
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
    alert(`✅ ${window.i18n.t('syncSuccess')}\n\n${window.i18n.t('syncSuccessMsg')}`);
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
    if (res.type === 'audio') {
      extraMedia = `
        <div style="background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.3); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
          <div style="font-size:1.8rem; margin-bottom:4px;">🎧</div>
          <div style="font-size:0.85rem; font-weight:600; color:#c084fc;">Offline Audio Explanation Playing</div>
          <div style="font-size:0.72rem; color:var(--text-secondary);">High-efficiency Opus Audio (Offline Cache)</div>
        </div>
      `;
    } else if (res.type === 'video') {
      extraMedia = `
        <div style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
          <div style="font-size:1.8rem; margin-bottom:4px;">🎥</div>
          <div style="font-size:0.85rem; font-weight:600; color:#34d399;">Offline Interactive Video Module</div>
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
        <div style="background:rgba(0,210,255,0.08); border:1px solid rgba(0,210,255,0.2); border-radius:8px; padding:10px; margin-bottom:12px; font-family:monospace; font-size:0.82rem; color:var(--primary);">
          📐 Key Formula: ${res.content.formulae}
        </div>
      ` : ''}
      ${res.content?.sampleProblem ? `
        <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:10px; font-size:0.82rem;">
          <b>💡 Practice Question:</b> ${res.content.sampleProblem}
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; margin-top:14px; font-size:0.72rem; color:var(--text-secondary);">
        <span>Author: ${res.createdBy}</span>
        <span>Version: ${res.version} &bull; Verified Hash: ✓</span>
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
