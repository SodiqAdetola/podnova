// frontend/src/components/TopicHistoryModal.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDE_HEIGHT = SCREEN_HEIGHT * 0.85;
const SWIPE_THRESHOLD = 100;

interface HistoryPoint {
  id: string;
  history_type: "initial" | "major_update" | "source_expansion" | "confidence_shift" | "periodic";
  created_at: string;
  title: string;
  summary: string;
  key_insights: string[];
  article_count: number;
  sources: string[];
  confidence: number;
  significance_score: number;
  was_regenerated: boolean;
  development_note?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  topicId: string;
  topicTitle: string;
}

const HISTORY_TYPE_CONFIG = {
  initial: {
    icon: "flag",
    color: "#8B5CF6",
    label: "Story Begins",
    description: "Initial reports",
  },
  major_update: {
    icon: "git-branch",
    color: "#EF4444",
    label: "Major Update",
    description: "Significant development",
  },
  source_expansion: {
    icon: "newspaper",
    color: "#3B82F6",
    label: "New Perspectives",
    description: "Additional sources",
  },
  confidence_shift: {
    icon: "shield-checkmark",
    color: "#F59E0B",
    label: "Reliability Shift",
    description: "Verification update",
  },
  periodic: {
    icon: "calendar",
    color: "#10B981",
    label: "Periodic Update",
    description: "Regular snapshot",
  },
};

