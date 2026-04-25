// frontend/src/screens/TopicDetail.tsx
// Displays a single topic with its summary, key insights, source articles, and discussion thread.

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
  Share,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
  Modal,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { TopicDetail } from "../types/topics";
import { Ionicons } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import PodcastGeneratorModal from "../components/modals/PodcastGenModal";
import TopicHistoryModal from "../components/modals/TopicHistoryModal";
import DiscussionThread from "../components/DiscussionThread";
import { getAuth } from "firebase/auth";
import { useAudio } from "../contexts/AudioContext";
import TopicDetailSkeleton from "../components/skeletons/TopicDetailSkeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type TopicDetailNavigationProp = NativeStackNavigationProp<MainStackParamList>;

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

const TopicDetailScreen: React.FC = () => {
  const navigation = useNavigation<TopicDetailNavigationProp>();
  const route = useRoute();
  const { topicId } = route.params as { topicId: string };
  const { showPlayer } = useAudio();
  
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);

  const [heroImageError, setHeroImageError] = useState(false);
  const [showPodcastModal, setShowPodcastModal] = useState(false);
  const [showHistoryTimeline, setShowHistoryTimeline] = useState(false);
  const [isArticlesExpanded, setIsArticlesExpanded] = useState(false);
  
  const [optimisticFollow, setOptimisticFollow] = useState<boolean | null>(null);
  const [showFollowModal, setShowFollowModal] = useState(false);

  // Fetch topic details
  const {
    data: topic,
    isLoading: loadingTopic,
    isError: isTopicError,
    refetch: refetchTopic,
    isRefetching: isRefetchingTopic
  } = useQuery({
    queryKey: ['topic', topicId],
    queryFn: async (): Promise<TopicDetail> => {
      if (!topicId || topicId === "undefined") throw new Error("Invalid Topic ID");
      const response = await fetch(`${API_BASE_URL}/topics/${topicId}`);
      if (!response.ok) throw new Error(`Failed to load topic`);
      
      const data = await response.json();
      if (data && data._id && !data.id) data.id = data._id;
      return data;
    },
    staleTime: 1000 * 60 * 5, 
    retry: 1,
  });

  // Fetch the discussion associated with this topic
  const {
    data: discussion,
    isLoading: loadingDiscussion,
    refetch: refetchDiscussion,
    isRefetching: isRefetchingDiscussion
  } = useQuery({
    queryKey: ['topicDiscussion', topic?.id],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token || !topic?.id) return null;

      const response = await fetch(
        `${API_BASE_URL}/discussions?topic_id=${topic.id}&discussion_type=topic`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return null;
      const data = await response.json();
      return data.discussions && data.discussions.length > 0 ? data.discussions[0] : null;
    },
    enabled: !!topic?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Check if the user is following this topic
  const { 
    data: followData, 
    refetch: refetchFollowStatus 
  } = useQuery({
    queryKey: ['followStatus', topicId],
    queryFn: async () => {
        const token = await getAuthToken();
        if (!token || !topicId) return { is_following: false };
        
        const res = await fetch(`${API_BASE_URL}/users/topics/${topicId}/follow-status`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) return { is_following: false };
        return res.json();
    },
    enabled: !!topicId,
  });

  const discussionId = discussion?.id || discussion?._id || null;
  const replyCount = discussion?.reply_count || 0;

  // Optimistic follow status - updates UI immediately before server response
  const isFollowing = optimisticFollow !== null 
    ? optimisticFollow 
    : (followData?.is_following || false);

  useEffect(() => {
    if (isTopicError) {
      Alert.alert("Topic Unavailable", "This topic could not be found or has been removed.");
      if (navigation.canGoBack()) navigation.goBack();
      else (navigation as any).replace("MainTabs"); 
    }
  }, [isTopicError]);

  const onRefresh = async () => {
    await Promise.all([refetchTopic(), refetchDiscussion(), refetchFollowStatus()]);
  };

  const openArticle = (url: string) => Linking.openURL(url);
  const handleGeneratePodcast = () => setShowPodcastModal(true);
  const handleOpenTimeline = () => setShowHistoryTimeline(true);

  const toggleArticles = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsArticlesExpanded(!isArticlesExpanded);
  };

  const scrollToDiscussions = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 400); 
  };

  const handleToggleFollow = async () => {
    if (!topic?.id) return;
    
    const newStatus = !isFollowing;
    setOptimisticFollow(newStatus);

    // Show confirmation modal only when following (not unfollowing)
    if (newStatus === true) {
      setShowFollowModal(true);
    }
    
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/users/topics/${topic.id}/follow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error("Failed to update follow status");
      }
      
      queryClient.invalidateQueries({ queryKey: ['followStatus', topic.id] });
      queryClient.invalidateQueries({ queryKey: ['followedTopics'] }); 
      
    } catch (error) {
      setOptimisticFollow(isFollowing);
      if (newStatus === true) setShowFollowModal(false);
      Alert.alert("Error", "Could not update tracking preferences. Please try again.");
    }
  };

  const handleShare = async () => {
    if (!topic) return;
    try {
      const shareUrl = `https://podnova.app/topic/${topic.id}`;
      const message = Platform.OS === 'android' 
        ? `Check out this topic on PodNova: ${topic.title}\n\n${shareUrl}`
        : `Check out this topic on PodNova: ${topic.title}`;

      await Share.share({
        message,
        url: shareUrl, 
        title: topic.title,
      });
    } catch (error: any) {
      Alert.alert("Error", "Could not share this topic.");
    }
  };

  const getCategoryFallback = (category?: string) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('tech')) return { colors: ['#FDA4A3', '#F16365'], icon: 'hardware-chip-outline' as const };
    if (cat.includes('finance')) return { colors: ['#A5CFF4', '#73AEF2'], icon: 'trending-up-outline' as const };
    if (cat.includes('politic')) return { colors: ['#A78BFA', '#8B5CF6'], icon: 'business-outline' as const };
    return { colors: ['#818CF8', '#4F46E5'], icon: 'newspaper-outline' as const }; 
  };

  const renderHeroImage = () => {
    if (!topic?.image_url || heroImageError) {
      const fallback = getCategoryFallback(topic?.category);
      return (
        <LinearGradient
          colors={fallback.colors as [string, string]}
          style={styles.heroPlaceholder}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name={fallback.icon as any} size={80} color="rgba(255,255,255,0.8)" />
          <Text style={[styles.heroPlaceholderText, { marginTop: 12 }]}>
            {topic?.category?.toUpperCase() || 'NEWS'}
          </Text>
        </LinearGradient>
      );
    }

    return (
      <Image
        source={{ uri: topic.image_url }}
        style={styles.heroImage}
        resizeMode="cover"
        progressiveRenderingEnabled={true} 
        fadeDuration={300} 
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
        <TouchableOpacity style={[styles.actionButton, styles.timelineAction]} onPress={handleOpenTimeline}>
          <Ionicons name="git-branch" size={18} color="#8B5CF6" />
          <Text style={styles.actionButtonText}>Timeline</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.podcastButtonContainer} onPress={handleGeneratePodcast} activeOpacity={0.8}>
          <LinearGradient
            colors={['#8B5CF6', '#6366F1']}
            style={styles.podcastButtonGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
            <Text style={styles.podcastButtonText}>Create Podcast</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.discussionAction]} onPress={scrollToDiscussions}>
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
          <Text style={styles.noDiscussionText}>Be the first to start a discussion about this topic</Text>
          <TouchableOpacity style={styles.startDiscussionButton}>
            <Text style={styles.startDiscussionButtonText}>Start a Discussion</Text>
          </TouchableOpacity>
        </View>
      );
    }

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
        <View style={styles.discussionContent}>
          <DiscussionThread 
            discussionId={discussionId} 
            isNested={true}
            onInputFocus={scrollToDiscussions} 
          />
        </View>
      </View>
    );
  };

  const renderArticlesSection = () => {
    if (!topic?.articles || topic.articles.length === 0) return null;
    return (
      <View style={styles.articlesSection}>
        <TouchableOpacity style={styles.sectionHeader} onPress={toggleArticles} activeOpacity={0.7}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="newspaper" size={20} color="#6366F1" />
            <Text style={styles.sectionHeaderTitle}>Source Articles</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            <Text style={styles.articleCountText}>{topic.article_count} total</Text>
            <Ionicons name={isArticlesExpanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
          </View>
        </TouchableOpacity>

        {isArticlesExpanded && (
          <View style={styles.articlesContent}>
            {topic.articles.map((article, index) => (
              <TouchableOpacity key={article.id} style={[styles.articleCard, index === 0 && styles.firstArticle]} onPress={() => openArticle(article.url)}>
                <View style={styles.articleContent}>
                  <Text style={styles.articleTitle} numberOfLines={2}>{article.title}</Text>
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

  if (loadingTopic) return <TopicDetailSkeleton />;
  if (!topic) return <View style={styles.centerContainer}><Text style={styles.errorText}>Topic not found</Text></View>;

  const dynamicBottomPadding = showPlayer ? 95 : 20;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle} numberOfLines={1}>{topic.category} PODNOVA TOPIC</Text>
        
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton} onPress={handleToggleFollow}>
            <Ionicons name={isFollowing ? "notifications" : "notifications-outline"} size={22} color={isFollowing ? "#F59E0B" : "#6B7280"} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            <RefreshControl 
              refreshing={(isRefetchingTopic || isRefetchingDiscussion) && !loadingTopic} 
              onRefresh={onRefresh} 
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: dynamicBottomPadding } 
          ]}
        >
          {renderHeroImage()}

          <View style={styles.titleSection}>
            <Text style={styles.topicTitle}>{topic.title}</Text>
            <View style={styles.metadata}>
              <Text style={styles.metadataText}>Updated {topic.time_ago}</Text>
              {topic.development_note && (
                <View style={styles.developingBadge}>
                  <Ionicons name="flash-outline" size={12} color="#8B5CF6" />
                  <Text style={styles.developingBadgeText}>Developing News</Text>
                </View>
              )}
            </View>
          </View>

          {renderStats()}
          {renderActionButtons()}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <Text style={styles.summaryText}>{topic.summary}</Text>
          </View>

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

          {topic.tags && topic.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {topic.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {renderArticlesSection()}
          {renderDiscussionSection()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirmation modal shown after following a topic */}
      <Modal
        visible={showFollowModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFollowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="notifications" size={32} color="#F59E0B" />
            </View>
            <Text style={styles.modalTitle}>Topic Tracked</Text>
            <Text style={styles.modalMessage}>
              You will now receive push notifications when this story develops. We'll alert you of major narrative shifts, new sources, and reliability updates.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowFollowModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {topic && (
        <>
          <PodcastGeneratorModal
            visible={showPodcastModal}
            onClose={() => setShowPodcastModal(false)}
            topic={{ id: topic.id, title: topic.title, article_count: topic.article_count }}
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
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    flexGrow: 1, 
  },
  heroImage: {
    width: "100%",
    height: 200,
  },
  heroPlaceholder: {
    width: "100%",
    height: 200,
    justifyContent: "center",
    alignItems: "center",
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
    lineHeight: 28,
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
    alignItems: "center", 
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 24,
    gap: 6,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  timelineAction: {
    borderColor: "#E5E7EB",
  },
  discussionAction: {
    borderColor: "#E5E7EB",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  podcastButtonContainer: {
    flex: 1.2,
    borderRadius: 48,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 1, height: 5 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  podcastButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  podcastButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    width: "50%",
    textAlign: "center",
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
  articlesSection: {
    marginHorizontal: 20,
    marginBottom: 10, 
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
  discussionSection: {
    marginTop: 24,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 8, 
    borderTopColor: "#F3F4F6", 
  },
  discussionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF", 
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
    backgroundColor: "#FFFFFF", 
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
    marginTop: 40,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 15,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default TopicDetailScreen;