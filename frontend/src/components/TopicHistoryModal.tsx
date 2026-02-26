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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
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
    label: "Initial",
    color: "#A78BFA" // Pastel purple
  },
  major_update: { 
    icon: "git-branch", 
    label: "Major Update",
    color: "#FCA5A5" // Pastel red
  },
  source_expansion: { 
    icon: "newspaper", 
    label: "New Sources",
    color: "#93C5FD" // Pastel blue
  },
  confidence_shift: { 
    icon: "shield-checkmark", 
    label: "Confidence Update",
    color: "#FDBA74" // Pastel orange
  },
  periodic: { 
    icon: "calendar", 
    label: "Periodic Update",
    color: "#6EE7B7" // Pastel green
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
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(SLIDE_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) slideAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          handleClose();
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
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
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SLIDE_HEIGHT, duration: 250, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const togglePoint = (pointId: string) => {
    setSelectedPoint(selectedPoint === pointId ? null : pointId);
  };

  const renderTimelinePoint = (point: HistoryPoint, index: number) => {
    const config = HISTORY_TYPE_CONFIG[point.history_type];
    const isExpanded = selectedPoint === point.id;
    const isFirst = index === 0;

    return (
      <View key={point.id} style={styles.timelineItem}>
        {/* Timeline line */}
        {index > 0 && <View style={styles.timelineLine} />}
        
        <View style={styles.timelineNode}>
          <View style={[styles.nodeDot, isFirst && styles.nodeDotFirst]}>
            <Ionicons 
              name={config.icon as any} 
              size={isFirst ? 14 : 12} 
              color={config.color}
            />
          </View>
          
          <View style={styles.nodeContent}>
            <TouchableOpacity
              style={[styles.nodeCard, isExpanded && styles.nodeCardExpanded]}
              onPress={() => togglePoint(point.id)}
              activeOpacity={0.8}
            >
              <View style={styles.nodeHeader}>
                <View style={styles.nodeHeaderLeft}>
                  <Text style={[styles.nodeType, { color: config.color }]}>{config.label}</Text>
                  <Text style={styles.nodeDate}>{formatDate(point.created_at)}</Text>
                </View>
                {point.was_regenerated && (
                  <View style={styles.regeneratedBadge}>
                    <Ionicons name="refresh" size={10} color="#9CA3AF" />
                    <Text style={styles.regeneratedText}>Updated</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.nodeTitle, isFirst && styles.nodeTitleFirst]}>
                {point.title}
              </Text>

              {/* Development note - outside dropdown, under title */}
              {point.development_note && (
                <View style={styles.developmentNote}>
                  <Text style={styles.developmentNoteText}>{point.development_note}</Text>
                </View>
              )}

              <View style={styles.nodeStats}>
                <Text style={styles.statText}>{point.article_count} articles</Text>
                <Text style={styles.statDot}>•</Text>
                <Text style={styles.statText}>{point.sources.length} sources</Text>
                <Text style={styles.statDot}>•</Text>
                <Text style={styles.statText}>{Math.round(point.confidence * 100)}%</Text>
              </View>

              {isExpanded && (
                <View style={styles.expandedContent}>
                  <View style={styles.divider} />

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Summary</Text>
                    <Text style={styles.sectionText}>{point.summary}</Text>
                  </View>

                  {point.key_insights && point.key_insights.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Key Insights</Text>
                      {point.key_insights.map((insight, idx) => (
                        <View key={idx} style={styles.insightRow}>
                          <Text style={styles.insightBullet}>•</Text>
                          <Text style={styles.insightText}>{insight}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.timestamp}>{formatFullDate(point.created_at)}</Text>
                </View>
              )}

              <View style={styles.expandIndicator}>
                <Text style={styles.expandText}>
                  {isExpanded ? "Show less" : "Show details"}
                </Text>
                <Ionicons 
                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                  size={12} 
                  color="#9CA3AF" 
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="time-outline" size={40} color="#E5E7EB" />
      <Text style={styles.emptyTitle}>No Timeline Yet</Text>
      <Text style={styles.emptyText}>
        This story hasn't had any updates yet.
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View
        style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="git-network" size={18} color="#6B7280" />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Timeline</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
                {topicTitle}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : history.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              <View style={styles.statsRow}>
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
                  <Text style={styles.statLabel}>Days</Text>
                </View>
              </View>

              <View style={styles.timeline}>
                {history.map((point, index) => renderTimelinePoint(point, index))}
              </View>
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
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SLIDE_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    width: "100%",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
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
    marginHorizontal: 12,
  },
  timeline: {
    paddingHorizontal: 20,
  },
  timelineItem: {
    position: "relative",
    marginBottom: 16,
  },
  timelineLine: {
    position: "absolute",
    left: 15,
    top: -20,
    bottom: 20,
    width: 2,
    backgroundColor: "#F3F4F6",
    zIndex: 0,
  },
  timelineNode: {
    flexDirection: "row",
    position: "relative",
    zIndex: 1,
    gap: 12,
  },
  nodeDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  nodeDotFirst: {
    backgroundColor: "#EEF2FF",
  },
  nodeContent: {
    flex: 1,
  },
  nodeCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
  },
  nodeCardExpanded: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  nodeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  nodeHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nodeType: {
    fontSize: 12,
    fontWeight: "500",
  },
  nodeDate: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  regeneratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  regeneratedText: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  nodeTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 8,
    lineHeight: 20,
  },
  nodeTitleFirst: {
    fontSize: 16,
    fontWeight: "600",
  },
  developmentNote: {
    backgroundColor: "#F3F4F6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  developmentNoteText: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 16,
  },
  nodeStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: "#6B7280",
  },
  statDot: {
    fontSize: 12,
    color: "#D1D5DB",
    marginHorizontal: 2,
  },
  expandedContent: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  sectionText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  insightRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 6,
  },
  insightBullet: {
    fontSize: 14,
    color: "#6366F1",
    lineHeight: 18,
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
    fontSize: 11,
    color: "#9CA3AF",
  },
});

export default TopicHistoryModal;