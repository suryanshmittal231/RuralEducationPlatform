# EduSync --- UI-Only Update Specification

## Apply this to the current multi-Bluetooth build

> **THIS DOCUMENT IS A UI / NAVIGATION UPDATE ONLY.**
>
> The current project has already been modified to support multiple
> Bluetooth connections. **Do not modify, refactor, replace, optimize,
> or "clean up" any Bluetooth, RFCOMM, BLE, GATT, socket, transfer,
> sync-transport, or peer-connection code.**
>
> The purpose of this task is to bring the previously requested
> UI/navigation changes into the **current multi-Bluetooth build**
> without breaking or changing the newly implemented Bluetooth
> functionality.

------------------------------------------------------------------------

# 1. Start by understanding the current project

This is the current project, not the old single-Bluetooth version.

The project currently contains:

-   `android/app/src/main/java/com/ruraleducation/platform/BluetoothP2PPlugin.java`
-   `www/js/transport.js`
-   `www/js/syncEngine.js`
-   `www/js/app.js`
-   `www/js/db.js`
-   `www/js/i18n.js`
-   `www/index.html`
-   `www/css/styles.css`

The current Android Bluetooth implementation has already been changed so
that the teacher can maintain multiple Bluetooth connections.

### VERY IMPORTANT

Treat the current Bluetooth implementation as **working and protected**.

Do not use an older version of the project as the source of truth for
Bluetooth.

Do not copy Bluetooth code from an old specification.

Do not revert the current multi-peer implementation.

Do not "simplify" the current Bluetooth implementation back to a single
connection.

Do not apply the previous Bluetooth specification again.

------------------------------------------------------------------------

# 2. HARD PROTECTED BLUETOOTH FILES

The following file is **STRICTLY OFF LIMITS** for this task:

``` text
android/app/src/main/java/com/ruraleducation/platform/BluetoothP2PPlugin.java
```

Do not edit it.

Do not reformat it.

Do not rename variables in it.

Do not change imports.

Do not change methods.

Do not change connection handling.

Do not change RFCOMM behavior.

Do not change BLE/GATT behavior.

Do not change socket handling.

Do not change peer maps.

Do not change connection limits.

Do not change transfer logic.

Do not change packet handling.

Do not change threading.

Do not change cleanup.

**Leave this file byte-for-byte functionally untouched.**

------------------------------------------------------------------------

# 3. Bluetooth-related JavaScript is also protected

Do not modify the Bluetooth/transport behavior in:

``` text
www/js/transport.js
www/js/syncEngine.js
```

These files may already contain the newly implemented multi-student
Bluetooth logic.

### Do NOT:

-   change Bluetooth APIs;
-   change native plugin calls;
-   change peer addressing;
-   change connection maps;
-   change transfer queues;
-   change chunking;
-   change packet routing;
-   change ACK handling;
-   change reconnect behavior;
-   change discovery;
-   change pairing;
-   change Bluetooth event listeners;
-   change transfer concurrency;
-   change the transport fallback;
-   change the browser demo transport.

If a UI feature needs to know connection status, **read the existing
exposed state/API**. Do not modify the underlying Bluetooth
implementation merely to make the UI easier.

------------------------------------------------------------------------

# 4. `www/js/app.js` is partially protected

`app.js` contains both UI code and Bluetooth-related orchestration.

It may be edited **only where necessary for UI/navigation**.

Before changing `app.js`, identify and preserve all code involving:

-   `eduTransport`;
-   Bluetooth discovery;
-   Bluetooth connection;
-   pairing;
-   peer events;
-   transfer calls;
-   sync calls;
-   Bluetooth status;
-   native plugin calls.

Do not rewrite those sections.

### Safe types of changes in `app.js`

It is okay to change:

-   menu opening/closing;
-   menu button listeners;
-   screen navigation;
-   back-button handlers;
-   rendering of navigation controls;
-   moving the language toggle from the header into the menu;
-   refreshing UI after language changes;
-   labels/text;
-   UI-only state.

### Not okay

