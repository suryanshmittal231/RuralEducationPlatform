# EduSync --- Bluetooth Multi-Student Upgrade Specification

## Antigravity implementation prompt --- Android / Capacitor / JavaScript

> **Purpose:** Upgrade the existing EduSync Bluetooth architecture so
> that one teacher can maintain connections with multiple students
> simultaneously and selectively share educational resources with one,
> several, or all connected students.
>
> **Critical constraint:** This must remain a **Bluetooth-only
> solution**. Do **NOT** introduce Wi-Fi, Wi-Fi Direct, a local hotspot,
> Internet, a router, WebRTC, or any network dependency for the
> implementation described here.
>
> **Important:** This is an upgrade to the existing project, not a
> request to rewrite the application from scratch. Preserve the existing
> UI, database, sync behavior, discovery flow, pairing-code concept, and
> working functionality unless a change is explicitly required by this
> specification.

------------------------------------------------------------------------

# 1. First: inspect the existing project before editing

Work from the supplied current project and understand the existing
architecture before changing anything.

The important existing files include:

-   `android/app/src/main/java/com/ruraleducation/platform/BluetoothP2PPlugin.java`
-   `www/js/transport.js`
-   `www/js/syncEngine.js`
-   `www/js/app.js`
-   `www/js/db.js`
-   the current HTML/CSS UI files
-   `capacitor.config.json`
-   existing Android Gradle/configuration files

There are also existing EduSync build/fix specification Markdown files
in the project. Read them before changing behavior so that this
Bluetooth work does not undo previous fixes.

## Current Bluetooth architecture

The current Android plugin already uses:

1.  Bluetooth Classic RFCOMM/SPP for reliable/high-speed data transfer.
2.  BLE advertising/discovery.
3.  A GATT server/client path as a fallback/control path.
4.  A Capacitor bridge between native Android Java and the JavaScript
    transport layer.
5.  JavaScript chunking/reassembly for educational resources.
6.  A four-digit pairing/verification code.

**Keep this overall architecture.**

The central problem is that the current implementation models Bluetooth
as a **single active peer**, even though the RFCOMM server can accept
more than one connection over time.

------------------------------------------------------------------------

# 2. Current single-peer limitations that must be removed

In the current `BluetoothP2PPlugin.java`, the following state is
single-peer:

``` java
private BluetoothGatt connectedGattClient;
private BluetoothDevice connectedRemoteDevice;

private BluetoothServerSocket serverSocket;
private BluetoothSocket activeSocket;
private DataOutputStream socketWriter;
private DataInputStream socketReader;
private Thread serverAcceptThread;
private Thread socketWorkerThread;
```

The current RFCOMM accept loop effectively does:

``` text
accept socket
→ handle socket
→ break
```

Therefore the teacher stops accepting new students while the current
student remains connected.

The current successful handshake also assigns:

``` java
activeSocket = socket;
socketReader = in;
socketWriter = out;
connectedRemoteDevice = device;
```

This overwrites the concept of a single connection.

The current `sendDataChunk()` also sends through only one
`socketWriter`.

The current JavaScript transport has the same assumption:

``` javascript
this.connectedPeer
this.isConnected
```

and:

``` javascript
sendPacketOverTransport(packetObj)
```

has no target student.

The sync engine similarly calls:

``` javascript
this.transport.transferResourceChunks(fullRes, callback)
```

without identifying which student should receive the transfer.

**All of these single-peer assumptions must be addressed.**

------------------------------------------------------------------------

# 3. Target architecture

Implement a **multi-peer Bluetooth connection manager**.

Conceptually:

``` text
                         TEACHER PHONE
                              |
                  BluetoothP2P / Peer Manager
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
         Student A        Student B        Student C
         RFCOMM           RFCOMM           RFCOMM
         socket A         socket B         socket C
         reader A         reader B         reader C
         writer A         writer B         writer C
             |                |                |
          Queue A          Queue B          Queue C
             |                |                |
             +----------------+----------------+
                              |
                         Sync Engine
```

There is **no Wi-Fi anywhere in this architecture**.

The teacher remains the central Bluetooth host.

The teacher must be able to:

-   accept multiple student connections;
-   keep those connections alive simultaneously;
-   see all currently connected students;
-   send to one selected student;
-   send to multiple selected students;
-   broadcast to all connected students;
-   receive requests/results from individual students;
-   continue communicating with other students if one student
    disconnects;
-   retry a failed student without restarting all other transfers.

------------------------------------------------------------------------

# 4. Native Android implementation

## 4.1 Create a per-peer connection model

Do not continue using `activeSocket`, `socketWriter`, and `socketReader`
as the source of truth.

Create a small internal connection class, for example:

