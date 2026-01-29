// frontend/src/screens/TopicDetail.tsx - UPDATED VERSION
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Image,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../Navigator";
import { TopicDetail } from "../types/topics";
import { Ionicons } from '@expo/vector-icons';
import PodcastGeneratorModal from "../components/PodcastGenModal";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

type TabType = "overview" | "discussion";
type TopicDetailNavigationProp = NativeStackNavigationProp<MainStackParamList>;

const TopicDetailScreen: React.FC = () => {
  const navigation = useNavigation<TopicDetailNavigationProp>();
  const route = useRoute();
  const { topicId } = route.params as { topicId: string };

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroImageError, setHeroImageError] = useState(false);
  const [showPodcastModal, setShowPodcastModal] = useState(false);

  useEffect(() => {
    loadTopic();
  }, [topicId]);

  const loadTopic = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/topics/${topicId}`);
      const data = await response.json();
      setTopic(data);
    } catch (error) {
      console.error("Error loading topic:", error);
    } finally {
      setLoading(false);
    }
  };

  const openArticle = (url: string) => {
    Linking.openURL(url);
  };

  const handleGeneratePodcast = () => {
    setShowPodcastModal(true);
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

  const renderOverviewTab = () => {
    if (!topic) return null;

    return (
      <View>
        {renderHeroImage()}

        <View style={styles.titleSection}>
          <Text style={styles.topicTitle}>{topic.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{topic.article_count} Articles</Text>
            <Text style={styles.metaSeparator}>•</Text>
            <Text style={styles.metaLabel}>Updated {topic.time_ago}</Text>
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>Confidence {Math.round(topic.confidence * 100)}%</Text>
          </View>
        </View>

        {/* UPDATED: Podcast button now opens modal */}
        <TouchableOpacity 
          style={styles.podcastButton}
          onPress={handleGeneratePodcast}
        >
          <View style={styles.podcastButtonContent}>
            <View style={styles.podcastIconContainer}>
                <Ionicons name="sparkles" size={20} color="#6366F1" />
            </View>
            <View style={styles.podcastTextContainer}>
              <Text style={styles.podcastTitle}>Generate AI Podcast</Text>
              <Text style={styles.podcastSubtitle}>
                Create a comprehensive podcast summary of all {topic.article_count} articles on this topic.
              </Text>
            </View>
          </View>
          <View style={styles.podcastGenerateButton}>
            <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
            <Text style={styles.podcastGenerateText}>Generate Podcast</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About this Topic</Text>
          <Text style={styles.summary}>{topic.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Insights</Text>
          {topic.key_insights?.map((insight, index) => (
            <View key={index} style={styles.insightItem}>
              <View style={styles.insightBullet}>
                <View style={styles.bulletDot} />
              </View>
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>

        {topic.tags && topic.tags.length > 0 && (
          <View style={styles.section}>
            <View style={styles.tagsContainer}>
              {topic.tags?.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
              {topic.tags && topic.tags.length > 3 && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>+{topic.tags.length - 3}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Source Articles ({topic.article_count})</Text>
          {topic.articles?.map((article) => (
            <TouchableOpacity
              key={article.id}
              style={styles.articleCard}
              onPress={() => openArticle(article.url)}
            >
              <Text style={styles.articleTitle}>{article.title}</Text>
              <Text style={styles.articleSource}>{article.source}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderDiscussionTab = () => {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No Discussions Yet</Text>
        <Text style={styles.emptyText}>
          Be the first to start a discussion about this topic
        </Text>
        <TouchableOpacity style={styles.startDiscussionButton}>
          <Text style={styles.startDiscussionText}>Start Discussion</Text>
        </TouchableOpacity>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {topic.category?.charAt(0).toUpperCase() + topic.category?.slice(1)}
        </Text>
        <TouchableOpacity style={styles.searchButton}>
          <Ionicons name="search" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "overview" && styles.tabActive]}
          onPress={() => setActiveTab("overview")}
        >
          <Text style={[styles.tabText, activeTab === "overview" && styles.tabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "discussion" && styles.tabActive]}
          onPress={() => setActiveTab("discussion")}
        >
          <Text style={[styles.tabText, activeTab === "discussion" && styles.tabTextActive]}>
            Discussion
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === "overview" ? renderOverviewTab() : renderDiscussionTab()}
      </ScrollView>

      {/*Podcast Generator Modal */}
      {topic && (
        <PodcastGeneratorModal
          visible={showPodcastModal}
          onClose={() => setShowPodcastModal(false)}
          topic={{
            id: topic.id,
            title: topic.title,
            article_count: topic.article_count,
          }}
        />
      )}
    </View>
  );
};

export default TopicDetailScreen;

// Styles remain the same
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
    paddingHorizontal: 16,
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
  },
  backIcon: {
    fontSize: 24,
    color: "#111827",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginHorizontal: 12,
    textAlign: "center",
  },
  searchButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#6366F1",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  heroImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#F3F4F6",
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
    backgroundColor: "#FFFFFF",
  },
  topicTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 28,
    marginBottom: 12,
  },
  section: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4B5563",
  },
  insightItem: {
    flexDirection: "row",
    marginBottom: 12,
  },
  insightBullet: {
    marginTop: 6,
    marginRight: 12,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6366F1",
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
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
  },
  tagText: {
    fontSize: 12,
    color: "#6366F1",
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  metaSeparator: {
    marginHorizontal: 8,
    color: "#D1D5DB",
  },
  confidenceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#D1FAE5",
  },
  confidenceText: {
    fontSize: 12,
    color: "#047857",
    fontWeight: "600",
  },
  podcastButton: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  podcastButtonContent: {
    flexDirection: "row",
    marginBottom: 16,
  },
  podcastIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  podcastTextContainer: {
    flex: 1,
  },
  podcastTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  podcastSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  podcastGenerateButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#6366F1",
    gap: 8,
  },
  podcastGenerateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  articleCard: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    marginBottom: 8,
  },
  articleTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  articleSource: {
    fontSize: 12,
    color: "#6B7280",
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  startDiscussionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#6366F1",
  },
  startDiscussionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorText: {
    fontSize: 16,
    color: "#6B7280",
  },
});