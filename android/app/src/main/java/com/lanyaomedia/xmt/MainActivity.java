package com.lanyaomedia.xmt;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(SecureCredentialPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