``` java
private static class PeerConnection {
    final String address;
    final String name;
    final BluetoothDevice device;
    final BluetoothSocket socket;
    final DataInputStream input;
    final DataOutputStream output;

    volatile boolean connected;
    Thread readerThread;

    PeerConnection(
        String address,
        String name,
        BluetoothDevice device,
        BluetoothSocket socket,
        DataInputStream input,
        DataOutputStream output
    ) {
        this.address = address;
        this.name = name;
        this.device = device;
        this.socket = socket;
        this.input = input;
        this.output = output;
        this.connected = true;
    }
}
```

Use the exact structure that best fits the existing project, but the
following properties are mandatory:

-   unique peer address;
-   Bluetooth device;
-   socket;
-   input stream;
-   output stream;
-   connected state;
-   independent reader thread;
-   serialized writes per peer.

Maintain a thread-safe map:

``` java
private final Map<String, PeerConnection> peerConnections =
        new ConcurrentHashMap<>();
```

Use `ConcurrentHashMap` or an equivalently safe structure.

Do not use an ordinary unsynchronized `HashMap` for live connection
state.

------------------------------------------------------------------------

# 5. RFCOMM server must continuously accept students

This is the most important native change.

Current behavior:

``` text
accept
→ process connection
→ break
```

Required behavior:

``` text
listen
→ accept Student A
→ create PeerConnection A
→ start A reader
→ continue listening
→ accept Student B
→ create PeerConnection B
→ start B reader
→ continue listening
→ ...
```

The RFCOMM accept loop must **not stop after the first successful
connection**.

Pseudo-architecture:

``` java
while (!Thread.currentThread().isInterrupted()) {
    BluetoothSocket socket = serverSocket.accept();

    if (socket == null) {
        continue;
    }

    executor.execute(() -> handleIncomingClientSocket(socket));

    // IMPORTANT:
    // Do not break here.
    // The server must continue accepting additional clients.
}
```

The handshake may happen on the worker/executor thread so the accept
thread remains available for new connections.

Do not perform a long file transfer on the server accept thread.

------------------------------------------------------------------------

# 6. Incoming student handshake

Keep the current four-digit pairing-code verification.

For every newly accepted socket:

1.  Read the handshake.
2.  Validate packet length.
3.  Parse the pairing code.
4.  Reject incorrect codes.
5.  Send the existing success/failure response.
6.  Determine the student's Bluetooth address.
7.  Determine the student's name.
8.  Create a dedicated `PeerConnection`.
9.  Store it in `peerConnections`.
10. Start that peer's reader thread.
11. Emit `peerConnected` with that student's information.

Example event:

``` json
{
  "address": "AA:BB:CC:DD:EE:FF",
  "name": "Student Phone",
  "role": "student",
  "isRFCOMM": true,
  "success": true
}
```

Do not emit a generic connection event that causes the JavaScript layer
to forget previous students.

If a peer with the same address already exists:

-   close the old socket safely;
-   replace it with the new valid connection;
-   emit an appropriate reconnect/update event;
-   never leave two live connection objects for the same address.

------------------------------------------------------------------------

# 7. Each peer needs its own reader

The current single `socketWorkerThread` must become per-peer reader
threads.

For example:

``` text
Peer A → reader thread A
Peer B → reader thread B
Peer C → reader thread C
```

Each reader must:

-   continuously read length-prefixed packets;
-   validate the packet length;
-   read the full payload;
-   attach the sender address to the Capacitor event;
-   remain independent of other peers;
-   terminate only when that peer's socket closes/errors/disconnects.

Incoming events should always identify the sender.

Example:

``` json
{
  "sender": "AA:BB:CC:DD:EE:FF",
  "payload": "{...}"
}
```

The existing code already includes a `sender` field in incoming chunk
events. Preserve and standardize that behavior across all incoming
packet types.

------------------------------------------------------------------------

# 8. Peer-specific sending

Change the native send method so it can target a specific Bluetooth
peer.

Current JavaScript call:

``` javascript
sendDataChunk({
    payload: rawString
})
```

Required capability:

``` javascript
sendDataChunk({
    payload: rawString,
    targetAddress: "AA:BB:CC:DD:EE:FF"
})
```

Also support an explicit broadcast mode when appropriate:

``` javascript
sendDataChunk({
    payload: rawString,
    broadcast: true
})
```

or an equivalent API.

### Rules

-   If `targetAddress` is supplied, send only through that peer's output
    stream.
-   If `broadcast` is true, send independently to every currently
    connected peer.
-   If neither is supplied, do **not** silently pick an arbitrary peer.
-   For backwards compatibility, if the existing single-student flow
    depends on no target being supplied, resolve that case deliberately
    using the current/default peer only when it is unambiguous.
-   Prefer explicit addressing throughout the new multi-student code.

------------------------------------------------------------------------

# 9. Never write concurrently to the same output stream

Every `PeerConnection.output` needs serialized writes.

For example:

``` java
synchronized (peer.output) {
    peer.output.writeInt(bytes.length);
    peer.output.write(bytes);
    peer.output.flush();
}
```

