// EduSync Local Database & Offline Storage Layer (IndexedDB with Fallback)
const DB_NAME = 'EduSyncOfflineDB';
const DB_VERSION = 1;

class EduSyncDatabase {
  constructor() {
    this.db = null;
    this.isReady = false;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Resources Store
        if (!db.objectStoreNames.contains('resources')) {
          const resourceStore = db.createObjectStore('resources', { keyPath: 'resourceId' });
          resourceStore.createIndex('class', 'class', { unique: false });
          resourceStore.createIndex('subject', 'subject', { unique: false });
          resourceStore.createIndex('class_subject', ['class', 'subject'], { unique: false });
        }

        // Quizzes Store
        if (!db.objectStoreNames.contains('quizzes')) {
          const quizStore = db.createObjectStore('quizzes', { keyPath: 'quizId' });
          quizStore.createIndex('class_subject', ['class', 'subject'], { unique: false });
        }

        // Quiz Submissions Store
        if (!db.objectStoreNames.contains('submissions')) {
          const subStore = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
          subStore.createIndex('studentId', 'studentId', { unique: false });
          subStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // Sync History Store
        if (!db.objectStoreNames.contains('sync_logs')) {
          db.createObjectStore('sync_logs', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        this.isReady = true;
        await this.seedInitialDataIfEmpty();
        resolve(this);
      };

      request.onerror = (event) => {
        console.error('[EduSync DB] IndexedDB error:', event.target.errorCode);
        reject(event.target.errorCode);
      };
    });
  }

