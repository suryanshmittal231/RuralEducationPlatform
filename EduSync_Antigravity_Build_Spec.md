# EduSync — Antigravity Build Specification

## 1. Project Overview

Build an **Android-first mobile application called EduSync** for rural educational environments where internet connectivity is unreliable, slow, expensive, or unavailable.

### Core idea

EduSync allows teachers and students to:

- Store educational content locally.
- Share educational content directly between nearby devices.
- Work completely offline after content is received.
- Synchronize student quiz/assignment results back to the teacher when devices reconnect.
- Minimize network usage and data size.
- Eventually support device-to-device propagation of educational content.

### Core message

> **Learn Offline. Sync Anywhere.**

This is NOT intended to be a generic Bluetooth file-sharing application. The application must understand educational resources and organize them by class, subject, chapter, and type.

---

# 2. Primary Target Users

## Teachers

Teachers should be able to:

- Add educational resources.
- Organize resources by class and subject.
- Share resources with nearby student devices.
- See which resources a connected student is missing.
- Sync student quiz/assignment results.
- See basic student progress.

## Students

Students should be able to:

- See the learning material available on their device.
- Receive missing educational resources.
- Read/watch/use resources offline.
- Take quizzes offline.
- See their own progress.
- Sync completed work back to the teacher when nearby.

---

# 3. VERY IMPORTANT DESIGN REQUIREMENTS

## A. Offline-first

The application must assume that the internet may be unavailable.

The core application must continue working with:

- No internet
- No mobile data
- Poor connectivity
- Intermittent connectivity

Do NOT make cloud connectivity a requirement for normal learning.

Internet should only be an optional way to obtain new content or synchronize with a central server in a future version.

---

## B. Lightweight code and data usage

This is extremely important.

The app is intended for rural environments with poor networks and potentially low-end Android phones.

### Requirements

- Keep dependencies to a minimum.
- Avoid unnecessary libraries.
- Avoid large frameworks unless absolutely necessary.
- Avoid loading remote web pages.
- Do not require a large backend for the MVP.
- Store important data locally.
- Avoid background network requests.
- Do not continuously poll servers.
- Compress images.
- Prefer small thumbnails.
- Use low-resolution educational videos when possible.
- Transfer only missing content.
- Support resumable/chunked transfers.
- Never re-download an entire file if part of it already exists.
- Avoid animations that consume unnecessary resources.
- Keep APK/app size as small as reasonably possible.
- Optimize for low RAM and older Android devices.

### Network philosophy

> **Every byte should have a reason to exist.**

If content can be transferred locally through Bluetooth/device-to-device communication, do not use the internet.

---

# 4. Connectivity Strategy

For the MVP, prioritize **device-to-device communication**.

Preferred order:

1. Bluetooth / Bluetooth Low Energy for discovery and synchronization where practical.
2. Wi-Fi Direct or local device-to-device connection as an optional faster transport.
3. Internet only as a fallback/future feature.

Do not make Wi-Fi internet access necessary.

### Important technical instruction

If reliable large-file transfer over BLE is impractical on the selected Android APIs, use BLE for discovery/control and an appropriate Android peer-to-peer transport for larger files.

The user experience should remain the same regardless of transport.

Create a simple abstraction such as:

```text
Transport Layer
    |
    +-- BluetoothTransport
    |
    +-- WifiDirectTransport (optional)
    |
    +-- FutureTransport
```

The rest of the application should communicate with the Transport Layer rather than depending directly on one protocol.

---

# 5. MVP Scope

Do NOT attempt to build a full production-grade mesh network initially.

The first working prototype must prove these functions:

### Feature 1 — Teacher mode

Teacher can:

- Select Teacher mode.
- Create/select a class.
- Add educational content.
- View local resources.
- See nearby devices.
- Connect to a student.

### Feature 2 — Student mode

Student can:

- Select Student mode.
- Enter/select their class.
- View available learning material.
- Connect to a teacher.

### Feature 3 — Smart synchronization

When Teacher and Student connect:

The app compares educational content manifests.

Example:

Teacher:

```text
Maths
  Chapter 1 ✓
  Chapter 2 ✓
  Chapter 3 ✓

Science
  Chapter 1 ✓
  Chapter 2 ✓
```

Student:

```text
Maths
  Chapter 1 ✓
  Chapter 2 ✗
  Chapter 3 ✓

Science
  Chapter 1 ✓
  Chapter 2 ✗
```

EduSync should display:

```text
2 resources available

Maths — Chapter 2
Science — Chapter 2

[ SYNC NOW ]
```

Only missing resources should be transferred.

---

# 6. Educational Resource Model

Do not treat everything as an anonymous file.

Each educational resource should have metadata such as:

