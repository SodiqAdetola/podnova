import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from "./src/contexts/AuthContext";
import { AudioProvider } from "./src/contexts/AudioContext";
import RootNavigator from "./src/Navigator";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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