  async seedInitialDataIfEmpty() {
    const count = await this.getResourceCount();
    if (count === 0) {
      console.log('[EduSync DB] Seeding initial curriculum resources and offline quizzes...');
      const seedResources = [
        {
          resourceId: 'MATH8CH1NOTES',
          title: 'Rational Numbers: Properties & Operations',
          class: '8',
          subject: 'mathematics',
          chapter: 'Chapter 1',
          type: 'notes',
          fileSize: '1.2 MB',
          version: 1,
          hash: 'hash_math8_ch1_v1',
          createdBy: 'Teacher R. Sharma',
          createdAt: new Date().toISOString(),
          isAvailableOffline: true,
          content: {
            summary: 'A rational number is any number that can be expressed in the form p/q where p and q are integers and q ≠ 0.',
            keyPoints: [
              'Closure Property: Rational numbers are closed under addition, subtraction, and multiplication.',
              'Commutative Property: Addition and multiplication are commutative for rational numbers (a + b = b + a).',
              'Associative Property: (a + b) + c = a + (b + c) holds true.',
              'Additive Identity is 0; Multiplicative Identity is 1.',
              'Reciprocal of a/b is b/a (where a ≠ 0).'
            ],
            formulae: 'p/q + r/s = (p*s + q*r) / (q*s)',
            sampleProblem: 'Example: Solve 3/7 + (-6/11) + (-8/21) + (5/22). Group terms with common denominators for fast solving!'
          }
        },
        {
          resourceId: 'MATH8CH2NOTES',
          title: 'Linear Equations in One Variable',
          class: '8',
          subject: 'mathematics',
          chapter: 'Chapter 2',
          type: 'notes',
          fileSize: '1.8 MB',
          version: 1,
          hash: 'hash_math8_ch2_v1',
          createdBy: 'Teacher R. Sharma',
          createdAt: new Date().toISOString(),
          isAvailableOffline: true,
          content: {
            summary: 'An algebraic equation is an equality involving variables and constants. A linear equation has highest power of variable equal to 1.',
            keyPoints: [
              'Standard form: ax + b = c, where a ≠ 0.',
              'Transposition method: When a term moves to the other side of an equality sign, its sign changes (+ becomes -, * becomes /).',
              'Applications: Word problems involving age, geometry perimeters, and currency coins.'
            ],
            formulae: 'x = (c - b) / a',
            sampleProblem: 'Solve 2x - 3 = 7. Step 1: 2x = 7 + 3 = 10. Step 2: x = 10 / 2 = 5.'
          }
        },
        {
          resourceId: 'MATH8CH3NOTES',
          title: 'Understanding Quadrilaterals & Polygons',
          class: '8',
          subject: 'mathematics',
          chapter: 'Chapter 3',
          type: 'notes',
          fileSize: '2.1 MB',
          version: 1,
          hash: 'hash_math8_ch3_v1',
          createdBy: 'Teacher R. Sharma',
          createdAt: new Date().toISOString(),
          isAvailableOffline: false, // Simulated missing on student device
          content: {
            summary: 'A quadrilateral is a polygon with 4 sides, 4 vertices, and 4 angles. Sum of interior angles is always 360°.',
            keyPoints: [
              'Parallelogram: Opposite sides are equal and parallel; opposite angles are equal; diagonals bisect each other.',
              'Rhombus: A parallelogram with sides of equal length; diagonals are perpendicular bisectors.',
              'Rectangle: A parallelogram with each angle 90°; diagonals are equal.',
              'Square: A rectangle with all sides equal.'
            ],
            formulae: 'Sum of interior angles of n-sided polygon = (n - 2) * 180°',
            sampleProblem: 'Find the measure of each interior angle of a regular octagon (n=8): ((8-2)*180)/8 = 1080/8 = 135°.'
          }
        },
        {
          resourceId: 'SCI8CH1NOTES',
          title: 'Crop Production and Management',
          class: '8',
          subject: 'science',
          chapter: 'Chapter 1',
          type: 'notes',
          fileSize: '1.4 MB',
          version: 1,
          hash: 'hash_sci8_ch1_v1',
          createdBy: 'Teacher Anita Patel',
          createdAt: new Date().toISOString(),
          isAvailableOffline: true,
          content: {
            summary: 'Agriculture practices required to cultivate crops in rural India on a large scale.',
            keyPoints: [
              'Kharif Crops: Sown in rainy season (June-Sept). Examples: Paddy, Maize, Soyabean, Cotton.',
              'Rabi Crops: Grown in winter season (Oct-March). Examples: Wheat, Gram, Pea, Mustard.',
              'Preparation of soil: Ploughing, leveling, manuring.',
              'Modern irrigation: Drip irrigation & Sprinkler system save water in water-scarce rural areas.',
              'Harvesting & Storage: Threshing, winnowing, silos to protect from pests.'
            ],
            formulae: 'Yield = Area * Seed Efficiency Rate',
            sampleProblem: 'Why is drip irrigation considered best for arid regions? It delivers water drop by drop directly to roots, reducing evaporation.'
          }
        },
        {
          resourceId: 'SCI8CH2PDF',
          title: 'Microorganisms: Friend and Foe (Illustrated Guide)',
          class: '8',
          subject: 'science',
          chapter: 'Chapter 2',
          type: 'pdf',
          fileSize: '3.4 MB',
          version: 1,
          hash: 'hash_sci8_ch2_v1',
          createdBy: 'Teacher Anita Patel',
          createdAt: new Date().toISOString(),
          isAvailableOffline: false, // Simulated missing on student device
          content: {
            summary: 'Microscopic living organisms classified into 4 major groups: Bacteria, Fungi, Protozoa, and Algae.',
            keyPoints: [
              'Friendly Microbes: Lactobacillus converts milk to curd; Yeast in bread & alcohol fermentation.',
              'Antibiotics: Medicines produced by microbes to kill disease-causing bacteria (e.g., Penicillin discovered by Alexander Fleming).',
              'Vaccines: Dead/weakened microbes introduced into body to build antibodies.',
              'Food Preservation: Salt, sugar, oil, vinegar, pasteurization (heating milk to 70°C for 15-30s).'
            ],
            formulae: 'Fermentation: Sugar + Yeast -> Alcohol + CO2',
            sampleProblem: 'Explain Nitrogen cycle: Rhizobium bacteria in leguminous root nodules fix atmospheric nitrogen into nitrates.'
          }
        },
        {
          resourceId: 'ENG8CH1AUDIO',
          title: 'The Best Christmas Present in the World — Audio Lesson',
          class: '8',
          subject: 'english',
          chapter: 'Chapter 1',
          type: 'audio',
          fileSize: '4.8 MB',
          version: 1,
          hash: 'hash_eng8_ch1_v1',
          createdBy: 'Teacher K. Verma',
          createdAt: new Date().toISOString(),
          isAvailableOffline: true,
          content: {
            summary: 'A touching story by Michael Morpurgo set during the 1914 World War I Christmas Truce between British and German soldiers.',
            keyPoints: [
              'Theme: Peace, humanity, and universal brotherhood over the futility of war.',
              'Characters: Jim Macpherson (Captain of English army), Connie Macpherson (his wife), Hans Wolf (German officer).',
              'Key Vocabulary: Parapet, trenches, shrapnel, camaraderie, keepsake.'
            ],
            sampleProblem: 'Why did Hans Wolf and Jim Macpherson feel that football was a better way to resolve conflicts than war?'
          }
        },
        {
          resourceId: 'SOC8CH1VIDEO',
          title: 'How, When and Where — Indian History Interactive Module',
          class: '8',
          subject: 'socialScience',
          chapter: 'Chapter 1',
          type: 'video',
          fileSize: '5.2 MB',
          version: 1,
          hash: 'hash_soc8_ch1_v1',
          createdBy: 'Teacher S. Roy',
          createdAt: new Date().toISOString(),
          isAvailableOffline: true,
          content: {
            summary: 'Understanding periodisation in history and official colonial records.',
            keyPoints: [
              'James Mill periodised Indian history into Hindu, Muslim, and British periods.',
              'Historians divide history into Ancient, Medieval, and Modern periods.',
              'Surveys, archives, and official records preserved by British administrations.'
            ],
            sampleProblem: 'What is the problem with the periodisation of Indian history that James Mill offers?'
          }
        }
      ];

      for (const res of seedResources) {
        await this.addResource(res);
      }

      // Seed Quizzes
      const seedQuizzes = [
        {
          quizId: 'QUIZ_MATH8_CH1',
          title: 'Rational Numbers Mastery Quiz',
          class: '8',
          subject: 'mathematics',
          chapter: 'Chapter 1',
          timeLimitMinutes: 10,
          totalQuestions: 5,
          questions: [
            {
              id: 'q1',
              question: 'Which of the following is the additive inverse of -7/19?',
              options: ['19/7', '7/19', '-19/7', '0'],
              correctAnswer: 1,
              explanation: 'The additive inverse of a/b is -a/b, so additive inverse of -7/19 is 7/19.'
            },
            {
              id: 'q2',
              question: 'What is the multiplicative identity for rational numbers?',
              options: ['0', '1', '-1', 'Any non-zero integer'],
              correctAnswer: 1,
              explanation: 'Multiplying any rational number by 1 gives the same number (a * 1 = a).'
            },
            {
              id: 'q3',
              question: 'The reciprocal of a negative rational number is always:',
              options: ['A positive rational number', 'A negative rational number', 'Zero', 'Equal to 1'],
              correctAnswer: 1,
              explanation: 'The reciprocal of -p/q is -q/p, which remains negative.'
            },
            {
              id: 'q4',
              question: 'Which property is shown here: (a/b * c/d) * e/f = a/b * (c/d * e/f)?',
              options: ['Commutative Property', 'Associative Property', 'Distributive Property', 'Closure Property'],
              correctAnswer: 1,
              explanation: 'Regrouping factors without changing order is the Associative Property of Multiplication.'
            },
            {
              id: 'q5',
              question: 'How many rational numbers exist between 3/5 and 4/5?',
              options: ['Zero', 'Only 1', '10', 'Countless / Infinite'],
              correctAnswer: 3,
              explanation: 'Between any two rational numbers, there are infinitely many rational numbers.'
            }
          ]
        },
        {
          quizId: 'QUIZ_SCI8_CH2',
          title: 'Microorganisms: Friend and Foe Quiz',
          class: '8',
          subject: 'science',
          chapter: 'Chapter 2',
          timeLimitMinutes: 10,
          totalQuestions: 5,
          questions: [
            {
              id: 'q1',
              question: 'Which bacterium helps in the formation of curd from milk?',
              options: ['Rhizobium', 'Lactobacillus', 'Spirogyra', 'Penicillium'],
              correctAnswer: 1,
              explanation: 'Lactobacillus promotes curd formation by multiplying in milk and converting lactose into lactic acid.'
            },
            {
              id: 'q2',
              question: 'Who discovered the first antibiotic, Penicillin, in 1929?',
              options: ['Louis Pasteur', 'Alexander Fleming', 'Edward Jenner', 'Robert Koch'],
              correctAnswer: 1,
              explanation: 'Sir Alexander Fleming discovered penicillin from a culture of Penicillium notatum.'
            },
            {
              id: 'q3',
              question: 'The process of conversion of sugar into alcohol by yeast is called:',
              options: ['Pasteurization', 'Fermentation', 'Nitrogen Fixation', 'Sterilization'],
              correctAnswer: 1,
              explanation: 'Louis Pasteur discovered fermentation in 1857.'
            },
            {
              id: 'q4',
              question: 'Which microorganism causes Malaria in humans?',
              options: ['Female Anopheles mosquito (Plasmodium)', 'Housefly', 'Aedes mosquito', 'Bacteria'],
              correctAnswer: 0,
              explanation: 'Plasmodium protozoan carried by female Anopheles mosquito causes malaria.'
            },
            {
              id: 'q5',
              question: 'Pasteurization of milk involves heating to 70°C for 15–30 seconds followed by:',
              options: ['Boiling for 10 minutes', 'Slow cooling over 24 hours', 'Quickly chilling to prevent microbe growth', 'Adding chemical preservatives'],
              correctAnswer: 2,
              explanation: 'Sudden chilling prevents any remaining micro-organisms from growing.'
            }
          ]
        }
      ];

      for (const quiz of seedQuizzes) {
        await this.addQuiz(quiz);
      }

      // Seed a sample submission for teacher view demo
      await this.saveQuizSubmission({
        studentId: 'STU_RAHUL_8A',
        studentName: 'Rahul Verma',
        class: '8',
        quizId: 'QUIZ_MATH8_CH1',
        quizTitle: 'Rational Numbers Mastery Quiz',
        subject: 'mathematics',
        score: 4,
        total: 5,
        percentage: 80,
        completedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        syncStatus: 'synced',
        deviceOrigin: "Rahul's Android Phone (Redmi 9A)"
      });
    }
  }

