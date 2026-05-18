import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    throw new Error('웹에서는 모바일 푸시 토큰을 만들 수 없습니다.');
  }

  const permission = await requestNotificationPermission();

  if (!permission.granted) {
    throw new Error('푸시 알림 권한이 필요합니다.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('stock-alerts', {
      name: 'Stock Alarm',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a9e6e'
    });
  }

  const projectId = getExpoProjectId();
  const result = await Notifications.getExpoPushTokenAsync(
    projectId
      ? {
          projectId
        }
      : undefined
  );

  return result.data;
}

async function requestNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();

  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return {
      granted: true
    };
  }

  return Notifications.requestPermissionsAsync();
}

function getExpoProjectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.manifest2?.extra?.expoClient?.extra?.eas?.projectId ||
    ''
  );
}
