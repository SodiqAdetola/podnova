import react, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { View, ActivityIndicator } from 'react-native';

//Authentication context interface set to being User or null
type AuthContextProps = {
    user: User | null;
}

// Default value for authentication context as null
const AuthContext = createContext<AuthContextProps>({ user: null });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    // make user state available throughout the app
    <AuthContext.Provider value={{ user }}>
        {children}
    </AuthContext.Provider>);
};

export const useAuth = () => useContext(AuthContext);