const TopicHistoryModal: React.FC<Props> = ({
  visible,
  onClose,
  topicId,
  topicTitle,
}) => {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<HistoryPoint | null>(null);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());

  const slideAnim = useRef(new Animated.Value(SLIDE_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      fetchHistory();
      animateIn();
    }
  }, [visible, topicId]);

  const animateIn = () => {
    slideAnim.setValue(SLIDE_HEIGHT);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SLIDE_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedPoint(null);
      onClose();
    });
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://podnova-backend-r8yz.onrender.com/topics/${topicId}/history`
      );
      const data = await response.json();
      setHistory(data.history_points || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const toggleInsights = (pointId: string) => {
    const newExpanded = new Set(expandedInsights);
    if (newExpanded.has(pointId)) {
      newExpanded.delete(pointId);
    } else {
      newExpanded.add(pointId);
    }
    setExpandedInsights(newExpanded);
  };

  const renderTimelinePoint = (point: HistoryPoint, index: number) => {
    const config = HISTORY_TYPE_CONFIG[point.history_type] || HISTORY_TYPE_CONFIG.major_update;
    const isFirst = index === 0;
    const isLast = index === history.length - 1;
    const isExpanded = expandedInsights.has(point.id);

    return (
      <View key={point.id} style={styles.timelinePointContainer}>
        {/* Timeline line */}
        {!isFirst && <View style={styles.timelineLine} />}

        {/* Timeline point */}
        <View style={styles.timelinePoint}>
          {/* Icon circle */}
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: config.color + "20", borderColor: config.color },
              isFirst && styles.iconCircleFirst,
            ]}
          >
            <Ionicons name={config.icon as any} size={isFirst ? 22 : 18} color={config.color} />
          </View>

          {/* Content card */}
          <TouchableOpacity
            style={[styles.contentCard, isFirst && styles.contentCardFirst]}
            onPress={() => toggleInsights(point.id)}
            activeOpacity={0.7}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.typeBadge, { backgroundColor: config.color + "15" }]}>
                  <Text style={[styles.typeBadgeText, { color: config.color }]}>
                    {config.label}
                  </Text>
                </View>
                <Text style={styles.timeAgo}>{formatTimeAgo(point.created_at)}</Text>
              </View>
              {point.was_regenerated && (
                <View style={styles.regeneratedBadge}>
                  <Ionicons name="sparkles" size={12} color="#8B5CF6" />
                  <Text style={styles.regeneratedText}>Updated</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={[styles.pointTitle, isFirst && styles.pointTitleFirst]}>
              {point.title}
            </Text>

            {/* Development note */}
            {point.development_note && (
              <View style={styles.developmentNote}>
                <Ionicons name="arrow-forward" size={14} color="#6366F1" />
                <Text style={styles.developmentNoteText}>{point.development_note}</Text>
              </View>
            )}

            {/* Meta row */}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="document-text" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{point.article_count} articles</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="newspaper" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{point.sources.length} sources</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="shield-checkmark" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{Math.round(point.confidence * 100)}%</Text>
              </View>
            </View>

            {/* Expandable insights */}
            {isExpanded && (
              <View style={styles.expandedContent}>
                <View style={styles.divider} />
                
                {/* Summary */}
                <View style={styles.summarySection}>
                  <Text style={styles.summaryLabel}>Summary</Text>
                  <Text style={styles.summaryText}>{point.summary}</Text>
                </View>

                {/* Key insights */}
                {point.key_insights && point.key_insights.length > 0 && (
                  <View style={styles.insightsSection}>
                    <Text style={styles.insightsLabel}>Key Points</Text>
                    {point.key_insights.slice(0, 3).map((insight, idx) => (
                      <View key={idx} style={styles.insightRow}>
                        <View style={styles.insightBullet} />
                        <Text style={styles.insightText}>{insight}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Timestamp */}
                <Text style={styles.timestamp}>{formatDate(point.created_at)}</Text>
              </View>
            )}

            {/* Expand indicator */}
            <View style={styles.expandIndicator}>
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color="#9CA3AF"
              />
              <Text style={styles.expandText}>
                {isExpanded ? "Show less" : "Show details"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Continue line to next point */}
        {!isLast && <View style={styles.timelineLine} />}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="time-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No History Yet</Text>
      <Text style={styles.emptyText}>
        This topic hasn't had any significant updates yet. Check back as the story develops!
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      {/* Slide-up panel */}
      <Animated.View
        style={[
          styles.slideUpContainer,
          {
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handleContainer} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="git-branch" size={20} color="#6366F1" />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Story Timeline</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {topicTitle}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>Loading timeline...</Text>
            </View>
          ) : history.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              <View style={styles.timelineStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{history.length}</Text>
                  <Text style={styles.statLabel}>Updates</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {history[0]?.article_count - history[history.length - 1]?.article_count || 0}
                  </Text>
                  <Text style={styles.statLabel}>New Articles</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {Math.round(
                      ((new Date().getTime() - new Date(history[history.length - 1]?.created_at).getTime()) /
                        (1000 * 60 * 60 * 24))
                    )}
                  </Text>
                  <Text style={styles.statLabel}>Days Active</Text>
                </View>
              </View>

              <View style={styles.timeline}>{history.map(renderTimelinePoint)}</View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  slideUpContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SLIDE_HEIGHT,
    backgroundColor: "#F9FAFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  handleContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  timelineStats: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#6366F1",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 12,
  },
  timeline: {
    paddingHorizontal: 20,
  },
  timelinePointContainer: {
    position: "relative",
  },
  timelineLine: {
    position: "absolute",
    left: 19,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#E5E7EB",
    zIndex: 0,
  },
  timelinePoint: {
    flexDirection: "row",
    position: "relative",
    zIndex: 1,
    marginBottom: 20,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 12,
  },
  iconCircleFirst: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
  },
  contentCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  contentCardFirst: {
    borderWidth: 2,
    borderColor: "#8B5CF6",
    shadowOpacity: 0.1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  timeAgo: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  regeneratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#F3E8FF",
    gap: 4,
  },
  regeneratedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8B5CF6",
  },
  pointTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 22,
    marginBottom: 8,
  },
  pointTitleFirst: {
    fontSize: 18,
    fontWeight: "700",
  },
  developmentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#EEF2FF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  developmentNoteText: {
    flex: 1,
    fontSize: 13,
    color: "#4338CA",
    lineHeight: 18,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: "#6B7280",
  },
  expandedContent: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  summarySection: {
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  insightsSection: {
    marginBottom: 12,
  },
  insightsLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  insightRow: {
    flexDirection: "row",
    marginBottom: 8,
    paddingLeft: 4,
  },
  insightBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6366F1",
    marginTop: 6,
    marginRight: 10,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 8,
  },
  expandIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 4,
  },
  expandText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});

export default TopicHistoryModal;