// frontend/src/components/ProfileSettings.tsx
import React, { useState } from "react";
import { View, LayoutAnimation, Alert, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getAuth, deleteUser } from "firebase/auth";
import { useAudio } from "../contexts/AudioContext";
import { useQueryClient } from "@tanstack/react-query";
import SettingsList, { SettingItem, SettingsSection } from "./lists/SettingsList";
import VoiceSelector from "./modals/VoiceSelectorModal";
import AIStyleSelector from "./modals/StyleSelectorModal";
import PodcastLengthSelector from "./modals/LengthSelectorModal";
import BlockedUsersModal from "./modals/BlockedUserModal";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

interface ProfileSettingsProps { 
  userProfile: any;
  onProfileUpdated: () => void;
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ userProfile, onProfileUpdated }) => {
  const [updating, setUpdating] = useState(false);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [showAIStyleSelector, setShowAIStyleSelector] = useState(false);
  const [showLengthSelector, setShowLengthSelector] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);

  const { stopPlayback } = useAudio();
  const queryClient = useQueryClient();

  const prefs = userProfile?.preferences || {};

  const getAuthToken = async () => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  // --- API LOGIC FOR PREFERENCES ---
  const updatePreference = async (updates: any) => {
    try {
      setUpdating(true);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/users/preferences`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to update");
      onProfileUpdated(); // Tell parent to fetch new data so UI stays in sync
    } catch (error) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update preferences.");
    } finally {
      setUpdating(false);
    }
  };

  // --- API LOGIC FOR ACCOUNT DELETION ---
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you absolutely sure? This will permanently delete your profile, podcasts, discussions, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete My Account", 
          style: "destructive",
          onPress: async () => {
            try {
              setUpdating(true);
              const auth = getAuth();
              const user = auth.currentUser;
              if (!user) return;

              const token = await user.getIdToken(true);
              
              const response = await fetch(`${API_BASE_URL}/users/account`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });

              if (!response.ok) throw new Error("Failed to delete backend data");

              await stopPlayback();
              queryClient.clear();
              await deleteUser(user);
              
            } catch (error: any) {
              console.error("Account deletion error:", error);
              if (error.code === 'auth/requires-recent-login') {
                Alert.alert(
                  "Authentication Required", 
                  "For security reasons, please log out and log back in before deleting your account."
                );
              } else {
                Alert.alert("Error", "Could not delete account. Please try again later.");
              }
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  const formatVoiceName = (voice: string) => voice.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const formatAIStyleName = (style: string) => style.charAt(0).toUpperCase() + style.slice(1);
  const formatLengthName = (length: string) => {
    const map: any = { short: "Short (5 min)", medium: "Medium (10 min)", long: "Long (20 min)" };
    return map[length] || "Medium (10 min)";
  };

  const settingsSections: SettingsSection[] = [
    {
      title: "Preferences",
      items: [
        {
          id: "push_notifications",
          type: "toggle",
          title: "Push Notifications",
          icon: "notifications",
          iconColor: "#6366F1",
          value: prefs.push_notifications ?? true,
          onToggle: (v: boolean) => updatePreference({ push_notifications: v }),
          subItems: [
            {
              id: "push_podcast_ready",
              type: "toggle",
              title: "Podcast Generation",
              value: prefs.push_podcast_ready ?? true,
              onToggle: (v: boolean) => updatePreference({ push_podcast_ready: v }),
            },
            {
              id: "push_reply",
              type: "toggle",
              title: "Message Replies",
              value: prefs.push_reply ?? true,
              onToggle: (v: boolean) => updatePreference({ push_reply: v }),
            },
            {
              id: "push_topic_update",
              type: "toggle",
              title: "Topic Updates",
              value: prefs.push_topic_update ?? true,
              onToggle: (v: boolean) => updatePreference({ push_topic_update: v }),
            },
          ]
        },
      ],
    },
    {
      title: "Podcast Defaults",
      items: [
        {
          id: "default_voice",
          type: "navigation",
          title: "Default Voice",
          icon: "mic",
          iconColor: "#8B5CF6",
          value: prefs.default_voice ? formatVoiceName(prefs.default_voice) : "Calm Female",
          onPress: () => setShowVoiceSelector(true),
        },
        {
          id: "default_ai_style",
          type: "navigation",
          title: "AI Style",
          icon: "sparkles",
          iconColor: "#6366F1",
          value: prefs.default_ai_style ? formatAIStyleName(prefs.default_ai_style) : "Standard",
          onPress: () => setShowAIStyleSelector(true),
        },
        {
          id: "default_length",
          type: "navigation",
          title: "Default Length",
          icon: "time",
          iconColor: "#F59E0B",
          value: prefs.default_podcast_length ? formatLengthName(prefs.default_podcast_length) : "Medium",
          onPress: () => setShowLengthSelector(true),
        },
      ],
    },
    {
      title: "Privacy & Account",
      items: [
        {
          id: "blocked_users",
          type: "navigation",
          title: "Blocked Users",
          icon: "shield",
          iconColor: "#F59E0B",
          onPress: () => setShowBlockedUsers(true),
        },
        {
          id: "delete_account",
          type: "action",
          title: "Delete Account",
          subtitle: "Permanently remove all your data",
          icon: "warning",
          iconColor: "#EF4444",
          destructive: true,
          showChevron: false,
          onPress: handleDeleteAccount, 
        },
      ],
    },
  ];

  return (
    <View>
      <SettingsList sections={settingsSections} />

      <VoiceSelector
        visible={showVoiceSelector}
        currentVoice={prefs.default_voice}
        onClose={() => setShowVoiceSelector(false)}
        onUpdate={(v) => updatePreference({ default_voice: v })}
      />
      <AIStyleSelector
        visible={showAIStyleSelector}
        currentStyle={prefs.default_ai_style}
        onClose={() => setShowAIStyleSelector(false)}
        onUpdate={(v) => updatePreference({ default_ai_style: v })}
      />
      <PodcastLengthSelector
        visible={showLengthSelector}
        currentLength={prefs.default_podcast_length}
        onClose={() => setShowLengthSelector(false)}
        onUpdate={(v) => updatePreference({ default_podcast_length: v })}
      />
      <BlockedUsersModal 
        visible={showBlockedUsers} 
        onClose={() => setShowBlockedUsers(false)} 
      />

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
  updateOverlay: { 
    position: "absolute", 
    top: -80, 
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
});

export default ProfileSettings;