This is essential.

Two JavaScript calls must never interleave bytes on the same RFCOMM
stream.

Even better, if practical, create a per-peer outgoing queue/worker so
all packets for that peer are serialized.

A simple and reliable model is:

``` text
Peer A
  outgoing queue
       ↓
  single writer
       ↓
  socket A
```

and independently:

``` text
Peer B
  outgoing queue
       ↓
  single writer
       ↓
  socket B
```

------------------------------------------------------------------------

# 10. Do not make one student's failure kill the others

This is mandatory.

If:

``` text
Student A disconnects
```

the application must **not**:

-   close Student B;
-   close Student C;
-   clear the entire peer map;
-   reset all transfers;
-   stop the teacher's RFCOMM server;
-   emit a global disconnect that causes JS to clear all peers.

Only Student A's state should be removed.

Correct:

``` text
A disconnected
→ remove A
→ emit peerDisconnected(A)
→ B continues
→ C continues
```

Incorrect:

``` text
A disconnected
→ disconnect()
→ clear everything
→ B/C lost
```

------------------------------------------------------------------------

# 11. Disconnect API must support one peer or all peers

The current:

``` javascript
BluetoothP2P.disconnect()
```

should be extended.

Preferred:

``` javascript
disconnect({
    address: "AA:BB:CC:DD:EE:FF"
})
```

to disconnect only that peer.

Also support:

``` javascript
disconnectAll()
```

or an equivalent:

``` javascript
disconnect({
    all: true
})
```

Keep whichever API is cleaner for the project, but the semantics must be
clear.

### Single-peer disconnect

Only:

-   close that socket;
-   stop its reader;
-   remove it from the map;
-   emit its disconnect event.

### Disconnect all

Used when:

-   teacher stops the Bluetooth session;
-   app is shutting down;
-   the user explicitly chooses to disconnect everyone.

------------------------------------------------------------------------

# 12. Add native method to return connected peers

Add something such as:

``` java
getConnectedPeers()
```

returning:

``` json
{
  "peers": [
    {
      "address": "AA:BB:CC:DD:EE:FF",
      "name": "Rahul",
      "role": "student",
      "isRFCOMM": true,
      "connected": true
    }
  ]
}
```

This is useful for UI recovery if JavaScript reloads while the native
plugin remains active.

Do not rely exclusively on JS memory for connection state.

------------------------------------------------------------------------

# 13. GATT/BLE considerations

The project already has:

-   BLE advertising;
-   GATT server;
-   GATT client;
-   RFCOMM.

Do not remove these unnecessarily.

However, the multi-peer refactor must not accidentally make GATT another
single-peer bottleneck.

Current single-peer fields such as:

``` java
private BluetoothGatt connectedGattClient;
private BluetoothDevice connectedRemoteDevice;
```

should be reviewed.

At minimum:

-   do not allow a second RFCOMM connection to overwrite another peer's
    state;
-   keep RFCOMM as the primary file-transfer transport;
-   retain GATT/BLE for the existing discovery/fallback/control
    behavior;
-   if GATT is actually used simultaneously for multiple peers, use
    peer-keyed state rather than one global remote device.

Do not redesign the entire BLE layer unless required.

**Do not move large resource transfer from RFCOMM to GATT.**

------------------------------------------------------------------------

# 14. JavaScript transport layer

Update `www/js/transport.js`.

The current model:

``` javascript
this.connectedPeer
this.isConnected
```

must become a multi-peer model.

Use something like:

``` javascript
this.connectedPeers = new Map();
```

Key:

``` text
Bluetooth address
```

Value:

``` javascript
{
    id,
    address,
    name,
    role,
    isRFCOMM,
    connected,
    ...
}
```

You may retain `connectedPeer` temporarily for backwards compatibility,
but all new logic must use `connectedPeers`.

Do not allow a new `peerConnected` event to overwrite the existing list.

------------------------------------------------------------------------

# 15. Peer connection events

When native emits:

``` text
peerConnected
```

JS should:

``` javascript
this.connectedPeers.set(peer.address, peer);
```

and emit the existing event so the UI can update.

When native emits:

``` text
peerDisconnected
```

JS should:

``` javascript
this.connectedPeers.delete(peer.address);
```

and emit the event with the disconnected peer.

The event payload should contain the address.

Example:

``` json
{
  "address": "AA:BB:CC:DD:EE:FF",
  "name": "Rahul"
}
```

Do not emit a bare `peerDisconnected` with no identity in the new
implementation.

------------------------------------------------------------------------

# 16. Add transport helper methods

Implement equivalents of:

``` javascript
getConnectedPeers()
```

``` javascript
isPeerConnected(address)
```

``` javascript
sendPacketOverTransport(packet, targetAddress)
```

``` javascript
broadcastPacketOverTransport(packet)
```

