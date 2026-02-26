// frontend/src/screens/ProfileScreen.tsx - PRODUCTION READY
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import VoiceSelector from "../components/VoiceSelector";
import AIStyleSelector from "../components/AIStyleSelector";
import PodcastLengthSelector from "../components/PodcastLengthSelector";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

interface UserPreferences {
  default_categories: string[];
  default_podcast_length: string;
  default_tone: string;
  push_notifications: boolean;
  default_voice: string;
  default_ai_style: string;
}

interface UserProfile {
  id: string;
  firebase_uid: string;
  email: string;
  full_name: string;
  preferences: UserPreferences;
}

const ProfileScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState({
    podcasts: 0,
    discussions: 0,
    upvotes: 0,
  });

  const [pushNotifications, setPushNotifications] = useState(true);
  
  // Modal states
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [showAIStyleSelector, setShowAIStyleSelector] = useState(false);
  const [showLengthSelector, setShowLengthSelector] = useState(false);

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
        const profile: UserProfile = await response.json();
        setUserProfile(profile);
        setPushNotifications(profile.preferences.push_notifications);
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
        const profile: UserProfile = await response.json();
        setUserProfile(profile);
        setPushNotifications(profile.preferences.push_notifications);
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

  const updatePreference = async (updates: Partial<UserPreferences>) => {
    try {
      setUpdating(true);
      const token = await getAuthToken();

      const response = await fetch(`${API_BASE_URL}/users/preferences`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        if (userProfile) {
          setUserProfile({
            ...userProfile,
            preferences: {
              ...userProfile.preferences,
              ...updates,
            },
          });
        }
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update preference");
      
      if (userProfile) {
        setPushNotifications(userProfile.preferences.push_notifications);
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    setPushNotifications(value);
    await updatePreference({ push_notifications: value });
  };

  const handleVoiceUpdate = (voice: string) => {
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        preferences: {
          ...userProfile.preferences,
          default_voice: voice,
        },
      });
    }
  };

  const handleAIStyleUpdate = (style: string) => {
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        preferences: {
          ...userProfile.preferences,
          default_ai_style: style,
        },
      });
    }
  };

  const handleLengthUpdate = (length: string) => {
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        preferences: {
          ...userProfile.preferences,
          default_podcast_length: length,
        },
      });
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
            await signOut(auth);
          } catch (error) {
            Alert.alert("Error", "Failed to logout");
          }
        },
      },
    ]);
  };

  const formatVoiceName = (voice: string) => {
    return voice
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const formatAIStyleName = (style: string) => {
    return style.charAt(0).toUpperCase() + style.slice(1);
  };

  const formatLengthName = (length: string) => {
    const lengthMap: Record<string, string> = {
      short: "Short (5 min)",
      medium: "Medium (10 min)",
      long: "Long (20 min)",
    };
    return lengthMap[length] || "Medium (10 min)";
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

      {/* Header*/}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.brandName}>PODNOVA PROFILE</Text>
          <Ionicons name="log-out-outline" size={24} color="#6366F1" onPress={handleLogout} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* User Info */}
        <View style={styles.userSection}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={48} color="#FFFFFF" />
          </View>

          <Text style={styles.userName}>{userProfile?.full_name || "User"}</Text>
          <Text style={styles.userEmail}>{userProfile?.email || ""}</Text>

          {/* Stats */}
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

        {/* Preferences */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="settings" size={18} color="#6B7280" />
            <Text style={styles.sectionTitle}>Preferences</Text>
          </View>

          <View style={styles.settingsCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: "#6366F115" }]}>
                  <Ionicons name="notifications" size={20} color="#6366F1" />
                </View>
                <Text style={styles.settingTitle}>Push Notifications</Text>
              </View>
              <Switch
                value={pushNotifications}
                onValueChange={handleNotificationToggle}
                disabled={updating}
                trackColor={{ false: "#D1D5DB", true: "#A78BFA" }}
                thumbColor={pushNotifications ? "#6366F1" : "#F3F4F6"}
              />
            </View>
          </View>
        </View>

        {/* Voice & AI */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={18} color="#6B7280" />
            <Text style={styles.sectionTitle}>Podcast Defaults</Text>
          </View>

          <View style={styles.settingsCard}>
            {/* Voice */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowVoiceSelector(true)}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: "#8B5CF615" }]}>
                  <Ionicons name="mic" size={20} color="#8B5CF6" />
                </View>
                <Text style={styles.settingTitle}>Default Voice</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.valueText}>
                  {userProfile?.preferences?.default_voice
                    ? formatVoiceName(userProfile.preferences.default_voice)
                    : "Calm Female"}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* AI Style */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowAIStyleSelector(true)}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: "#6366F115" }]}>
                  <Ionicons name="sparkles" size={20} color="#6366F1" />
                </View>
                <Text style={styles.settingTitle}>AI Style</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.valueText}>
                  {userProfile?.preferences?.default_ai_style
                    ? formatAIStyleName(userProfile.preferences.default_ai_style)
                    : "Standard"}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Podcast Length */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowLengthSelector(true)}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: "#F59E0B15" }]}>
                  <Ionicons name="time" size={20} color="#F59E0B" />
                </View>
                <Text style={styles.settingTitle}>Default Length</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.valueText}>
                  {userProfile?.preferences?.default_podcast_length
                    ? formatLengthName(userProfile.preferences.default_podcast_length)
                    : "Medium (10 min)"}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <View style={styles.settingsCard}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Alert.alert("PodNova", "Version 1.0.0\n\nAI-powered news podcasts")}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: "#6B728015" }]}>
                  <Ionicons name="information-circle" size={20} color="#6B7280" />
                </View>
                <Text style={styles.settingTitle}>About PodNova</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer} />
      </ScrollView>

      {/* Modals */}
      {userProfile && (
        <>
          <VoiceSelector
            visible={showVoiceSelector}
            currentVoice={userProfile.preferences.default_voice}
            onClose={() => setShowVoiceSelector(false)}
            onUpdate={handleVoiceUpdate}
          />

          <AIStyleSelector
            visible={showAIStyleSelector}
            currentStyle={userProfile.preferences.default_ai_style}
            onClose={() => setShowAIStyleSelector(false)}
            onUpdate={handleAIStyleUpdate}
          />

          <PodcastLengthSelector
            visible={showLengthSelector}
            currentLength={userProfile.preferences.default_podcast_length}
            onClose={() => setShowLengthSelector(false)}
            onUpdate={handleLengthUpdate}
          />
        </>
      )}

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
  logoutButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
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
    color: "#111827",
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
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingsCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  valueText: {
    fontSize: 15,
    color: "#6B7280",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 60,
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
    shadowOffset: { width: 0, height: 2 },
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