```text
resourceId
title
class
subject
chapter
type
fileSize
version
hash
createdBy
createdAt
```

Possible types:

- PDF
- Image
- Audio
- Video
- Quiz
- Notes
- Assignment

Example:

```text
resourceId: SCI8CH2PDF
title: Materials Around Us
class: 8
subject: Science
chapter: 2
type: PDF
version: 1
hash: <file hash>
```

Use a local database such as SQLite/Room only if it is lightweight and practical. Avoid unnecessary database complexity.

---

# 7. Offline Learning

After receiving content, the student must be able to access it without internet.

Student home screen:

```text
EduSync

My Class: 8

[ Mathematics ]
[ Science ]
[ English ]

[ My Quizzes ]
[ My Progress ]
[ Sync ]
```

The UI should clearly indicate that content is available offline.

Example:

```text
✓ Available Offline
```

---

# 8. Offline Quiz System

Include a simple quiz system in the MVP.

Teacher can distribute a quiz.

Student can:

- Open quiz offline.
- Answer questions.
- Submit.
- Store results locally.

Example:

```text
Science — Chapter 2

Q1. Which material is a conductor?

○ Wood
○ Plastic
● Copper
○ Rubber

[ NEXT ]
```

After completion:

```text
Quiz Complete

Score: 8 / 10

✓ Saved Offline

Results will sync when you connect
to your teacher.
```

---

# 9. Two-Way Synchronization

This is an important differentiator.

Synchronization should work in both directions.

```text
TEACHER
   |
   | educational content
   v
STUDENT
   |
   | quiz / assignment results
   v
TEACHER
```

Student results should remain safely stored if the connection disappears.

When the teacher and student reconnect:

```text
1 pending result found

Science Chapter 2 Quiz
Score: 8/10

[ SYNC RESULTS ]
```

---

# 10. Transfer Reliability

Transfers should be designed for unreliable connections.

Implement, if feasible:

- File chunking.
- Progress percentage.
- Resume interrupted transfer.
- Basic checksum/hash verification.
- Duplicate detection.
- Do not transfer a resource already present with the same version/hash.

Example:

```text
Science_Chapter_2.pdf

████████████░░░░░░ 68%

68 MB / 100 MB

Connection interrupted.

[ RESUME ]
```

Do NOT restart from 0% after a temporary disconnect.

For the MVP, a simple robust implementation is more important than a sophisticated protocol.

---

# 11. Device Discovery

Create a simple nearby-device screen.

Teacher:

```text
Nearby Devices

● Rahul's Phone
  Student — Class 8

● Ananya's Phone
  Student — Class 8

[ CONNECT ]
```

Student:

```text
Nearby Teachers

● School Teacher
  Class 8

[ CONNECT ]
```

Use clear icons and large buttons.

Do not expose technical Bluetooth terminology to normal users unless necessary.

---

# 12. Pairing / Trust

The first connection should be simple.

Possible MVP approach:

Teacher displays a short pairing code or QR code.

Student confirms the teacher.

Example:

```text
Teacher verification

School: Government School A
Teacher: Science Teacher

Code: 4821

Does this match your teacher?

[ YES, CONNECT ]
```

Do not build complicated authentication for the first prototype.

However, structure the code so stronger authentication can be added later.

---

# 13. Future Store-and-Forward / Mesh Capability

This is NOT required for the first MVP but the architecture should allow it.

Long-term concept:

```text
Internet
   |
School A
   |
Bluetooth
   |
Student A
   |
Bluetooth
   |
Student B
   |
Bluetooth
   |
School B
```

A device can temporarily act as a carrier of educational resources.

For the prototype, it is acceptable to implement this manually:

1. Device A receives content.
2. Device B connects to Device A.
3. Device B receives missing content.

Automatic routing across many devices is a future feature.

DO NOT let mesh networking delay the core MVP.

---

# 14. User Interface Principles

This is extremely important.

The target audience may include people with limited technical experience.

The interface must be:

## Simple

Avoid complex menus.

Use 3–5 major actions per screen.

## Large

- Large buttons.
- Large text.
- Clear icons.
- High contrast.
- Large touch targets.

## Familiar

Use words such as:

- Learn
- Share
- Sync
- Results
- My Class

Avoid unnecessary technical terms such as:

- Manifest
- Peer discovery
- Transport protocol
- Hash
- BLE

These can exist internally but should not appear in the normal user interface.

---

# 15. Language Support

Design the UI so localization can be added easily.

MVP:

- English
- Hindi

Architecture should allow future regional languages.

Do NOT hard-code user-visible strings throughout the application.

Put UI text in a centralized localization/resource system.

---

# 16. Accessibility

Consider:

