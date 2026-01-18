// frontend/src/screens/Home.tsx
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
import { Category, Topic } from "../types/topics";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type HomeScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentTopics, setRecentTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch categories
      const categoriesRes = await fetch(`${API_BASE_URL}/topics/categories`);
      const categoriesData = await categoriesRes.json();
      setCategories(categoriesData.categories || []);

      // Fetch recent topics from all categories (for "Recently Active Topics")
      const topicsPromises = categoriesData.categories.map((cat: Category) =>
        fetch(`${API_BASE_URL}/topics/category/${cat.name}?sort_by=latest`)
          .then((res) => res.json())
          .then((data) => data.topics || [])
      );

      const allTopics = await Promise.all(topicsPromises);
      const flatTopics = allTopics.flat();
      
      // Sort by last_updated and take top 5
      const sortedTopics = flatTopics
        .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
        .slice(0, 5);
      
      setRecentTopics(sortedTopics);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getCategoryIcon = (name: string) => {
    switch (name) {
      case "technology":
        return "📱";
      case "finance":
        return "💰";
      case "politics":
        return "🏛️";
      default:
        return "📰";
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
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>PODNOVA</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Explore Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>

        {/* Categories */}
        {categories.map((category) => (
          <TouchableOpacity
            key={category.name}
            style={styles.categoryCard}
            onPress={() => navigation.navigate("CategoryTopics", { category: category.name })}
          >
            <View style={styles.categoryIcon}>
              <Text style={styles.categoryEmoji}>{getCategoryIcon(category.name)}</Text>
            </View>
            <View style={styles.categoryContent}>
              <Text style={styles.categoryName}>{category.display_name}</Text>
              <Text style={styles.categoryTrending}>
                {category.trending ? `Trending: ${category.trending.substring(0, 40)}...` : "No trending topics"}
              </Text>
            </View>
            <View style={styles.categoryArrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recently Active Topics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recently Active Topics</Text>

        {recentTopics.map((topic) => (
          <TouchableOpacity
            key={topic.id}
            style={styles.topicCard}
            onPress={() => navigation.navigate("TopicDetail", { topicId: topic.id })}
          >
            <View style={styles.topicHeader}>
              <Text style={styles.topicTitle}>{topic.title}</Text>
              <View style={styles.trendIndicator}>
                <Text style={styles.trendIcon}>📈</Text>
              </View>
            </View>
            <Text style={styles.topicMeta}>
              {topic.source_count} Sources • {topic.time_ago}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

export default HomeScreen;

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
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: 20,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    color: "#111827",
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  categoryTrending: {
    fontSize: 13,
    color: "#6B7280",
  },
  categoryArrow: {
    marginLeft: 8,
  },
  arrowText: {
    fontSize: 24,
    color: "#D1D5DB",
  },
  topicCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
  trendIndicator: {
    marginLeft: 8,
  },
  trendIcon: {
    fontSize: 16,
  },
  topicMeta: {
    fontSize: 13,
    color: "#6B7280",
  },
});