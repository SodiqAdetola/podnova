import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { useAuth } from "./contexts/AuthContext";
import LoginScreen from "./screens/Login";
import RegisterScreen from "./screens/Register";
import ProfileScreen from "./screens/Profile";
import CreateScreen from "./screens/Create";
import LibraryScreen from "./screens/Library";
import SearchScreen from "./screens/Search";
import HomeScreen from "./screens/Home";


// route names & parameters for for Auth stack
export type AuthStackParamList = {
    Login: undefined;
    Register: undefined;
};

// route names & parameters for main app stack
export type MainStackParamList = {
    Home: undefined;
    Search: undefined;
    Create: undefined;
    Library: undefined;
    Profile: undefined;
};

// navigator components with their type info
// Auth stack for login & registration
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
// Main app stack for logged in users
const MainStack = createBottomTabNavigator<MainStackParamList>();

// Auth stack navigator component for login & registration screens
const AuthStackNavigator: React.FC = () => (
    <AuthStack.Navigator>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
);

// Main app stack navigator component for main app screens
const MainStackNavigator: React.FC = () => (
    <MainStack.Navigator>
        <MainStack.Screen name="Home" component={HomeScreen} />
        <MainStack.Screen name="Search" component={SearchScreen} />
        <MainStack.Screen name="Create" component={CreateScreen} />
        <MainStack.Screen name="Library" component={LibraryScreen} />
        <MainStack.Screen name="Profile" component={ProfileScreen} />
    </MainStack.Navigator>
);

const Navigator: React.FC = () => {
    // get user authentication status from AuthContext
    const { user } = useAuth();

    return (
        <NavigationContainer>
            {user ? <MainStackNavigator /> : <AuthStackNavigator />}
        </NavigationContainer>
    );
};

export default Navigator;