``` javascript
disconnectPeer(address)
```

``` javascript
disconnectAllPeers()
```

Use the exact names that fit the existing codebase, but preserve clear
semantics.

------------------------------------------------------------------------

# 17. Packet sender identity

Every incoming packet must be associated with its sender.

For incoming native events:

``` javascript
{
    sender: address,
    payload: rawPayload
}
```

When parsing the payload, preserve the sender:

``` javascript
msg.sender = senderAddress;
```

Do not rely on the JSON packet itself to identify the sender because a
student should not be able to spoof the native socket identity merely by
putting a different address in JSON.

The native socket address is the authoritative transport-level sender.

------------------------------------------------------------------------

# 18. Resource transfers must become target-specific

The current function:

``` javascript
transferResourceChunks(resource, onProgress)
```

must support:

``` javascript
transferResourceChunks(
    resource,
    targetAddress,
    onProgress
)
```

or an equivalent backwards-compatible signature.

Every transfer must have:

``` text
targetAddress
transferId
resourceId
totalChunks
currentChunk
status
```

The target address must be attached to the transfer's state.

Example:

``` javascript
{
    transferId: "tx_abcd123",
    targetAddress: "AA:BB:CC:DD:EE:FF",
    resourceId: "math_05",
    status: "transferring",
    progress: 42
}
```

------------------------------------------------------------------------

# 19. IMPORTANT: transfer IDs must be unique per transfer

Do not reuse a transfer ID for the same resource being sent to several
students.

If the teacher sends the same resource to:

``` text
Student A
Student B
Student C
```

there should be independent transfer state.

Prefer:

``` text
tx_A_xxxxxx
tx_B_xxxxxx
tx_C_xxxxxx
```

or a unique UUID for each transfer.

This prevents incoming/outgoing transfer state from colliding.

------------------------------------------------------------------------

# 20. Per-student transfer queues

Do not simply launch unlimited parallel writes.

Bluetooth bandwidth is shared and phone capabilities differ.

Implement per-peer serialization.

Conceptually:

``` text
Student A:
    Resource 1
    Resource 2
    Resource 3

Student B:
    Resource 1
    Resource 4

Student C:
    Resource 2
```

Each peer should have its own queue.

Within one peer:

``` text
Resource 1
    ↓
Resource 2
    ↓
Resource 3
```

must be sequential.

Across different peers, transfers may occur concurrently.

------------------------------------------------------------------------

# 21. Add a modest concurrency limit

Do not attempt to transfer to dozens of students simultaneously just
because multiple sockets exist.

The implementation should support multiple connected students, but
resource transfers should be scheduled sensibly.

Recommended initial policy:

-   multiple Bluetooth connections can remain active;
-   allow approximately **2--3 active bulk transfers at once**;
-   queue additional transfers;
-   make the concurrency value easy to change later.

Do not hard-code an assumption that Android supports an unlimited number
of simultaneous RFCOMM streams.

The exact practical number should be determined through device testing.

------------------------------------------------------------------------

# 22. Progress must identify the student

Current progress:

``` javascript
{
    percent,
    chunk,
    totalChunks,
    resourceTitle
}
```

must be extended with:

``` javascript
{
    targetAddress,
    targetName,
    transferId,
    ...
}
```

Example:

``` json
{
  "targetAddress": "AA:BB:CC:DD:EE:FF",
  "targetName": "Rahul",
  "transferId": "tx_123",
  "percent": 64,
  "chunk": 80,
  "totalChunks": 125,
  "resourceTitle": "Mathematics Chapter 5"
}
```

This allows the UI to show per-student progress.

------------------------------------------------------------------------

# 23. Broadcast vs selective sharing

The teacher must be able to select recipients.

Implement three logical modes:

### One student

``` text
target = Student A
```

### Multiple selected students

``` text
targets = [A, C, E]
```

### All connected students

``` text
targets = all connected students
```

Do not automatically broadcast every resource to everyone.

A teacher's request for one student must remain one-student-only.

------------------------------------------------------------------------

# 24. SyncEngine changes

Update `www/js/syncEngine.js`.

The existing:

``` javascript
streamRequestedResourcesToStudent(resourceIds, onProgressCallback)
```

must become target-aware.

For example:

``` javascript
streamRequestedResourcesToStudent(
    resourceIds,
    targetAddress,
    onProgressCallback
)
```

The exact signature may differ, but the target must be explicit.

When receiving:

``` text
REQUEST_RESOURCES
```

the transport layer must preserve the sender address.

The teacher should then call:

``` text
streamRequestedResourcesToStudent(
    requestedResourceIds,
    senderAddress
)
```

not a generic broadcast.

This is extremely important for two-way student sync.

------------------------------------------------------------------------

# 25. Student requests must go only to the teacher

A student sending:

``` text
REQUEST_MANIFEST
REQUEST_RESOURCES
QUIZ_RESULTS
```

