import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Image,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { TopicDetail } from "../types/topics";
import { Ionicons } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import PodcastGeneratorModal from "../components/PodcastGenModal";
import TopicHistoryModal from "../components/TopicHistoryModal";
import DiscussionThread from "../components/DiscussionThread";
import { getAuth } from "firebase/auth";
import { useAudio } from "../contexts/AudioContext";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type TopicDetailNavigationProp = NativeStackNavigationProp<MainStackParamList>;

// Interface for discussion data
interface DiscussionData {
  id: string;
  reply_count: number;
}

const TopicDetailScreen: React.FC = () => {
  const navigation = useNavigation<TopicDetailNavigationProp>();
  const route = useRoute();
  const { topicId } = route.params as { topicId: string };
  const { showPlayer } = useAudio();
  
  const scrollViewRef = useRef<ScrollView>(null);

  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroImageError, setHeroImageError] = useState(false);
  const [showPodcastModal, setShowPodcastModal] = useState(false);
  const [showHistoryTimeline, setShowHistoryTimeline] = useState(false);
  const [discussionId, setDiscussionId] = useState<string | null>(null);
  const [replyCount, setReplyCount] = useState(0);
  const [loadingDiscussion, setLoadingDiscussion] = useState(false);
  const [isArticlesExpanded, setIsArticlesExpanded] = useState(false);

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
    loadTopic();
  }, [topicId]);

  const loadTopic = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/topics/${topicId}`);
      const data = await response.json();
      setTopic(data);
      
      // After loading the topic, fetch the discussion for it
      await fetchTopicDiscussion();
    } catch (error) {
      console.error("Error loading topic:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTopic();
  };

  const fetchTopicDiscussion = async () => {
    try {
      setLoadingDiscussion(true);
      const token = await getAuthToken();
      
      if (!token) {
        console.log("No auth token for fetching discussion");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/discussions?topic_id=${topicId}&discussion_type=topic`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.discussions && data.discussions.length > 0) {
          const discussion = data.discussions[0];
          setDiscussionId(discussion.id);
          setReplyCount(discussion.reply_count || 0);
        }
      }
    } catch (error) {
      console.error("Error fetching topic discussion:", error);
    } finally {
      setLoadingDiscussion(false);
    }
  };

  const truncateTitle = (title: string, maxLength: number = 30) => {
    if (!title) return 'Untitled';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  const openArticle = (url: string) => {
    Linking.openURL(url);
  };

  const handleGeneratePodcast = () => {
    setShowPodcastModal(true);
  };

  const handleOpenTimeline = () => {
    setShowHistoryTimeline(true);
  };

  const toggleArticles = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsArticlesExpanded(!isArticlesExpanded);
  };

  const scrollToDiscussions = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const renderHeroImage = () => {
    if (!topic?.image_url || heroImageError) {
      return (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroPlaceholderIcon}>📰</Text>
          <Text style={styles.heroPlaceholderText}>{topic?.category?.toUpperCase()}</Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: topic.image_url }}
        style={styles.heroImage}
        resizeMode="cover"
        onError={() => setHeroImageError(true)}
      />
    );
  };

  const renderStats = () => {
    if (!topic) return null;

    return (
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{topic.article_count}</Text>
          <Text style={styles.statLabel}>Articles</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{Math.round(topic.confidence * 100)}%</Text>
          <Text style={styles.statLabel}>Confidence</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{topic.history_point_count || 0}</Text>
          <Text style={styles.statLabel}>Updates</Text>
        </View>
      </View>
    );
  };

  const renderActionButtons = () => {
    if (!topic) return null;

    return (
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.timelineAction]}
          onPress={handleOpenTimeline}
        >
          <Ionicons name="git-branch" size={18} color="#8B5CF6" />
          <Text style={styles.actionButtonText}>Timeline</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.podcastAction]}
          onPress={handleGeneratePodcast}
        >
          <Ionicons name="sparkles" size={18} color="#6366F1" />
          <Text style={styles.actionButtonText}>Generate Podcast</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.discussionAction]}
          onPress={scrollToDiscussions}
        >
          <Ionicons name="chatbubble-outline" size={18} color="#10B981" />
          <Text style={styles.actionButtonText}>Discuss</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDiscussionSection = () => {
    if (loadingDiscussion) {
      return (
        <View style={styles.discussionLoading}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={styles.discussionLoadingText}>Loading discussions...</Text>
        </View>
      );
    }

    if (!discussionId) {
      return (
        <View style={styles.noDiscussion}>
          <Ionicons name="chatbubbles-outline" size={32} color="#D1D5DB" />
          <Text style={styles.noDiscussionTitle}>No Discussions Yet</Text>
          <Text style={styles.noDiscussionText}>
            Be the first to start a discussion about this topic
          </Text>
          <TouchableOpacity style={styles.startDiscussionButton}>
            <Text style={styles.startDiscussionButtonText}>Start a Discussion</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const miniPlayerHeight = showPlayer ? 70 : 0;

    return (
      <View style={styles.discussionSection}>
        <View style={styles.discussionHeader}>
          <View style={styles.discussionHeaderLeft}>
            <Ionicons name="chatbubble-outline" size={20} color="#10B981" />
            <Text style={styles.discussionHeaderTitle}>Discussion</Text>
          </View>
          <View style={styles.replyCountBadge}>
            <Text style={styles.replyCountText}>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</Text>
          </View>
        </View>
        <View style={[styles.discussionContent, { paddingBottom: miniPlayerHeight }]}>
          <DiscussionThread discussionId={discussionId} />
        </View>
      </View>
    );
  };

  const renderArticlesSection = () => {
    if (!topic?.articles || topic.articles.length === 0) return null;

    return (
      <View style={styles.articlesSection}>
        <TouchableOpacity 
          style={styles.sectionHeader}
          onPress={toggleArticles}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="newspaper" size={20} color="#6366F1" />
            <Text style={styles.sectionHeaderTitle}>Source Articles</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            <Text style={styles.articleCountText}>{topic.article_count} total</Text>
            <Ionicons 
              name={isArticlesExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color="#6B7280" 
            />
          </View>
        </TouchableOpacity>

        {isArticlesExpanded && (
          <View style={styles.articlesContent}>
            {topic.articles.map((article, index) => (
              <TouchableOpacity
                key={article.id}
                style={[styles.articleCard, index === 0 && styles.firstArticle]}
                onPress={() => openArticle(article.url)}
              >
                <View style={styles.articleContent}>
                  <Text style={styles.articleTitle} numberOfLines={2}>
                    {article.title}
                  </Text>
                  <Text style={styles.articleSource}>{article.source}</Text>
                </View>
                <Ionicons name="open-outline" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!topic) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Topic not found</Text>
      </View>
    );
  }

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          PODNOVA TOPIC
        </Text>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="share-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: miniPlayerHeight + 20 }
        ]}
      >
        {/* Hero Section */}
        {renderHeroImage()}

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.topicTitle}>{topic.title}</Text>
          <View style={styles.metadata}>
            <Text style={styles.metadataText}>
              Updated {topic.time_ago}
            </Text>
            {topic.development_note && (
              <View style={styles.developingBadge}>
                <Ionicons name="flash-outline" size={12} color="#8B5CF6" />
                <Text style={styles.developingBadgeText}>Developing News</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats Grid */}
        {renderStats()}

        {/* Action Buttons */}
        {renderActionButtons()}

        {/* Summary Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          <Text style={styles.summaryText}>{topic.summary}</Text>
        </View>

        {/* Key Insights with Feather check-circle icons */}
        {topic.key_insights && topic.key_insights.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Key Insights</Text>
            {topic.key_insights.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <Feather name="check-circle" size={16} color="#10B981" style={styles.insightIcon} />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tags */}
        {topic.tags && topic.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {topic.tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Articles Section - Collapsible */}
        {renderArticlesSection()}

        {/* Discussion Section - Non-collapsible, takes more space */}
        {renderDiscussionSection()}
      </ScrollView>

      {/* Modals */}
      {topic && (
        <>
          <PodcastGeneratorModal
            visible={showPodcastModal}
            onClose={() => setShowPodcastModal(false)}
            topic={{
              id: topic.id,
              title: topic.title,
              article_count: topic.article_count,
            }}
          />

          <TopicHistoryModal
            visible={showHistoryTimeline}
            onClose={() => setShowHistoryTimeline(false)}
            topicId={topic.id}
            topicTitle={topic.title}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  heroImage: {
    width: "100%",
    height: 200,
  },
  heroPlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  heroPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroPlaceholderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  titleSection: {
    padding: 20,
    paddingBottom: 16,
  },
  topicTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 32,
    marginBottom: 8,
  },
  metadata: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metadataText: {
    fontSize: 14,
    color: "#6B7280",
  },
  developingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  developingBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8B5CF6",
  },
  statsGrid: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 20,
    borderRadius: 24,
    gap: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  timelineAction: {
    borderColor: "#8B5CF6",
  },
  podcastAction: {
    borderColor: "#6366F1",
  },
  discussionAction: {
    borderColor: "#10B981",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  card: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#4B5563",
  },
  insightItem: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start",
  },
  insightIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  tag: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    color: "#4B5563",
  },
  // Articles Section
  articlesSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  articleCountText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  articlesContent: {
    padding: 16,
  },
  articleCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  firstArticle: {
    paddingTop: 0,
    marginTop: 0,
    borderTopWidth: 0,
  },
  articleContent: {
    flex: 1,
    marginRight: 12,
  },
  articleTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
    lineHeight: 20,
  },
  articleSource: {
    fontSize: 13,
    color: "#6B7280",
  },
  // Discussion Section - Non-collapsible
  discussionSection: {
    marginBottom: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    overflow: "hidden",
    minHeight: 500,
  },
  discussionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  discussionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  discussionHeaderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  discussionContent: {
    minHeight: 600,
    backgroundColor: "#F9FAFB",
  },
  replyCountBadge: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  replyCountText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
  },
  discussionLoading: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 40,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  discussionLoadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  noDiscussion: {
    marginHorizontal: 20,
    padding: 40,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  noDiscussionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  noDiscussionText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
  },
  startDiscussionButton: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startDiscussionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorText: {
    fontSize: 16,
    color: "#6B7280",
  },
});

export default TopicDetailScreen;