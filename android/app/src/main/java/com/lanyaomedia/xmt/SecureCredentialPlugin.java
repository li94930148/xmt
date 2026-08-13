package com.lanyaomedia.xmt;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores refresh credentials encrypted with an Android Keystore AES-GCM key. */
@CapacitorPlugin(name = "SecureCredential")
public class SecureCredentialPlugin extends Plugin {
  private static final String KEY_ALIAS = "xmt_mobile_refresh_v1";
  private static final String STORE = "xmt_secure_credentials";

  @PluginMethod
  public void set(PluginCall call) {
    String key = call.getString("key"); String value = call.getString("value");
    if (key == null || value == null) { call.reject("key 和 value 为必填项"); return; }
    try { preferences().edit().putString(key, encrypt(value)).apply(); call.resolve(); }
    catch (Exception error) { call.reject("安全凭据保存失败", error); }
  }

  @PluginMethod
  public void get(PluginCall call) {
    String key = call.getString("key"); if (key == null) { call.reject("key 为必填项"); return; }
    try { JSObject result = new JSObject(); String stored = preferences().getString(key, null); result.put("value", stored == null ? null : decrypt(stored)); call.resolve(result); }
    catch (Exception error) { call.reject("安全凭据读取失败", error); }
  }

  @PluginMethod
  public void remove(PluginCall call) { String key = call.getString("key"); if (key == null) { call.reject("key 为必填项"); return; } preferences().edit().remove(key).apply(); call.resolve(); }

  private SharedPreferences preferences() { return getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE); }
  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
    if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
    return generator.generateKey();
  }
  private String encrypt(String value) throws Exception { Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key()); return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP); }
  private String decrypt(String value) throws Exception { String[] parts = value.split(":", 2); if (parts.length != 2) throw new IllegalArgumentException("invalid credential"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))); return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8); }
}
