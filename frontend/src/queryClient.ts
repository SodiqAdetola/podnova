import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Configure the Query Client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // gcTime (Garbage Collection Time): How long unused data stays in the cache.
      // Set to 24 hours. This means if a user opens the app tomorrow, 
      // yesterday's data is still there to show instantly.
      gcTime: 1000 * 60 * 60 * 24, 
      
      // staleTime: How long data is considered "fresh" before it needs to be refetched.
      // Set to 2 minutes. This prevents the app from spamming your API if the user
      // switches back and forth between tabs quickly.
      staleTime: 1000 * 60 * 2, 
      
      // Retry failed requests once before showing an error UI
      retry: 1,
    },
  },
});

// 2. Configure the Persister to use React Native's AsyncStorage
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // Optional: You can throttle how often the cache writes to disk to save battery
  throttleTime: 1000, 
});