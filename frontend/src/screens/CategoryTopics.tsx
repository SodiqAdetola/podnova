// frontend/src/screens/CategoryTopics.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  FlatList,
} from "react-native";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CompositeNavigationProp } from "@react-navigation/native";
import { MainTabParamList, MainStackParamList } from "../Navigator";
import { Topic, SortOption } from "../types/topics";
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import DiscussionsList from "../components/DiscussionsList";
import CreateDiscussionModal from "../components/CreateDiscussionModal";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const PAGE_LIMIT = 20;

type TabType = "topics" | "discussions";

type CategoryTopicsNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "CategoryTopics">,
  NativeStackNavigationProp<MainStackParamList>
>;

// --- API Fetching Function ---
const fetchTopics = async ({ pageParam, queryKey }: any) => {
  const [_, category, sortBy] = queryKey;
  const skip = pageParam * PAGE_LIMIT;
  
  const response = await fetch(
    `${API_BASE_URL}/topics/categories/${category}?sort_by=${sortBy}&limit=${PAGE_LIMIT}&skip=${skip}`
  );
  
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  
  const data = await response.json();
  const rawTopics = data.topics || [];
  
  // ✅ FORCE MAP ID: Ensure every topic definitely has an 'id' string
  return rawTopics.map((t: any) => ({
    ...t,
    id: t.id || t._id || Math.random().toString() // Fallback so flatlist keyExtractor never crashes
  }));
};

const CategoryTopicsScreen: React.FC = () => {
  const navigation = useNavigation<CategoryTopicsNavigationProp>();
  const route = useRoute();
  const { category } = route.params as { category: string };

  const [activeTab, setActiveTab] = useState<TabType>("topics");
  const [sortBy, setSortBy] = useState<SortOption>("latest");
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [discussionsKey, setDiscussionsKey] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      setActiveTab("topics");
    }, [])
  );

  // --- TanStack Infinite Query ---
  const {
    data,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['categoryTopics', category, sortBy],
    queryFn: fetchTopics,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_LIMIT ? allPages.length : undefined;
    },
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
    enabled: activeTab === "topics",
  });

  const topics = data?.pages.flat() || [];

  const handleImageError = (topicId: string) => {
    setImageErrors((prev) => new Set(prev).add(topicId));
  };

  const handleCreateSuccess = () => {
    setDiscussionsKey(prev => prev + 1);
  };

  const getSortButtonStyle = (option: SortOption) => {
    return sortBy === option ? styles.sortButtonActive : styles.sortButton;
  };

  const getSortTextStyle = (option: SortOption) => {
    return sortBy === option ? styles.sortButtonTextActive : styles.sortButtonText;
  };

  const renderTopicImage = (topic: Topic) => {
    if (!topic.image_url || imageErrors.has(topic.id)) {
      return (
        <View style={styles.topicImagePlaceholder}>
          <Text style={styles.placeholderIcon}>📰</Text>
        </View>
      );
    }
    return (
      <Image
        source={{ uri: topic.image_url }}
        style={styles.topicImage}
        resizeMode="cover"
        onError={() => handleImageError(topic.id)}
      />
    );
  };

  // --- Render List Items ---
  const renderTopicItem = ({ item: topic }: { item: Topic }) => {
    return (
      <TouchableOpacity
        style={styles.topicCard}
        onPress={() => {
          if (topic.id) {
            navigation.navigate('TopicDetail', { topicId: topic.id });
          } else {
            console.error("Missing topic ID for:", topic.title);
          }
        }}
      >
        <View style={styles.topicContentRow}>
          {renderTopicImage(topic)}
          <View style={styles.topicContent}>
            <Text style={styles.topicTitle} numberOfLines={2}>
              {topic.title}
            </Text>
            <Text style={styles.topicSummary} numberOfLines={2}>
              {topic.summary}
            </Text>
          </View>
        </View>

        <View style={styles.topicFooter}>
          <View style={styles.clusteredBadge}>
            <Ionicons name="newspaper-outline" size={10} color="#6B7280" />
            <Text style={styles.clusteredText}>
              Clustered from {topic.article_count} {topic.article_count === 1 ? 'article' : 'articles'} • {topic.time_ago}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <View style={styles.sortContainer}>
      <TouchableOpacity style={getSortButtonStyle("latest")} onPress={() => setSortBy("latest")}>
        <Text style={getSortTextStyle("latest")}>Latest</Text>
      </TouchableOpacity>
      <TouchableOpacity style={getSortButtonStyle("reliable")} onPress={() => setSortBy("reliable")}>
        <Text style={getSortTextStyle("reliable")}>Reliable</Text>
      </TouchableOpacity>
      <TouchableOpacity style={getSortButtonStyle("most_discussed")} onPress={() => setSortBy("most_discussed")}>
        <Text style={getSortTextStyle("most_discussed")}>Most Discussed</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No topics available</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </Text>
        <TouchableOpacity style={styles.searchButton} onPress={() => navigation.navigate('Search')}>
          <Ionicons name="search" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "topics" && styles.tabActive]}
          onPress={() => setActiveTab("topics")}
        >
          <Text style={[styles.tabText, activeTab === "topics" && styles.tabTextActive]}>
            Topics
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "discussions" && styles.tabActive]}
          onPress={() => setActiveTab("discussions")}
        >
          <Text style={[styles.tabText, activeTab === "discussions" && styles.tabTextActive]}>
            Discussions
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "topics" ? (
        isLoading && topics.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : (
          <FlatList
            data={topics}
            keyExtractor={(item) => item.id}
            renderItem={renderTopicItem}
            ListHeaderComponent={renderListHeader}
            ListEmptyComponent={renderEmptyState}
            ListFooterComponent={() => (
              <View style={{ paddingBottom: 80, paddingTop: 20 }}>
                {isFetchingNextPage && <ActivityIndicator size="small" color="#6366F1" />}
              </View>
            )}
            contentContainerStyle={styles.content}
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
                colors={["#6366F1"]}
                tintColor="#6366F1"
              />
            }
          />
        )
      ) : (
        <View style={styles.content}>
          <DiscussionsList
            key={discussionsKey}
            category={category}
            onCreatePress={() => setShowCreateModal(true)}
          />
        </View>
      )}

      <CreateDiscussionModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        category={category}
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
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
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
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  searchButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#6366F1",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  sortContainer: {
    flexDirection: "row",
    paddingVertical: 16,
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  sortButtonActive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#6366F1",
  },
  sortButtonText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  topicCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  topicContentRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  topicImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  topicImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 32,
  },
  topicContent: {
    flex: 1,
    justifyContent: "center",
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
    marginBottom: 4,
  },
  topicSummary: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  topicFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  clusteredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  clusteredText: {
    fontSize: 11,
    color: "#6B7280",
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});

export default CategoryTopicsScreen;