Do not change how the Bluetooth system works merely because a screen has
a new layout.

------------------------------------------------------------------------

# 5. Main UI change: replace the logo in the top header with a hamburger menu

The current header contains:

``` html
<div class="brand-badge btn-back-home">
    <img src="assets/icon.svg" ...>
    <span class="brand-title">EduSync</span>
</div>
```

and currently places the language toggle in the header.

Change the top-level application header so that:

``` text
┌─────────────────────────────────────┐
│ ☰   EduSync              100% Offline│
└─────────────────────────────────────┘
```

### Requirements

-   Remove the **EduSync logo icon from beside the EduSync title** in
    the application header.
-   Keep the text **EduSync**.
-   Put a clear **three-line hamburger button** in the position where
    the logo currently appears.
-   The hamburger button opens the app navigation drawer/menu.
-   Keep the existing offline status indicator.
-   Remove the standalone Hindi/language button from the top header.
-   Language selection must move into the hamburger menu.

### Important

This applies to the **application header**, not the role-selection hero.

The large EduSync logo/hero on the initial role-selection screen may
remain.

Do not remove the branding from the welcome/role-selection hero unless
necessary for layout consistency.

------------------------------------------------------------------------

# 6. Hamburger menu

Create a simple lightweight navigation drawer or dropdown panel that
fits the existing EduSync visual style.

Do not introduce a large external UI library.

The menu should be simple enough for rural users and low-end devices.

Suggested structure:

``` text
┌─────────────────────────────┐
│  EduSync                    │
│  ─────────────────────────  │
│  🏠 Dashboard               │
│  📚 My Resources / Learning │
│  🔄 Sync Center             │
│  📊 Progress                │
│  🌐 Language                │
│  ❓ Help / About             │
└─────────────────────────────┘
```

The exact icons can follow the existing app style.

------------------------------------------------------------------------

# 7. Menu options should be context-aware

Do not show irrelevant options to a student or teacher.

### Teacher menu

Show relevant options such as:

-   Dashboard
-   My Resources
-   Nearby Students
-   Sync Center
-   Student Progress
-   Language
-   Help / About

### Student menu

Show relevant options such as:

-   Dashboard
-   My Learning
-   My Quizzes
-   My Progress
-   Sync with Teacher
-   Language
-   Help / About

Do not create fake screens just to populate the menu.

If an option already corresponds to an existing screen, navigate to that
existing screen.

------------------------------------------------------------------------

# 8. Language control must move into the hamburger menu

The current header contains:

``` text
🌐 हिंदी
```

Remove that standalone header control.

Instead, put:

``` text
🌐 Language
```

inside the hamburger menu.

When tapped, it should provide the existing language choices / toggle
behavior.

The existing `i18n.js` system already supports:

-   English
-   Hindi

Do not replace the localization engine.

Do not rewrite translations.

Do not remove Hindi.

Do not add an online translation service.

The language selection must work completely offline.

------------------------------------------------------------------------

# 9. Language behavior

When the user changes language:

1.  Update the existing `i18n` language state.
2.  Close the menu if appropriate.
3.  Refresh the current screen.
4.  Ensure all visible navigation/menu labels update.
5.  Ensure the language option itself updates correctly.

The existing language system in:

``` text
www/js/i18n.js
```

should remain the source of truth.

Do not duplicate translations into the menu unnecessarily.

Use `data-i18n` wherever practical.

------------------------------------------------------------------------

# 10. Hamburger menu interaction

The menu must:

-   open when the hamburger is tapped;
-   close when the close button is tapped;
-   close when tapping outside it;
-   close when a navigation item is selected;
-   not block the entire application permanently;
-   work on small Android screens;
-   work with touch;
-   not interfere with scrolling;
-   not interfere with modals;
-   not interfere with Bluetooth operations.

Do not use a complicated animation.

A short slide/fade transition is enough.

------------------------------------------------------------------------

# 11. Do not make the hamburger menu a Bluetooth control panel

The hamburger menu is a UI navigation element.

Do not put low-level Bluetooth controls into it.

Do not add:

