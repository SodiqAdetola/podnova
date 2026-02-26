// frontend/src/screens/DiscussionDetailScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import DiscussionThread from "../components/DiscussionThread";
import { useAudio } from "../contexts/AudioContext";

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
  view_count: number;
  created_at: string;
  time_ago: string;
  is_auto_created: boolean;
  user_has_upvoted: boolean;
  total_replies: number;
}

const DiscussionDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { discussionId } = route.params as { discussionId: string };
  const { showPlayer } = useAudio();

  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadDiscussion();
  }, [discussionId]);

  const loadDiscussion = async () => {
    try {
      const token = await getAuthToken();
      
      if (!token) {
        console.log("No authenticated user");
        Alert.alert("Error", "You need to be logged in to view discussions");
        navigation.goBack();
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/discussions/${discussionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Extract only the discussion metadata, not the replies
        const { replies, ...discussionMeta } = data;
        setDiscussion(discussionMeta);
      } else if (response.status === 401) {
        // Token expired - try to refresh once
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
          const newToken = await user.getIdToken(true);
          const retryResponse = await fetch(
            `${API_BASE_URL}/discussions/${discussionId}`,
            {
              headers: {
                Authorization: `Bearer ${newToken}`,
              },
            }
          );
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            const { replies, ...discussionMeta } = data;
            setDiscussion(discussionMeta);
          } else {
            Alert.alert("Error", "Failed to load discussion");
          }
        }
      } else {
        Alert.alert("Error", "Failed to load discussion");
      }
    } catch (error) {
      console.error("Error loading discussion:", error);
      Alert.alert("Error", "Failed to load discussion");
    } finally {
      setLoading(false);
    }
  };

  const handleUpvoteDiscussion = async () => {
    if (!discussion) return;

    try {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert("Error", "You need to be logged in to upvote");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/discussions/${discussionId}/upvote`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDiscussion((prev) =>
          prev
            ? {
                ...prev,
                user_has_upvoted: data.upvoted,
                upvote_count: data.upvoted
                  ? prev.upvote_count + 1
                  : prev.upvote_count - 1,
              }
            : null
        );
      }
    } catch (error) {
      console.error("Error upvoting discussion:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!discussion) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Discussion not found</Text>
      </View>
    );
  }

  // Calculate bottom padding for mini player (70 is mini player height)
  const miniPlayerHeight = showPlayer ? 70 : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
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

      {/* Discussion Thread with bottom padding for mini player */}
      <View style={[styles.threadContainer, { paddingBottom: miniPlayerHeight }]}>
        <DiscussionThread 
          discussionId={discussionId}
          title={discussion.title}
          description={discussion.description}
          username={discussion.username}
          createdAt={discussion.time_ago}
          replyCount={discussion.reply_count}
          viewCount={discussion.view_count}
          userHasUpvoted={discussion.user_has_upvoted}
          upvoteCount={discussion.upvote_count}
          onUpvote={handleUpvoteDiscussion}
          discussionType={discussion.discussion_type}
          category={discussion.category}
          tags={discussion.tags}
        />
      </View>
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
  threadContainer: {
    flex: 1,
  },
  errorText: {
    fontSize: 16,
    color: "#6B7280",
  },
});

export default DiscussionDetailScreen;