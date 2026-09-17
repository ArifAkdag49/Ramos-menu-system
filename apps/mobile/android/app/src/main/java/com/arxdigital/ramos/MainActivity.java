package com.arxdigital.ramos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Yerel eklentiler köprü kurulmadan (super.onCreate) önce kaydedilmeli.
        registerPlugin(RamosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