-   RFCOMM settings;
-   socket settings;
-   GATT settings;
-   packet settings;
-   Bluetooth debugging controls;
-   connection-limit settings;
-   transfer concurrency settings.

The teacher should not need to understand Bluetooth.

------------------------------------------------------------------------

# 12. Fix the Sync Center Back button

The current project already contains:

``` html
<button
    class="btn-secondary btn-sm"
    id="btn-sync-header-back"
    onclick="window.eduApp.goBackFromSyncCenter()">
    ⬅ Back
</button>
```

and:

``` javascript
goBackFromSyncCenter() {
    if (this.currentRole === 'student') {
        this.renderStudentLearning();
    } else {
        this.setRole('teacher');
    }
}
```

This behavior must be audited and fixed.

### Required behavior

If the user entered Sync Center from:

``` text
Teacher Dashboard → Sync Center
```

then Back should return to:

``` text
Teacher Dashboard
```

If the user entered Sync Center from:

``` text
Student Learning / Student Dashboard → Sync Center
```

then Back should return to the correct previous student screen.

### Do not blindly use role alone

The correct previous screen should be tracked when navigation occurs.

For example:

``` javascript
this.previousScreen = ...
```

or an existing navigation mechanism may be used.

Do not create a huge routing system just for this.

A small reliable navigation-history mechanism is preferable.

------------------------------------------------------------------------

# 13. Audit ALL back buttons

Do not fix only the Sync Center.

Go through every existing screen and verify that its Back button
actually works.

At minimum inspect:

-   Teacher Resources
-   Nearby Students / Radar
-   Sync Center
-   Student Learning
-   Student Quizzes
-   Quiz Detail
-   Student Progress
-   Teacher Progress
-   Add Resource modal
-   Lesson Viewer
-   Pairing modal
-   Any other screen that has a Back button

### Principle

Every Back button should return the user to the **logical screen they
came from**, not merely the user's role dashboard.

------------------------------------------------------------------------

# 14. Avoid accidental Bluetooth changes while fixing navigation

Some navigation functions currently trigger Bluetooth discovery or sync.

Do not remove those operations.

For example, if entering Nearby Students currently starts Bluetooth
discovery, keep that behavior exactly as it is.

Only change:

``` text
where the UI goes
```

not:

``` text
how Bluetooth discovery works
```

Similarly, if opening Sync Center currently requests a manifest,
preserve that existing behavior.

The navigation fix must not break synchronization.

------------------------------------------------------------------------

# 15. Screen navigation should be predictable

Use a simple navigation model.

Example:

``` text
Teacher Dashboard
   ↓
Teacher Resources
   ↓
Nearby Students
```

If the user presses Back:

``` text
Nearby Students
   ↓
Teacher Resources
```

not automatically:

``` text
Nearby Students
   ↓
Teacher Dashboard
```

unless Dashboard was actually the previous screen.

Likewise:

``` text
Student Dashboard
   ↓
My Quizzes
   ↓
Quiz Detail
```

Back from Quiz Detail should return to:

``` text
My Quizzes
```

not directly to Dashboard.

------------------------------------------------------------------------

# 16. Do not break direct dashboard navigation

The hamburger menu's Dashboard option should always provide a reliable
way back to the role dashboard.

Teacher:

``` text
☰ → Dashboard → Teacher Dashboard
```

Student:

``` text
☰ → Dashboard → Student Dashboard
```

This is separate from the Back button.

------------------------------------------------------------------------

# 17. Role selection screen

Keep the initial role-selection experience.

The existing hero:

``` text
EduSync
Learn Offline. Sync Anywhere.
```

can remain.

The hamburger menu does not need to appear on the role-selection screen
if that screen is the entry point.

Do not create confusing navigation before the user chooses Teacher or
Student.

------------------------------------------------------------------------

# 18. Header consistency

For all normal application screens, use a consistent header:

``` text
☰  EduSync                         ●
```

where:

-   `☰` = menu button;
-   `EduSync` = app name;
-   `● 100% Offline` = existing status indicator.

