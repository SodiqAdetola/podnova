// frontend/src/components/ProfileSettings.tsx
import React, { useState } from "react";
import { 
  View, 
  LayoutAnimation, 
  Alert, 
  ActivityIndicator, 
  StyleSheet, 
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { getAuth, deleteUser } from "firebase/auth";
import { useAudio } from "../contexts/AudioContext";
import { useQueryClient } from "@tanstack/react-query";
import SettingsList, { SettingItem, SettingsSection } from "./lists/SettingsList";
import VoiceSelector from "./modals/VoiceSelectorModal";
import AIStyleSelector from "./modals/StyleSelectorModal";
import PodcastLengthSelector from "./modals/LengthSelectorModal";
import BlockedUsersModal from "./modals/BlockedUserModal";
import { Ionicons } from "@expo/vector-icons";

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
  
  // --- Account Deletion State ---
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

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
      onProfileUpdated(); 
    } catch (error) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update preferences.");
    } finally {
      setUpdating(false);
    }
  };

  // --- API LOGIC FOR ACCOUNT DELETION ---
  const confirmDeleteIntent = () => {
    setDeleteConfirmationText("");
    setShowDeleteModal(true);
  };

  const executeAccountDeletion = async () => {
    if (deleteConfirmationText !== "DELETE") return;

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
      setShowDeleteModal(false);
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
          onPress: confirmDeleteIntent, // Triggers the modal instead of an alert
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

      {/* --- ACCOUNT DELETION MODAL --- */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboardWrapper}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="warning" style={styles.modalIcon} color="#EF4444" />
              </View>
              <Text style={styles.modalTitle}>Delete Account?</Text>
              <Text style={styles.modalWarningText}>
                This action is irreversible. All your podcasts, discussions, saved items, and settings will be permanently erased.
              </Text>
              
              <Text style={styles.modalInstructionText}>
                To confirm, type <Text style={styles.boldText}>DELETE</Text> below:
              </Text>
              
              <TextInput
                style={styles.deleteInput}
                value={deleteConfirmationText}
                onChangeText={setDeleteConfirmationText}
                placeholder="Type DELETE"
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => setShowDeleteModal(false)}
                  disabled={updating}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.deleteButton, 
                    deleteConfirmationText !== "DELETE" && styles.deleteButtonDisabled
                  ]} 
                  onPress={executeAccountDeletion}
                  disabled={deleteConfirmationText !== "DELETE" || updating}
                >
                  {updating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {updating && !showDeleteModal && (
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
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalKeyboardWrapper: {
    width: "100%",
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  modalIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalIcon: {
    fontSize: 28,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  modalWarningText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalInstructionText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  boldText: {
    fontWeight: "700",
    color: "#111827",
  },
  deleteInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    marginBottom: 24,
    textAlign: "center",
    fontWeight: "600",
    letterSpacing: 2,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4B5563",
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonDisabled: {
    backgroundColor: "#FCA5A5", // Faded red when disabled
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default ProfileSettings;