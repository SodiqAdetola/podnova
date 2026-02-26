import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Ionicons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface Discussion {
  id: string;
  title: string;
  description: string;
  discussion_type: "topic" | "community";
  topic_id?: string;
  category?: string;
  tags: string[];
  username: string;
  reply_count: number;
  upvote_count: number;
  created_at: string;
  time_ago: string;
  is_auto_created: boolean;
}

interface DiscussionsListProps {
  category?: string;
  discussionType?: "topic" | "community";
  onCreatePress?: () => void;
}

const getCategoryColor = (category?: string): string => {
  if (!category) return "#6B7280";
  switch (category.toLowerCase()) {
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

const DiscussionsList: React.FC<DiscussionsListProps> = ({
  category,
  discussionType,
  onCreatePress,
}) => {
  const navigation = useNavigation<NavigationProp>();

  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"latest" | "most_discussed">("latest");

  useEffect(() => {
    loadDiscussions();
  }, [category, discussionType, sortBy]);

  const loadDiscussions = async () => {
    try {
      const params = new URLSearchParams();
      if (category) params.append("category", category);
      if (discussionType) params.append("discussion_type", discussionType);
      params.append("sort_by", sortBy);
      params.append("limit", "50");

      const response = await fetch(
        `${API_BASE_URL}/discussions?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();
        setDiscussions(data.discussions || []);
      }
    } catch (error) {
      console.error("Error loading discussions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDiscussions();
  };

  const getTypeStyles = (type: string, category?: string) => {
    const categoryColor = getCategoryColor(category);
    
    if (type === "topic") {
      return {
        bg: "white",
        text: categoryColor,
        icon: "chatbubble-ellipses-outline" as const,
        label: "Podnova Topic Discussion",
      };
    } else {
      return {
        bg: "#FEF3C7",
        text: "#d68b0a",
        icon: "people-outline" as const,
        label: "Community Discussion",
      };
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
      {/* Sort & Create */}
      <View style={styles.actionsBar}>
        <View style={styles.sortButtons}>
          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === "latest" && styles.sortButtonActive,
            ]}
            onPress={() => setSortBy("latest")}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortBy === "latest" && styles.sortButtonTextActive,
              ]}
            >
              Latest
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === "most_discussed" && styles.sortButtonActive,
            ]}
            onPress={() => setSortBy("most_discussed")}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortBy === "most_discussed" && styles.sortButtonTextActive,
              ]}
            >
              Most Discussed
            </Text>
          </TouchableOpacity>
        </View>

        {onCreatePress && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={onCreatePress}
          >
            <Ionicons name="add" size={20} color="#d68b0a" />
            <Text style={styles.createButtonText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Discussions List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {discussions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Discussions Yet</Text>
            <Text style={styles.emptyText}>
              {category
                ? `Be the first to start a discussion in ${category}`
                : "Start a discussion to connect with the community"}
            </Text>
            {onCreatePress && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={onCreatePress}
              >
                <Text style={styles.emptyButtonText}>Start Discussion</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          discussions.map((discussion) => {
            const typeStyles = getTypeStyles(discussion.discussion_type, discussion.category);
            const categoryColor = getCategoryColor(discussion.category);
            const isAutoGenerated = discussion.discussion_type === "topic";

            // Community discussions get orange left border, topic discussions have no border
            const cardStyle = isAutoGenerated
              ? styles.discussionCard
              : [styles.discussionCard, styles.communityCard];

            return (
              <TouchableOpacity
                key={discussion.id}
                style={cardStyle}
                onPress={() =>
                  navigation.navigate("DiscussionDetail", {
                    discussionId: discussion.id,
                  })
                }
                activeOpacity={0.7}
              >
                {/* Header */}
                <View style={styles.discussionHeader}>
                  <View style={styles.headerLeft}>
                    <View
                      style={[
                        styles.typeBadge,
                        { backgroundColor: typeStyles.bg },
                      ]}
                    >
                      <Ionicons
                        name={typeStyles.icon}
                        size={10}
                        color={typeStyles.text}
                      />
                      <Text
                        style={[
                          styles.typeBadgeText,
                          { color: typeStyles.text },
                        ]}
                      >
                        {typeStyles.label}
                      </Text>
                    </View>
                    {discussion.category && (
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
                          {discussion.category}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.metaInfo}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={11}
                      color="#6B7280"
                    />
                    <Text style={styles.metaText}>{discussion.reply_count}</Text>
                    <Feather
                      name="thumbs-up"
                      size={11}
                      color="#6B7280"
                      style={styles.metaIcon}
                    />
                    <Text style={styles.metaText}>{discussion.upvote_count}</Text>
                  </View>
                </View>

                {/* Title */}
                <Text style={styles.discussionTitle} numberOfLines={2}>
                  {discussion.title}
                </Text>

                {/* Description */}
                <Text style={styles.discussionDescription} numberOfLines={2}>
                  {discussion.description}
                </Text>

                {/* Footer */}
                <View style={styles.discussionFooter}>
                  <View style={styles.footerLeft}>
                    <Ionicons
                      name="person-circle-outline"
                      size={16}
                      color="#9CA3AF"
                    />
                    <Text style={styles.footerText}>{discussion.username}</Text>
                  </View>
                  <Text style={styles.footerText}>{discussion.time_ago}</Text>
                </View>

                {/* Tags */}
                {discussion.tags && discussion.tags.length > 0 && (
                  <View style={styles.tagsRow}>
                    {discussion.tags.slice(0, 3).map((tag, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  actionsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  sortButtons: {
    flexDirection: "row",
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  sortButtonActive: {
    backgroundColor: "#6366F1",
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  sortButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderColor: "#d68b0a",
    borderWidth: 1,
    backgroundColor: "#FEF3C7",
    gap: 4,
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#d68b0a",
  },
  list: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  discussionCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  communityCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  discussionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  typeBadgeText: {
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
  discussionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
    marginBottom: 4,
  },
  discussionDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 8,
  },
  discussionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
  emptyState: {
    paddingTop: 80,
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
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#6366F1",
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default DiscussionsList;