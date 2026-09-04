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
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
                "android.permission.BLUETOOTH_CONNECT"
            },
            alias = "bluetooth12"
        )
    }
)
public class BluetoothP2PPlugin extends Plugin {

    private static final String TAG = "EduSyncBLE";

    // Standard EduSync Service & Characteristic UUIDs
    public static final UUID SERVICE_UUID = UUID.fromString("0000ed00-0000-1000-8000-00805f9b34fb");
    public static final UUID CHAR_INFO_UUID = UUID.fromString("0000ed01-0000-1000-8000-00805f9b34fb");
    public static final UUID CHAR_PAIR_UUID = UUID.fromString("0000ed02-0000-1000-8000-00805f9b34fb");
    public static final UUID CHAR_DATA_UUID = UUID.fromString("0000ed03-0000-1000-8000-00805f9b34fb");
    public static final UUID CLIENT_CONFIG_DESCRIPTOR = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattServer gattServer;
    private BluetoothLeScanner scanner;
    private BluetoothGatt connectedGattClient;
    private BluetoothDevice connectedRemoteDevice;

    private boolean isAdvertising = false;
    private boolean isScanning = false;
    private String localPairingCode = "0000";
    private String localDeviceInfoJson = "{}";
    private int negotiatedMtu = 23; // Default BLE MTU

    private final Map<String, JSObject> discoveredPeers = new HashMap<>();