Do not show the logo beside the title.

Keep the header compact.

------------------------------------------------------------------------

# 19. Screen-specific headers

Existing screen-specific headers such as:

``` text
← Back    Smart Sync Center
```

may remain where they are useful.

The hamburger menu and screen Back button serve different purposes:

### Hamburger

Navigation to major app destinations.

### Back

Return to the immediately previous logical screen.

Do not remove useful Back buttons merely because the hamburger exists.

------------------------------------------------------------------------

# 20. Improve Back button implementation

Avoid inline handlers where practical if they are causing conflicts.

For example, this:

``` html
onclick="window.eduApp.goBackFromSyncCenter()"
```

may remain if it is reliable, but if event listeners are already being
used elsewhere, use one consistent mechanism.

The important requirement is that there is only **one authoritative
handler**.

Avoid:

``` text
inline onclick
+
addEventListener
+
another addEventListener
```

for the same button.

That can cause double navigation.

------------------------------------------------------------------------

# 21. CSS requirements

Update:

``` text
www/css/styles.css
```

for:

-   hamburger button;
-   navigation drawer;
-   overlay;
-   menu items;
-   active/pressed states;
-   responsive layout;
-   proper z-index;
-   touch-friendly sizing.

Follow the existing design system.

Existing variables such as:

``` css
--bg-surface
--bg-surface-elevated
--primary
--text-main
--text-secondary
--border-subtle
--radius-md
--radius-lg
```

should be reused.

Do not introduce a completely different visual theme.

------------------------------------------------------------------------

# 22. Mobile-first menu sizing

The app is designed for phones.

The menu must work on:

-   small Android screens;
-   360px-ish widths;
-   larger Android phones;
-   the current desktop browser/device-frame preview.

Do not make the menu wider than necessary.

A menu width around 75--85% of the screen or a compact side drawer is
acceptable.

Do not cover the entire screen unless necessary.

------------------------------------------------------------------------

# 23. Touch targets

Buttons should be easy to press.

The hamburger button should have a comfortable touch area even if the
icon itself is small.

Menu rows should have approximately:

``` text
44–52px
```

of usable touch height.

Do not use tiny text or tiny icons.

------------------------------------------------------------------------

# 24. Menu accessibility

Add appropriate:

``` html
aria-label
```

and:

``` html
aria-expanded
```

where practical.

Example:

``` html
<button
    id="btn-menu"
    aria-label="Open navigation menu"
    aria-expanded="false">
    ☰
</button>
```

Update `aria-expanded` when opening/closing.

This should not add a dependency.

------------------------------------------------------------------------

# 25. Menu should not interfere with modals

When:

-   Add Resource modal is open;
-   Lesson Viewer is open;
-   Pairing modal is open;

the hamburger menu should not accidentally appear above the modal.

Use sensible z-index ordering.

If a modal is active, tapping behind it should not open the menu.

------------------------------------------------------------------------

# 26. Existing transport banner

The current app has a transport banner:

``` text
Bluetooth Direct P2P
```

or:

``` text
DEMO MODE — Single Device Simulated
```

Do not remove it.

Do not change its meaning.

Do not alter the underlying detection logic.

It is useful for distinguishing real native transport from browser demo
mode.

If its position needs minor CSS adjustment because of the new header,
adjust presentation only.

------------------------------------------------------------------------

# 27. Do not change Bluetooth-related labels to hide functionality

Do not make the app appear to use a different transport.

Do not remove:

``` text
Bluetooth Direct P2P
```

Do not rename it to:

``` text
Local Network
```

or anything else.

The current Bluetooth implementation must remain transparent to the
user.

------------------------------------------------------------------------

# 28. Multi-Bluetooth UI compatibility

The current Bluetooth implementation now supports multiple students.

The UI work must not assume that there is only one student.

If the current Nearby Students screen already displays multiple peers,
preserve that behavior.

Do not replace a list with:

``` text
Connected Student
```

singular.

Where the current implementation already exposes multiple connected
peers, the UI should remain compatible with that state.

