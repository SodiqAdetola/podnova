// frontend/src/screens/SearchScreen.tsx - FIXED VERSION
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Keyboard,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { auth } from "../firebase/config";

type Props = NativeStackScreenProps<MainStackParamList>;

interface Topic {
  id: string;
  title: string;
  category: string;
  confidence: number;
  article_count: number;
}

const CATEGORY_FILTERS = [
  { id: "all", label: "All", color: "#6366F1" },
  { id: "technology", label: "Tech", color: "#EF4444" },
  { id: "finance", label: "Finance", color: "#3B82F6" },
  { id: "politics", label: "Politics", color: "#8B5CF6" },
];

const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filteredTopics, setFilteredTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Topic[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  useEffect(() => {
    loadRecentSearches();
    loadAISuggestions();
  }, []);

  useEffect(() => {
    if (submittedQuery.trim()) {
      filterTopics();
      setShowSuggestions(false);
    } else {
      setFilteredTopics([]);
      setShowSuggestions(true);
    }
  }, [submittedQuery, activeFilter]);

  const loadRecentSearches = async () => {
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const saved = await AsyncStorage.getItem("@podnova_recent_searches");
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Error loading recent searches:", error);
    }
  };

  const saveRecentSearch = async (query: string) => {
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(updated);
      await AsyncStorage.setItem("@podnova_recent_searches", JSON.stringify(updated));
    } catch (error) {
      console.error("Error saving recent search:", error);
    }
  };

  const clearRecentSearches = async () => {
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      setRecentSearches([]);
      await AsyncStorage.removeItem("@podnova_recent_searches");
    } catch (error) {
      console.error("Error clearing recent searches:", error);
    }
  };

  const loadAISuggestions = async () => {
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return;

      const response = await fetch(
        "https://podnova-backend-r8yz.onrender.com/topics/categories/all",
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const allTopics = data.topics || [];
        
        // Get top 6 topics by confidence (most reliable trending topics)
        const topTopics = allTopics
          .filter((t: Topic) => t.article_count >= 5) // Only show substantial topics
          .sort((a: Topic, b: Topic) => b.confidence - a.confidence)
          .slice(0, 6);
        
        setAiSuggestions(topTopics);
      }
    } catch (error) {
      console.error("Error loading AI suggestions:", error);
    }
  };

  const filterTopics = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return;

      // Fetch from appropriate category
      const category = activeFilter === "all" ? "all" : activeFilter;
      const response = await fetch(
        `https://podnova-backend-r8yz.onrender.com/topics/categories/${category}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        let results = data.topics || [];

        // Filter by search query if present
        if (submittedQuery.trim()) {
          const query = submittedQuery.toLowerCase();
          results = results.filter((topic: Topic) =>
            topic.title.toLowerCase().includes(query)
          );
        }

        setFilteredTopics(results);
      }
    } catch (error) {
      console.error("Error filtering topics:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = () => {
    const query = searchQuery.trim();
    if (query) {
      setSubmittedQuery(query);
      saveRecentSearch(query);
      Keyboard.dismiss();
    }
  };

  const handleSuggestionPress = (topic: Topic) => {
    navigation.navigate("TopicDetail", { topicId: topic.id });
  };

  const handleRecentSearchPress = (query: string) => {
    setSearchQuery(query);
    setSubmittedQuery(query);
    Keyboard.dismiss();
  };

  const removeRecentSearch = async (query: string) => {
    const updated = recentSearches.filter(s => s !== query);
    setRecentSearches(updated);
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("@podnova_recent_searches", JSON.stringify(updated));
    } catch (error) {
      console.error("Error removing search:", error);
    }
  };

  const handleTopicPress = (topic: Topic) => {
    navigation.navigate("TopicDetail", { topicId: topic.id });
  };

  const getCategoryColor = (category: string) => {
    const filter = CATEGORY_FILTERS.find((f) => f.id === category);
    return filter?.color || "#6366F1";
  };

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      technology: "hardware-chip-outline",
      finance: "stats-chart-outline",
      politics: "shield-outline",
    };
    return icons[category] || "trending-up-outline";
  };

  const renderAISuggestion = ({ item }: { item: Topic }) => (
    <TouchableOpacity
      style={styles.suggestionCard}
      onPress={() => handleSuggestionPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.suggestionIcon, { backgroundColor: getCategoryColor(item.category) + "20" }]}>
        <Ionicons 
          name={getCategoryIcon(item.category)} 
          size={20} 
          color={getCategoryColor(item.category)} 
        />
      </View>
      <Text style={styles.suggestionText} numberOfLines={1}>
        {item.title}
      </Text>
      <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );

  const renderRecentSearch = ({ item }: { item: string }) => (
    <View style={styles.recentSearchItem}>
      <TouchableOpacity
        style={styles.recentSearchButton}
        onPress={() => handleRecentSearchPress(item)}
        activeOpacity={0.7}
      >
        <Ionicons name="time-outline" size={20} color="#6B7280" />
        <Text style={styles.recentSearchText}>{item}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => removeRecentSearch(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );

  const renderTopicCard = ({ item }: { item: Topic }) => (
    <TouchableOpacity
      style={styles.topicCard}
      onPress={() => handleTopicPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.topicContent}>
        <View
          style={[
            styles.topicThumbnail,
            { backgroundColor: getCategoryColor(item.category) },
          ]}
        >
          <Ionicons name="newspaper-outline" size={24} color="#FFFFFF" />
        </View>

        <View style={styles.topicInfo}>
          <Text style={styles.topicTitle} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.topicMeta}>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: getCategoryColor(item.category) + "20" },
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: getCategoryColor(item.category) },
                ]}
              >
                {item.category}
              </Text>
            </View>
            <Text style={styles.articleCount}>{item.article_count} articles</Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => {
    if (loading) return null;

    if (submittedQuery.trim() && filteredTopics.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptySubtitle}>
            Try adjusting your search or filter
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Topics and Discussions..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearchQuery("");
              setSubmittedQuery("");
              setShowSuggestions(true);
            }}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
        >
          {CATEGORY_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              style={[
                styles.filterChip,
                activeFilter === filter.id && {
                  backgroundColor: filter.color,
                },
              ]}
              onPress={() => setActiveFilter(filter.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter.id && styles.filterTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {showSuggestions && !submittedQuery.trim() ? (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* AI Suggestions */}
          {aiSuggestions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles" size={20} color="#8B5CF6" />
                <Text style={styles.sectionTitle}>AI Suggestions</Text>
              </View>
              <FlatList
                data={aiSuggestions}
                renderItem={renderAISuggestion}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={clearRecentSearches}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={recentSearches}
                renderItem={renderRecentSearch}
                keyExtractor={(item, index) => `recent-${index}`}
                scrollEnabled={false}
              />
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.resultsContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredTopics}
              renderItem={renderTopicCard}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.resultsList}
              ListEmptyComponent={renderEmptyState}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}
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
    alignItems: "center",
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  searchSection: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    marginLeft: 12,
    marginRight: 8,
  },
  filtersContainer: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  filterTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 8,
    flex: 1,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6366F1",
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  recentSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  recentSearchButton: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  recentSearchText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
  },
  resultsContainer: {
    flex: 1,
  },
  resultsList: {
    padding: 16,
  },
  topicCard: {
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
  topicContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  topicThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  topicInfo: {
    flex: 1,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
    lineHeight: 22,
  },
  topicMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  articleCount: {
    fontSize: 13,
    color: "#6B7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
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
  },
});

export default SearchScreen;