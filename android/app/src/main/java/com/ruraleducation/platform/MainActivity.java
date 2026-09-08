package com.ruraleducation.platform;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothP2PPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