Do not modify the underlying peer collection.

------------------------------------------------------------------------

# 29. Nearby Students screen

Only make UI improvements if necessary for the existing multi-peer
behavior.

The screen should be capable of visually representing:

``` text
Nearby / Connected Students

● Rahul — Connected
● Aman — Connected
● Priya — Connected
```

But **do not implement new Bluetooth logic here**.

If the current code already provides the peer list, render that existing
data.

Do not modify the native discovery/connection mechanism.

------------------------------------------------------------------------

# 30. Language consistency

After moving language selection into the menu, verify both English and
Hindi.

Test:

### English

``` text
Dashboard
My Resources
Sync Center
Language
Help / About
```

### Hindi

The existing `i18n.js` Hindi translations should appear.

Do not hard-code English text into newly added UI if an existing
translation key can be used.

If a new label needs translation, add only the required UI translation
keys to `i18n.js`.

Do not rewrite unrelated translation entries.

------------------------------------------------------------------------

# 31. Add only useful menu options

Do not turn the menu into a settings dump.

The goal is:

``` text
Navigation
+
Language
+
Help/About
```

not:

``` text
Bluetooth configuration
developer settings
database tools
debug console
network settings
```

Keep it understandable to a teacher or student.

------------------------------------------------------------------------

# 32. Help / About

If the project already has an About/Help screen, use it.

If it does not, a very small lightweight panel is acceptable.

It can explain:

``` text
EduSync

Learn Offline. Sync Anywhere.

EduSync helps teachers and students share
educational resources and work offline.

Version: current app version
```

Do not add an online help page.

Do not require Internet.

Do not create a large new screen unless necessary.

------------------------------------------------------------------------

# 33. Do not alter the database

Do not change:

``` text
www/js/db.js
```

unless absolutely necessary for a UI-only display bug.

No schema changes are required for this task.

Do not modify resource storage.

Do not modify quiz storage.

Do not modify manifest generation.

------------------------------------------------------------------------

# 34. Do not alter sync behavior

Do not modify:

``` text
www/js/syncEngine.js
```

for this UI task.

The existing multi-Bluetooth sync implementation must remain intact.

The UI may display the existing sync status/progress, but must not
change how synchronization operates.

------------------------------------------------------------------------

# 35. Do not alter transport behavior

Do not modify:

``` text
www/js/transport.js
```

for this task.

If the new UI needs:

``` text
connected peers
```

use the existing transport API/state.

Do not create a second Bluetooth state system in the UI.

------------------------------------------------------------------------

# 36. Exact files that may normally be changed

Preferred:

``` text
www/index.html
www/css/styles.css
www/js/app.js
www/js/i18n.js
```

Possibly:

``` text
www/manifest.json
```

only if needed for purely visual metadata.

Do not change:

``` text
android/app/src/main/java/com/ruraleducation/platform/BluetoothP2PPlugin.java
www/js/transport.js
www/js/syncEngine.js
www/js/db.js
```

unless there is an absolutely unavoidable dependency.

If you believe one of the protected files must be changed, **STOP before
changing it and explain exactly why.**

Do not silently edit it.

------------------------------------------------------------------------

# 37. Before editing: inspect current changes

Because this project was recently modified for multi-Bluetooth support:

1.  Inspect the current repository.
2.  Identify which Bluetooth files have changed from the older version.
3.  Treat those changes as intentional.
4.  Do not overwrite them with older code.
5.  Inspect the current UI and determine which requested UI changes are
    already partially present.
6.  Make only the remaining UI changes.

Do not assume the old project is still the correct implementation.

------------------------------------------------------------------------

# 38. Specific current UI problems to address

The following are the known requested changes:

### Problem A

The top header currently has the EduSync logo beside the name.

**Fix:**

``` text
Remove logo
Add hamburger menu button
Keep EduSync title
```

### Problem B

The Hindi/language toggle is currently in the top header.

**Fix:**

``` text
Remove it from header
Move language control into hamburger menu
```

### Problem C

There is no proper hamburger navigation menu.

**Fix:**