must send them to its connected teacher.

Do not broadcast these requests to other students.

The teacher receiving a request must know which student requested it.

------------------------------------------------------------------------

# 26. Teacher-to-student resource packets

Packets should continue to use the existing structure where practical:

``` json
{
  "type": "DATA_CHUNK",
  "transferId": "tx_xxxxx",
  "chunkIdx": 0,
  "totalChunks": 20,
  "payloadChunk": "...",
  "meta": {
    "contentType": "RESOURCE",
    "title": "...",
    "resourceId": "...",
    "totalBytes": 12345,
    "fileSize": 12345
  }
}
```

Do not unnecessarily redesign the packet protocol.

The transport-level destination is determined by the selected socket.

If adding an application-level `targetAddress` field helps debugging, it
must not replace native socket routing.

------------------------------------------------------------------------

# 27. Incoming transfer reassembly

Update:

``` javascript
this.incomingTransfers
```

so it is safe when packets from multiple students/peers are present.

At minimum, the key must be globally unique.

Prefer a compound key:

``` text
senderAddress + transferId
```

or guarantee globally unique transfer IDs.

For example:

``` javascript
const transferKey = `${senderAddress}:${transferId}`;
```

This prevents:

``` text
Student A transfer tx_123
```

from colliding with:

``` text
Student B transfer tx_123
```

------------------------------------------------------------------------

# 28. Teacher receiving quiz results

When the teacher receives:

``` text
QUIZ_RESULTS
```

the transport event must preserve the student's sender address.

The sync layer should be able to associate submissions with the correct
student.

Do not change the existing database schema unnecessarily, but ensure the
sender identity is not lost.

------------------------------------------------------------------------

# 29. ACK handling must be peer-specific

Current:

``` text
SYNC_COMPLETE_ACK
```

is effectively associated with one global connection.

Make it target-aware through the native sender address / transport
event.

A completion from Student A must not mark Student B's transfer as
complete.

Similarly, a failure/retry for Student A must not affect Student B.

------------------------------------------------------------------------

# 30. Error handling

Every transfer should distinguish:

-   connection unavailable;
-   connection lost;
-   invalid packet;
-   write failure;
-   timeout if applicable;
-   resource not found;
-   transfer completed.

When one student fails:

``` text
Student A → FAILED
Student B → continues
Student C → continues
```

The teacher UI should be able to retry Student A.

Do not automatically restart all students.

------------------------------------------------------------------------

# 31. UI requirements

Modify only the UI required to expose the new functionality.

Do not undo the previous UI polish changes.

The teacher should be able to see something like:

``` text
Connected Students (4)

☑ Rahul
☑ Aman
☐ Simran
☑ Priya

[ Share Selected ]

[ Share With All ]
```

The exact visual design should match the current EduSync interface.

Do not introduce a complicated enterprise-style dashboard.

This app is designed for teachers in rural environments, so the
interface must remain:

-   simple;
-   readable;
-   touch-friendly;
-   lightweight;
-   low-data;
-   understandable without technical knowledge.

------------------------------------------------------------------------

# 32. Connection status UI

Each student should show a simple state:

``` text
Connected
Sending…
Complete
Failed
Disconnected
```

Avoid excessive animations.

Do not make Bluetooth activity visually overwhelming.

------------------------------------------------------------------------

# 33. Teacher session behavior

When the teacher starts Bluetooth sharing:

``` text
Start advertising
+
Start RFCOMM server
+
Existing BLE/GATT behavior
```

The RFCOMM server must remain listening for additional students.

Stopping the teacher's Bluetooth session must:

1.  stop advertising;
2.  stop accepting new RFCOMM connections;
3.  close all existing peer sockets;
4.  stop all peer reader/writer workers;
5.  clear peer connection state;
6.  notify JS/UI that the session ended.

------------------------------------------------------------------------

# 34. Student-side behavior

The student workflow should remain essentially unchanged:

``` text
Scan
→ find teacher
→ enter four-digit code
→ connect
→ exchange manifest
→ request missing resources
→ receive resources
→ optionally upload quiz results
```

Do not require the student to understand that the teacher is connected
to other students.

From the student's perspective, it still has one teacher connection.

The multi-peer complexity should primarily live on the teacher side.

------------------------------------------------------------------------

# 35. Browser demo mode

The current browser fallback uses `BroadcastChannel`.

Do not pretend that BroadcastChannel is real Bluetooth.

Keep it as a development/demo fallback.

If feasible, update the browser-mode data structures to support multiple
simulated peers so the UI can be tested without physical phones.

But do not allow browser-mode changes to contaminate the native
Bluetooth architecture.

------------------------------------------------------------------------

# 36. Backwards compatibility

Existing single-student workflows must continue working.

These should still work:

-   student connects to teacher;
-   pairing code;
-   manifest request;
-   resource request;
-   resource transfer;
-   quiz results;
-   disconnect;
-   resume/retry behavior where currently supported.

