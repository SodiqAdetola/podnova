// frontend/App.tsx
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from "./src/contexts/AuthContext";
import { AudioProvider } from "./src/contexts/AudioContext";
import RootNavigator from "./src/Navigator";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 1. IMPORT EXPO NOTIFICATIONS
import * as Notifications from 'expo-notifications';

// 2. CONFIGURE FOREGROUND NOTIFICATIONS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // Keeps compatibility with older Androids
    shouldPlaySound: true,   // Plays the notification ping sound
    shouldSetBadge: true,    // Updates the red dot on the app icon
    shouldShowBanner: true,  // Forces the drop-down banner on iOS/Android
    shouldShowList: true,    // Keeps it in the notification center history
  }),
});

// Create a client
const queryClient = new QueryClient();

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AudioProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </AudioProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}