Create one with relevant role-specific navigation options.

### Problem D

Some Back buttons do not reliably return to the previous screen.

**Fix:**

Audit navigation and implement reliable previous-screen behavior.

### Problem E

Sync Center Back navigation is specifically unreliable.

**Fix:**

Make Sync Center return to the correct previous screen.

------------------------------------------------------------------------

# 39. Preserve current visual design

Do not redesign the entire app.

Keep:

-   dark theme;
-   cyan/blue primary accent;
-   glass/card styling;
-   rounded corners;
-   existing typography;
-   existing icons where appropriate;
-   current spacing language;
-   existing mobile-first layout.

The changes should look like a natural evolution of the current UI.

------------------------------------------------------------------------

# 40. Avoid excessive animations

Keep the app lightweight.

Menu animation should be subtle.

Do not add:

-   particle effects;
-   large background animations;
-   heavy transitions;
-   video backgrounds;
-   unnecessary shadows;
-   large external animation libraries.

------------------------------------------------------------------------

# 41. Navigation implementation recommendation

A simple previous-screen tracker is preferred.

For example:

``` javascript
this.currentScreenId = null;
this.previousScreenId = null;
```

or a small history stack:

``` javascript
this.navigationHistory = [];
```

Use whichever fits the existing `renderScreen()` architecture.

### Important

Do not record the same screen repeatedly.

Avoid:

``` text
Dashboard
→ Dashboard
→ Dashboard
→ Back
```

which can create an infinite-feeling Back loop.

Before pushing a screen:

``` text
if previous !== current:
    push previous
```

------------------------------------------------------------------------

# 42. Back behavior hierarchy

Use this priority:

### 1. Modal open

Back/close should close the modal.

### 2. Nested screen

Return to previous screen.

### 3. Main role screen

Return to role selector only if that is the existing intended behavior.

### 4. Role selector

Do nothing.

Do not unexpectedly exit the app from normal navigation.

------------------------------------------------------------------------

# 43. Do not duplicate event handlers

Before adding a listener, search the current `app.js`.

Pay special attention to:

``` text
btn-sync-header-back
btn-radar-back
btn-lang-toggle
```

and all newly created menu buttons.

If a listener already exists, modify it rather than registering another
one.

------------------------------------------------------------------------

# 44. Test menu navigation

### Teacher

``` text
Role → Teacher Dashboard

☰ → My Resources
☰ → Nearby Students
☰ → Sync Center
☰ → Student Progress
☰ → Dashboard
☰ → Language
```

Every destination must open the existing screen.

### Student

``` text
Role → Student Dashboard

☰ → My Learning
☰ → My Quizzes
☰ → My Progress
☰ → Sync with Teacher
☰ → Dashboard
☰ → Language
```

Every destination must open the existing screen.

------------------------------------------------------------------------

# 45. Test Back navigation

Test at minimum:

``` text
Teacher Dashboard
→ My Resources
→ Back
→ Teacher Dashboard
```

``` text
Teacher Dashboard
→ Nearby Students
→ Back
→ Teacher Dashboard
```

``` text
Teacher Dashboard
→ Sync Center
→ Back
→ Teacher Dashboard
```

``` text
Student Dashboard
→ My Learning
→ Sync Center
→ Back
→ My Learning
```

``` text
Student Dashboard
→ My Quizzes
→ Quiz Detail
→ Back
→ My Quizzes
```

------------------------------------------------------------------------

# 46. Test language

Test:

``` text
English → Hindi
Hindi → English
```

while:

-   on Dashboard;
-   inside Sync Center;
-   inside Resources;
-   inside Student Learning;
-   with menu open;
-   with menu closed.

The screen should remain on the same logical page after changing
language.

Do not navigate the user somewhere else just because the language
changed.

------------------------------------------------------------------------

# 47. Test Bluetooth regression

This task is not allowed to modify Bluetooth, but still perform
regression testing afterward.

With two or more real Android devices:

