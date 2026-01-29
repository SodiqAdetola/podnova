import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

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
};

export type MainStackParamList = {
  MainTabs: undefined;
  CategoryTopics: { category: string };
  TopicDetail: { topicId: string };
};

/* -------------------- NAVIGATORS -------------------- */

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

/* -------------------- ICON MAP -------------------- */

const TAB_ICONS: Record<
  keyof MainTabParamList,
  [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]
> = {
  Home: ["home", "home-outline"],
  Search: ["search", "search-outline"],
  Create: ["add", "add"],
  Library: ["library", "library-outline"],
  Profile: ["person", "person-outline"],
};

/* -------------------- AUTH STACK -------------------- */

const AuthStackNavigator: React.FC = () => (
  <AuthStack.Navigator>
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

/* -------------------- MAIN TABS -------------------- */

const MainTabsNavigator: React.FC = () => (
  <MainTabs.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarShowLabel: false,
      tabBarStyle: styles.tabBar,
      tabBarActiveTintColor: "#6366F1",
      tabBarInactiveTintColor: "#9CA3AF",
      tabBarIcon: ({ focused, color, size }) => {
        const [activeIcon, inactiveIcon] = TAB_ICONS[route.name as keyof MainTabParamList];

        return (
          <Ionicons
            name={focused ? activeIcon : inactiveIcon}
            size={24}
            color={color}
          />
        );
      },
    })}
  >
    <MainTabs.Screen name="Home" component={HomeScreen} />
    <MainTabs.Screen name="Search" component={SearchScreen} />

    {/* CENTER CREATE BUTTON */}
    <MainTabs.Screen
      name="Create"
      component={CreateScreen}
      options={{
        tabBarIcon: () => (
          <Ionicons name="add" size={28} color="#FFFFFF" />
        ),
        tabBarButton: (props) => <CreateTabButton {...props} />,
      }}
    />

    <MainTabs.Screen name="Library" component={LibraryScreen} />
    <MainTabs.Screen name="Profile" component={ProfileScreen} />
  </MainTabs.Navigator>
);

/* -------------------- MAIN STACK -------------------- */

const MainStackNavigator: React.FC = () => (
  <MainStack.Navigator screenOptions={{ headerShown: false }}>
    <MainStack.Screen name="MainTabs" component={MainTabsNavigator} />
    <MainStack.Screen name="CategoryTopics" component={CategoryTopicsScreen} />
    <MainStack.Screen name="TopicDetail" component={TopicDetailScreen} />
  </MainStack.Navigator>
);

/* -------------------- ROOT -------------------- */

const Navigator: React.FC = () => {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      {user ? <MainStackNavigator /> : <AuthStackNavigator />}
    </NavigationContainer>
  );
};

export default Navigator;

/* -------------------- STYLES -------------------- */

const styles = StyleSheet.create({
  tabBar: {
    height: 80,
    paddingBottom: 0,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0,
    elevation: 10,
  },
  createButtonWrapper: {
    top: -15,
    justifyContent: "center",
    alignItems: "center",
  },
  createButton: {
    width: 50,
    height: 50,
    borderRadius: 30,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
});
