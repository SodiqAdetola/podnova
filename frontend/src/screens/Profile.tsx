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
  Image,
  ActivityIndicator,
  Modal,
  TextInput
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import ProfileScreenSkeleton from "../components/skeletons/ProfileScreenSkeleton";
import SettingsModal from "../components/modals/SettingsModal";
import { useAudio } from "../contexts/AudioContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { LinearGradient } from "expo-linear-gradient";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type ProfileNavProp = NativeStackNavigationProp<MainStackParamList>;

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileNavProp>();
  const [loading, setLoading] = useState(true);
  const { stopPlayback } = useAudio();
  const queryClient = useQueryClient();
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [stats, setStats] = useState({ podcasts: 0, discussions: 0, upvotes: 0 });

  // Modals State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingDiscussion, setEditingDiscussion] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const getAuthToken = async () => {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  const { data: followedTopics, isLoading: loadingFollowed } = useQuery({
    queryKey: ['followedTopics'],
    queryFn: async () => {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE_URL}/users/followed-topics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch followed topics");
      const data = await res.json();
      return data.topics || [];
    }
  });

  const { data: myDiscussions, isLoading: loadingDiscussions } = useQuery({
    queryKey: ['myDiscussions', auth.currentUser?.uid],
    queryFn: async () => {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE_URL}/discussions?author_id=${auth.currentUser?.uid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch discussions");
      const data = await res.json();
      return data.discussions || [];
    },
    enabled: !!auth.currentUser?.uid
  });

  useEffect(() => {
    fetchProfileData(); // Initial load is NOT silent
  }, []);

  // 👈 ADDED 'silent' PARAMETER TO PREVENT MODAL JITTER
  const fetchProfileData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = await getAuthToken();

      const profileRes = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        setUserProfile(await profileRes.json());
      } else if (profileRes.status === 404) {
        const newProfileRes = await fetch(`${API_BASE_URL}/users/profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (newProfileRes.ok) setUserProfile(await newProfileRes.json());
      }

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
      if (!silent) setLoading(false);
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

  const openEditModal = (discussion: any) => {
    setEditingDiscussion(discussion);
    setEditTitle(discussion.title);
    setEditDescription(discussion.description);
  };

  const submitEdit = async () => {
    if (!editTitle.trim() || !editDescription.trim()) {
      Alert.alert("Error", "Title and description cannot be empty.");
      return;
    }
    setIsSubmittingEdit(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE_URL}/discussions/${editingDiscussion.id}`, {
        method: "PATCH",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim()
        })
      });

      if (!res.ok) throw new Error("Failed to edit");
      
      queryClient.invalidateQueries({ queryKey: ['myDiscussions'] });
      setEditingDiscussion(null);
    } catch (error) {
      Alert.alert("Error", "Could not save your edits.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteDiscussion = (id: string) => {
    Alert.alert("Delete Discussion", "Are you sure? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getAuthToken();
            const res = await fetch(`${API_BASE_URL}/discussions/${id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to delete");
            queryClient.invalidateQueries({ queryKey: ['myDiscussions'] });
            fetchProfileData(true); // Silent refresh
          } catch (error) {
            Alert.alert("Error", "Could not delete discussion.");
          }
        }
      }
    ]);
  };

  const getCategoryFallback = (category?: string) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('tech')) return { colors: ['#FDA4A3', '#F16365'], icon: 'hardware-chip-outline' };
    if (cat.includes('finance')) return { colors: ['#A5CFF4', '#73AEF2'], icon: 'trending-up-outline' };
    if (cat.includes('politic')) return { colors: ['#A78BFA', '#8B5CF6'], icon: 'business-outline' };
    return { colors: ['#818CF8', '#4F46E5'], icon: 'newspaper-outline' }; 
  };

  if (loading) return <ProfileScreenSkeleton />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.brandName}>PODNOVA PROFILE</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setShowSettingsModal(true)} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={24} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
              <Ionicons name="log-out-outline" size={24} color="#6366F1" />
            </TouchableOpacity>
          </View>
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

        <View style={styles.followedSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Topics You Follow</Text>
            <Ionicons name="notifications" size={18} color="#F59E0B" />
          </View>

          {loadingFollowed ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          ) : followedTopics && followedTopics.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicsScroll}>
              {followedTopics.map((topic: any) => {
                const fallback = getCategoryFallback(topic.category);
                return (
                  <TouchableOpacity 
                    key={topic.id} 
                    style={styles.topicCard}
                    onPress={() => navigation.navigate("TopicDetail", { topicId: topic.id })}
                    activeOpacity={0.8}
                  >
                    {topic.image_url ? (
                      <Image source={{ uri: topic.image_url }} style={styles.topicImage} />
                    ) : (
                      <LinearGradient
                        colors={fallback.colors as [string, string]}
                        style={styles.topicImagePlaceholder}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <Ionicons name={fallback.icon as any} size={28} color="#FFFFFF" />
                      </LinearGradient>
                    )}
                    <View style={styles.topicCardContent}>
                      <Text style={styles.topicCardTitle} numberOfLines={2}>{topic.title}</Text>
                      <Text style={styles.topicCardTime}>Updated {topic.time_ago}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>You are not following any topics yet.</Text>
            </View>
          )}
        </View>

        <View style={styles.followedSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Discussions</Text>
            <Ionicons name="chatbubbles" size={18} color="#10B981" />
          </View>

          {loadingDiscussions ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          ) : myDiscussions && myDiscussions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicsScroll}>
              {myDiscussions.map((disc: any) => (
                <View key={disc.id} style={[styles.topicCard, { width: 220 }]}>
                  <TouchableOpacity 
                    style={styles.discCardBody}
                    onPress={() => navigation.navigate("DiscussionDetail", { discussionId: disc.id })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.discCardHeader}>
                      <Text style={styles.topicCardTitle} numberOfLines={2}>{disc.title}</Text>
                    </View>
                    <Text style={styles.topicCardTime}>{disc.reply_count} Replies • {disc.time_ago}</Text>
                  </TouchableOpacity>

                  <View style={styles.discCardActions}>
                    <TouchableOpacity style={styles.discActionBtn} onPress={() => openEditModal(disc)}>
                      <Ionicons name="pencil" size={14} color="#6B7280" />
                      <Text style={styles.discActionText}>Edit</Text>
                    </TouchableOpacity>
                    <View style={styles.discActionDiv} />
                    <TouchableOpacity style={styles.discActionBtn} onPress={() => handleDeleteDiscussion(disc.id)}>
                      <Ionicons name="trash" size={14} color="#EF4444" />
                      <Text style={[styles.discActionText, { color: "#EF4444" }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="create-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>You haven't started any discussions.</Text>
            </View>
          )}
        </View>

        <View style={styles.footer} />
      </ScrollView>

      {/* ENCAPSULATED SETTINGS MODAL */}
      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        userProfile={userProfile}
        onProfileUpdated={() => fetchProfileData(true)} // 👈 SILENT REFRESH TRUE
      />

      {/* EDIT DISCUSSION MODAL */}
      <Modal
        visible={!!editingDiscussion}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditingDiscussion(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Discussion</Text>
              <TouchableOpacity onPress={() => setEditingDiscussion(null)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Discussion Title"
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, { height: 100 }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="What do you want to discuss?"
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={submitEdit}
              disabled={isSubmittingEdit}
            >
              {isSubmittingEdit ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconButton: {
    padding: 4,
  },
  scrollView: { 
    flex: 1,
  },
  userSection: { 
    backgroundColor: "#FFFFFF", 
    paddingVertical: 32, 
    paddingHorizontal: 20, 
    alignItems: "center", 
    marginBottom: 12,
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
  followedSection: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 20,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  loadingContainer: {
    paddingVertical: 30,
    alignItems: "center",
  },
  topicsScroll: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  topicCard: {
    width: 160,
    marginRight: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  topicImage: {
    width: "100%",
    height: 90,
  },
  topicImagePlaceholder: {
    width: "100%",
    height: 90,
    justifyContent: "center",
    alignItems: "center",
  },
  topicCardContent: {
    padding: 12,
  },
  topicCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 18,
    marginBottom: 6,
    height: 36, 
  },
  topicCardTime: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  
  discCardBody: {
    padding: 14,
    minHeight: 85,
  },
  discCardHeader: {
    marginBottom: 8,
  },
  discCardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#F9FAFB',
  },
  discActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  discActionDiv: {
    width: 1,
    backgroundColor: '#E5E7EB',
  },
  discActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  footer: { 
    height: 40,
  },

  // Edit Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: "50%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
  saveButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  }
});

export default ProfileScreen;