The new implementation should be a superset of the old behavior.

------------------------------------------------------------------------

# 37. Do NOT make these mistakes

## Mistake 1 --- creating one new socket variable

Do NOT do:

``` java
BluetoothSocket socket1;
BluetoothSocket socket2;
BluetoothSocket socket3;
```

Use a scalable peer collection.

------------------------------------------------------------------------

## Mistake 2 --- keeping the old global writer

Do NOT keep:

``` java
socketWriter
```

as the actual routing mechanism.

Use:

``` text
peerConnections[address].output
```

------------------------------------------------------------------------

## Mistake 3 --- removing the accept-loop break without adding per-peer state

Simply deleting:

``` java
break;
```

is NOT sufficient.

Without independent:

-   readers;
-   writers;
-   connection state;
-   cleanup;

the implementation will be unreliable.

------------------------------------------------------------------------

## Mistake 4 --- broadcasting student requests

Do not broadcast:

``` text
REQUEST_RESOURCES
QUIZ_RESULTS
REQUEST_MANIFEST
```

to every student.

They must go to the teacher.

------------------------------------------------------------------------

## Mistake 5 --- global disconnect

Do not call a global disconnect when one socket fails.

------------------------------------------------------------------------

## Mistake 6 --- sharing transfer state between students

Do not use one:

``` javascript
this.transferProgress
```

for all students.

Transfer state must be per transfer/per peer.

------------------------------------------------------------------------

## Mistake 7 --- assuming simultaneous transfers are free

Multiple sockets do not create unlimited Bluetooth bandwidth.

Use queues and a modest concurrency limit.

------------------------------------------------------------------------

## Mistake 8 --- moving to Wi-Fi

Do NOT add:

-   Wi-Fi Direct;
-   hotspot;
-   TCP server;
-   UDP;
-   HTTP server;
-   WebSocket server;
-   Internet;
-   Firebase;
-   LAN discovery.

The requirement is Bluetooth-only.

------------------------------------------------------------------------

# 38. Threading requirements

The native Android code must remain responsive.

Never:

-   perform a blocking `accept()` on the Android UI thread;
-   perform large file writes on the UI thread;
-   perform blocking socket reads on the UI thread;
-   call JavaScript callbacks in a way that blocks Bluetooth workers.

Use the existing executor/thread approach appropriately.

Each peer's blocking input stream should be handled off the UI thread.

The accept thread should remain free to accept new connections.

------------------------------------------------------------------------

# 39. Lifecycle safety

Review the plugin's cleanup behavior.

Handle:

-   app pause/resume;
-   activity recreation;
-   plugin reload;
-   Bluetooth disabled;
-   teacher stops advertising;
-   student disconnects;
-   socket IOException;
-   malformed handshake;
-   malformed packet;
-   duplicate connection;
-   app termination.

Do not leak threads or sockets.

When a peer is removed:

``` text
socket.close()
reader stops
writer queue stops/finishes safely
peer removed from map
JS notified
```

------------------------------------------------------------------------

# 40. Security / validation

Keep the current four-digit pairing-code requirement.

Validate:

-   payload length;
-   handshake length;
-   target address;
-   peer existence;
-   connection state;
-   packet type;
-   chunk index;
-   total chunks;
-   duplicate chunks;
-   malformed JSON.

Never trust a JavaScript-supplied target address blindly.

Before sending:

``` text
targetAddress
→ lookup peerConnections
→ verify connected
→ send through that exact peer
```

Do not allow a request to redirect a packet to an arbitrary Bluetooth
address unless that address is currently in the trusted connection map.

------------------------------------------------------------------------

# 41. Logging

Add useful native logs such as:

``` text
RFCOMM server listening
Accepted connection from <address>
Handshake success for <name> <address>
Peer count = 3
Sending packet to <address>
Peer disconnected <address>
Transfer failed for <address>
```

Do not log sensitive payload contents unnecessarily.

Keep logs concise enough for debugging real phones.

------------------------------------------------------------------------

# 42. Suggested native API

The final native API can look approximately like:

``` text
startAdvertising(...)
stopAdvertising(...)

startScanning(...)
stopScanning(...)

connectToPeer(...)
getConnectedPeers(...)

sendDataChunk({
    payload,
    targetAddress
})

broadcastDataChunk({
    payload
})

disconnectPeer({
    address
})

disconnectAll(...)
```

You may consolidate APIs if the existing Capacitor plugin style is
cleaner.

The important behavior matters more than exact method names.

------------------------------------------------------------------------

# 43. Suggested JavaScript transport API

Aim for something like:

``` javascript
transport.getConnectedPeers()

transport.isPeerConnected(address)

transport.sendPacketOverTransport(packet, targetAddress)

transport.broadcastPacketOverTransport(packet)

transport.transferResourceChunks(
    resource,
    targetAddress,
    onProgress
)

transport.disconnectPeer(address)

transport.disconnectAllPeers()
```

