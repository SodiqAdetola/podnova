// frontend/src/screens/DiscussionDetailScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Ionicons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";
import { getAuth } from "firebase/auth";
import DiscussionThread from "../components/DiscussionThread";
import { useAudio } from "../contexts/AudioContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DiscussionDetailSkeleton from "../components/skeletons/DiscussionDetailSkeleton";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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
  view_count: number;
  created_at: string;
  time_ago: string;
  is_auto_created: boolean;
  user_has_upvoted: boolean;
  total_replies: number;
}

const getCategoryColor = (category?: string): string => {
  if (!category) return "#8B5CF6";
  switch (category.toLowerCase()) {
    case "technology":
    case "tech": return "#f16365ff";
    case "finance": return "#73aef2ff";
    case "politics": return "#8B5CF6";
    default: return "#8B5CF6";
  }
};

const getAuthToken = async (): Promise<string | null> => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error("Error getting token:", error);
      return null;
    }
  }
  return null;
};

const DiscussionDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  // placeholderDiscussion is for List-to-Detail instant hydration (if you add it to your lists later)
  const { discussionId, placeholderDiscussion } = route.params as { discussionId: string, placeholderDiscussion?: any };
  const { showPlayer } = useAudio();
  const queryClient = useQueryClient();

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // ==========================================
  // REACT QUERY: FETCH DISCUSSION METADATA
  // ==========================================
  const {
    data: discussion,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['discussionMeta', discussionId],
    queryFn: async (): Promise<Discussion> => {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert("Error", "You need to be logged in to view discussions");
        navigation.goBack();
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${API_BASE_URL}/discussions/${discussionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to load discussion");
      
      const data = await response.json();
      const { replies, ...discussionMeta } = data; // We only want the meta here, Thread fetches replies
      return discussionMeta;
    },
    placeholderData: placeholderDiscussion,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });

  if (isError) {
    Alert.alert("Error", "Failed to load discussion");
    navigation.goBack();
  }

  // --- ACTIONS ---
  const handleUpvoteDiscussion = async () => {
    if (!discussion) return;

    // Optimistically update the UI instantly
    queryClient.setQueryData(['discussionMeta', discussionId], (oldData: Discussion | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        user_has_upvoted: !oldData.user_has_upvoted,
        upvote_count: oldData.user_has_upvoted ? oldData.upvote_count - 1 : oldData.upvote_count + 1,
      };
    });

    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/discussions/${discussionId}/upvote`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );

      // If it fails on the server, we could rollback the optimistic update here.
      // But for simplicity, we let it be or refetch.
      if (!response.ok) {
        queryClient.invalidateQueries({ queryKey: ['discussionMeta', discussionId] });
      }
    } catch (error) {
      console.error("Error upvoting discussion:", error);
      queryClient.invalidateQueries({ queryKey: ['discussionMeta', discussionId] });
    }
  };

  // --- HEADER COMPONENT ---
  const renderDiscussionMetadata = () => {
    if (!discussion) return null;

    const categoryColor = getCategoryColor(discussion.category);
    const isTopicDiscussion = discussion.discussion_type === "topic";
    
    const typeColors = isTopicDiscussion 
      ? { bg: categoryColor + "20", text: categoryColor, icon: "chatbubble-ellipses-outline" as const }
      : { bg: "#FEF3C7", text: "#F59E0B", icon: "people-outline" as const };

    const typeText = isTopicDiscussion ? "Topic Discussion" : "Community Discussion";

    return (
      <View style={styles.metadataContainer}>
        <View style={styles.typeBadge}>
          <View style={[styles.typeBadgeInner, { backgroundColor: typeColors.bg }]}>
            <Ionicons name={typeColors.icon} size={12} color={typeColors.text} />
            <Text style={[styles.typeBadgeText, { color: typeColors.text }]}>{typeText}</Text>
          </View>
          {isTopicDiscussion && discussion.category && (
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + "15" }]}>
              <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>{discussion.category}</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{discussion.title}</Text>

        {discussion.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.description} numberOfLines={isDescriptionExpanded ? undefined : 1}>
              {discussion.description}
            </Text>
            {discussion.description.length > 100 && (
              <TouchableOpacity onPress={() => setIsDescriptionExpanded(!isDescriptionExpanded)} activeOpacity={0.7}>
                <Text style={styles.showMoreText}>{isDescriptionExpanded ? 'Show less' : 'Show more'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {discussion.tags && discussion.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {discussion.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statsLeft}>
            <Ionicons name="person-circle-outline" size={14} color="#6B7280" />
            <Text style={styles.statsText}>{discussion.username || 'Anonymous'}</Text>
            <Text style={styles.statsDot}>•</Text>
            <Text style={styles.statsText}>{discussion.time_ago || 'Just now'}</Text>
          </View>
          
          <View style={styles.statsRight}>
            {discussion.view_count !== undefined && (
              <View style={styles.statsItem}>
                <Ionicons name="eye-outline" size={12} color="#9CA3AF" />
                <Text style={styles.statsItemText}>{discussion.view_count}</Text>
              </View>
            )}
            {discussion.reply_count !== undefined && (
              <View style={styles.statsItem}>
                <Ionicons name="chatbubble-outline" size={12} color="#9CA3AF" />
                <Text style={styles.statsItemText}>{discussion.reply_count}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.upvoteButton} onPress={handleUpvoteDiscussion}>
              <Feather name="thumbs-up" size={12} color={discussion.user_has_upvoted ? "#6366F1" : "#9CA3AF"} />
              <Text style={[styles.upvoteText, discussion.user_has_upvoted && styles.upvoteTextActive]}>{discussion.upvote_count}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />
      </View>
    );
  };

  // --- RENDER SKELETON ---
  if (isLoading) {
    return <DiscussionDetailSkeleton />;
  }

  const miniPlayerHeight = showPlayer ? 70 : 0;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Podnova Discussion</Text>
        <View style={styles.placeholder} />
      </View>

      <DiscussionThread 
        discussionId={discussionId}
        isNested={false} 
        bottomPadding={miniPlayerHeight} 
        headerComponent={renderDiscussionMetadata()}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  metadataContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  typeBadgeInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  descriptionContainer: {
    marginBottom: 12,
  },
  description: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 20,
  },
  showMoreText: {
    fontSize: 13,
    color: "#6366F1",
    fontWeight: "500",
    marginTop: 4,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    color: "#6366F1",
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statsText: {
    fontSize: 12,
    color: "#6B7280",
  },
  statsDot: {
    fontSize: 12,
    color: "#D1D5DB",
  },
  statsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  statsItemText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  upvoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  upvoteText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  upvoteTextActive: {
    color: "#6366F1",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginTop: 12,
  },
});

export default DiscussionDetailScreen;