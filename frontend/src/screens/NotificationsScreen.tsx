// frontend/src/screens/NotificationsScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface Notification {
  id: string;
  type: "mention" | "reply" | "upvote";
  discussion_id: string;
  reply_id?: string;
  actor_user_id: string;
  actor_username: string;
  preview: string;
  is_read: boolean;
  created_at: string;
  time_ago: string;
}

const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      
      if (!token) {
        console.log("No auth token found");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/discussions/notifications/list`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      
      const response = await fetch(
        `${API_BASE_URL}/discussions/notifications/${notificationId}/read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        // Update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      
      const response = await fetch(
        `${API_BASE_URL}/discussions/notifications/read-all`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }

    // Navigate to discussion
    navigation.navigate("DiscussionDetail", {
      discussionId: notification.discussion_id,
    });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "mention":
        return "at-circle";
      case "reply":
        return "chatbubble";
      case "upvote":
        return "arrow-up-circle";
      default:
        return "notifications";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "mention":
        return "#6366F1";
      case "reply":
        return "#10B981";
      case "upvote":
        return "#F59E0B";
      default:
        return "#6B7280";
    }
  };

  const getNotificationText = (notification: Notification) => {
    switch (notification.type) {
      case "mention":
        return `${notification.actor_username} mentioned you in a discussion`;
      case "reply":
        return `${notification.actor_username} replied to your discussion`;
      case "upvote":
        return `${notification.actor_username} upvoted your discussion`;
      default:
        return "New notification";
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Podnova Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllAsRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {unreadCount === 0 && <View style={styles.placeholder} />}
      </View>

      {/* Unread count badge */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadText}>
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {/* Notifications list */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="notifications-outline"
              size={64}
              color="#D1D5DB"
            />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyText}>
              You'll see notifications here when someone mentions you or replies
              to your discussions
            </Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
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
                  {
                    backgroundColor: getNotificationColor(notification.type) + "20",
                  },
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
                  {getNotificationText(notification)}
                </Text>
                <Text style={styles.notificationPreview} numberOfLines={2}>
                  {notification.preview}
                </Text>
                <Text style={styles.notificationTime}>
                  {notification.time_ago}
                </Text>
              </View>

              {!notification.is_read && (
                <View style={styles.unreadDot} />
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
    fontSize: 18,
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
});

export default NotificationsScreen;