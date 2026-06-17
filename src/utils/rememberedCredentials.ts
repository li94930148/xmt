const REMEMBER_KEY = 'xmt_login_remember';
const USERNAME_KEY = 'xmt_login_username';
const PASSWORD_CIPHER_KEY = 'xmt_login_password_cipher_v1';
const PASSWORD_KEY_MATERIAL = 'xmt_login_password_key_v1';

type RememberedCredentials = {
  remember: boolean;
  username: string;
  password: string;
};

type PasswordCredentialConstructor = new (data: {
  id: string;
  password: string;
  name?: string;
}) => Credential;

function getCredentialConstructor() {
  return (window as Window & {
    PasswordCredential?: PasswordCredentialConstructor;
  }).PasswordCredential;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getPasswordKey() {
  const cryptoApi = window.crypto?.subtle;
  if (!cryptoApi) {
    throw new Error('Web Crypto unavailable');
  }

  const savedKey = localStorage.getItem(PASSWORD_KEY_MATERIAL);
  if (savedKey) {
    return cryptoApi.importKey('raw', base64ToBytes(savedKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(PASSWORD_KEY_MATERIAL, bytesToBase64(rawKey));
  return cryptoApi.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptPassword(password: string) {
  const cryptoApi = window.crypto?.subtle;
  if (!cryptoApi) {
    return '';
  }

  const key = await getPasswordKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(password);
  const encrypted = await cryptoApi.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptPassword(ciphertext: string) {
  const cryptoApi = window.crypto?.subtle;
  if (!cryptoApi || !ciphertext) {
    return '';
  }

  const [ivBase64, payloadBase64] = ciphertext.split('.');
  if (!ivBase64 || !payloadBase64) {
    return '';
  }

  const key = await getPasswordKey();
  const decrypted = await cryptoApi.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(payloadBase64),
  );
  return new TextDecoder().decode(decrypted);
}

async function storeCredential(username: string, password: string) {
  const credentialsApi = navigator.credentials;
  const PasswordCredential = getCredentialConstructor();
  if (!credentialsApi || !PasswordCredential || !window.isSecureContext) {
    return;
  }

  try {
    const credential = new PasswordCredential({ id: username, password, name: username });
    await credentialsApi.store(credential);
  } catch {
    // Ignore unsupported browser credential store failures.
  }
}

async function loadCredentialPassword(username: string) {
  const credentialsApi = navigator.credentials;
  if (!credentialsApi || !window.isSecureContext) {
    return '';
  }

  try {
    const credential = await credentialsApi.get({
      password: true,
      mediation: 'silent',
    } as CredentialRequestOptions);

    if (
      credential &&
      'id' in credential &&
      'password' in credential &&
      typeof credential.id === 'string' &&
      typeof credential.password === 'string' &&
      credential.id === username
    ) {
      return credential.password;
    }
  } catch {
    // Ignore unsupported browser credential read failures.
  }

  return '';
}

export async function loadRememberedCredentials(): Promise<RememberedCredentials> {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY) === 'true';
    const username = remember ? localStorage.getItem(USERNAME_KEY) || '' : '';
    if (!remember || !username) {
      return { remember: false, username: '', password: '' };
    }

    const credentialPassword = await loadCredentialPassword(username);
    if (credentialPassword) {
      return { remember, username, password: credentialPassword };
    }

    const cipher = localStorage.getItem(PASSWORD_CIPHER_KEY) || '';
    const password = cipher ? await decryptPassword(cipher) : '';
    return { remember, username, password };
  } catch {
    return { remember: false, username: '', password: '' };
  }
}

export async function persistRememberedCredentials(remember: boolean, username: string, password: string) {
  if (!remember) {
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(PASSWORD_CIPHER_KEY);
    return;
  }

  localStorage.setItem(REMEMBER_KEY, 'true');
  localStorage.setItem(USERNAME_KEY, username);

  if (!password) {
    localStorage.removeItem(PASSWORD_CIPHER_KEY);
    return;
  }

  await storeCredential(username, password);
  const cipher = await encryptPassword(password);
  if (cipher) {
    localStorage.setItem(PASSWORD_CIPHER_KEY, cipher);
  }
}
