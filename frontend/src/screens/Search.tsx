// frontend/src/screens/SearchScreen.tsx (updated topic card layout)

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  FlatList,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { getAuth } from "firebase/auth";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface Topic {
  id: string;
  title: string;
  summary: string;
  category: string;
  article_count: number;
  confidence_score: number;
  last_updated: string;
  image_url?: string;
  time_ago?: string;
  tags?: string[];
}

interface Discussion {
  id: string;
  title: string;
  description: string;
  discussion_type: "topic" | "community";
  category?: string;
  username: string;
  reply_count: number;
  upvote_count: number;
  time_ago: string;
  tags?: string[];
}

type SearchResult = Topic | Discussion;

const CATEGORIES = [
  { id: "all", name: "All Categories", icon: "apps", color: "#6B7280" },
  { id: "technology", name: "Technology", icon: "hardware-chip", color: "#f16365ff" },
  { id: "finance", name: "Finance", icon: "cash", color: "#73aef2ff" },
  { id: "politics", name: "Politics", icon: "people", color: "#8B5CF6" }
];

type SearchScope = "news" | "discussions";
type DiscussionFilter = "all" | "topic" | "community";

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchScope, setSearchScope] = useState<SearchScope>("news");
  const [discussionFilter, setDiscussionFilter] = useState<DiscussionFilter>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Get current user ID from Firebase
  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      setUserId(user.uid);
    } else {
      setUserId(null);
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
        setRecentSearches([]);
      }
    });

    return unsubscribe;
  }, []);

  // Load recent searches when userId changes
  useEffect(() => {
    if (userId) {
      loadRecentSearches();
    } else {
      setRecentSearches([]);
    }
  }, [userId]);

  useEffect(() => {
    if (submittedQuery) {
      performSearch();
    } else {
      setSearchResults([]);
    }
  }, [submittedQuery, selectedCategory, searchScope, discussionFilter]);

  const getRecentSearchesKey = () => {
    return userId ? `@podnova_recent_searches_${userId}` : null;
  };

  const loadRecentSearches = async () => {
    try {
      const key = getRecentSearchesKey();
      if (!key) return;

      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      } else {
        setRecentSearches([]);
      }
    } catch (error) {
      console.error("Error loading recent searches:", error);
    }
  };

  const performSearch = async () => {
    try {
      setLoadingResults(true);

      if (searchScope === "news") {
        // Search for news topics
        const params = new URLSearchParams({
          q: submittedQuery,
          limit: "30"
        });

        if (selectedCategory !== "all") {
          params.append("category", selectedCategory);
        }

        const endpoint = `${API_BASE_URL}/topics/search?${params.toString()}`;
        console.log("Searching news:", endpoint);

        const response = await fetch(endpoint);
        
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.topics || []);
        } else {
          setSearchResults([]);
        }
      } else {
        // Search for discussions
        const params = new URLSearchParams({
          sort_by: "latest",
          limit: "30"
        });

        // Add discussion type filter
        if (discussionFilter !== "all") {
          params.append("discussion_type", discussionFilter);
        }

        if (selectedCategory !== "all") {
          params.append("category", selectedCategory);
        }

        const endpoint = `${API_BASE_URL}/discussions?${params.toString()}`;
        console.log("Searching discussions:", endpoint);

        const response = await fetch(endpoint);
        
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.discussions || []);
        } else {
          setSearchResults([]);
        }
      }
    } catch (error) {
      console.error("Error performing search:", error);
      setSearchResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  const saveRecentSearch = async (query: string) => {
    try {
      const key = getRecentSearchesKey();
      if (!key) return;

      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      const updated = [
        trimmedQuery,
        ...recentSearches.filter((s) => s !== trimmedQuery),
      ].slice(0, 10);

      setRecentSearches(updated);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (error) {
      console.error("Error saving recent search:", error);
    }
  };

  const handleSearchSubmit = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    saveRecentSearch(trimmed);
    setSubmittedQuery(trimmed);
  };

  const handleRecentSearchPress = (query: string) => {
    setSearchQuery(query);
    setSubmittedQuery(query);
  };

  const handleRemoveRecentSearch = async (query: string) => {
    try {
      const key = getRecentSearchesKey();
      if (!key) return;

      const updated = recentSearches.filter((s) => s !== query);
      setRecentSearches(updated);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (error) {
      console.error("Error removing recent search:", error);
    }
  };

  const handleClearAllSearches = async () => {
    try {
      const key = getRecentSearchesKey();
      if (!key) return;

      setRecentSearches([]);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error("Error clearing recent searches:", error);
    }
  };

  const handleImageError = (topicId: string) => {
    setImageErrors((prev) => new Set(prev).add(topicId));
  };

  const getCategoryColor = (category: string | undefined): string => {
    if (!category) return "#6B7280";
    const cat = CATEGORIES.find(c => c.id === category.toLowerCase());
    return cat?.color || "#6B7280";
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

  const renderTopicCard = ({ item }: { item: Topic }) => {
    const categoryColor = getCategoryColor(item.category);
    
    return (
      <TouchableOpacity
        style={styles.resultCard}
        onPress={() => navigation.navigate("TopicDetail", { topicId: item.id })}
        activeOpacity={0.7}
      >
        {/* Top row with category and article count - full width */}
        <View style={styles.topicTopRow}>
          <View style={styles.topicLeftSection}>
            <View style={[styles.categoryBadge, { backgroundColor: "white" }]}>
              <Text style={[styles.categoryText, { color: categoryColor }]}>{item.category}</Text>
            </View>
            <View style={styles.sourceBadge}>
              <Ionicons name="newspaper-outline" size={10} color="#6B7280" />
              <Text style={styles.sourceText}>{item.article_count} articles</Text>
            </View>
          </View>
        </View>

        {/* Image and content row */}
        <View style={styles.topicMiddleRow}>
          {renderTopicImage(item)}
          <View style={styles.topicContent}>
            <Text style={styles.resultTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.resultSummary} numberOfLines={2}>
              {item.summary}
            </Text>
          </View>
        </View>

        {/* Tags section - full width */}
        {item.tags && item.tags.length > 0 && (
          <View style={styles.topicTagsRow}>
            {item.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

const renderDiscussionCard = ({ item }: { item: Discussion }) => {
  const categoryColor = getCategoryColor(item.category);
  const isAutoGenerated = item.discussion_type === "topic";
  
  // Topic discussions have no border, community discussions have orange border
  const cardStyle = isAutoGenerated 
    ? styles.resultCard 
    : [styles.resultCard, { borderLeftColor: "#F59E0B", borderLeftWidth: 4 }];
  
  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={() => navigation.navigate("DiscussionDetail", { discussionId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.resultHeader}>
        <View style={styles.resultHeaderLeft}>
          <View
            style={[
              styles.discussionBadge,
              {
                backgroundColor: isAutoGenerated
                  ? "white"
                  : "#FEF3C7",
              },
            ]}
          >
            <Ionicons
              name={isAutoGenerated ? "chatbubble-ellipses-outline" : "people-outline"}
              size={10}
              color={isAutoGenerated ? categoryColor : "#d68b0a"}
            />
            <Text
              style={[
                styles.discussionBadgeText,
                { color: isAutoGenerated ? categoryColor : "#d68b0a" },
              ]}
            >
              {isAutoGenerated ? "Podnova Topic Discussion" : "Community Discussion"}
            </Text>
          </View>
          {item.category && (
            <View
              style={[
                styles.miniCategoryBadge
              ]}
            >
              <Text
                style={[
                  styles.miniCategoryText,
                  { color: categoryColor },
                ]}
              >
                {item.category}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.metaInfo}>
          <Ionicons name="chatbubble-outline" size={11} color="#6B7280" />
          <Text style={styles.metaText}>{item.reply_count}</Text>
          <Feather name="thumbs-up" size={11} color="#6B7280" style={styles.metaIcon} />
          <Text style={styles.metaText}>{item.upvote_count}</Text>
        </View>
      </View>

      <Text style={styles.resultTitle} numberOfLines={2}>
        {item.title}
      </Text>

      <Text style={styles.resultSummary} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.resultFooter}>
        <View style={styles.footerLeft}>
          <Ionicons name="person-circle-outline" size={16} color="#9CA3AF" />
          <Text style={styles.footerText}>{item.username}</Text>
        </View>
        <Text style={styles.footerText}>{item.time_ago}</Text>
      </View>

      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {item.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

  const renderResult = ({ item }: { item: SearchResult }) => {
    if ('article_count' in item) {
      return renderTopicCard({ item: item as Topic });
    } else {
      return renderDiscussionCard({ item: item as Discussion });
    }
  };

  const getActiveCategoryColor = () => {
    const cat = CATEGORIES.find(c => c.id === selectedCategory);
    return cat?.color || "#6366F1";
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.brandName}>PODNOVA SEARCH</Text>
          <Ionicons name="search-outline" size={24} color="#6366F1" />
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search news or discussions..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery("");
                setSubmittedQuery("");
              }}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Scope Toggle */}
        <View style={styles.scopeToggleContainer}>
          <TouchableOpacity
            style={[
              styles.scopeToggle,
              searchScope === "news" && styles.scopeToggleActive
            ]}
            onPress={() => setSearchScope("news")}
          >
            <Ionicons 
              name="newspaper-outline" 
              size={16} 
              color={searchScope === "news" ? "#6366F1" : "#6B7280"} 
            />
            <Text style={[
              styles.scopeToggleText,
              searchScope === "news" && styles.scopeToggleTextActive
            ]}>News</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.scopeToggle,
              searchScope === "discussions" && styles.scopeToggleActive
            ]}
            onPress={() => setSearchScope("discussions")}
          >
            <Ionicons 
              name="chatbubbles-outline" 
              size={16} 
              color={searchScope === "discussions" ? "#6366F1" : "#6B7280"} 
            />
            <Text style={[
              styles.scopeToggleText,
              searchScope === "discussions" && styles.scopeToggleTextActive
            ]}>Discussions</Text>
          </TouchableOpacity>
        </View>

        {/* Category Filters - Always show */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContent}
        >
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  isActive && { borderColor: cat.color, borderWidth: 2 },
                  !isActive && styles.categoryChipInactive,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={16}
                  color={isActive ? cat.color : "#6366F1"}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && { color: cat.color, fontWeight: "600" },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Discussion Type Filters - Only show when searching discussions */}
        {searchScope === "discussions" && (
          <View style={styles.discussionFiltersContainer}>
            <TouchableOpacity
              style={[
                styles.discussionFilter,
                discussionFilter === "all" && styles.discussionFilterActive
              ]}
              onPress={() => setDiscussionFilter("all")}
            >
              <Text style={[
                styles.discussionFilterText,
                discussionFilter === "all" && styles.discussionFilterTextActive
              ]}>All</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.discussionFilter,
                discussionFilter === "topic" && styles.discussionFilterActive
              ]}
              onPress={() => setDiscussionFilter("topic")}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={discussionFilter === "topic" ? "#6366F1" : "#6B7280"} />
              <Text style={[
                styles.discussionFilterText,
                discussionFilter === "topic" && styles.discussionFilterTextActive
              ]}>Auto</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.discussionFilter,
                discussionFilter === "community" && styles.discussionFilterActive
              ]}
              onPress={() => setDiscussionFilter("community")}
            >
              <Ionicons name="people-outline" size={14} color={discussionFilter === "community" ? "#6366F1" : "#6B7280"} />
              <Text style={[
                styles.discussionFilterText,
                discussionFilter === "community" && styles.discussionFilterTextActive
              ]}>Community</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Content */}
      {!userId ? (
        <View style={styles.emptyState}>
          <Ionicons name="log-in-outline" size={64} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Sign in to Search</Text>
          <Text style={styles.emptyText}>
            Please sign in to search and save your search history
          </Text>
        </View>
      ) : !submittedQuery ? (
        <View style={styles.content}>
          {recentSearches.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={handleClearAllSearches}>
                  <Text style={[styles.clearText, { color: getActiveCategoryColor() }]}>Clear All</Text>
                </TouchableOpacity>
              </View>

              {recentSearches.map((search, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.recentItem}
                  onPress={() => handleRecentSearchPress(search)}
                >
                  <View style={styles.recentLeft}>
                    <Ionicons name="time-outline" size={18} color="#6B7280" />
                    <Text style={styles.recentText}>{search}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRemoveRecentSearch(search);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle-outline" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )}

          {recentSearches.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={64} color="#E5E7EB" />
              <Text style={styles.emptyTitle}>Start Searching</Text>
              <Text style={styles.emptyText}>
                Search for news or join discussions
              </Text>
            </View>
          )}
        </View>
      ) : loadingResults ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={getActiveCategoryColor()} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>No Results Found</Text>
          <Text style={styles.emptyText}>
            Try different keywords or adjust your filters
          </Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderResult}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.resultsHeader}>
              <Text style={[styles.resultsCount, { color: getActiveCategoryColor() }]}>
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.resultsQuery}>for "{submittedQuery}"</Text>
            </View>
          }
        />
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
    backgroundColor: "#FFFFFF",
    paddingTop: 70,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  searchSection: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 24,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: "#111827",
  },
  clearButton: {
    padding: 4,
  },
  scopeToggleContainer: {
    flexDirection: "row",
    marginTop: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 24,
    padding: 4,
  },
  scopeToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  scopeToggleActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scopeToggleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  scopeToggleTextActive: {
    color: "#6366F1",
  },
  categoriesScroll: {
    marginTop: 16,
    marginHorizontal: -20,
  },
  categoriesContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: "#EEF2FF",
    gap: 6,
  },
  categoryChipInactive: {
    backgroundColor: "#EEF2FF",
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6366F1",
  },
  discussionFiltersContainer: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  discussionFilter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    gap: 4,
  },
  discussionFilterActive: {
    backgroundColor: "#EEF2FF",
  },
  discussionFilterText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  discussionFilterTextActive: {
    color: "#6366F1",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  recentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  recentText: {
    fontSize: 14,
    color: "#111827",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
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
  resultsList: {
    padding: 16,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: "600",
    marginRight: 6,
  },
  resultsQuery: {
    fontSize: 14,
    color: "#6B7280",
  },
  resultCard: {
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
  // Topic-specific styles
  topicTopRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  topicLeftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topicMiddleRow: {
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
  topicTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  // Discussion styles
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  resultHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 10,
    color: "#6B7280",
  },
  discussionBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  discussionBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  miniCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniCategoryText: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  metaInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaIcon: {
    marginLeft: 8,
  },
  metaText: {
    fontSize: 11,
    color: "#6B7280",
    marginLeft: 2,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
    marginBottom: 4,
  },
  resultSummary: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  resultFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 8,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tagText: {
    fontSize: 10,
    color: "#6366F1",
    fontWeight: "500",
  },
});

export default SearchScreen;