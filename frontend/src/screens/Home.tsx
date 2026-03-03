// frontend/src/screens/Home.tsx
import React from "react";
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
import { Category, Topic } from "../types/topics";
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getAuth } from "firebase/auth";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type HomeScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  technology: "hardware-chip-outline",
  finance: "cash-outline",
  politics: "people-outline",
};

// --- API Fetching Functions ---
const fetchCategories = async (): Promise<Category[]> => {
  const res = await fetch(`${API_BASE_URL}/topics/categories`);
  const data = await res.json();
  return data.categories || data || [];
};

const fetchRecentTopics = async (categories: Category[]): Promise<Topic[]> => {
  if (!categories || categories.length === 0) return [];
  
  const topicsPromises = categories.map((cat) =>
    fetch(`${API_BASE_URL}/topics/categories/${cat.name}?sort_by=latest`)
      .then((res) => res.json())
      .then((data) => data.topics || data || [])
      .catch(() => [])
  );

  const allTopics = await Promise.all(topicsPromises);
  const flatTopics = allTopics.flat();
  
  return flatTopics
    .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
    .slice(0, 5);
};

// NEW: Lightweight fetch just for the unread count
const fetchUnreadCount = async (): Promise<number> => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return 0;
    
    const token = await user.getIdToken();
    if (!token) return 0;

    // We only need 1 item to get the unread_count from the payload
    const response = await fetch(`${API_BASE_URL}/notifications?limit=1&skip=0`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) return 0;
    const data = await response.json();
    return data.unread_count || 0;
  } catch (error) {
    return 0;
  }
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  const { 
    data: categories = [], 
    isLoading: isLoadingCategories,
    refetch: refetchCategories
  } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 1000 * 60 * 5,
  });

  const { 
    data: recentTopics = [], 
    isLoading: isLoadingTopics,
    isRefetching,
    refetch: refetchTopics
  } = useQuery({
    queryKey: ['recentTopics', categories],
    queryFn: () => fetchRecentTopics(categories),
    enabled: categories.length > 0,
    staleTime: 1000 * 60 * 2,
  });

  // NEW: Query for the unread badge counter
  const { data: unreadCount = 0, refetch: refetchUnread } = useQuery({
    queryKey: ['unreadNotificationCount'],
    queryFn: fetchUnreadCount,
    refetchInterval: 1000 * 60, // Auto-refresh every 60 seconds while on this screen
  });

  const onRefresh = async () => {
    await Promise.all([refetchCategories(), refetchTopics(), refetchUnread()]);
  };

  const getCategoryColor = (name: string) => {
    switch (name.toLowerCase()) {
      case "technology":
      case "tech": return "#f16365ff";
      case "finance": return "#73aef2ff";
      case "politics": return "#8B5CF6";
      default: return "#6B7280";
    }
  };

  if (isLoadingCategories || isLoadingTopics) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>PODNOVA</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => navigation.navigate("Notifications")}
          >
            <Ionicons name="notifications-outline" size={20} color="#ffffff" />
            
            {/* NEW: Unread Badge UI */}
            {unreadCount > 0 && (
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>

        {categories.map((category) => (
          <TouchableOpacity
            key={category.name}
            style={[styles.categoryCard, { borderLeftColor: getCategoryColor(category.name) }]}
            onPress={() => (navigation as any).navigate('MainTabs', {
              screen: 'CategoryTopics',
              params: { category: category.name }
            })}
          >
            <View style={styles.categoryIcon}>
              <Ionicons 
                name={CATEGORY_ICONS[category.name.toLowerCase()] ?? "grid-outline"} 
                size={25} 
                color={getCategoryColor(category.name)} 
              />
            </View>
            <View style={styles.categoryContent}>
              <Text style={styles.categoryName}>{category.display_name}</Text>
              <Text style={styles.categoryTrending}>
                Trending: {category.trending ? category.trending : "Breaking stories"}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recently Active Topics</Text>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topicsScrollContainer}
        >
          {recentTopics.map((topic) => {
            const safeId = topic.id || (topic as any)._id;

            return (
              <TouchableOpacity
                key={safeId || Math.random().toString()}
                style={styles.topicCard}
                onPress={() => {
                  if (safeId) {
                    navigation.navigate('TopicDetail', { topicId: safeId });
                  }
                }}
              >
                <View style={styles.topicHeader}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <View>
                    <Ionicons name="trending-up-outline" size={25} color="#10B981" />
                  </View>
                </View>
                <Text style={styles.topicMeta}>
                  {topic.source_count} Sources - {topic.time_ago}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
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
    paddingBottom: 20,
    backgroundColor: "#FFFFFF",
  },
  logo: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#6366F1",
    letterSpacing: 1,
  },
  headerIcons: {
    flexDirection: "row",
    gap: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    position: "relative", // Needed for the absolute badge to position correctly
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444', // Danger red
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF', // Creates a cutout effect
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  section: {
    marginTop: 24,
    paddingLeft: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    marginBottom: 16,
    paddingRight: 20,
    textTransform: "uppercase",
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 5,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#363d4f",
    marginBottom: 4,
  },
  categoryTrending: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  topicsScrollContainer: {
    paddingRight: 20,
  },
  topicCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topicHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  topicTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  topicMeta: {
    fontSize: 13,
    color: "#9CA3AF",
  },
});

export default HomeScreen;