1.  Start teacher Bluetooth session.
2.  Connect multiple students.
3.  Confirm the connected peers remain connected.
4.  Open/close the hamburger menu.
5.  Navigate through UI.
6.  Open Sync Center.
7.  Go Back.
8.  Return to Nearby Students.
9.  Confirm Bluetooth connections are still alive.
10. Confirm resource sharing still works.
11. Confirm no Bluetooth disconnect occurs simply because the UI
    changed.

The UI update must have **zero intentional impact on Bluetooth
connections**.

------------------------------------------------------------------------

# 48. Important: do not use UI changes as an excuse to refactor Bluetooth

If you notice something in Bluetooth code that looks improvable while
doing this task:

**Do not fix it in this task.**

Leave it alone.

The current multi-Bluetooth implementation is outside the scope of this
specification.

The purpose of this build is:

``` text
CURRENT MULTI-BLUETOOTH BUILD
          +
     UI / NAVIGATION
          =
CURRENT MULTI-BLUETOOTH BUILD
WITH THE REQUESTED UI
```

It must NOT become:

``` text
CURRENT MULTI-BLUETOOTH BUILD
          +
UI
          +
BLUETOOTH REFACTOR
          +
SYNC REFACTOR
          +
OTHER CHANGES
```

------------------------------------------------------------------------

# 49. Final protected-file check

Before declaring completion, inspect the final diff.

The following files must show **no Bluetooth-related functional
changes**:

``` text
android/app/src/main/java/com/ruraleducation/platform/BluetoothP2PPlugin.java
www/js/transport.js
www/js/syncEngine.js
```

If any of these were modified:

1.  Determine why.
2.  If the modification is unrelated to the UI task, revert it.
3.  If it is supposedly required, stop and report it instead of silently
    proceeding.

------------------------------------------------------------------------

# 50. Final acceptance criteria

The task is complete only when:

-   [ ] Current multi-Bluetooth implementation is preserved.
-   [ ] `BluetoothP2PPlugin.java` is not modified.
-   [ ] `transport.js` Bluetooth behavior is not modified.
-   [ ] `syncEngine.js` Bluetooth/sync behavior is not modified.
-   [ ] Existing multiple-student Bluetooth connections still work.
-   [ ] Top header no longer shows the logo beside "EduSync".
-   [ ] Hamburger icon appears where the header logo was.
-   [ ] Hamburger opens a clean navigation menu.
-   [ ] Menu contains relevant teacher options.
-   [ ] Menu contains relevant student options.
-   [ ] Language control is inside the hamburger menu.
-   [ ] Language toggle is removed from the top header.
-   [ ] English/Hindi switching still works.
-   [ ] Sync Center Back button works correctly.
-   [ ] Other screen Back buttons have been audited.
-   [ ] Nested screens return to their logical previous screen.
-   [ ] Dashboard remains accessible from the hamburger menu.
-   [ ] Menu closes correctly after navigation.
-   [ ] Menu closes when tapping outside.
-   [ ] Menu does not interfere with modals.
-   [ ] UI remains lightweight and mobile-friendly.
-   [ ] No unnecessary dependencies were added.
-   [ ] No unrelated functionality was changed.
-   [ ] Multi-Bluetooth behavior remains intact after the UI changes.
-   [ ] The app builds successfully.
-   [ ] The final APK can be installed and opened.

------------------------------------------------------------------------

# 51. Final instruction

**Treat the current Bluetooth implementation as a locked subsystem.**

Your job is NOT to improve Bluetooth.

Your job is NOT to merge the old Bluetooth specification.

Your job is NOT to redesign the transport layer.

Your job is NOT to change how multiple students connect.

Your job is:

> **Take the current multi-Bluetooth EduSync build exactly as it is, and
> implement the requested UI/navigation improvements on top of it
> without changing the Bluetooth subsystem.**

The final result should feel like:

``` text
CURRENT WORKING MULTI-BLUETOOTH APP
                 +
       CLEANER NAVIGATION
                 +
        HAMBURGER MENU
                 +
        LANGUAGE IN MENU
                 +
       RELIABLE BACK BUTTONS
```

and nothing more.
