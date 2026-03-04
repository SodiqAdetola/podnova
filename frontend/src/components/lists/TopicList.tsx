// frontend/src/components/TopicsList.tsx
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
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../../Navigator";
import { Topic, SortOption } from "../../types/topics";
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import TopicListSkeleton from "../skeletons/TopicListSkeleton";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const PAGE_LIMIT = 20;

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface TopicsListProps {
  category: string;
}

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
  
  return rawTopics.map((t: any) => ({
    ...t,
    id: t.id || t._id || Math.random().toString()
  }));
};

const getCategoryFallback = (category?: string) => {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('tech')) return { colors: ['#FDA4A3', '#F16365'], icon: 'hardware-chip' as const };
  if (cat.includes('finance')) return { colors: ['#A5CFF4', '#73AEF2'], icon: 'trending-up' as const };
  if (cat.includes('politic')) return { colors: ['#A78BFA', '#8B5CF6'], icon: 'business' as const };
  return { colors: ['#818CF8', '#4F46E5'], icon: 'newspaper' as const };
};

const TopicsList: React.FC<TopicsListProps> = ({ category }) => {
  const navigation = useNavigation<NavigationProp>();
  const [sortBy, setSortBy] = useState<SortOption>("latest");
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['category', category, sortBy],
    queryFn: fetchTopics,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_LIMIT ? allPages.length : undefined;
    },
    staleTime: 1000 * 60 * 2, 
  });

  const topics = data?.pages.flat() || [];

  const handleImageError = (topicId: string) => {
    setImageErrors((prev) => new Set(prev).add(topicId));
  };

  const getSortButtonStyle = (option: SortOption) => [
    styles.sortPill,
    sortBy === option && styles.sortPillActive
  ];

  const getSortTextStyle = (option: SortOption) => [
    styles.sortPillText,
    sortBy === option && styles.sortPillTextActive
  ];

  const renderTopicImage = (topic: Topic) => {
    if (!topic.image_url || imageErrors.has(topic.id)) {
      const fallback = getCategoryFallback(topic.category);
      return (
        <LinearGradient
          colors={fallback.colors as [string, string]}
          style={styles.topicImagePlaceholder}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name={fallback.icon as any} size={32} color="#FFFFFF" style={{ opacity: 0.9 }} />
        </LinearGradient>
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

  const renderTopicItem = ({ item: topic }: { item: Topic }) => (
    <TouchableOpacity
      style={styles.topicCard}
      onPress={() => {
        if (topic.id) {
          navigation.navigate('TopicDetail', { topicId: topic.id });
        }
      }}
    >
      <View style={styles.topicContentRow}>
        {renderTopicImage(topic)}
        <View style={styles.topicContent}>
          <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
          <Text style={styles.topicSummary} numberOfLines={2}>{topic.summary}</Text>
        </View>
      </View>

      <View style={styles.topicFooter}>
        <View style={styles.clusteredBadge}>
          <Ionicons name="newspaper-outline" size={10} color="#6B7280" />
          <Text style={styles.clusteredText}>
            {topic.article_count} articles • {topic.time_ago}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderListHeader = () => (
    <View style={styles.sortContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
        <TouchableOpacity style={getSortButtonStyle("latest")} onPress={() => setSortBy("latest")}>
          <Text style={getSortTextStyle("latest")}>Latest</Text>
        </TouchableOpacity>
        <TouchableOpacity style={getSortButtonStyle("reliable")} onPress={() => setSortBy("reliable")}>
          <Text style={getSortTextStyle("reliable")}>Reliable</Text>
        </TouchableOpacity>
        <TouchableOpacity style={getSortButtonStyle("most_discussed")} onPress={() => setSortBy("most_discussed")}>
          <Text style={getSortTextStyle("most_discussed")}>Most Discussed</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (isLoading && topics.length === 0) {
    return <TopicListSkeleton />;
  }

  return (
    <FlatList
      data={topics}
      keyExtractor={(item) => item.id}
      renderItem={renderTopicItem}
      ListHeaderComponent={renderListHeader}
      ListFooterComponent={() => (
        <View style={{ paddingBottom: 80, paddingTop: 20 }}>
          {isFetchingNextPage && <ActivityIndicator size="small" color="#6366F1" />}
        </View>
      )}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
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
  );
};

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  sortContainer: {
    backgroundColor: "transparent",
    paddingVertical: 12,
    marginBottom: 4,
  },
  sortScroll: {
    gap: 8,
  },
  sortPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "transparent",
  },
  sortPillActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  sortPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
  },
  sortPillTextActive: {
    color: "#4F46E5",
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
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
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
});

export default TopicsList;