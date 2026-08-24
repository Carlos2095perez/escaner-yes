package com.nuvo.validador;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NuvoScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
