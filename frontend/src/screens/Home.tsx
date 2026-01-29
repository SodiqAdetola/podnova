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
import { Ionicons } from '@expo/vector-icons';

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type HomeScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  technology: "hardware-chip-outline",
  finance: "cash-outline",
  politics: "people-outline",
};

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
      console.log("Starting to load data...");
      
      const categoriesRes = await fetch(`${API_BASE_URL}/topics/categories`);
      const categoriesData = await categoriesRes.json();
      console.log("Categories response:", JSON.stringify(categoriesData, null, 2));
      
      const categoriesList = categoriesData.categories || categoriesData || [];
      console.log("Categories list:", categoriesList);
      
      setCategories(categoriesList);

      if (categoriesList.length > 0) {
        const topicsPromises = categoriesList.map((cat: Category) =>
          fetch(`${API_BASE_URL}/topics/category/${cat.name}?sort_by=latest`)
            .then((res) => res.json())
            .then((data) => {
              console.log(`Topics for ${cat.name}:`, data);
              return data.topics || data || [];
            })
            .catch((err) => {
              console.error(`Error fetching topics for ${cat.name}:`, err);
              return [];
            })
        );

        const allTopics = await Promise.all(topicsPromises);
        const flatTopics = allTopics.flat();
        console.log("Total topics:", flatTopics.length);
        
        const sortedTopics = flatTopics
          .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
          .slice(0, 5);
        
        setRecentTopics(sortedTopics);
      }
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

  const getCategoryColor = (name: string) => {
    switch (name.toLowerCase()) {
      case "technology":
      case "tech":
        return "#f16365ff";
      case "finance":
        return "#73aef2ff";
      case "politics":
        return "#8B5CF6";
      default:
        return "#6B7280";
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
      <View style={styles.header}>
        <Text style={styles.logo}>PODNOVA</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="search" size={25} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="person" size={25} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>

        {categories.map((category, index) => (
          <TouchableOpacity
            key={category.name}
            style={[
              styles.categoryCard,
              { borderLeftColor: getCategoryColor(category.name) }
            ]}
            onPress={() => navigation.navigate("CategoryTopics", { category: category.name })}
          >
            <View style={styles.categoryIcon}>
              <Ionicons name={CATEGORY_ICONS[category.name.toLowerCase()] ?? "grid-outline"} size={25} color={getCategoryColor(category.name)} />
            </View>
            
            <View style={styles.categoryContent}>
              <Text style={styles.categoryName}>{category.display_name}</Text>
              <Text style={styles.categoryTrending}>
                Trending: {category.trending ? category.trending.substring(0, 40) : "Breaking stories"}
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
          {recentTopics.map((topic) => (
            <TouchableOpacity
              key={topic.id}
              style={styles.topicCard}
              onPress={() => navigation.navigate("TopicDetail", { topicId: topic.id })}
            >
              <View style={styles.topicHeader}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <View style={styles.trendIndicator}>
                  <Text style={styles.trendIcon}>↗</Text>
                </View>
              </View>
              <Text style={styles.topicMeta}>
                {topic.source_count} Sources - {topic.time_ago}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  searchIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  section: {
    marginTop: 24,
    paddingLeft: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    color: "#111827",
    paddingRight: 20,
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
  docIcon: {
    width: 20,
    height: 24,
    backgroundColor: "#6B7280",
    borderRadius: 2,
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
  trendIndicator: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  trendIcon: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "bold",
  },
  topicMeta: {
    fontSize: 13,
    color: "#9CA3AF",
  },
});