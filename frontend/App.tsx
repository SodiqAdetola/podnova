import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from "./src/contexts/AuthContext";
import { AudioProvider } from "./src/contexts/AudioContext";
import RootNavigator from "./src/Navigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AudioProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </AudioProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}