- Large readable fonts.
- Strong contrast.
- Icons accompanied by text.
- Minimal reliance on color alone.
- Clear success/error messages.
- Simple navigation.
- Avoid tiny buttons.
- Avoid excessive animations.

---

# 17. Suggested App Navigation

## First screen

```text
          EduSync

   Learn Offline. Sync Anywhere.

       [ 👩‍🏫 TEACHER ]

       [ 👨‍🎓 STUDENT ]
```

## Teacher home

```text
Welcome, Teacher

Class 8

[ 📚 My Resources ]
[ 📱 Nearby Students ]
[ 🔄 Sync ]
[ 📊 Student Progress ]
```

## Student home

```text
Welcome, Student

Class 8

[ 📚 My Learning ]
[ 📝 My Quizzes ]
[ 📊 My Progress ]
[ 🔄 Sync ]
```

---

# 18. Teacher Resource Screen

```text
My Resources

Mathematics
  ✓ Chapter 1
  ✓ Chapter 2
  ✓ Chapter 3

Science
  ✓ Chapter 1
  ✓ Chapter 2

[ + ADD RESOURCE ]

[ SHARE WITH NEARBY STUDENTS ]
```

Adding a resource should be easy.

Prefer Android's normal file picker.

---

# 19. Student Learning Screen

```text
My Learning

MATHEMATICS

✓ Chapter 1
✓ Chapter 2
↓ Chapter 3 — Downloading

SCIENCE

✓ Chapter 1
✓ Chapter 2

✓ = Available Offline
↓ = Currently syncing
```

---

# 20. Sync Screen

The sync screen should explain what is happening in simple language.

Example:

```text
Connected to:

Teacher — Government School

Checking your learning material...

✓ 12 resources already available

2 new resources found

[ SYNC 2 RESOURCES ]
```

After sync:

```text
Sync Complete ✓

2 learning resources added.

You can now use them offline.
```

---

# 21. Error Handling

Never show technical errors such as:

```text
NullPointerException
SocketException
GATT_ERROR_133
```

to the user.

Instead:

```text
Connection lost

The transfer was paused.

Move closer to the other device
and try again.

[ RESUME ]
```

Another example:

```text
Not enough storage

Please remove some files and
try again.
```

---

# 22. Data Efficiency

Implement these principles:

### Only transfer missing resources

Do not resend files that already exist.

### Versioning

If the teacher updates Chapter 2:

```text
Chapter 2
Version 2
```

Only update when necessary.

### Compression

Compress suitable text/metadata and small resources.

Do not repeatedly compress already-compressed media.

### Chunking

Large files should be divided into chunks.

Example:

```text
Video
Chunk 1 ✓
Chunk 2 ✓
Chunk 3 ✓
Chunk 4 ✗
Chunk 5 ✗
```

If connection fails, continue from Chunk 4.

---

# 23. Local Storage

The app must prioritize local storage.

Suggested structure:

```text
Local Database
    |
    +-- Users
    +-- Classes
    +-- Resources
    +-- Resource metadata
    +-- Quizzes
    +-- Quiz results
    +-- Sync history
```

Actual educational files should be stored locally using appropriate Android storage APIs.

---

# 24. Security / Privacy

For the MVP:

- Do not collect unnecessary personal information.
- Do not require users to create online accounts.
- Keep student data on-device unless explicitly synchronized.
- Use secure local storage where practical.
- Verify transferred files.
- Do not automatically expose all device files.
- Only allow EduSync-approved educational content to enter the app's content library.

---

# 25. Recommended Technical Approach

Build this as an **Android application** first.

Preferred:

- Kotlin
- Modern Android UI
- Local SQLite/Room if needed
- Android Bluetooth APIs
- Android file picker
- Local storage
- No mandatory cloud backend

Keep the architecture modular:

```text
UI
 |
ViewModel / App Logic
 |
Sync Engine
 |
Content Database
 |
Transport Layer
 |
Bluetooth / Wi-Fi Direct / Future transports
```

Do not introduce technologies simply because they are popular.

Choose the simplest reliable implementation.

---

# 26. Development Strategy for Antigravity

Build incrementally.

DO NOT attempt to generate the entire application in one huge step.

### Milestone 1

Create the UI and navigation.

Test:

- Teacher mode
- Student mode
- Home screens
- Resource screens
- Quiz screens

### Milestone 2

Implement local storage.

Test:

- Add resource
- Display resource
- Open resource offline
- Store quiz results

### Milestone 3

Implement device discovery and connection.

Test using two physical Android devices.

### Milestone 4

Implement a small file transfer.

First test with:

- TXT
- Small PDF
- Small image

Only after this works should larger files be tested.

### Milestone 5

