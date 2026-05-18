import * as SecureStore from 'expo-secure-store';

const BASE_URL_KEY = 'stockAlarm.apiBaseUrl';
const DEVICE_SESSION_KEY = 'stockAlarm.deviceSession';

export async function loadBaseUrl() {
  return SecureStore.getItemAsync(BASE_URL_KEY);
}

export async function saveBaseUrl(baseUrl) {
  await SecureStore.setItemAsync(BASE_URL_KEY, String(baseUrl || '').trim());
}

export async function loadDeviceSession() {
  const serialized = await SecureStore.getItemAsync(DEVICE_SESSION_KEY);

  if (!serialized) {
    return null;
  }

  try {
    const session = JSON.parse(serialized);

    if (!session.deviceId || !session.deviceSecret) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function saveDeviceSession(session) {
  await SecureStore.setItemAsync(DEVICE_SESSION_KEY, JSON.stringify(session));
}

export async function clearDeviceSession() {
  await SecureStore.deleteItemAsync(DEVICE_SESSION_KEY);
}
