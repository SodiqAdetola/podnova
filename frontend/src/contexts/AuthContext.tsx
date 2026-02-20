// frontend/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { View, ActivityIndicator } from 'react-native';

type AuthContextProps = {
    user: User | null;
    loading: boolean; // Export loading state
}

const AuthContext = createContext<AuthContextProps>({ user: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log("Setting up auth state listener");
        
        const unsubscribe = onAuthStateChanged(auth, 
            (firebaseUser) => {
                console.log("Auth state changed:", firebaseUser ? `User ${firebaseUser.email} logged in` : "No user");
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

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                <ActivityIndicator size="large" color="#6366F1" />
            </View>
        );
    }

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);