  // --- Resource Methods ---
  async addResource(resource) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['resources'], 'readwrite');
      const store = tx.objectStore('resources');
      const req = store.put(resource);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getResource(resourceId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['resources'], 'readonly');
      const store = tx.objectStore('resources');
      const req = store.get(resourceId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllResources(filterClass = null, filterSubject = null) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['resources'], 'readonly');
      const store = tx.objectStore('resources');
      const req = store.getAll();
      req.onsuccess = () => {
        let items = req.result || [];
        if (filterClass) items = items.filter(r => r.class === filterClass.toString());
        if (filterSubject && filterSubject !== 'all') items = items.filter(r => r.subject === filterSubject);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getResourceCount() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['resources'], 'readonly');
      const store = tx.objectStore('resources');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteResource(resourceId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['resources'], 'readwrite');
      const store = tx.objectStore('resources');
      const req = store.delete(resourceId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async updateResourceOfflineStatus(resourceId, isAvailableOffline) {
    const res = await this.getResource(resourceId);
    if (res) {
      res.isAvailableOffline = isAvailableOffline;
      return this.addResource(res);
    }
  }

  // --- Quiz Methods ---
  async addQuiz(quiz) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['quizzes'], 'readwrite');
      const store = tx.objectStore('quizzes');
      const req = store.put(quiz);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getQuiz(quizId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['quizzes'], 'readonly');
      const store = tx.objectStore('quizzes');
      const req = store.get(quizId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllQuizzes(filterClass = null) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['quizzes'], 'readonly');
      const store = tx.objectStore('quizzes');
      const req = store.getAll();
      req.onsuccess = () => {
        let items = req.result || [];
        if (filterClass) items = items.filter(q => q.class === filterClass.toString());
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --- Submissions / Results Methods ---
  async saveQuizSubmission(submission) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['submissions'], 'readwrite');
      const store = tx.objectStore('submissions');
      const req = store.add(submission);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllSubmissions() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['submissions'], 'readonly');
      const store = tx.objectStore('submissions');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingSubmissions() {
    const all = await this.getAllSubmissions();
    return all.filter(sub => sub.syncStatus === 'pending_sync');
  }

  async markSubmissionsAsSynced(ids) {
    const tx = this.db.transaction(['submissions'], 'readwrite');
    const store = tx.objectStore('submissions');
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.syncStatus = 'synced';
          item.syncedAt = new Date().toISOString();
          store.put(item);
        }
      };
    }
  }

  // --- Sync Manifest Generator ---
  async generateManifest(studentMode = false) {
    const resources = await this.getAllResources();
    return resources.map(res => ({
      resourceId: res.resourceId,
      title: res.title,
      class: res.class,
      subject: res.subject,
      chapter: res.chapter,
      type: res.type,
      fileSize: res.fileSize,
      version: res.version,
      hash: res.hash,
      isAvailableOffline: studentMode ? !!res.isAvailableOffline : true
    }));
  }
}

window.eduDB = new EduSyncDatabase();