Again, adapt names to the existing code rather than unnecessarily
breaking every existing caller.

------------------------------------------------------------------------

# 44. Recommended implementation order

Do not attempt to change everything at once.

Implement in this order:

### Phase 1 --- Native peer model

1.  Create `PeerConnection`.
2.  Create thread-safe `peerConnections`.
3.  Remove dependence on single `activeSocket`.
4.  Remove dependence on single writer/reader as source of truth.

### Phase 2 --- Multi-client RFCOMM server

5.  Keep RFCOMM server socket alive.
6.  Remove first-client-only behavior.
7.  Create a peer worker for every accepted socket.
8.  Handle independent handshakes.

### Phase 3 --- Native sending

9.  Implement target-address sending.
10. Serialize writes per peer.
11. Implement broadcast.
12. Implement per-peer disconnect.

### Phase 4 --- Native events

13. Emit peer-specific connect/disconnect events.
14. Attach sender address to every incoming data event.
15. Add `getConnectedPeers()`.

### Phase 5 --- JavaScript transport

16. Replace single-peer state with `Map`.
17. Make send methods target-aware.
18. Make incoming packet handling sender-aware.
19. Make transfer state peer-specific.

### Phase 6 --- Sync engine

20. Make resource requests target-aware.
21. Make resource transfers target-aware.
22. Make ACKs/results target-aware.
23. Add per-peer transfer queues/concurrency.

### Phase 7 --- UI

24. Show connected students.
25. Allow multi-selection.
26. Add Share Selected.
27. Add Share With All.
28. Show per-student progress/failure.

### Phase 8 --- regression testing

29. Test the original one-student workflow.
30. Test two students.
31. Test three or more students.
32. Test disconnect/reconnect.
33. Test simultaneous transfers.
34. Test selective sharing.
35. Test broadcast.
36. Test student requests.
37. Test quiz results.
38. Test app/session cleanup.

------------------------------------------------------------------------

# 45. Physical-device test matrix

Do not declare this finished based only on compilation.

At minimum test:

## Test A --- one student

``` text
Teacher ↔ Student A
```

Expected:

-   pairing works;
-   manifest works;
-   resource transfer works;
-   quiz results work;
-   disconnect works.

## Test B --- two students

``` text
Teacher ↔ Student A
Teacher ↔ Student B
```

Expected:

-   both remain connected;
-   A can receive a resource;
-   B remains connected while A receives it;
-   B can independently receive another resource.

## Test C --- three students

``` text
Teacher ↔ A
Teacher ↔ B
Teacher ↔ C
```

Expected:

-   all three appear in connected list;
-   all three remain connected;
-   selective sharing works.

## Test D --- disconnect one

``` text
A disconnects
B connected
C connected
```

Expected:

-   only A becomes disconnected;
-   B and C continue;
-   teacher can still send to B/C.

## Test E --- simultaneous transfer

Send the same resource to A, B and C.

Expected:

-   separate transfer IDs;
-   separate progress;
-   no packet corruption;
-   all successful students receive the resource.

## Test F --- one transfer fails

Force/produce a disconnect for B.

Expected:

``` text
A = success
B = failed/disconnected
C = success
```

A and C must not be affected.

## Test G --- selective sharing

Send:

``` text
Resource X → A and C
```

Expected:

``` text
A = receives X
B = does not receive X
C = receives X
```

## Test H --- student request

A requests resource X.

Expected:

``` text
A gets X
B does not get X
C does not get X
```

## Test I --- quiz results

A sends quiz results.

Expected:

-   teacher receives them;
-   sender identity remains A;
-   B/C are unaffected.

------------------------------------------------------------------------

# 46. Performance expectations

Do not promise a fixed maximum number of students without testing.

The implementation should be designed to support multiple simultaneous
Bluetooth connections, but practical limits depend on:

-   Android version;
-   phone model;
-   Bluetooth controller;
-   distance;
-   interference;
-   packet sizes;
-   concurrent transfers;
-   OS resource limits.

Therefore:

**Build the architecture for multiple peers, but determine the reliable
classroom capacity empirically.**

The initial target should be several students, not an arbitrary claim of
dozens.

------------------------------------------------------------------------

# 47. Resource-transfer reliability

The existing project uses:

``` text
length-prefixed packets
+
JSON
+
4096-byte resource chunks
```

Do not unnecessarily change this working mechanism.

However:

-   verify that the chunk size remains safe across all currently used
    transports;
-   do not assume BLE and RFCOMM have identical payload constraints;
-   ensure RFCOMM sends are serialized per peer;
-   ensure a failed write is propagated to the correct transfer;
-   never silently continue after a failed send.

