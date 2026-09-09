package com.ruraleducation.platform;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "BluetoothP2P",
    permissions = {
        @Permission(
            strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            },
            alias = "bluetoothLegacy"
        ),
        @Permission(
            strings = {
                "android.permission.BLUETOOTH_SCAN",
                "android.permission.BLUETOOTH_ADVERTISE",
                "android.permission.BLUETOOTH_CONNECT",
                Manifest.permission.ACCESS_FINE_LOCATION
            },
            alias = "bluetooth12"
        )
    }
)
public class BluetoothP2PPlugin extends Plugin {

    private static final String TAG = "EduSyncBT";

    // Standard EduSync UUIDs
    public static final UUID SERVICE_UUID = UUID.fromString("0000ed00-0000-1000-8000-00805f9b34fb");
    public static final UUID CHAR_INFO_UUID = UUID.fromString("0000ed01-0000-1000-8000-00805f9b34fb");
    public static final UUID CHAR_PAIR_UUID = UUID.fromString("0000ed02-0000-1000-8000-00805f9b34fb");
    public static final UUID CHAR_DATA_UUID = UUID.fromString("0000ed03-0000-1000-8000-00805f9b34fb");
    public static final UUID CLIENT_CONFIG_DESCRIPTOR = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    // Classic Bluetooth RFCOMM SPP Socket UUID
    public static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");

    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattServer gattServer;
    private BluetoothLeScanner scanner;
    private BluetoothGatt connectedGattClient;
    private BluetoothDevice connectedRemoteDevice;

    // RFCOMM Socket state
    private BluetoothServerSocket serverSocket;
    private BluetoothSocket activeSocket;
    private DataOutputStream socketWriter;
    private DataInputStream socketReader;
    private Thread serverAcceptThread;
    private Thread socketWorkerThread;
    private final Map<String, Thread> clientReaderThreads = new ConcurrentHashMap<>();
    private final Map<String, SocketSession> clientSessions = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, BluetoothDevice> connectedGattDevices = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, BluetoothDevice> subscribedGattDevices = new ConcurrentHashMap<>();
    private final Object gattNotificationLock = new Object();
    private final Queue<GattNotificationTask> gattNotificationQueue = new ArrayDeque<>();
    private boolean gattNotificationInProgress = false;

    private boolean isAdvertising = false;
    private boolean isScanning = false;
    private boolean isReceiverRegistered = false;
    private String localPairingCode = "0000";
    private String localDeviceInfoJson = "{}";
    private String localDeviceName = "EduSync Teacher";
    private String localRole = "teacher";
    private String localClass = "8";

    private final Map<String, JSObject> discoveredPeers = new HashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    private static class SocketSession {
        final BluetoothSocket socket;
        final DataOutputStream writer;

        SocketSession(BluetoothSocket socket, DataOutputStream writer) {
            this.socket = socket;
            this.writer = writer;
        }

    }

    private static class GattNotificationTask {
        final byte[] payload;
        final List<BluetoothDevice> peers;
        final PluginCall call;
        int nextPeerIndex = 0;
        int sentCount = 0;

        GattNotificationTask(byte[] payload, List<BluetoothDevice> peers, PluginCall call) {
            this.payload = payload;
            this.peers = peers;
            this.call = call;
        }
    }

