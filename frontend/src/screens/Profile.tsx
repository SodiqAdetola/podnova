// frontend/src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import ProfileSettings from "../components/ProfileSettings";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const ProfileScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    podcasts: 0,
    discussions: 0,
    upvotes: 0,
  });

  useEffect(() => {
    loadUserProfile();
    loadStats();
  }, []);

  const getAuthToken = async () => {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 404) {
        await createUserProfile();
        return;
      }

      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const createUserProfile = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
      }
    } catch (error) {
      console.error("Error creating profile:", error);
    }
  };

  const loadStats = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStats({
          podcasts: data.podcasts || 0,
          discussions: data.discussions || 0,
          upvotes: data.upvotes || 0,
        });
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const updatePreference = async (updates: any) => {
    try {
      setUpdating(true);
      
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          preferences: { ...userProfile.preferences, ...updates },
        });
      }

      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/users/preferences`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to update");
    } catch (error) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update preferences. Reverting changes.");
      loadUserProfile();
    } finally {
      setUpdating(false);
    }
  };

  // Restored Logout logic
  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { 
        text: "Cancel", 
        style: "cancel" 
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (error) {
            Alert.alert("Error", "Failed to logout");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Restored Header with Logout Button */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.brandName}>PODNOVA PROFILE</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.userSection}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={48} color="#FFFFFF" />
          </View>
          <Text style={styles.userName}>{userProfile?.username || "User"}</Text>
          <Text style={styles.userEmail}>{userProfile?.email || ""}</Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.podcasts}</Text>
              <Text style={styles.statLabel}>Podcasts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.discussions}</Text>
              <Text style={styles.statLabel}>Discussions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.upvotes}</Text>
              <Text style={styles.statLabel}>Upvotes</Text>
            </View>
          </View>
        </View>

        <ProfileSettings 
          userProfile={userProfile} 
          onUpdatePreference={updatePreference} 
        />

        <View style={styles.footer} />
      </ScrollView>

      {updating && (
        <View style={styles.updateOverlay}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={styles.updateText}>Updating...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: 70,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  scrollView: {
    flex: 1,
  },
  userSection: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3d424d",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
  },
  updateOverlay: {
    position: "absolute",
    top: 100,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  updateText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  footer: {
    height: 40,
  },
});

export default ProfileScreen;