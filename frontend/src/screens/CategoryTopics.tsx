// frontend/src/screens/CategoryTopics.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Topic, SortOption } from "../types/topics";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type TabType = "topics" | "discussions";
type CategoryTopicsNavigationProp = NativeStackNavigationProp<MainStackParamList>;

const CategoryTopicsScreen: React.FC = () => {
  const navigation = useNavigation<CategoryTopicsNavigationProp>();
  const route = useRoute();
  const { category } = route.params as { category: string };

  const [activeTab, setActiveTab] = useState<TabType>("topics");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("latest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTopics();
  }, [category, sortBy]);

  const loadTopics = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/topics/category/${category}?sort_by=${sortBy}`
      );
      const data = await response.json();
      setTopics(data.topics || []);
      // Reset image errors when loading new topics
      setImageErrors(new Set());
    } catch (error) {
      console.error("Error loading topics:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTopics();
  };

  const handleImageError = (topicId: string) => {
    setImageErrors((prev) => new Set(prev).add(topicId));
  };

  const getSortButtonStyle = (option: SortOption) => {
    return sortBy === option ? styles.sortButtonActive : styles.sortButton;
  };

  const getSortTextStyle = (option: SortOption) => {
    return sortBy === option ? styles.sortButtonTextActive : styles.sortButtonText;
  };

  const renderTopicImage = (topic: Topic) => {
    // Don't render if image failed to load or doesn't exist
    if (!topic.image_url || imageErrors.has(topic.id)) {
      return (
        <View style={styles.placeholderImage}>
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

  const renderTopicsTab = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      );
    }

    return (
      <View>
        {/* Sort Options */}
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={getSortButtonStyle("latest")}
            onPress={() => setSortBy("latest")}
          >
            <Text style={getSortTextStyle("latest")}>Latest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={getSortButtonStyle("reliable")}
            onPress={() => setSortBy("reliable")}
          >
            <Text style={getSortTextStyle("reliable")}>Reliable</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={getSortButtonStyle("most_discussed")}
            onPress={() => setSortBy("most_discussed")}
          >
            <Text style={getSortTextStyle("most_discussed")}>Most Discussed</Text>
          </TouchableOpacity>
        </View>

        {/* Topics List */}
        {topics.map((topic) => (
          <TouchableOpacity
            key={topic.id}
            style={styles.topicCard}
            onPress={() => navigation.navigate("TopicDetail", { topicId: topic.id })}
          >
            <View style={styles.topicCardContent}>
              {/* Topic Image */}
              {renderTopicImage(topic)}

              {/* Topic Info */}
              <View style={styles.topicInfo}>
                <View style={styles.topicCardHeader}>
                  <Text style={styles.topicTitle} numberOfLines={2}>
                    {topic.title}
                  </Text>
                  <TouchableOpacity>
                    <Text style={styles.menuIcon}>⋮</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.topicMeta} numberOfLines={1}>
                  Clustered from {topic.article_count} Sources • {topic.time_ago}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {topics.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No topics available</Text>
          </View>
        )}
      </View>
    );
  };

  const renderDiscussionsTab = () => {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Discussions Coming Soon</Text>
        <Text style={styles.emptyText}>
          Community discussions for {category} topics will be available soon
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{category.charAt(0).toUpperCase() + category.slice(1)}</Text>
        <TouchableOpacity style={styles.searchButton}>
          <View style={styles.searchIconShape} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
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

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === "topics" ? renderTopicsTab() : renderDiscussionsTab()}
      </ScrollView>
    </View>
  );
};

export default CategoryTopicsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
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
  backIcon: {
    fontSize: 24,
    color: "#111827",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  searchButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  searchIconShape: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#6B7280",
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
    flex: 1,
    paddingHorizontal: 16,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    overflow: "hidden",
  },
  topicCardContent: {
    flexDirection: "row",
    padding: 12,
  },
  topicImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  placeholderImage: {
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
  topicInfo: {
    flex: 1,
    justifyContent: "center",
  },
  topicCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  topicTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  menuIcon: {
    fontSize: 20,
    color: "#9CA3AF",
    marginLeft: 8,
  },
  topicMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});