// frontend/App.tsx
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from "./src/contexts/AuthContext";
import { AudioProvider } from "./src/contexts/AudioContext";
import RootNavigator from "./src/Navigator";

// 1. PERSIST PROVIDER AND YOUR CUSTOM CACHING SETUP
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from './src/queryClient';

// EXPO NOTIFICATIONS
import * as Notifications from 'expo-notifications';

// CONFIGURE FOREGROUND NOTIFICATIONS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // Keeps compatibility with older Androids
    shouldPlaySound: true,   // Plays the notification ping sound
    shouldSetBadge: true,    // Updates the red dot on the app icon
    shouldShowBanner: true,  // Forces the drop-down banner on iOS/Android
    shouldShowList: true,    // Keeps it in the notification center history
  }),
});

export default function App() {
  return (
    <SafeAreaProvider>
      {/* 2. APP WRAPPED IN THE PERSISTENT QUERY PROVIDER */}
      <PersistQueryClientProvider 
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <AuthProvider>
          <AudioProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </AudioProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}