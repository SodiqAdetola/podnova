// frontend/src/screens/NotificationsScreen.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuth } from "firebase/auth";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";
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
    // ✅ FIXED: Using Firebase to get the fresh token
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
    staleTime: 1000 * 60, // Cache for 1 minute
  });

  const notifications = data?.pages?.reduce((acc: Notification[], page: any) => {
    if (page && Array.isArray(page.notifications)) {
      return [...acc, ...page.notifications];
    }
    return acc;
  }, []) || [];

  const unreadCount = data?.pages?.[0]?.unread_count || 0;

  // --- Mutations for Marking as Read ---
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      // ✅ FIXED: Using Firebase for mutation tokens too
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      return fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      // ✅ FIXED: Using Firebase for mutation tokens too
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      return fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleNotificationPress = (notification: Notification) => {
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "mention": return "at-circle";
      case "reply": return "chatbubble";
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

  const renderItem = ({ item: notification }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        !notification.is_read && styles.notificationCardUnread,
      ]}
      onPress={() => handleNotificationPress(notification)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: getNotificationColor(notification.type) + "20" },
        ]}
      >
        <Ionicons
          name={getNotificationIcon(notification.type) as any}
          size={24}
          color={getNotificationColor(notification.type)}
        />
      </View>

      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle}>
          {notification.title || "Notification"}
        </Text>
        <Text style={styles.notificationPreview} numberOfLines={2}>
          {notification.message || notification.preview || "You have a new update."}
        </Text>
        <Text style={styles.notificationTime}>
          {notification.time_ago || "Recently"}
        </Text>
      </View>

      {!notification.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

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

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PODNOVA NOTIFICATIONS</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={() => markAllAsReadMutation.mutate()}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadText}>
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

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
  markAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },
  placeholder: {
    width: 80,
  },
  unreadBanner: {
    backgroundColor: "#EEF2FF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E7FF",
  },
  unreadText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6366F1",
  },
  content: {
    flex: 1,
  },
  notificationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  notificationCardUnread: {
    backgroundColor: "#FAFBFF",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  notificationPreview: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366F1",
    marginLeft: 8,
    marginTop: 8,
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
});

export default NotificationsScreen;