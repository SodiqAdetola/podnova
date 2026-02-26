// frontend/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { View, ActivityIndicator } from 'react-native';

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