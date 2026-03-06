// frontend/src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import ProfileSettings from "../components/ProfileSettings";
import ProfileScreenSkeleton from "../components/skeletons/ProfileScreenSkeleton";
import { useAudio } from "../contexts/AudioContext";
import { useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const ProfileScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const { stopPlayback } = useAudio();
  const queryClient = useQueryClient();
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    podcasts: 0,
    discussions: 0,
    upvotes: 0,
  });

  useEffect(() => {
    fetchProfileData();
  }, []);

  const getAuthToken = async () => {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();

      // Fetch Profile
      const profileRes = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        setUserProfile(await profileRes.json());
      } else if (profileRes.status === 404) {
        // Create profile if missing
        const newProfileRes = await fetch(`${API_BASE_URL}/users/profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (newProfileRes.ok) setUserProfile(await newProfileRes.json());
      }

      // Fetch Stats
      const statsRes = await fetch(`${API_BASE_URL}/users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats({
          podcasts: data.podcasts || 0,
          discussions: data.discussions || 0,
          upvotes: data.upvotes || 0,
        });
      }
    } catch (error) {
      console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await stopPlayback(); 
            queryClient.clear(); 
            await signOut(auth);
          } catch (error) {
            Alert.alert("Error", "Failed to logout");
          }
        },
      },
    ]);
  };

  if (loading) return <ProfileScreenSkeleton />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

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

        {/* Encapsulated Settings Logic */}
        <ProfileSettings 
          userProfile={userProfile} 
          onProfileUpdated={fetchProfileData} 
        />

        <View style={styles.footer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#F9FAFB", 
    marginBottom: 70,
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
  footer: { 
    height: 40,
  },
});

export default ProfileScreen;