    private void safeNotifyListeners(String eventName, JSObject data) {
        try {
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    try {
                        notifyListeners(eventName, data);
                    } catch (Throwable t) {
                        Log.w(TAG, "Error in notifyListeners on main thread: " + t.getMessage());
                    }
                });
            } else {
                notifyListeners(eventName, data);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Error posting notifyListeners: " + t.getMessage());
        }
    }

    private BluetoothDevice safeGetRemoteDevice(BluetoothSocket socket) {
        if (socket == null) return null;
        try {
            return socket.getRemoteDevice();
        } catch (Throwable t) {
            Log.w(TAG, "safeGetRemoteDevice notice: " + t.getMessage());
            return null;
        }
    }

    private String safeGetAddress(BluetoothDevice device) {
        if (device == null) return "UNKNOWN";
        try {
            String addr = device.getAddress();
            return addr != null ? addr : "UNKNOWN";
        } catch (Throwable t) {
            return "UNKNOWN";
        }
    }

    private String safeGetName(BluetoothDevice device, String fallback) {
        if (device == null) return fallback;
        try {
            String name = device.getName();
            return (name != null && !name.trim().isEmpty()) ? name : fallback;
        } catch (Throwable t) {
            return fallback;
        }
    }

    @Override
    public void load() {
        try {
            Context ctx = getContext();
            if (ctx != null) {
                bluetoothManager = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
            }
            if (bluetoothManager != null) {
                bluetoothAdapter = bluetoothManager.getAdapter();
            } else {
                bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
            }
            Log.i(TAG, "EduSync BluetoothP2PPlugin loaded.");
        } catch (Throwable e) {
            Log.e(TAG, "Error initializing Bluetooth plugin: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPlatform(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isNative", true);
        ret.put("isSupported", bluetoothAdapter != null);
        try {
            ret.put("isEnabled", bluetoothAdapter != null && bluetoothAdapter.isEnabled());
        } catch (Throwable e) {
            ret.put("isEnabled", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void enableBluetooth(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported on this device.");
            return;
        }

        try {
            if (bluetoothAdapter.isEnabled()) {
                JSObject ret = new JSObject();
                ret.put("enabled", true);
                call.resolve(ret);
                return;
            }
            boolean requested = bluetoothAdapter.enable();
            JSObject ret = new JSObject();
            ret.put("enabled", requested);
            call.resolve(ret);
        } catch (Throwable e) {
            call.reject("Security exception enabling Bluetooth: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestDevicePermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetooth12", call, "permissionsCallback");
        } else {
            requestPermissionForAlias("bluetoothLegacy", call, "permissionsCallback");
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        JSArray array = new JSArray();
        if (bluetoothAdapter != null) {
            try {
                if (bluetoothAdapter.isEnabled()) {
                    Set<BluetoothDevice> paired = bluetoothAdapter.getBondedDevices();
                    if (paired != null) {
                        for (BluetoothDevice dev : paired) {
                            String addr = safeGetAddress(dev);
                            String name = safeGetName(dev, "Paired Device (" + addr + ")");
                            JSObject obj = new JSObject();
                            obj.put("id", addr);
                            obj.put("address", addr);
                            obj.put("name", name);
                            obj.put("isPaired", true);
                            obj.put("role", "teacher");
                            obj.put("classLevel", "8");
                            obj.put("rssi", -45);
                            array.put(obj);
                        }
                    }
                }
            } catch (Throwable e) {
                Log.w(TAG, "Exception getting paired devices: " + e.getMessage());
            }
        }
        JSObject ret = new JSObject();
        ret.put("devices", array);
        call.resolve(ret);
    }

    // =========================================================================
    // TEACHER: START ADVERTISING & RFCOMM SERVER
    // =========================================================================
    @PluginMethod
    public void startAdvertising(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth adapter not available.");
            return;
        }

        try {
            if (!bluetoothAdapter.isEnabled()) {
                call.reject("Bluetooth is not enabled on this device. Please turn on Bluetooth.");
                return;
            }
        } catch (Throwable e) {
            call.reject("Bluetooth permission not granted: " + e.getMessage());
            return;
        }

        localDeviceName = call.getString("name", "EduSync Teacher");
        localRole = call.getString("role", "teacher");
        localClass = call.getString("classLevel", "8");
        localPairingCode = call.getString("pairingCode", "1234");

        try {
            JSONObject infoObj = new JSONObject();
            infoObj.put("name", localDeviceName);
            infoObj.put("role", localRole);
            infoObj.put("classLevel", localClass);
            infoObj.put("pairingCode", localPairingCode);
            localDeviceInfoJson = infoObj.toString();
        } catch (Throwable e) {
            localDeviceInfoJson = "{}";
        }

        isAdvertising = true;

        // 1. Start RFCOMM SPP Server Socket for reliable high-speed data stream
        startRfcommServerSocket();

        // 2. Start GATT Server (Fallback)
        setupGattServer();

        // 3. Start BLE Advertiser for fast zero-pair discovery (if supported)
        try {
            advertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
            if (advertiser != null) {
                AdvertiseSettings settings = new AdvertiseSettings.Builder()
                        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                        .setConnectable(true)
                        .setTimeout(0)
                        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                        .build();

                AdvertiseData data = new AdvertiseData.Builder()
                        .setIncludeDeviceName(true)
                        .setIncludeTxPowerLevel(false)
                        .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                        .build();

                advertiser.startAdvertising(settings, data, advertiseCallback);
                Log.i(TAG, "Started BLE Advertising with 4-Digit Code: " + localPairingCode);
            }
        } catch (Throwable e) {
            Log.w(TAG, "BLE advertising notice: " + e.getMessage());
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("pairingCode", localPairingCode);
        ret.put("name", localDeviceName);
        call.resolve(ret);
    }

    private synchronized void startRfcommServerSocket() {
        stopRfcommServer();

        serverAcceptThread = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted() && isAdvertising) {
                BluetoothServerSocket listeningSocket = null;
                try {
                    if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                        break;
                    }

                    listeningSocket = bluetoothAdapter.listenUsingInsecureRfcommWithServiceRecord("EduSyncTeacher", SPP_UUID);
                    synchronized (BluetoothP2PPlugin.this) {
                        serverSocket = listeningSocket;
                    }
                    Log.i(TAG, "RFCOMM Server Socket listening for Student connections on UUID: " + SPP_UUID);

                    while (!Thread.currentThread().isInterrupted() && isAdvertising) {
                        BluetoothSocket socket = listeningSocket.accept();
                        if (socket != null) {
                            BluetoothDevice remoteDevice = safeGetRemoteDevice(socket);
                            String clientAddr = safeGetAddress(remoteDevice);
                            Log.i(TAG, "Accepted RFCOMM connection from: " + clientAddr);
                            handleIncomingClientSocket(socket);
                        }
                    }
                } catch (IOException e) {
                    if (Thread.currentThread().isInterrupted() || !isAdvertising) {
                        Log.i(TAG, "RFCOMM accept loop finished: " + e.getMessage());
                        break;
                    }
                    Log.w(TAG, "RFCOMM server socket failed; recreating listener: " + e.getMessage());
                } catch (Throwable t) {
                    if (Thread.currentThread().isInterrupted() || !isAdvertising) {
                        Log.w(TAG, "RFCOMM accept loop stopped: " + t.getMessage());
                        break;
                    }
                    Log.w(TAG, "RFCOMM server error; recreating listener: " + t.getMessage());
                } finally {
                    try {
                        if (listeningSocket != null) {
                            listeningSocket.close();
                        }
                    } catch (Throwable ignored) {}
                    synchronized (BluetoothP2PPlugin.this) {
                        if (serverSocket == listeningSocket) {
                            serverSocket = null;
                        }
                    }
                }

                if (!Thread.currentThread().isInterrupted() && isAdvertising) {
                    try {
                        Thread.sleep(250);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }, "EduSync-ServerAcceptThread");

        serverAcceptThread.start();
    }

    private void handleIncomingClientSocket(BluetoothSocket socket) {
        executor.execute(() -> {
            try {
                DataInputStream in = new DataInputStream(socket.getInputStream());
                DataOutputStream out = new DataOutputStream(socket.getOutputStream());

                // Read Handshake frame
                int length = in.readInt();
                if (length <= 0 || length > 10 * 1024 * 1024) {
                    try { socket.close(); } catch (Throwable ignored) {}
                    return;
                }

                byte[] bytes = new byte[length];
                in.readFully(bytes);
                String handshakeStr = new String(bytes, StandardCharsets.UTF_8);
                JSONObject hsObj = new JSONObject(handshakeStr);

                String receivedCode = hsObj.optString("pairingCode", "").trim();
                boolean matches = receivedCode.equals(localPairingCode);

                JSONObject respObj = new JSONObject();
                respObj.put("success", matches);
                respObj.put("teacherName", localDeviceName);
                respObj.put("classLevel", localClass);
                if (!matches) {
                    respObj.put("error", "Incorrect 4-digit verification code.");
                }

                byte[] respBytes = respObj.toString().getBytes(StandardCharsets.UTF_8);
                out.writeInt(respBytes.length);
                out.write(respBytes);
                out.flush();

                BluetoothDevice device = safeGetRemoteDevice(socket);
                String addr = safeGetAddress(device);

                if (!matches) {
                    Log.w(TAG, "Pairing verification failed for client: " + receivedCode + " != " + localPairingCode);
                    JSObject errObj = new JSObject();
                    errObj.put("peerAddress", addr);
                    errObj.put("reason", "Incorrect 4-digit code");
                    safeNotifyListeners("pairingFailed", errObj);
                    try { socket.close(); } catch (Throwable ignored) {}
                    return;
                }

                // Successful Pairing!
                String sessionAddress = addr.equals("UNKNOWN")
                        ? "socket_" + Integer.toHexString(System.identityHashCode(socket))
                        : addr;
                String studentName = hsObj.optString("studentName", safeGetName(device, "Student (" + (addr.length() > 5 ? addr.substring(addr.length() - 5) : addr) + ")"));
                Log.i(TAG, "RFCOMM Student Connected and Paired: " + studentName);
                clientSessions.put(sessionAddress, new SocketSession(socket, out));

                JSObject connObj = new JSObject();
                connObj.put("address", addr);
                connObj.put("name", studentName);
                connObj.put("role", "student");
                connObj.put("isRFCOMM", true);
                connObj.put("success", true);
                safeNotifyListeners("peerConnected", connObj);

                // Start Socket Reader Loop
                startSocketReaderLoop(socket, in, sessionAddress);

            } catch (Throwable e) {
                Log.e(TAG, "Error during student handshake: " + e.getMessage());
                try {
                    socket.close();
                } catch (Throwable ignored) {}
            }
        });
    }

    private void startSocketReaderLoop(BluetoothSocket socket, DataInputStream in, String sessionAddress) {
        Thread readerThread = new Thread(() -> {
            try {
                BluetoothDevice device = safeGetRemoteDevice(socket);
                String addr = safeGetAddress(device);

                Log.i(TAG, "Starting socket reader loop for device: " + addr);

                try {
                    while (!Thread.currentThread().isInterrupted() && in != null) {
                        int length;
                        try {
                            length = in.readInt();
                        } catch (java.io.EOFException e) {
                            Log.i(TAG, "Socket reached EOF from: " + addr);
                            break;
                        } catch (java.io.IOException e) {
                            Log.i(TAG, "Socket read IOException from " + addr + ": " + e.getMessage());
                            break;
                        }

                        if (length <= 0 || length > 25 * 1024 * 1024) {
                            Log.w(TAG, "Invalid packet length received: " + length);
                            break;
                        }

                        byte[] buffer = new byte[length];
                        in.readFully(buffer);
                        String payload = new String(buffer, StandardCharsets.UTF_8);

                        Log.i(TAG, "Received chunk packet (" + length + " bytes) from " + addr);

                        JSObject chunkObj = new JSObject();
                        chunkObj.put("sender", addr);
                        chunkObj.put("payload", payload);
                        safeNotifyListeners("chunkReceived", chunkObj);
                    }
                } catch (Throwable e) {
                    Log.i(TAG, "RFCOMM Socket stream closed: " + e.getMessage());
                } finally {
                    try {
                        if (socket != null) socket.close();
                    } catch (Throwable ignored) {}
                    if (activeSocket == socket) {
                        activeSocket = null;
                        socketWriter = null;
                        socketReader = null;
                    }
                    clientSessions.remove(sessionAddress);
                    clientReaderThreads.remove(sessionAddress);
                    JSObject discObj = new JSObject();
                    discObj.put("address", sessionAddress);
                    safeNotifyListeners("peerDisconnected", discObj);

                }
            } catch (Throwable outer) {
                Log.w(TAG, "Unhandled in socketWorkerThread: " + outer.getMessage());
            }
        }, "EduSync-SocketWorker-" + sessionAddress.replace(':', '_'));

        clientReaderThreads.put(sessionAddress, readerThread);
        readerThread.start();
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            super.onStartSuccess(settingsInEffect);
            Log.i(TAG, "BLE AdvertiseCallback onStartSuccess");
        }

        @Override
        public void onStartFailure(int errorCode) {
            super.onStartFailure(errorCode);
            Log.w(TAG, "BLE AdvertiseCallback onStartFailure: " + errorCode);
        }
    };

    private void setupGattServer() {
        if (gattServer != null) {
            try {
                gattServer.close();
            } catch (Throwable ignored) {}
        }

        try {
            if (bluetoothManager == null) return;
            gattServer = bluetoothManager.openGattServer(getContext(), gattServerCallback);
            if (gattServer == null) return;

            BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);

            BluetoothGattCharacteristic infoChar = new BluetoothGattCharacteristic(
                    CHAR_INFO_UUID,
                    BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_READ
            );

            BluetoothGattCharacteristic pairChar = new BluetoothGattCharacteristic(
                    CHAR_PAIR_UUID,
                    BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_WRITE
            );

            BluetoothGattCharacteristic dataChar = new BluetoothGattCharacteristic(
                    CHAR_DATA_UUID,
                    BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                    BluetoothGattCharacteristic.PERMISSION_WRITE
            );
            dataChar.addDescriptor(new BluetoothGattDescriptor(
                    CLIENT_CONFIG_DESCRIPTOR,
                    BluetoothGattDescriptor.PERMISSION_WRITE | BluetoothGattDescriptor.PERMISSION_READ
            ));

            service.addCharacteristic(infoChar);
            service.addCharacteristic(pairChar);
            service.addCharacteristic(dataChar);

            gattServer.addService(service);
            Log.i(TAG, "GATT Server configured with EduSync services.");
        } catch (Throwable e) {
            Log.w(TAG, "GATT Server setup notice: " + e.getMessage());
        }
    }

    private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            try {
                String addr = safeGetAddress(device);
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    connectedRemoteDevice = device;
                    connectedGattDevices.put(addr, device);
                    Log.i(TAG, "GATT Client connected: " + addr);
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.i(TAG, "GATT Client disconnected.");
                    connectedGattDevices.remove(addr);
                    subscribedGattDevices.remove(addr);
                    if (activeSocket == null) {
                        JSObject obj = new JSObject();
                        obj.put("address", addr);
                        safeNotifyListeners("peerDisconnected", obj);
                    }
                }
            } catch (Throwable e) {
                Log.w(TAG, "GATT onConnectionStateChange exception: " + e.getMessage());
            }
        }

        @Override
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset, BluetoothGattCharacteristic characteristic) {
            try {
                if (CHAR_INFO_UUID.equals(characteristic.getUuid()) && gattServer != null) {
                    byte[] data = localDeviceInfoJson.getBytes(StandardCharsets.UTF_8);
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, data);
                }
            } catch (Throwable ignored) {}
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            try {
                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                }
            } catch (Throwable ignored) {}

            try {
                String addr = safeGetAddress(device);
                if (CHAR_PAIR_UUID.equals(characteristic.getUuid()) && value != null) {
                    String receivedCode = new String(value, StandardCharsets.UTF_8).trim();
                    boolean matches = receivedCode.equals(localPairingCode);
                    Log.i(TAG, "GATT received pairing code: " + receivedCode + " (Match: " + matches + ")");

                    JSObject obj = new JSObject();
                    obj.put("peerAddress", addr);
                    obj.put("address", addr);
                    obj.put("name", safeGetName(device, "EduSync Device (" + addr + ")"));
                    obj.put("role", "student");
                    obj.put("success", matches);

                    if (matches) {
                        connectedRemoteDevice = device;
                        connectedGattDevices.put(addr, device);
                        safeNotifyListeners("peerConnected", obj);
                    } else {
                        safeNotifyListeners("pairingFailed", obj);
                        if (gattServer != null) {
                            try {
                                gattServer.cancelConnection(device);
                            } catch (Throwable ignored) {}
                        }
                    }
                } else if (CHAR_DATA_UUID.equals(characteristic.getUuid()) && value != null) {
                    String payload = new String(value, StandardCharsets.UTF_8);
                    JSObject obj = new JSObject();
                    obj.put("sender", addr);
                    obj.put("payload", payload);
                    safeNotifyListeners("chunkReceived", obj);
                }
            } catch (Throwable e) {
                Log.w(TAG, "GATT write processing notice: " + e.getMessage());
            }
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId, BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            try {
                if (CLIENT_CONFIG_DESCRIPTOR.equals(descriptor.getUuid()) && value != null) {
                    descriptor.setValue(value);
                    String address = safeGetAddress(device);
                    if (Arrays.equals(value, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                            || Arrays.equals(value, BluetoothGattDescriptor.ENABLE_INDICATION_VALUE)) {
                        subscribedGattDevices.put(address, device);
                        Log.i(TAG, "BLE data notifications enabled for " + address);
                    } else {
                        subscribedGattDevices.remove(address);
                        Log.i(TAG, "BLE data notifications disabled for " + address);
                    }
                }
                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                }
            } catch (Throwable e) {
                Log.w(TAG, "GATT descriptor write response notice: " + e.getMessage());
            }
        }

        @Override
        public void onNotificationSent(BluetoothDevice device, int status) {
            completeNextGattNotification(status == BluetoothGatt.GATT_SUCCESS);
        }
    };

    private void enqueueGattNotification(byte[] bytes, PluginCall call) {
        Map<String, BluetoothDevice> eligiblePeers = new HashMap<>(connectedGattDevices);
        eligiblePeers.putAll(subscribedGattDevices);
        List<BluetoothDevice> peers = new ArrayList<>(eligiblePeers.values());
        synchronized (gattNotificationLock) {
            gattNotificationQueue.add(new GattNotificationTask(bytes, peers, call));
        }
        drainGattNotificationQueue();
    }

    private void drainGattNotificationQueue() {
        synchronized (gattNotificationLock) {
            if (gattNotificationInProgress || gattNotificationQueue.isEmpty()) {
                return;
            }

            GattNotificationTask task = gattNotificationQueue.peek();
            if (task.peers.isEmpty() || gattServer == null) {
                gattNotificationQueue.remove();
                task.call.reject("No subscribed BLE students are connected.");
                drainGattNotificationQueue();
                return;
            }

            BluetoothGattService service = gattServer.getService(SERVICE_UUID);
            BluetoothGattCharacteristic dataChar = service == null
                    ? null
                    : service.getCharacteristic(CHAR_DATA_UUID);
            if (dataChar == null) {
                gattNotificationQueue.remove();
                task.call.reject("EduSync BLE data characteristic is unavailable.");
                drainGattNotificationQueue();
                return;
            }

            while (task.nextPeerIndex < task.peers.size()) {
                BluetoothDevice peer = task.peers.get(task.nextPeerIndex);
                task.nextPeerIndex++;
                if (!connectedGattDevices.containsKey(safeGetAddress(peer))) {
                    continue;
                }

                try {
                    dataChar.setValue(task.payload);
                    gattNotificationInProgress = true;
                    boolean accepted = false;
                    for (int attempt = 0; attempt < 3 && !accepted; attempt++) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            accepted = gattServer.notifyCharacteristicChanged(peer, dataChar, false, task.payload)
                                    == BluetoothGatt.GATT_SUCCESS;
                        } else {
                            accepted = gattServer.notifyCharacteristicChanged(peer, dataChar, false);
                        }
                        if (!accepted) {
                            try {
                                Thread.sleep(40L);
                            } catch (InterruptedException interrupted) {
                                Thread.currentThread().interrupt();
                                break;
                            }
                        }
                    }
                    if (accepted) {
                        return;
                    }
                    gattNotificationInProgress = false;
                } catch (Throwable e) {
                    Log.w(TAG, "BLE notification enqueue notice: " + e.getMessage());
                    gattNotificationInProgress = false;
                }
            }

            gattNotificationQueue.remove();
            if (task.sentCount > 0) {
                JSObject ret = new JSObject();
                ret.put("sent", true);
                ret.put("transport", "BLE_GATT_SERVER");
                ret.put("peerCount", task.sentCount);
                task.call.resolve(ret);
            } else {
                task.call.reject("BLE notification was rejected by all connected peers.");
            }
            drainGattNotificationQueue();
        }
    }

    private void completeNextGattNotification(boolean success) {
        synchronized (gattNotificationLock) {
            if (!gattNotificationInProgress || gattNotificationQueue.isEmpty()) {
                return;
            }

            GattNotificationTask task = gattNotificationQueue.peek();
            gattNotificationInProgress = false;
            if (success) {
                task.sentCount++;
            }
            drainGattNotificationQueue();
        }
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        isAdvertising = false;
        try {
            if (advertiser != null) {
                advertiser.stopAdvertising(advertiseCallback);
            }
        } catch (Throwable ignored) {}

        try {
            if (gattServer != null) {
                gattServer.close();
                gattServer = null;
            }
        } catch (Throwable ignored) {}

        stopRfcommServer();

        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private synchronized void stopRfcommServer() {
        try {
            if (serverAcceptThread != null) {
                serverAcceptThread.interrupt();
                serverAcceptThread = null;
            }
        } catch (Throwable ignored) {}

        try {
            if (serverSocket != null) {
                serverSocket.close();
                serverSocket = null;
            }
        } catch (Throwable ignored) {}
    }

    // =========================================================================
    // STUDENT: DUAL SCANNING (BLE + CLASSIC BT DISCOVERY)
    // =========================================================================
    @PluginMethod
    public void startScanning(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth adapter not available.");
            return;
        }

        try {
            if (!bluetoothAdapter.isEnabled()) {
                call.reject("Bluetooth is not enabled on this device. Please turn on Bluetooth.");
                return;
            }
        } catch (Throwable e) {
            call.reject("Bluetooth permission not granted: " + e.getMessage());
            return;
        }

        discoveredPeers.clear();

        // Scan only for the EduSync service advertised by the app.
        try {
            scanner = bluetoothAdapter.getBluetoothLeScanner();
            if (scanner != null) {
                ScanSettings settings = new ScanSettings.Builder()
                        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                        .build();
                ScanFilter filter = new ScanFilter.Builder()
                        .setServiceUuid(new ParcelUuid(SERVICE_UUID))
                        .build();

                scanner.startScan(java.util.Collections.singletonList(filter), settings, scanCallback);
                isScanning = true;
                Log.i(TAG, "BLE Scanner started for EduSync devices only.");
            }
        } catch (Throwable e) {
            Log.w(TAG, "BLE scanning notice: " + e.getMessage());
        }

        JSObject ret = new JSObject();
        ret.put("scanning", true);
        call.resolve(ret);
    }

    private void registerDiscoveryReceiver() {
        if (!isReceiverRegistered && getContext() != null) {
            try {
                IntentFilter filter = new IntentFilter();
                filter.addAction(BluetoothDevice.ACTION_FOUND);
                filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
                getContext().registerReceiver(discoveryReceiver, filter);
                isReceiverRegistered = true;
            } catch (Throwable e) {
                Log.w(TAG, "Error registering discovery receiver: " + e.getMessage());
            }
        }
    }

    private void unregisterDiscoveryReceiver() {
        if (isReceiverRegistered && getContext() != null) {
            try {
                getContext().unregisterReceiver(discoveryReceiver);
            } catch (Throwable ignored) {}
            isReceiverRegistered = false;
        }
    }

    private final BroadcastReceiver discoveryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            try {
                String action = intent.getAction();
                if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (device != null) {
                        short rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, (short) -60);
                        addDiscoveredDevice(device, (int) rssi, "ClassicBT");
                    }
                }
            } catch (Throwable e) {
                Log.w(TAG, "Discovery receiver notice: " + e.getMessage());
            }
        }
    };

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            try {
                BluetoothDevice device = result.getDevice();
                if (device != null) {
                    String devName = null;
                    if (result.getScanRecord() != null) {
                        devName = result.getScanRecord().getDeviceName();
                    }
                    addDiscoveredDevice(device, result.getRssi(), "BLE", devName);
                }
            } catch (Throwable e) {
                Log.w(TAG, "ScanCallback notice: " + e.getMessage());
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.w(TAG, "BLE Scan failed with code: " + errorCode);
        }
    };

    private void addDiscoveredDevice(BluetoothDevice device, int rssi, String source) {
        addDiscoveredDevice(device, rssi, source, null);
    }

    private synchronized void addDiscoveredDevice(BluetoothDevice device, int rssi, String source, String recordName) {
        String address = safeGetAddress(device);
        if (address.equals("UNKNOWN") || address.equals("SECURE_DEVICE")) return;

        String devName = recordName;
        if (devName == null || devName.trim().isEmpty()) {
            devName = safeGetName(device, "EduSync Teacher (" + (address.length() > 5 ? address.substring(address.length() - 5) : address) + ")");
        }

        if (!discoveredPeers.containsKey(address)) {
            JSObject peer = new JSObject();
            peer.put("id", address);
            peer.put("address", address);
            peer.put("name", devName);
            peer.put("role", "teacher");
            peer.put("classLevel", "8");
            peer.put("rssi", rssi);
            peer.put("source", source);
            peer.put("isPaired", source.equals("Paired"));

            discoveredPeers.put(address, peer);
            safeNotifyListeners("peerDiscovered", peer);
            Log.i(TAG, "Discovered device via [" + source + "]: " + devName + " [" + address + "] RSSI: " + rssi);
        }
    }

    @PluginMethod
    public void stopScanning(PluginCall call) {
        try {
            if (scanner != null && isScanning) {
                scanner.stopScan(scanCallback);
                isScanning = false;
            }
            if (bluetoothAdapter != null && bluetoothAdapter.isDiscovering()) {
                bluetoothAdapter.cancelDiscovery();
            }
            unregisterDiscoveryReceiver();

            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (Throwable e) {
            call.reject("Error stopping scan: " + e.getMessage());
        }
    }

    // Stop scanning without stopping the teacher's advertising or active peers.
    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        stopScanning(call);
    }

    @PluginMethod
    public void connectToPeer(PluginCall call) {
        String address = call.getString("address");
        String pairingCode = call.getString("pairingCode", "0000");
        String studentName = call.getString("studentName", "Student Phone");

        if (address == null) {
            call.reject("Peer address is required.");
            return;
        }

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth adapter unavailable.");
            return;
        }

        // Stop scanning during connection
        try {
            if (scanner != null && isScanning) {
                scanner.stopScan(scanCallback);
                isScanning = false;
            }
            if (bluetoothAdapter.isDiscovering()) {
                bluetoothAdapter.cancelDiscovery();
            }
            unregisterDiscoveryReceiver();
        } catch (Throwable ignored) {}

        BluetoothDevice device = null;
        try {
            device = bluetoothAdapter.getRemoteDevice(address);
        } catch (Throwable t) {
            call.reject("Could not get device for address: " + address);
            return;
        }

        if (device == null) {
            call.reject("Device not found with address: " + address);
            return;
        }

        final BluetoothDevice finalDevice = device;

        executor.execute(() -> {
            try {
                boolean connected = false;
                Throwable lastConnectionError = null;
                // Discovery has already been stopped above; use one immediate
                // RFCOMM attempt and fall back to GATT without retry delays.
                for (int attempt = 1; attempt <= 1 && !connected; attempt++) {
                    BluetoothSocket socket = null;
                    try {
                        Log.i(TAG, "Attempting RFCOMM Socket connection to " + address + " (attempt " + attempt + ")");
                        socket = finalDevice.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                        socket.connect();

                        DataOutputStream out = new DataOutputStream(socket.getOutputStream());
                        DataInputStream in = new DataInputStream(socket.getInputStream());

                        JSONObject hsObj = new JSONObject();
                        hsObj.put("type", "HANDSHAKE");
                        hsObj.put("pairingCode", pairingCode);
                        hsObj.put("studentName", studentName);

                        byte[] hsBytes = hsObj.toString().getBytes(StandardCharsets.UTF_8);
                        out.writeInt(hsBytes.length);
                        out.write(hsBytes);
                        out.flush();

                        int respLen = in.readInt();
                        if (respLen <= 0 || respLen > 1024 * 1024) {
                            throw new IOException("Invalid teacher handshake response length: " + respLen);
                        }
                        byte[] respBytes = new byte[respLen];
                        in.readFully(respBytes);
                        JSONObject respObj = new JSONObject(new String(respBytes, StandardCharsets.UTF_8));

                        boolean verified = respObj.optBoolean("success", false);
                        if (!verified) {
                            Log.w(TAG, "Teacher rejected pairing code: " + pairingCode);
                            JSObject failObj = new JSObject();
                            failObj.put("peerAddress", address);
                            failObj.put("reason", respObj.optString("error", "Incorrect 4-digit verification code."));
                            safeNotifyListeners("pairingFailed", failObj);
                            try { socket.close(); } catch (Throwable ignored) {}
                            return;
                        }

                        activeSocket = socket;
                        socketWriter = out;
                        socketReader = in;
                        connectedRemoteDevice = finalDevice;
                        connected = true;

                        Log.i(TAG, "RFCOMM Socket Connected and Verified with Teacher!");
                        JSObject connObj = new JSObject();
                        connObj.put("address", address);
                        connObj.put("name", respObj.optString("teacherName", safeGetName(finalDevice, "Teacher")));
                        connObj.put("role", "teacher");
                        connObj.put("isRFCOMM", true);
                        connObj.put("success", true);
                        safeNotifyListeners("peerConnected", connObj);
                        startSocketReaderLoop(socket, in, address);
                    } catch (Throwable e) {
                        lastConnectionError = e;
                        if (socket != null) {
                            try { socket.close(); } catch (Throwable ignored) {}
                        }
                    }
                }

                if (connected) {
                    return;
                }
                if (lastConnectionError != null) {
                    Log.w(TAG, "RFCOMM connection attempts exhausted (" + lastConnectionError.getMessage() + "). Falling back to BLE GATT...");
                }
                connectViaGatt(finalDevice, pairingCode);
            } catch (Throwable outer) {
                Log.e(TAG, "Error in connectToPeer executor: " + outer.getMessage());
            }
        });

        JSObject ret = new JSObject();
        ret.put("initiating", true);
        call.resolve(ret);
    }

    private void connectViaGatt(BluetoothDevice device, String pairingCode) {
        try {
            if (connectedGattClient != null) {
                try {
                    connectedGattClient.close();
                } catch (Throwable ignored) {}
            }

            String addr = safeGetAddress(device);
            Log.i(TAG, "Connecting to GATT Server: " + addr);
            connectedGattClient = device.connectGatt(
                    getContext(),
                    false,
                    new BluetoothGattCallback() {
                        @Override
                        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                            try {
                                if (newState == BluetoothProfile.STATE_CONNECTED) {
                                    Log.i(TAG, "Connected to GATT server! Requesting MTU 512...");
                                    gatt.requestMtu(512);
                                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                                    Log.i(TAG, "Disconnected from GATT server.");
                                    JSObject obj = new JSObject();
                                    obj.put("address", addr);
                                    safeNotifyListeners("peerDisconnected", obj);
                                }
                            } catch (Throwable ignored) {}
                        }

                        @Override
                        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                            try {
                                Log.i(TAG, "BLE MTU set to: " + mtu + ". Discovering services...");
                                gatt.discoverServices();
                            } catch (Throwable ignored) {}
                        }

                        @Override
                        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                            try {
                                if (status == BluetoothGatt.GATT_SUCCESS) {
                                    BluetoothGattService service = gatt.getService(SERVICE_UUID);
                                    if (service != null) {
                                        Log.i(TAG, "EduSync Service discovered. Verifying pairing code: " + pairingCode);
                                        BluetoothGattCharacteristic pairChar = service.getCharacteristic(CHAR_PAIR_UUID);
                                        if (pairChar != null) {
                                            pairChar.setValue(pairingCode.getBytes(StandardCharsets.UTF_8));
                                            gatt.writeCharacteristic(pairChar);
                                        }
                                    }
                                }
                            } catch (Throwable e) {
                                Log.w(TAG, "onServicesDiscovered notice: " + e.getMessage());
                            }
                        }

                                @Override
                        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                                   try {
                                       if (CHAR_PAIR_UUID.equals(characteristic.getUuid()) && status == BluetoothGatt.GATT_SUCCESS) {
                                           BluetoothGattService service = gatt.getService(SERVICE_UUID);
                                           BluetoothGattCharacteristic dataChar = service == null ? null : service.getCharacteristic(CHAR_DATA_UUID);
                                           if (dataChar != null) {
                                               gatt.setCharacteristicNotification(dataChar, true);
                                               BluetoothGattDescriptor desc = dataChar.getDescriptor(CLIENT_CONFIG_DESCRIPTOR);
                                               if (desc != null) {
                                                   desc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                                                   gatt.writeDescriptor(desc);
                                                   return;
                                               }
                                           }
                                           emitGattPeerConnected(addr, device);
                                       }
                                   } catch (Throwable e) {
                                       Log.w(TAG, "GATT pairing write notice: " + e.getMessage());
                                   }
                        }

                        @Override
                        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
                                   if (CLIENT_CONFIG_DESCRIPTOR.equals(descriptor.getUuid())) {
                                       emitGattPeerConnected(addr, device);
                                   }
                        }

                        private void emitGattPeerConnected(String address, BluetoothDevice peerDevice) {
                                   JSObject obj = new JSObject();
                                   obj.put("address", address);
                                   obj.put("name", safeGetName(peerDevice, "Teacher (BLE)"));
                                   obj.put("role", "teacher");
                                   obj.put("success", true);
                                   safeNotifyListeners("peerConnected", obj);
                        }
                        @Override
                        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
                            try {
                                if (CHAR_DATA_UUID.equals(characteristic.getUuid())) {
                                    byte[] val = characteristic.getValue();
                                    if (val != null) {
                                        String payload = new String(val, StandardCharsets.UTF_8);
                                        JSObject obj = new JSObject();
                                        obj.put("sender", addr);
                                        obj.put("payload", payload);
                                        safeNotifyListeners("chunkReceived", obj);
                                    }
                                }
                            } catch (Throwable ignored) {}
                        }

                        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
                            try {
                                if (CHAR_DATA_UUID.equals(characteristic.getUuid()) && value != null) {
                                    String payload = new String(value, StandardCharsets.UTF_8);
                                    JSObject obj = new JSObject();
                                    obj.put("sender", addr);
                                    obj.put("payload", payload);
                                    safeNotifyListeners("chunkReceived", obj);
                                }
                            } catch (Throwable ignored) {}
                        }
                    },
                    BluetoothDevice.TRANSPORT_LE
            );
        } catch (Throwable e) {
            Log.e(TAG, "Exception in connectViaGatt: " + e.getMessage());
        }
    }

    // =========================================================================
    // DATA TRANSMISSION (HIGH-SPEED SOCKET STREAM + BLE FALLBACK)
    // =========================================================================
    @PluginMethod
    public void sendDataChunk(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null) {
            call.reject("Payload cannot be empty.");
            return;
        }

        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);

        // Broadcast teacher packets to every connected student session.
        if (!clientSessions.isEmpty()) {
            int sentCount = 0;
            for (Map.Entry<String, SocketSession> entry : clientSessions.entrySet()) {
                try {
                    DataOutputStream writer = entry.getValue().writer;
                    synchronized (writer) {
                        writer.writeInt(bytes.length);
                        writer.write(bytes);
                        writer.flush();
                    }
                    sentCount++;
                } catch (Throwable e) {
                    Log.w(TAG, "Socket write notice for " + entry.getKey() + ": " + e.getMessage());
                    clientSessions.remove(entry.getKey());
                }
            }
            if (sentCount > 0) {
                JSObject ret = new JSObject();
                ret.put("sent", true);
                ret.put("transport", "RFCOMM");
                ret.put("peerCount", sentCount);
                call.resolve(ret);
                return;
            }
        }

        // Case 1: Active High-Speed RFCOMM Socket Stream
        if (socketWriter != null) {
            try {
                synchronized (socketWriter) {
                    socketWriter.writeInt(bytes.length);
                    socketWriter.write(bytes);
                    socketWriter.flush();
                }
                JSObject ret = new JSObject();
                ret.put("sent", true);
                ret.put("transport", "RFCOMM");
                call.resolve(ret);
                return;
            } catch (Throwable e) {
                Log.w(TAG, "Socket write notice: " + e.getMessage());
            }
        }

        // Case 2: BLE GATT Client to Server
        try {
            if (connectedGattClient != null) {
                BluetoothGattService service = connectedGattClient.getService(SERVICE_UUID);
                if (service != null) {
                    BluetoothGattCharacteristic dataChar = service.getCharacteristic(CHAR_DATA_UUID);
                    if (dataChar != null) {
                        dataChar.setValue(bytes);
                        if (!connectedGattClient.writeCharacteristic(dataChar)) {
                            call.reject("BLE characteristic write was rejected.");
                            return;
                        }
                        JSObject ret = new JSObject();
                        ret.put("sent", true);
                        ret.put("transport", "BLE_GATT");
                        call.resolve(ret);
                        return;
                    }
                }
            }

            // Case 3: Broadcast through the BLE GATT server to every connected student.
            if (gattServer != null && !connectedGattDevices.isEmpty()) {
                enqueueGattNotification(bytes, call);
                return;
            }

            call.reject("No active Bluetooth connection to send data.");
        } catch (Throwable e) {
            call.reject("Exception sending data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            for (SocketSession session : clientSessions.values()) {
                try { session.socket.close(); } catch (Throwable ignored) {}
            }
            clientSessions.clear();
            connectedGattDevices.clear();
            subscribedGattDevices.clear();
            for (Thread readerThread : clientReaderThreads.values()) {
                try { readerThread.interrupt(); } catch (Throwable ignored) {}
            }
            clientReaderThreads.clear();
            if (activeSocket != null) {
                try {
                    activeSocket.close();
                } catch (Throwable ignored) {}
                activeSocket = null;
                socketWriter = null;
                socketReader = null;
            }

            if (socketWorkerThread != null) {
                try {
                    socketWorkerThread.interrupt();
                } catch (Throwable ignored) {}
                socketWorkerThread = null;
            }

            if (connectedGattClient != null) {
                try {
                    connectedGattClient.disconnect();
                    connectedGattClient.close();
                } catch (Throwable ignored) {}
                connectedGattClient = null;
            }

            if (gattServer != null && connectedRemoteDevice != null) {
                try {
                    gattServer.cancelConnection(connectedRemoteDevice);
                } catch (Throwable ignored) {}
                connectedRemoteDevice = null;
            }

            JSObject ret = new JSObject();
            ret.put("disconnected", true);
            call.resolve(ret);
        } catch (Throwable e) {
            call.reject("Exception disconnecting: " + e.getMessage());
        }
    }
}
