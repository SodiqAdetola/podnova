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
import CategoryTopicsScreen from "./screens/CategoryTopics";
import TopicDetailScreen from "./screens/TopicDetail";

// Auth stack
export type AuthStackParamList = {
    Login: undefined;
    Register: undefined;
};

// Bottom tab navigator (main 5 tabs)
export type MainTabParamList = {
    Home: undefined;
    Search: undefined;
    Create: undefined;
    Library: undefined;
    Profile: undefined;
};

// Main stack (includes tabs + detail screens)
export type MainStackParamList = {
    MainTabs: undefined;
    CategoryTopics: { category: string };
    TopicDetail: { topicId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// Auth screens
const AuthStackNavigator: React.FC = () => (
    <AuthStack.Navigator>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
);

// Bottom tabs (5 main screens)
const MainTabsNavigator: React.FC = () => (
    <MainTabs.Navigator>
        <MainTabs.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <MainTabs.Screen name="Search" component={SearchScreen} />
        <MainTabs.Screen name="Create" component={CreateScreen} />
        <MainTabs.Screen name="Library" component={LibraryScreen} />
        <MainTabs.Screen name="Profile" component={ProfileScreen} />
    </MainTabs.Navigator>
);

// Main stack (tabs + detail screens)
const MainStackNavigator: React.FC = () => (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
        <MainStack.Screen name="MainTabs" component={MainTabsNavigator} />
        <MainStack.Screen name="CategoryTopics" component={CategoryTopicsScreen} />
        <MainStack.Screen name="TopicDetail" component={TopicDetailScreen} />
    </MainStack.Navigator>
);

const Navigator: React.FC = () => {
    const { user } = useAuth();

    return (
        <NavigationContainer>
            {user ? <MainStackNavigator /> : <AuthStackNavigator />}
        </NavigationContainer>
    );
};

export default Navigator;