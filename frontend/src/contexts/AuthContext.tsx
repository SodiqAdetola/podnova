// frontend/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { View, ActivityIndicator, Platform } from 'react-native';

// --- NEW IMPORTS FOR PUSH NOTIFICATIONS ---
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type AuthContextProps = {
    user: User | null;
    loading: boolean;
    getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextProps>({ 
    user: null, 
    loading: true,
    getToken: async () => null 
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // --- PUSH NOTIFICATION SYNC FUNCTION ---
    const syncPushToken = async (firebaseUser: User) => {
        try {
            if (!Device.isDevice) {
                console.log("Must use physical device for Push Notifications");
                return;
            }
            // 1. Check existing permissions (Silent)
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            // 2. Only ask if we haven't asked before (Shows native pop-up)
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            // 3. If they denied, stop here.
            if (finalStatus !== 'granted') {
                console.log("Push permission denied");
                return;
            }
            // 4. Get the Expo Push Token
            const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
            if (!projectId) {
                console.log("Missing Project ID in app.json for push notifications");
                return;
            }
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            const expoPushToken = tokenData.data;
            // 5. Send token to your backend
            const authToken = await firebaseUser.getIdToken();
            await fetch(`${API_BASE_URL}/users/push-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ token: expoPushToken })
            });
            
            console.log("✅ Push token synced with backend:", expoPushToken);

            // (Android specific config)
            if (Platform.OS === 'android') {
                Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#6366F1',
                });
            }
        } catch (error) {
            console.error("❌ Error setting up push notifications:", error);
        }
    };
    // ---------------------------------------

    useEffect(() => {
        console.log("Setting up auth state listener");
        
        const unsubscribe = onAuthStateChanged(auth, 
            async (firebaseUser) => {
                console.log("Auth state changed:", firebaseUser ? `User ${firebaseUser.email} logged in` : "No user");
                
                if (firebaseUser) {
                    // Force token refresh on auth state change
                    try {
                        await firebaseUser.getIdToken(true);
                        console.log("Token refreshed");
                        
                        // NEW: Fire the push token sync now that we have a verified user!
                        syncPushToken(firebaseUser);
                    } catch (error) {
                        console.error("Error refreshing token:", error);
                    }
                }
                
                setUser(firebaseUser);
                setLoading(false);
            },
            (error) => {
                console.error("Auth state change error:", error);
                setLoading(false);
            }
        );

        // Check current user immediately
        const currentUser = auth.currentUser;
        console.log("Current user on mount:", currentUser?.email);

        return () => {
            console.log("Cleaning up auth listener");
            unsubscribe();
        };
    }, []);

    const getToken = async (): Promise<string | null> => {
        if (!user) return null;
        try {
            return await user.getIdToken();
        } catch (error) {
            console.error("Error getting token:", error);
            return null;
        }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                <ActivityIndicator size="large" color="#6366F1" />
            </View>
        );
    }

    return (
        <AuthContext.Provider value={{ user, loading, getToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);