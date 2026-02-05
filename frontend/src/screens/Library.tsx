// frontend/src/screens/LibraryScreen.tsx

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../firebase/config";
import { useFocusEffect } from "@react-navigation/native";
import { File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudio } from "../contexts/AudioContext";
import PodcastPlayer from "../components/PodcastPlayer";
import { Podcast, TabType, PodcastLibraryResponse } from "../types/podcasts";

const STORAGE_KEYS = {
  DOWNLOADS: "@podnova_downloads",
  SAVED: "@podnova_saved",
};

const LibraryScreen: React.FC = () => {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [downloadedPodcasts, setDownloadedPodcasts] = useState<Set<string>>(new Set());
  const [savedPodcasts, setSavedPodcasts] = useState<Set<string>>(new Set());
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [downloadingPodcasts, setDownloadingPodcasts] = useState<Set<string>>(new Set());
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  
  const { loadPodcast, showPlayer, currentPodcast } = useAudio();
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const previousPodcastCount = useRef<number>(0);

  useEffect(() => {
    loadLocalData();
  }, []);

  const loadLocalData = async () => {
    try {
      const [downloads, saved] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADS),
        AsyncStorage.getItem(STORAGE_KEYS.SAVED),
      ]);

      if (downloads) setDownloadedPodcasts(new Set(JSON.parse(downloads)));
      if (saved) setSavedPodcasts(new Set(JSON.parse(saved)));
    } catch (error) {
      console.error("Error loading local data:", error);
    }
  };

  const fetchPodcasts = async (isRefresh = false, silent = false) => {
    try {
      if (!silent && !isRefresh && !hasInitiallyLoaded) {
        setLoading(true);
      }

      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return;

      const response = await fetch(
        "https://podnova-backend-r8yz.onrender.com/podcasts/library",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data: PodcastLibraryResponse = await response.json();
      if (response.ok) {
        const newPodcasts = data.podcasts || [];
        
        if (previousPodcastCount.current > 0 && newPodcasts.length > previousPodcastCount.current) {
          const completedCount = newPodcasts.filter(p => p.status === 'completed').length;
          const previousCompletedCount = podcasts.filter(p => p.status === 'completed').length;
          
          if (completedCount > previousCompletedCount) {
            console.log('New podcast completed!');
          }
        }
        
        previousPodcastCount.current = newPodcasts.length;
        setPodcasts(newPodcasts);
        setHasInitiallyLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching podcasts:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchPodcasts(false, hasInitiallyLoaded);
      
      return () => {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
      };
    }, [hasInitiallyLoaded])
  );

  useEffect(() => {
    const hasGenerating = podcasts.some((p) =>
      ["pending", "generating_script", "generating_audio", "uploading"].includes(p.status)
    );

    if (hasGenerating) {
      if (!pollingInterval.current) {
        pollingInterval.current = setInterval(() => {
          fetchPodcasts(false, true);
        }, 5000);
      }
    } else {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    }

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [podcasts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPodcasts(true);
  };

  const downloadPodcast = async (podcast: Podcast) => {
    if (!podcast.audio_url) {
      Alert.alert("Error", "Audio not available for download");
      return;
    }

    try {
      setDownloadingPodcasts((prev) => new Set(prev).add(podcast.id));
      setActiveMenu(null);

      const destination = new File(Paths.cache, `podcast_${podcast.id}.mp3`);
      
      const downloadedFile = await File.downloadFileAsync(
        podcast.audio_url,
        destination,
        { idempotent: true }
      );

      if (downloadedFile.exists) {
        const newDownloads = new Set(downloadedPodcasts).add(podcast.id);
        setDownloadedPodcasts(newDownloads);
        await AsyncStorage.setItem(
          STORAGE_KEYS.DOWNLOADS,
          JSON.stringify([...newDownloads])
        );
        Alert.alert("Success", "Podcast downloaded for offline listening");
      }
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert("Error", "Failed to download podcast");
    } finally {
      setDownloadingPodcasts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(podcast.id);
        return newSet;
      });
    }
  };

  const deletePodcast = async (podcast: Podcast) => {
    Alert.alert(
      "Delete Podcast",
      "Are you sure you want to delete this podcast? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setActiveMenu(null);
              const token = await auth.currentUser?.getIdToken(true);
              if (!token) return;

              const response = await fetch(
                `https://podnova-backend-r8yz.onrender.com/podcasts/${podcast.id}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              if (response.ok) {
                if (downloadedPodcasts.has(podcast.id)) {
                  try {
                    const file = new File(Paths.cache, `podcast_${podcast.id}.mp3`);
                    if (file.exists) {
                      file.delete();
                    }
                  } catch (e) {
                    console.error("Error deleting local file:", e);
                  }
                  
                  const newDownloads = new Set(downloadedPodcasts);
                  newDownloads.delete(podcast.id);
                  setDownloadedPodcasts(newDownloads);
                  await AsyncStorage.setItem(
                    STORAGE_KEYS.DOWNLOADS,
                    JSON.stringify([...newDownloads])
                  );
                }

                if (savedPodcasts.has(podcast.id)) {
                  const newSaved = new Set(savedPodcasts);
                  newSaved.delete(podcast.id);
                  setSavedPodcasts(newSaved);
                  await AsyncStorage.setItem(
                    STORAGE_KEYS.SAVED,
                    JSON.stringify([...newSaved])
                  );
                }

                setPodcasts(prev => prev.filter(p => p.id !== podcast.id));
              }
            } catch (error) {
              console.error("Delete error:", error);
              Alert.alert("Error", "Failed to delete podcast");
            }
          },
        },
      ]
    );
  };

  const toggleSaved = async (podcastId: string) => {
    try {
      setActiveMenu(null);
      const newSaved = new Set(savedPodcasts);
      
      if (newSaved.has(podcastId)) {
        newSaved.delete(podcastId);
      } else {
        newSaved.add(podcastId);
      }
      
      setSavedPodcasts(newSaved);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify([...newSaved]));
    } catch (error) {
      console.error("Error toggling saved:", error);
    }
  };

  const handlePlayPodcast = (podcast: Podcast) => {
    if (podcast.status !== "completed" || !podcast.audio_url) {
      Alert.alert("Not Available", "This podcast is not ready to play yet.");
      return;
    }
    
    // Load podcast into global audio context
    loadPodcast(podcast);
    
    // Show full player (mini player will show when this is closed)
    setShowFullPlayer(true);
  };

  const completedPodcasts = podcasts.filter(p => p.status === "completed");
  const hasGenerating = podcasts.some(p => 
    ["pending", "generating_script", "generating_audio", "uploading"].includes(p.status)
  );

  const filteredPodcasts = completedPodcasts.filter((podcast) => {
    if (activeTab === "downloads") return downloadedPodcasts.has(podcast.id);
    if (activeTab === "saved") return savedPodcasts.has(podcast.id);
    return true;
  });

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "Unknown";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      finance: "#3B82F6",
      technology: "#EF4444",
      politics: "#8B5CF6",
    };
    return colors[category?.toLowerCase()] || "#6366F1";
  };

  const renderMenu = (podcast: Podcast) => {
    if (activeMenu !== podcast.id) return null;

    const isDownloaded = downloadedPodcasts.has(podcast.id);
    const isSaved = savedPodcasts.has(podcast.id);

    return (
      <Modal
        visible={true}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveMenu(null)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setActiveMenu(null)}
        >
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle} numberOfLines={2}>
              {podcast.topic_title}
            </Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => toggleSaved(podcast.id)}
            >
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={22}
                color={isSaved ? "#F59E0B" : "#374151"}
              />
              <Text style={styles.menuItemText}>
                {isSaved ? "Remove from Saved" : "Save for Later"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => downloadPodcast(podcast)}
              disabled={isDownloaded}
            >
              <Ionicons
                name={isDownloaded ? "checkmark-circle" : "download-outline"}
                size={22}
                color={isDownloaded ? "#10B981" : "#374151"}
              />
              <Text style={[styles.menuItemText, isDownloaded && styles.menuItemTextDisabled]}>
                {isDownloaded ? "Already Downloaded" : "Download"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => deletePodcast(podcast)}
            >
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                Delete Podcast
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setActiveMenu(null)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderPodcastCard = ({ item }: { item: Podcast }) => {
    const isDownloaded = downloadedPodcasts.has(item.id);
    const isSaved = savedPodcasts.has(item.id);
    const isDownloading = downloadingPodcasts.has(item.id);

    return (
      <>
        <TouchableOpacity 
          style={styles.podcastCard} 
          activeOpacity={0.7}
          onPress={() => handlePlayPodcast(item)}
        >
          <View style={styles.cardContent}>
            <View
              style={[styles.thumbnail, { backgroundColor: getCategoryColor(item.category) }]}
            >
              <Ionicons name="musical-notes" size={28} color="#FFFFFF" />
            </View>

            <View style={styles.podcastInfo}>
              <Text style={styles.podcastTitle} numberOfLines={2}>
                {item.topic_title}
              </Text>

              <View style={styles.metaRow}>
                <Text style={styles.duration}>
                  {formatDuration(item.duration_seconds)}
                </Text>
                <Text style={styles.metaDivider}>•</Text>
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>

              <View style={styles.tagsRow}>
                <View
                  style={[
                    styles.categoryTag,
                    { backgroundColor: getCategoryColor(item.category) + "20" },
                  ]}
                >
                  <Text
                    style={[styles.categoryText, { color: getCategoryColor(item.category) }]}
                  >
                    {item.category}
                  </Text>
                </View>

                {isDownloaded && (
                  <View style={styles.downloadBadge}>
                    <Ionicons name="download" size={12} color="#10B981" />
                  </View>
                )}

                {isSaved && (
                  <View style={styles.savedBadge}>
                    <Ionicons name="bookmark" size={12} color="#F59E0B" />
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity 
              style={styles.playButton}
              onPress={() => handlePlayPodcast(item)}
            >
              <Ionicons name="play" size={24} color="#6366F1" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuButton}
              onPress={(e) => {
                e.stopPropagation();
                setActiveMenu(item.id);
              }}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {renderMenu(item)}
      </>
    );
  };

  const renderEmptyState = () => {
    let message = "No podcasts yet";
    let subtitle = "Generate your first podcast from the Discover tab!";
    let icon: keyof typeof Ionicons.glyphMap = "folder-open-outline";

    if (activeTab === "downloads") {
      message = "No downloads";
      subtitle = "Downloaded podcasts will appear here for offline listening";
      icon = "download-outline";
    } else if (activeTab === "saved") {
      message = "No saved podcasts";
      subtitle = "Bookmark podcasts to save them for later";
      icon = "bookmark-outline";
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name={icon} size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>{message}</Text>
        <Text style={styles.emptySubtitle}>{subtitle}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Library</Text>
        <TouchableOpacity onPress={() => fetchPodcasts(true)} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "all" && styles.activeTab]}
          onPress={() => setActiveTab("all")}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>
            All
          </Text>
          {activeTab === "all" && <View style={styles.activeTabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "downloads" && styles.activeTab]}
          onPress={() => setActiveTab("downloads")}
        >
          <Text style={[styles.tabText, activeTab === "downloads" && styles.activeTabText]}>
            Downloads
          </Text>
          {activeTab === "downloads" && <View style={styles.activeTabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "saved" && styles.activeTab]}
          onPress={() => setActiveTab("saved")}
        >
          <Text style={[styles.tabText, activeTab === "saved" && styles.activeTabText]}>
            Saved
          </Text>
          {activeTab === "saved" && <View style={styles.activeTabIndicator} />}
        </TouchableOpacity>
      </View>

      {hasGenerating && (
        <View style={styles.generatingBanner}>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={styles.generatingText}>Generating podcast...</Text>
        </View>
      )}

      {loading && !hasInitiallyLoaded ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading your library...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPodcasts}
          renderItem={renderPodcastCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            filteredPodcasts.length === 0 && styles.emptyListContent,
            showPlayer && styles.listContentWithPlayer,
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6366F1"
              colors={["#6366F1"]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Full Player - shown when clicking a podcast */}
      <PodcastPlayer
        visible={showFullPlayer}
        podcast={currentPodcast}
        onClose={() => setShowFullPlayer(false)}
        isSaved={currentPodcast ? savedPodcasts.has(currentPodcast.id) : false}
        onToggleSave={() => {
          if (currentPodcast) {
            toggleSaved(currentPodcast.id);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    position: "relative",
  },
  activeTab: {},
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  activeTabText: {
    color: "#6366F1",
    fontWeight: "600",
  },
  activeTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#6366F1",
  },
  generatingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#F3E8FF",
    gap: 10,
  },
  generatingText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B21A8",
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: "center",
  },
  listContentWithPlayer: {
    paddingBottom: 80,
  },
  podcastCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  podcastInfo: {
    flex: 1,
  },
  podcastTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  duration: {
    fontSize: 13,
    color: "#6B7280",
  },
  metaDivider: {
    fontSize: 13,
    color: "#D1D5DB",
    marginHorizontal: 6,
  },
  dateText: {
    fontSize: 13,
    color: "#6B7280",
  },
  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  downloadBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#D1FAE5",
    justifyContent: "center",
    alignItems: "center",
  },
  savedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  menuButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: "#374151",
    fontWeight: "500",
  },
  menuItemTextDisabled: {
    color: "#9CA3AF",
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    marginTop: 8,
  },
  menuItemTextDanger: {
    color: "#EF4444",
  },
  menuCancel: {
    marginTop: 12,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
});

export default LibraryScreen;