    @Override
    public void load() {
        Context ctx = getContext();
        bluetoothManager = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }
        Log.i(TAG, "EduSync BluetoothP2PPlugin loaded.");
    }

    @PluginMethod
    public void checkPlatform(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isNative", true);
        ret.put("isSupported", bluetoothAdapter != null);
        ret.put("isEnabled", bluetoothAdapter != null && bluetoothAdapter.isEnabled());
        call.resolve(ret);
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
    public void startAdvertising(PluginCall call) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is not enabled on this device.");
            return;
        }

        advertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            call.reject("Bluetooth LE Advertising is not supported by this device hardware.");
            return;
        }

        String name = call.getString("name", "EduSync Device");
        String role = call.getString("role", "teacher");
        String classLevel = call.getString("classLevel", "8");
        localPairingCode = call.getString("pairingCode", "1234");

        try {
            JSONObject infoObj = new JSONObject();
            infoObj.put("name", name);
            infoObj.put("role", role);
            infoObj.put("classLevel", classLevel);
            infoObj.put("pairingCode", localPairingCode);
            localDeviceInfoJson = infoObj.toString();
        } catch (Exception e) {
            localDeviceInfoJson = "{}";
        }

        setupGattServer();

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                .setConnectable(true)
                .setTimeout(0)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .build();

        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                .build();

        try {
            advertiser.startAdvertising(settings, data, advertiseCallback);
            isAdvertising = true;
            Log.i(TAG, "Started BLE Advertising with code: " + localPairingCode);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("pairingCode", localPairingCode);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Security Exception starting advertising: " + e.getMessage());
        } catch (Exception e) {
            call.reject("Failed to start advertising: " + e.getMessage());
        }
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            super.onStartSuccess(settingsInEffect);
            Log.i(TAG, "AdvertiseCallback onStartSuccess");
        }

        @Override
        public void onStartFailure(int errorCode) {
            super.onStartFailure(errorCode);
            isAdvertising = false;
            Log.e(TAG, "AdvertiseCallback onStartFailure: " + errorCode);
        }
    };

    private void setupGattServer() {
        if (gattServer != null) {
            gattServer.close();
        }

        try {
            gattServer = bluetoothManager.openGattServer(getContext(), gattServerCallback);
            BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);

            // Info Characteristic (Read)
            BluetoothGattCharacteristic infoChar = new BluetoothGattCharacteristic(
                    CHAR_INFO_UUID,
                    BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_READ
            );

            // Pairing Characteristic (Write)
            BluetoothGattCharacteristic pairChar = new BluetoothGattCharacteristic(
                    CHAR_PAIR_UUID,
                    BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_WRITE
            );

            // Data Transfer Characteristic (Write, Notify)
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
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException in setupGattServer: " + e.getMessage());
        }
    }

    private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connectedRemoteDevice = device;
                Log.i(TAG, "Client connected to GATT Server: " + device.getAddress());
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.i(TAG, "Client disconnected from GATT Server");
                connectedRemoteDevice = null;
                JSObject obj = new JSObject();
                obj.put("address", device.getAddress());
                notifyListeners("peerDisconnected", obj);
            }
        }

        @Override
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset, BluetoothGattCharacteristic characteristic) {
            if (CHAR_INFO_UUID.equals(characteristic.getUuid())) {
                byte[] data = localDeviceInfoJson.getBytes(StandardCharsets.UTF_8);
                try {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, data);
                } catch (SecurityException ignored) {}
            }
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            try {
                if (responseNeeded) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                }
            } catch (SecurityException ignored) {}

            if (CHAR_PAIR_UUID.equals(characteristic.getUuid())) {
                String receivedCode = new String(value, StandardCharsets.UTF_8).trim();
                boolean matches = receivedCode.equals(localPairingCode);
                Log.i(TAG, "Received pairing verification code: " + receivedCode + " (Match: " + matches + ")");

                JSObject obj = new JSObject();
                obj.put("peerAddress", device.getAddress());
                obj.put("success", matches);
                notifyListeners(matches ? "peerConnected" : "pairingFailed", obj);
            } else if (CHAR_DATA_UUID.equals(characteristic.getUuid())) {
                String payload = new String(value, StandardCharsets.UTF_8);
                JSObject obj = new JSObject();
                obj.put("sender", device.getAddress());
                obj.put("payload", payload);
                notifyListeners("chunkReceived", obj);
            }
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId, BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            try {
                if (responseNeeded) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                }
            } catch (SecurityException ignored) {}
        }
    };

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        try {
            if (advertiser != null && isAdvertising) {
                advertiser.stopAdvertising(advertiseCallback);
                isAdvertising = false;
            }
            if (gattServer != null) {
                gattServer.close();
                gattServer = null;
            }
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Security Exception stopping advertising: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startScanning(PluginCall call) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is not enabled on this device.");
            return;
        }

        scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("BLE Scanner is not available.");
            return;
        }

        discoveredPeers.clear();

        ScanFilter filter = new ScanFilter.Builder()
                .setServiceUuid(new ParcelUuid(SERVICE_UUID))
                .build();

        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        try {
            scanner.startScan(Arrays.asList(filter), settings, scanCallback);
            isScanning = true;
            Log.i(TAG, "Started BLE Scanning for EduSync devices.");
            JSObject ret = new JSObject();
            ret.put("scanning", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Security Exception starting scanning: " + e.getMessage());
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            if (device == null) return;

            String address = device.getAddress();
            if (!discoveredPeers.containsKey(address)) {
                JSObject peer = new JSObject();
                peer.put("id", address);
                peer.put("address", address);
                try {
                    peer.put("name", device.getName() != null ? device.getName() : "EduSync Device (" + address.substring(address.length() - 5) + ")");
                } catch (SecurityException e) {
                    peer.put("name", "EduSync Device");
                }
                peer.put("rssi", result.getRssi());

                discoveredPeers.put(address, peer);
                notifyListeners("peerDiscovered", peer);
                Log.i(TAG, "Discovered EduSync peer: " + address + " RSSI: " + result.getRssi());
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            isScanning = false;
            Log.e(TAG, "Scan failed with error code: " + errorCode);
        }
    };

    @PluginMethod
    public void stopScanning(PluginCall call) {
        try {
            if (scanner != null && isScanning) {
                scanner.stopScan(scanCallback);
                isScanning = false;
            }
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Security Exception stopping scan: " + e.getMessage());
        }
    }

    @PluginMethod
    public void connectToPeer(PluginCall call) {
        String address = call.getString("address");
        String pairingCode = call.getString("pairingCode", "");

        if (address == null) {
            call.reject("Peer address is required.");
            return;
        }

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth adapter unavailable.");
            return;
        }

        BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
        if (device == null) {
            call.reject("Device not found.");
            return;
        }

        try {
            if (connectedGattClient != null) {
                connectedGattClient.close();
            }

            Log.i(TAG, "Connecting to GATT Server: " + address);
            connectedGattClient = device.connectGatt(
                    getContext(),
                    false,
                    new BluetoothGattCallback() {
                        @Override
                        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                            if (newState == BluetoothProfile.STATE_CONNECTED) {
                                Log.i(TAG, "Connected to GATT server! Requesting high MTU (512)...");
                                try {
                                    gatt.requestMtu(512);
                                } catch (SecurityException ignored) {}
                            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                                Log.i(TAG, "Disconnected from GATT server.");
                                JSObject obj = new JSObject();
                                obj.put("address", address);
                                notifyListeners("peerDisconnected", obj);
                            }
                        }

                        @Override
                        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                            negotiatedMtu = mtu;
                            Log.i(TAG, "Negotiated BLE MTU: " + mtu + ". Discovering services...");
                            try {
                                gatt.discoverServices();
                            } catch (SecurityException ignored) {}
                        }

                        @Override
                        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                            if (status == BluetoothGatt.GATT_SUCCESS) {
                                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                                if (service != null) {
                                    Log.i(TAG, "EduSync Service discovered. Verifying pairing code: " + pairingCode);
                                    BluetoothGattCharacteristic pairChar = service.getCharacteristic(CHAR_PAIR_UUID);
                                    if (pairChar != null) {
                                        pairChar.setValue(pairingCode.getBytes(StandardCharsets.UTF_8));
                                        try {
                                            gatt.writeCharacteristic(pairChar);
                                        } catch (SecurityException ignored) {}
                                    }

                                    // Enable notification on data channel
                                    BluetoothGattCharacteristic dataChar = service.getCharacteristic(CHAR_DATA_UUID);
                                    if (dataChar != null) {
                                        try {
                                            gatt.setCharacteristicNotification(dataChar, true);
                                            BluetoothGattDescriptor desc = dataChar.getDescriptor(CLIENT_CONFIG_DESCRIPTOR);
                                            if (desc != null) {
                                                desc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                                                gatt.writeDescriptor(desc);
                                            }
                                        } catch (SecurityException ignored) {}
                                    }

                                    JSObject obj = new JSObject();
                                    obj.put("address", address);
                                    obj.put("success", true);
                                    notifyListeners("peerConnected", obj);
                                }
                            }
                        }

                        @Override
                        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
                            if (CHAR_DATA_UUID.equals(characteristic.getUuid())) {
                                String payload = new String(characteristic.getValue(), StandardCharsets.UTF_8);
                                JSObject obj = new JSObject();
                                obj.put("sender", address);
                                obj.put("payload", payload);
                                notifyListeners("chunkReceived", obj);
                            }
                        }
                    },
                    BluetoothDevice.TRANSPORT_LE
            );

            JSObject ret = new JSObject();
            ret.put("initiating", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Security exception connecting to peer: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sendDataChunk(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null) {
            call.reject("Payload cannot be empty.");
            return;
        }

        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);

        try {
            // Case 1: Send from Central (Client) to Peripheral (Server)
            if (connectedGattClient != null) {
                BluetoothGattService service = connectedGattClient.getService(SERVICE_UUID);
                if (service != null) {
                    BluetoothGattCharacteristic dataChar = service.getCharacteristic(CHAR_DATA_UUID);
                    if (dataChar != null) {
                        dataChar.setValue(bytes);
                        connectedGattClient.writeCharacteristic(dataChar);
                        JSObject ret = new JSObject();
                        ret.put("sent", true);
                        call.resolve(ret);
                        return;
                    }
                }
            }

            // Case 2: Send from Peripheral (Server) to Central (Client) via notification
            if (gattServer != null && connectedRemoteDevice != null) {
                BluetoothGattService service = gattServer.getService(SERVICE_UUID);
                if (service != null) {
                    BluetoothGattCharacteristic dataChar = service.getCharacteristic(CHAR_DATA_UUID);
                    if (dataChar != null) {
                        dataChar.setValue(bytes);
                        gattServer.notifyCharacteristicChanged(connectedRemoteDevice, dataChar, false);
                        JSObject ret = new JSObject();
                        ret.put("sent", true);
                        call.resolve(ret);
                        return;
                    }
                }
            }

            call.reject("No active BLE connection to send data.");
        } catch (SecurityException e) {
            call.reject("Security exception sending data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            if (connectedGattClient != null) {
                connectedGattClient.disconnect();
                connectedGattClient.close();
                connectedGattClient = null;
            }
            if (gattServer != null && connectedRemoteDevice != null) {
                gattServer.cancelConnection(connectedRemoteDevice);
                connectedRemoteDevice = null;
            }
            JSObject ret = new JSObject();
            ret.put("disconnected", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Security exception disconnecting: " + e.getMessage());
        }
    }
}