Implement content manifest comparison.

### Milestone 6

Implement resumable transfer.

### Milestone 7

Implement two-way result synchronization.

### Milestone 8

Polish UI and create the final demo flow.

---

# 27. Testing Requirements

Test on real Android phones.

Do NOT rely only on an emulator.

At minimum test:

1. Two phones with no internet.
2. Bluetooth discovery.
3. Pairing.
4. Small PDF transfer.
5. Transfer interruption.
6. Resume.
7. Student opens content offline.
8. Student completes quiz offline.
9. Results sync back to teacher.
10. Duplicate content is not transferred again.

---

# 28. 10-Day Prototype Goal

At the end of 10 days, the ideal demonstration should be:

### Step 1

Disable internet on all phones.

### Step 2

Teacher opens EduSync.

### Step 3

Student opens EduSync.

### Step 4

They discover each other.

### Step 5

EduSync compares available educational content.

### Step 6

It says:

```text
Student is missing:

Maths — Chapter 3
Science — Chapter 2

[ SYNC ]
```

### Step 7

Content transfers directly between devices.

### Step 8

Student opens the content with no internet.

### Step 9

Student completes a quiz.

### Step 10

Student reconnects to teacher.

### Step 11

Quiz result synchronizes.

```text
Science Chapter 2
Score: 8/10

✓ Synced with teacher
```

This is the core demo.

---

# 29. Do Not Overbuild

The following are NOT required for the first prototype:

- Full cloud backend
- User accounts
- AI tutor
- Automatic mesh routing
- Government dashboard
- Complex analytics
- Live video classrooms
- Social networking
- Chat
- Push notifications
- iOS version
- Web version
- Complex authentication
- Production-scale infrastructure

The objective is to make the **offline educational synchronization loop work reliably**.

---

# 30. Future Roadmap

After the MVP works, possible future features include:

### Phase 2

- Automatic multi-hop propagation.
- Regional language support.
- Audio lessons.
- More efficient video compression.
- School-to-school synchronization.
- Teacher-created quizzes.
- Better progress analytics.

### Phase 3

- Local school server / Raspberry Pi hub.
- Automatic content prioritization.
- Government/school infrastructure analytics.
- Regional educational content distribution.
- Advanced security.
- Optional cloud synchronization when internet becomes available.

---

# 31. SIH Problem Statement Alignment

EduSync directly addresses:

### Educational resources

Makes educational material available even without continuous internet.

### Connectivity

Uses device-to-device communication instead of depending entirely on internet connectivity.

### Remote learning

Allows students to access lessons offline.

### Resource management

Organizes resources by class, subject, chapter, and type.

### Data synchronization

Allows student learning results to reach teachers even after offline work.

### Rural infrastructure

Reduces the requirement for every student to have continuous high-speed internet.

---

# 32. Core Differentiator

Do NOT describe EduSync as:

> "A Bluetooth file-sharing app."

Describe it as:

> **"An offline-first educational synchronization platform that allows learning resources and student progress to move between nearby devices without requiring continuous internet connectivity."**

Bluetooth is the transport mechanism.

The actual product is the **educational synchronization system**.

---

# 33. Final Product Principle

Always prioritize:

1. Reliability
2. Simplicity
3. Offline functionality
4. Low data usage
5. Low device requirements
6. Easy user experience
7. Educational usefulness
8. Technical innovation

Do not sacrifice reliability just to add impressive-looking features.

A simple application that successfully transfers educational content and synchronizes quiz results with **zero internet connectivity** is a better prototype than a complex application with many unfinished features.

---

# 34. Antigravity Working Instructions

When generating or modifying code:

- Explain what you are changing before making major architectural changes.
- Make one feature work before moving to the next.
- Keep code modular and lightweight.
- Avoid unnecessary dependencies.
- Prefer native Android APIs when practical.
- Never remove working functionality while adding a new feature.
- After each milestone, provide clear instructions for testing on a physical Android device.
- If an error occurs, diagnose the actual error before rewriting large parts of the application.
- Preserve offline functionality.
- Do not introduce a cloud dependency unless explicitly requested.
- Do not replace Bluetooth with internet-based file transfer.
- Keep the UI simple enough for first-time smartphone users.
- Optimize for low-end Android devices and poor connectivity.

## Definition of Done for MVP

The MVP is complete when two physical Android devices can:

1. Discover each other.
2. Connect without internet.
3. Compare educational resources.
4. Transfer a missing educational resource.
5. Store and open that resource offline.
6. Allow a student to complete a quiz offline.
7. Transfer the quiz result back to the teacher.
8. Resume a transfer after an interruption.
9. Avoid transferring duplicate resources.

Build toward this definition of done first.