If the current `sendDataChunk()` catches an exception and merely falls
through to another transport, review that behavior carefully so a failed
RFCOMM send cannot accidentally be reported as successful.

------------------------------------------------------------------------

# 48. Important correction to existing transfer-progress logic

The current transfer implementation uses global fields such as:

``` javascript
this.transferProgress
this.isTransferring
this.isPaused
this.activeTransfer
```

These are not sufficient for multiple independent recipients.

Refactor them so transfer state is keyed by `transferId` and/or peer
address.

For example:

``` javascript
this.activeTransfers = new Map();
```

with:

``` javascript
transferId → {
    targetAddress,
    resource,
    progress,
    paused,
    status
}
```

A pause/failure for Student A must not pause Student B.

------------------------------------------------------------------------

# 49. Do not create a fake multi-student UI

The UI must be backed by real native connection state.

Do not simply add three fake students to the screen.

The connected-student list must reflect actual Bluetooth sockets.

Likewise, progress must represent actual transfer state.

------------------------------------------------------------------------

# 50. Do not break the current project

Before finishing:

-   compare changed files against the original architecture;
-   preserve existing routes/screens;
-   preserve current role selection;
-   preserve current pairing flow;
-   preserve current language system;
-   preserve current IndexedDB storage;
-   preserve current resource model;
-   preserve browser demo mode;
-   preserve existing working student functionality.

Avoid unrelated refactoring.

If a refactor is necessary, keep it localized and explain it in
comments.

------------------------------------------------------------------------

# 51. Build requirements

After implementation:

1.  Clean Android build.
2.  Build debug APK.
3.  Install on at least two physical Android devices.
4.  Ideally test with three or more Android devices.
5.  Verify permissions on Android 12+.
6.  Verify Bluetooth enable/disable behavior.
7.  Verify app logs.
8.  Verify no crash when a peer disappears unexpectedly.
9.  Verify no leaked socket/thread after disconnect.
10. Verify JavaScript bridge does not throw when peer list changes.

Do not claim success if only the Java code compiles.

------------------------------------------------------------------------

# 52. Final acceptance criteria

The implementation is complete only when all of these are true:

-   [ ] No Wi-Fi is required.
-   [ ] No Internet connection is required.
-   [ ] Teacher can accept multiple students over Bluetooth.
-   [ ] Teacher can keep multiple RFCOMM sockets alive simultaneously.
-   [ ] Existing single-student functionality still works.
-   [ ] Each student has independent socket/reader/writer state.
-   [ ] Each peer can be disconnected independently.
-   [ ] One peer failure does not terminate other peers.
-   [ ] Teacher can view connected students.
-   [ ] Teacher can select specific students.
-   [ ] Teacher can share to selected students.
-   [ ] Teacher can broadcast to all connected students.
-   [ ] Student resource requests are routed only to the teacher.
-   [ ] Teacher responses are routed only to the requesting student.
-   [ ] Transfer IDs do not collide across students.
-   [ ] Incoming transfer reassembly is sender-safe.
-   [ ] Transfer progress is tracked per student.
-   [ ] Multiple transfers can be scheduled without corrupting streams.
-   [ ] Per-peer writes are serialized.
-   [ ] Failed transfers can be identified and retried individually.
-   [ ] Quiz results preserve student identity.
-   [ ] Existing pairing-code verification remains intact.
-   [ ] BLE/GATT functionality is not unnecessarily removed.
-   [ ] RFCOMM remains the primary bulk-transfer transport.
-   [ ] No unrelated UI/functionality is broken.
-   [ ] Physical-device testing has been performed.

------------------------------------------------------------------------

# 53. Final instruction to Antigravity

**Do not just patch the first obvious `break` statement.**

The actual goal is:

> Convert EduSync's Bluetooth layer from a single-peer state model into
> a robust multi-peer Bluetooth session model while preserving the
> current RFCOMM + BLE architecture and keeping the entire solution
> Bluetooth-only.

The key architectural principle is:

``` text
ONE TEACHER
    ↓
MULTIPLE INDEPENDENT BLUETOOTH PEERS
    ↓
ONE CONNECTION OBJECT PER STUDENT
    ↓
ONE READER + SERIALIZED WRITER + TRANSFER QUEUE PER PEER
    ↓
TARGETED OR BROADCAST RESOURCE SHARING
```

Do not replace this with Wi-Fi.

Do not rewrite the application.

Do not remove the current pairing flow.

Do not make one student's state global.

Do not let one failed socket affect other students.

Before modifying files, inspect the existing implementation and map
every current single-peer assumption. Then implement the multi-peer
architecture systematically, build it, and test the complete workflow on
real Android devices.

If an implementation choice is uncertain, prefer the option that: 1.
preserves the existing architecture; 2. keeps Bluetooth-only operation;
3. isolates each student's connection; 4. avoids global mutable
connection state; 5. preserves backward compatibility; 6. is reliable on
low-end Android phones.
