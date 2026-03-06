// frontend/src/screens/NotificationsScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Modal,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuth } from "firebase/auth";
import NotificationListSkeleton from "../components/skeletons/NotificationListSkeleton";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const PAGE_LIMIT = 20;

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface Notification {
  id: string;
  type: "mention" | "reply" | "upvote" | "podcast_ready" | "topic_update";
  source_type: "discussion" | "podcast" | "topic" | "system";
  source_id: string;
  secondary_id?: string;
  actor_username?: string;
  title: string;
  message: string;
  preview?: string;
  action_path?: string;
  is_read: boolean;
  created_at: string;
  time_ago: string;
}

// --- API Fetching Function ---
const fetchNotifications = async ({ pageParam = 0 }: any) => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("You are not logged in.");
    
    const token = await user.getIdToken();
    if (!token) throw new Error("Failed to get authentication token.");

    const skip = pageParam * PAGE_LIMIT;
    
    const response = await fetch(
      `${API_BASE_URL}/notifications?limit=${PAGE_LIMIT}&skip=${skip}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server Error (${response.status}): ${errorText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || "Failed to connect to the server.");
  }
};

const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();

  // Bottom Sheet State (used for long-press delete now)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Selection Mode State
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isError,
    error
  } = useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || !lastPage.notifications) return undefined;
      return lastPage.notifications.length === PAGE_LIMIT ? allPages.length : undefined;
    },
    staleTime: 1000 * 60, 
  });

  const notifications = data?.pages?.reduce((acc: Notification[], page: any) => {
    if (page && Array.isArray(page.notifications)) {
      return [...acc, ...page.notifications];
    }
    return acc;
  }, []) || [];

  const unreadCount = data?.pages?.[0]?.unread_count || 0;

  // --- Mutations ---
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      return fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      return fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete notification");
      return response.json();
    },
    onSuccess: () => {
      setShowActionMenu(false);
      setSelectedNotification(null);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => Alert.alert("Error", "Could not delete notification. Please try again.")
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/notifications/bulk-delete`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ notification_ids: ids })
      });
      if (!response.ok) throw new Error("Failed to delete selected notifications");
      return response.json();
    },
    onSuccess: () => {
      setIsSelectMode(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => Alert.alert("Error", "Some notifications could not be deleted.")
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/notifications/delete-all`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete all notifications");
      return response.json();
    },
    onSuccess: () => {
      setIsSelectMode(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => Alert.alert("Error", "Failed to clear notifications.")
  });

  // --- Handlers ---
  const toggleSelectionMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSelectMode(!isSelectMode);
    setSelectedIds(new Set());
  };

  const toggleItemSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set()); 
    } else {
      const allIds = notifications.map((n: Notification) => n.id);
      setSelectedIds(new Set(allIds));
    }
  };

  const handleDynamicDelete = () => {
    if (selectedIds.size === 0) {
      Alert.alert(
        "Clear All Notifications",
        "Are you sure you want to permanently delete ALL notifications? This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete All", style: "destructive", onPress: () => deleteAllMutation.mutate() }
        ]
      );
    } else {
      Alert.alert(
        "Delete Selected",
        `Are you sure you want to delete ${selectedIds.size} notification${selectedIds.size !== 1 ? 's' : ''}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => bulkDeleteMutation.mutate(Array.from(selectedIds)) }
        ]
      );
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    if (isSelectMode) {
      toggleItemSelection(notification.id);
      return;
    }

    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    
    if (notification.source_type === "podcast") {
      (navigation as any).navigate("MainTabs", { screen: "Library" });
    } else if (notification.source_type === "discussion") {
      navigation.navigate("DiscussionDetail", {
        discussionId: notification.source_id,
      });
    } else if (notification.source_type === "topic") {
      navigation.navigate("TopicDetail", {
        topicId: notification.source_id,
      });
    }
  };

  const openActionMenu = (notification: Notification) => {
    if (isSelectMode) return;
    setSelectedNotification(notification);
    setShowActionMenu(true);
  };

  const handleDeleteSingle = () => {
    if (selectedNotification) {
      deleteNotificationMutation.mutate(selectedNotification.id);
    }
  };

  // --- Rendering Helpers ---
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "mention": return "at-circle";
      case "reply": return "chatbubble-outline";
      case "upvote": return "arrow-up-circle";
      case "podcast_ready": return "headset";
      case "topic_update": return "newspaper";
      default: return "notifications";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "mention": return "#6366F1";
      case "reply": return "#10B981";
      case "upvote": return "#F59E0B";
      case "podcast_ready": return "#8B5CF6";
      case "topic_update": return "#EC4899";
      default: return "#6B7280";
    }
  };

  const renderItem = ({ item: notification }: { item: Notification }) => {
    const isSelected = selectedIds.has(notification.id);

    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          !notification.is_read && styles.notificationCardUnread,
          isSelected && styles.notificationCardSelected
        ]}
        onPress={() => handleNotificationPress(notification)}
        onLongPress={() => openActionMenu(notification)} 
        activeOpacity={0.7}
      >
        {/* 1. Left: Selection Checkbox */}
        {isSelectMode && (
          <View style={styles.checkboxContainer}>
            <Ionicons 
              name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
              size={24} 
              color={isSelected ? "#6366F1" : "#D1D5DB"} 
            />
          </View>
        )}

        {/* 2. Left: Icon */}
        <View style={[styles.iconContainer, { backgroundColor: getNotificationColor(notification.type) + "20" }]}>
          <Ionicons name={getNotificationIcon(notification.type) as any} size={20} color={getNotificationColor(notification.type)} />
        </View>

        {/* 3. Middle: Text Content */}
        <View style={styles.notificationContent}>
          <View style={styles.titleRow}>
            <Text style={styles.notificationTitle} numberOfLines={1}>
              {notification.title || "Notification"}
            </Text>
          </View>
          <Text style={styles.notificationPreview} numberOfLines={2}>
            {notification.message || notification.preview || "You have a new update."}
          </Text>
          <View style={styles.footerRow}>
            <Text style={styles.notificationTime}>
              {notification.time_ago || "Recently"}
            </Text>
          </View>
        </View>

        {/* 4. Right: Vertical Centered Dot (MOVED HERE) */}
        {!notification.is_read && (
          <View style={styles.unreadDotContainer}>
            <View style={styles.unreadDot} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    if (isLoading) return null;
    
    if (isError) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.emptyTitle}>Failed to Load</Text>
          <Text style={styles.emptyText}>
            {error instanceof Error ? error.message : "We couldn't fetch your notifications."}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name="notifications-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Notifications</Text>
        <Text style={styles.emptyText}>
          You'll see notifications here when someone interacts with your discussions or your podcasts finish generating.
        </Text>
      </View>
    );
  };

  const isDeleting = bulkDeleteMutation.isPending || deleteAllMutation.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
        <View style={styles.placeholder} />
      </View>

      {/* PERMANENT BANNER */}
      <View style={styles.bannerContainer}>
        {isSelectMode ? (
          <>
            <Text style={styles.bannerMainText}>
              {selectedIds.size} Selected
            </Text>
            <View style={styles.bannerActionsRow}>
              <TouchableOpacity onPress={handleSelectAll} style={styles.bannerAction}>
                <Text style={styles.bannerActionText}>
                  {selectedIds.size === notifications.length && notifications.length > 0 ? "Deselect" : "Select All"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDynamicDelete} style={styles.bannerAction}>
                <Text style={[styles.bannerActionText, styles.dangerText]}>
                  {selectedIds.size === 0 ? "Delete All" : "Delete"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleSelectionMode} style={styles.bannerAction}>
                <Text style={[styles.bannerActionText, styles.bannerActionTextLast]}>Done</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.bannerMainText}>
              {unreadCount} Unread
            </Text>
            <View style={styles.bannerActionsRow}>
              <TouchableOpacity 
                onPress={() => markAllAsReadMutation.mutate()} 
                style={styles.bannerAction}
                disabled={notifications.length === 0}
              >
                <Text style={[styles.bannerActionText, notifications.length === 0 && styles.disabledText]}>
                  Mark All Read
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={toggleSelectionMode} 
                style={styles.bannerAction}
                disabled={notifications.length === 0}
              >
                <Text style={[
                  styles.bannerActionText, 
                  styles.bannerActionTextLast, 
                  notifications.length === 0 && styles.disabledText
                ]}>
                  Select
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Loading Overlay for Background Deletions */}
      {isDeleting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingOverlayText}>Deleting...</Text>
        </View>
      )}

      {isLoading && notifications.length === 0 ? (
        <NotificationListSkeleton />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id || Math.random().toString()}
          renderItem={renderItem}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={() => (
            <View style={styles.footerLoader}>
              {isFetchingNextPage && <ActivityIndicator size="small" color="#6366F1" />}
            </View>
          )}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl 
              refreshing={isRefetching && !isFetchingNextPage} 
              onRefresh={refetch} 
            />
          }
        />
      )}

      {/* --- ACTION MENU BOTTOM SHEET --- */}
      <Modal 
        visible={showActionMenu} 
        transparent 
        animationType="slide" 
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableOpacity 
          style={styles.bottomSheetOverlay} 
          activeOpacity={1} 
          onPress={() => setShowActionMenu(false)}
        >
          <View style={styles.bottomSheetContainer}>
            <View style={styles.bottomSheetHandle} />
            
            <TouchableOpacity 
              style={styles.actionSheetButton}
              onPress={handleDeleteSingle}
              disabled={deleteNotificationMutation.isPending}
            >
              {deleteNotificationMutation.isPending ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              )}
              <Text style={[styles.actionSheetText, styles.destructiveText]}>
                {deleteNotificationMutation.isPending ? "Deleting..." : "Delete Notification"}
              </Text>
            </TouchableOpacity>

            <View style={styles.actionSheetDivider} />

            <TouchableOpacity 
              style={styles.actionSheetCancel} 
              onPress={() => setShowActionMenu(false)}
            >
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  bannerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E7FF",
  },
  bannerMainText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },
  bannerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerAction: {
    paddingVertical: 4,
  },
  bannerActionText: {
    fontSize: 14,
    color: "#3c517e",
    fontWeight: "500",
    borderRightWidth: 1,
    borderColor: "#b4b4b4",
    paddingRight: 10,
  },
  bannerActionTextLast: {
    borderRightWidth: 0,
    paddingRight: 0,
  },
  dangerText: {
    color: "#EF4444",
  },
  disabledText: {
    color: "#D1D5DB",
  },
  content: {
    flex: 1,
  },
  notificationCard: {
    flexDirection: "row",
    alignItems: "center", 
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  notificationContent: {
    flex: 1, 
  },
  unreadDotContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    width: 20, 
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 5,
    backgroundColor: "#6366F1",
    bottom: 4,
  },
  notificationCardUnread: {
    backgroundColor: "#FAFBFF",
  },
  notificationCardSelected: {
    backgroundColor: "#EEF2FF",
  },
  checkboxContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    marginTop: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginRight: 8,
  },
  notificationPreview: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 8,
    lineHeight: 14,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  emptyState: {
    paddingTop: 100,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  footerLoader: {
    paddingVertical: 20,
  },
  loadingOverlay: {
    position: "absolute",
    top: 135, 
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingOverlayText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },

  // --- BOTTOM SHEET STYLES ---
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  actionSheetButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  actionSheetText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  destructiveText: {
    color: "#EF4444",
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 8,
  },
  actionSheetCancel: {
    paddingVertical: 16,
    alignItems: "center",
  },
  actionSheetCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
});

export default NotificationsScreen;