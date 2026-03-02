// frontend/src/Navigator.tsx
import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "./contexts/AuthContext";
import { useAudio } from "./contexts/AudioContext";
import LoginScreen from "./screens/Login";
import RegisterScreen from "./screens/Register";
import ProfileScreen from "./screens/Profile";
import CreateScreen from "./screens/Create";
import LibraryScreen from "./screens/Library";
import SearchScreen from "./screens/Search";
import HomeScreen from "./screens/Home";
import CategoryTopicsScreen from "./screens/CategoryTopics";
import TopicDetailScreen from "./screens/TopicDetail";
import NotificationsScreen from "./screens/Notification";
import DiscussionDetailScreen from "./screens/DiscussionDetailScreen";
import MiniPlayer from "./components/MiniPlayer";
import PodcastPlayer from "./components/PodcastPlayer";

/* -------------------- TYPES -------------------- */

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Create: undefined;
  Library: undefined;
  Profile: undefined;
  CategoryTopics: { category: string };
};

export type MainStackParamList = {
  MainTabs: undefined;
  TopicDetail: { topicId: string };
  Notifications: undefined;
  DiscussionDetail: { discussionId: string };
  Library: undefined;
};

/* -------------------- NAVIGATORS -------------------- */

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

/* -------------------- ICON MAP -------------------- */

const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home: ["home", "home-outline"],
  Search: ["search", "search-outline"],
  Create: ["add", "add"],
  Library: ["library", "library-outline"],
  Profile: ["person", "person-outline"],
};

/* -------------------- AUTH STACK -------------------- */

const AuthStackNavigator: React.FC = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
  </AuthStack.Navigator>
);

/* -------------------- CUSTOM CREATE TAB -------------------- */

const CreateTabButton = ({ children, onPress }: any) => (
  <TouchableOpacity
    style={styles.createButtonWrapper}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={styles.createButton}>{children}</View>
  </TouchableOpacity>
);

/* -------------------- MAIN TABS NAVIGATOR -------------------- */

const MainTabsNavigator: React.FC = () => {
  return (
    <MainTabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: "#6366F1",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarIcon: ({ focused, color }) => {
          if (route.name === "Home") {
            const [activeIcon, inactiveIcon] = TAB_ICONS.Home;
            return <Ionicons name={focused ? activeIcon : inactiveIcon} size={24} color={color} />;
          } else if (route.name === "Search") {
            const [activeIcon, inactiveIcon] = TAB_ICONS.Search;
            return <Ionicons name={focused ? activeIcon : inactiveIcon} size={24} color={color} />;
          } else if (route.name === "Create") {
            return <Ionicons name="add" size={28} color="#FFFFFF" />;
          } else if (route.name === "Library") {
            const [activeIcon, inactiveIcon] = TAB_ICONS.Library;
            return <Ionicons name={focused ? activeIcon : inactiveIcon} size={24} color={color} />;
          } else if (route.name === "Profile") {
            const [activeIcon, inactiveIcon] = TAB_ICONS.Profile;
            return <Ionicons name={focused ? activeIcon : inactiveIcon} size={24} color={color} />;
          }
          return null;
        },
      })}
    >
      <MainTabs.Screen name="Home" component={HomeScreen} />
      <MainTabs.Screen name="Search" component={SearchScreen} />
      <MainTabs.Screen
        name="Create"
        component={CreateScreen}
        options={{ tabBarButton: (props) => <CreateTabButton {...props} /> }}
      />
      <MainTabs.Screen name="Library" component={LibraryScreen} />
      <MainTabs.Screen name="Profile" component={ProfileScreen} />
      <MainTabs.Screen 
        name="CategoryTopics" 
        component={CategoryTopicsScreen}
        options={{ tabBarItemStyle: { display: 'none' }, tabBarButton: () => null }}
      />
    </MainTabs.Navigator>
  );
};

/* -------------------- STACK NAVIGATOR -------------------- */

const MainStackNavigator: React.FC = () => {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="MainTabs" component={MainTabsNavigator} />
      <MainStack.Screen name="TopicDetail" component={TopicDetailScreen} />
      <MainStack.Screen name="Notifications" component={NotificationsScreen} />  
      <MainStack.Screen name="DiscussionDetail" component={DiscussionDetailScreen} /> 
    </MainStack.Navigator>
  );
};

/* -------------------- ROOT OVERLAY -------------------- */

// Define which screens actually display the bottom tab bar
const SCREENS_WITH_TAB_BAR = [
  "Home", 
  "Search", 
  "Create", 
  "Library", 
  "Profile", 
  "CategoryTopics"
];

const RootAppOverlay: React.FC = () => {
  const { user } = useAuth();
  const { showPlayer, currentPodcast } = useAudio();
  
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string>("Home");
  
  // Navigation Ref allows us to track route changes globally
  const navigationRef = useNavigationContainerRef();

  const shouldShowMiniPlayer = showPlayer && !showFullPlayer && currentPodcast;
  
  // Check if the current screen is one of our tab screens
  const hasTabBar = SCREENS_WITH_TAB_BAR.includes(currentRouteName);

  return (
    <View style={{ flex: 1 }}>
      {/* Navigation Layer */}
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? "Home");
        }}
        onStateChange={() => {
          setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? "Home");
        }}
      >
        {user ? <MainStackNavigator /> : <AuthStackNavigator />}
      </NavigationContainer>

      {/* Global Mini Player Layer - Now aware of the tab bar! */}
      {shouldShowMiniPlayer && (
        <MiniPlayer 
          onExpand={() => setShowFullPlayer(true)} 
          hasTabBar={hasTabBar} 
        />
      )}

      {/* Global Full Player Modal Layer */}
      {showFullPlayer && currentPodcast && (
        <PodcastPlayer
          visible={showFullPlayer}
          podcast={currentPodcast}
          onClose={() => setShowFullPlayer(false)}
          isSaved={false}
          onToggleSave={() => {}}
        />
      )}
    </View>
  );
};

export default RootAppOverlay;

/* -------------------- STYLES -------------------- */

const styles = StyleSheet.create({
  tabBar: {
    height: 70,
    paddingBottom: 5,
    paddingTop: 5,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    elevation: 8,
    zIndex: 10,
    position: 'absolute',
    bottom: 0,
    left: 10,
    right: 10,
    borderRadius: 35,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  createButtonWrapper: {
    top: -15,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  createButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});