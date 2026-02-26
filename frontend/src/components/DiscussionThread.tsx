import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
  Alert,
  Modal,
  Keyboard,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";
import { getAuth } from "firebase/auth";
import { useAudio } from "../contexts/AudioContext";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

interface Reply {
  id: string;
  discussion_id: string;
  parent_reply_id?: string;
  content: string;
  user_id: string;
  username: string;
  upvote_count: number;
  is_upvoted_by_user: boolean;
  mentions: string[];
  created_at: string;
  time_ago: string;
  is_edited: boolean;
  replies?: Reply[];
}

interface DiscussionThreadProps {
  discussionId: string;
  title?: string;
  description?: string;
  username?: string;
  createdAt?: string;
  replyCount?: number;
  viewCount?: number;
  userHasUpvoted?: boolean;
  upvoteCount?: number;
  onUpvote?: () => void;
  discussionType?: "topic" | "community";
  category?: string;
  tags?: string[];
}

const getCategoryColor = (category?: string): string => {
  if (!category) return "#8B5CF6";
  switch (category.toLowerCase()) {
    case "technology":
    case "tech":
      return "#f16365ff";
    case "finance":
      return "#73aef2ff";
    case "politics":
      return "#8B5CF6";
    default:
      return "#8B5CF6";
  }
};

const DiscussionThread: React.FC<DiscussionThreadProps> = ({ 
  discussionId,
  title,
  description,
  username,
  createdAt,
  replyCount,
  viewCount,
  userHasUpvoted = false,
  upvoteCount = 0,
  onUpvote,
  discussionType = "community",
  category,
  tags = [],
}) => {
  const { showPlayer } = useAudio();
  
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  // Keyboard listener with dynamic padding based on mini player
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        if (showPlayer) {
          setKeyboardHeight(260);
        } else {
          setKeyboardHeight(e.endCoordinates.height);
        }
        setIsKeyboardVisible(true);
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [showPlayer]);

  const getAuthToken = async (): Promise<string | null> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      setCurrentUser(user.uid);
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
    loadReplies();
  }, [discussionId]);

  const loadReplies = async () => {
    try {
      const token = await getAuthToken();
      
      if (!token) {
        console.log("No authenticated user");
        setLoading(false);
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
        const nestedReplies = organizeReplies(data.replies || []);
        setReplies(nestedReplies);
      }
    } catch (error) {
      console.error("Error loading replies:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const organizeReplies = (flatReplies: Reply[]): Reply[] => {
    const replyMap = new Map<string, Reply>();
    const rootReplies: Reply[] = [];

    flatReplies.forEach(reply => {
      replyMap.set(reply.id, { ...reply, replies: [] });
    });

    flatReplies.forEach(reply => {
      const replyWithChildren = replyMap.get(reply.id)!;
      if (reply.parent_reply_id) {
        const parent = replyMap.get(reply.parent_reply_id);
        if (parent) {
          if (!parent.replies) parent.replies = [];
          parent.replies.push(replyWithChildren);
        }
      } else {
        rootReplies.push(replyWithChildren);
      }
    });

    return rootReplies;
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReplies();
  };

  const handleUpvoteReply = async (replyId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/discussions/replies/${replyId}/upvote`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const updateReplyInTree = (repliesList: Reply[]): Reply[] => {
          return repliesList.map(reply => {
            if (reply.id === replyId) {
              return {
                ...reply,
                is_upvoted_by_user: data.upvoted,
                upvote_count: data.upvoted
                  ? reply.upvote_count + 1
                  : reply.upvote_count - 1,
              };
            }
            if (reply.replies) {
              return {
                ...reply,
                replies: updateReplyInTree(reply.replies)
              };
            }
            return reply;
          });
        };
        setReplies(updateReplyInTree(replies));
      }
    } catch (error) {
      console.error("Error upvoting reply:", error);
    }
  };

  const handleDeleteReply = async () => {
    if (!replyToDelete) return;

    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/discussions/replies/${replyToDelete}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const removeReplyFromTree = (repliesList: Reply[]): Reply[] => {
            return repliesList.filter(reply => {
              if (reply.id === replyToDelete) {
                return false;
              }
              if (reply.replies) {
                reply.replies = removeReplyFromTree(reply.replies);
              }
              return true;
            });
          };
          setReplies(removeReplyFromTree(replies));
          Alert.alert("Success", "Reply deleted successfully");
        } else {
          Alert.alert("Error", result.message || "Failed to delete reply");
        }
      } else {
        const error = await response.json();
        Alert.alert("Error", error.detail || "Failed to delete reply");
      }
    } catch (error) {
      console.error("Error deleting reply:", error);
      Alert.alert("Error", "Failed to delete reply");
    } finally {
      setShowDeleteModal(false);
      setReplyToDelete(null);
    }
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !discussionId) return;

    try {
      setSubmitting(true);
      const token = await getAuthToken();
      
      if (!token) {
        Alert.alert("Error", "You need to be logged in to reply");
        return;
      }

      let url = `${API_BASE_URL}/discussions/${discussionId}/replies?content=${encodeURIComponent(replyText.trim())}`;
      if (replyingTo?.id) {
        url += `&parent_reply_id=${replyingTo.id}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setReplyText("");
        setReplyingTo(null);
        await loadReplies();
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        const errorText = await response.text();
        Alert.alert("Error", `Failed to post reply: ${errorText}`);
      }
    } catch (error) {
      console.error("Error submitting reply:", error);
      Alert.alert("Error", "Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const toggleThread = (replyId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(replyId)) {
      newExpanded.delete(replyId);
    } else {
      newExpanded.add(replyId);
    }
    setExpandedThreads(newExpanded);
  };

  const toggleDescription = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDescriptionExpanded(!isDescriptionExpanded);
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const renderReply = (reply: Reply, depth: number = 0) => {
    const isExpanded = expandedThreads.has(reply.id);
    const hasReplies = reply.replies && reply.replies.length > 0;
    const isOwnReply = reply.user_id === currentUser;

    return (
      <View key={reply.id} style={[styles.replyContainer, depth > 0 && styles.nestedReply]}>
        <View style={styles.replyCard}>
          {/* Reply Header */}
          <View style={styles.replyHeader}>
            <View style={styles.replyUserInfo}>
              <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
              <Text style={styles.replyUsername}>{reply.username}</Text>
              <Text style={styles.replyTime}>• {reply.time_ago}</Text>
              {reply.is_edited && (
                <Text style={styles.editedBadge}>(edited)</Text>
              )}
            </View>

            <View style={styles.replyHeaderRight}>
              {isOwnReply && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => {
                    setReplyToDelete(reply.id);
                    setShowDeleteModal(true);
                  }}
                >
                  <Ionicons name="trash-outline" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Reply Content */}
          <Text style={styles.replyContent}>{reply.content}</Text>

          {/* Reply Actions Row */}
          <View style={styles.replyActionsRow}>
            <View style={styles.replyActionsLeft}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleUpvoteReply(reply.id)}
              >
                <Feather
                  name="thumbs-up"
                  size={14}
                  color={reply.is_upvoted_by_user ? "#6366F1" : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.actionText,
                    reply.is_upvoted_by_user && styles.actionTextActive,
                  ]}
                >
                  {reply.upvote_count}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setReplyingTo(reply);
                  focusInput();
                }}
              >
                <Ionicons name="return-down-forward-outline" size={14} color="#9CA3AF" />
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>

              {hasReplies && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => toggleThread(reply.id)}
                >
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#9CA3AF"
                  />
                  <Text style={styles.actionText}>
                    {reply.replies?.length}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Nested Replies */}
        {hasReplies && isExpanded && (
          <View style={styles.repliesThread}>
            {reply.replies?.map(childReply => renderReply(childReply, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => {
    if (!title) return null;

    const categoryColor = getCategoryColor(category);
    const isTopicDiscussion = discussionType === "topic";
    
    const typeColors = isTopicDiscussion 
      ? { 
          bg: categoryColor + "20", // 20% opacity of category color
          text: categoryColor,
          icon: "chatbubble-ellipses-outline" as const
        }
      : { 
          bg: "#FEF3C7", 
          text: "#F59E0B",
          icon: "people-outline" as const
        };

    const typeText = isTopicDiscussion ? "Topic Discussion" : "Community Discussion";

    return (
      <View style={styles.headerContainer}>
        {/* Type Badge */}
        <View style={styles.typeBadge}>
          <View style={[styles.typeBadgeInner, { backgroundColor: typeColors.bg }]}>
            <Ionicons name={typeColors.icon} size={12} color={typeColors.text} />
            <Text style={[styles.typeBadgeText, { color: typeColors.text }]}>
              {typeText}
            </Text>
          </View>
          {isTopicDiscussion && category && (
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + "15" }]}>
              <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
                {category}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Description with toggle */}
        {description && (
          <View style={styles.descriptionContainer}>
            <Text 
              style={styles.description}
              numberOfLines={isDescriptionExpanded ? undefined : 2}
            >
              {description}
            </Text>
            {description.length > 100 && (
              <TouchableOpacity onPress={toggleDescription} activeOpacity={0.7}>
                <Text style={styles.showMoreText}>
                  {isDescriptionExpanded ? 'Show less' : 'Show more'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Metadata Row */}
        <View style={styles.metadataRow}>
          <View style={styles.metadataLeft}>
            <Ionicons name="person-circle-outline" size={14} color="#6B7280" />
            <Text style={styles.metadataText}>{username || 'Anonymous'}</Text>
            <Text style={styles.metadataDot}>•</Text>
            <Text style={styles.metadataText}>{createdAt || 'Just now'}</Text>
          </View>
          
          <View style={styles.metadataRight}>
            {viewCount !== undefined && (
              <View style={styles.metadataItem}>
                <Ionicons name="eye-outline" size={12} color="#9CA3AF" />
                <Text style={styles.metadataItemText}>{viewCount}</Text>
              </View>
            )}
            {replyCount !== undefined && (
              <View style={styles.metadataItem}>
                <Ionicons name="chatbubble-outline" size={12} color="#9CA3AF" />
                <Text style={styles.metadataItemText}>{replyCount}</Text>
              </View>
            )}
            <TouchableOpacity 
              style={styles.upvoteButton}
              onPress={onUpvote}
            >
              <Feather
                name="thumbs-up"
                size={12}
                color={userHasUpvoted ? "#6366F1" : "#9CA3AF"}
              />
              <Text style={[styles.upvoteText, userHasUpvoted && styles.upvoteTextActive]}>
                {upvoteCount}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />
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

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View style={styles.container}>
        {/* Fixed Header */}
        {renderHeader()}

        {/* Scrollable Replies */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {replies.length === 0 ? (
            <View style={styles.emptyReplies}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyRepliesText}>
                No replies yet. Be the first to share your thoughts!
              </Text>
            </View>
          ) : (
            replies.map(reply => renderReply(reply))
          )}
          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Fixed Reply Input */}
        <View style={[
          styles.inputContainer,
          isKeyboardVisible && { marginBottom: keyboardHeight }
        ]}>
          {replyingTo && (
            <View style={styles.replyingToBanner}>
              <View style={styles.replyingToContent}>
                <Ionicons name="return-down-forward" size={12} color="#6366F1" />
                <Text style={styles.replyingToText} numberOfLines={1}>
                  Replying to {replyingTo.username}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.replyInputRow}>
            <TextInput
              ref={inputRef}
              style={styles.replyInput}
              placeholder="Add a reply..."
              placeholderTextColor="#9CA3AF"
              value={replyText}
              onChangeText={setReplyText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!replyText.trim() || submitting) && styles.sendButtonDisabled,
              ]}
              onPress={handleSubmitReply}
              disabled={!replyText.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Delete Confirmation Modal */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowDeleteModal(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.deleteModal}>
                  <View style={styles.deleteModalHeader}>
                    <Ionicons name="warning" size={32} color="#EF4444" />
                    <Text style={styles.deleteModalTitle}>Delete Reply</Text>
                  </View>
                  <Text style={styles.deleteModalText}>
                    Are you sure you want to delete this reply? This action cannot be undone.
                  </Text>
                  <View style={styles.deleteModalButtons}>
                    <TouchableOpacity
                      style={[styles.deleteModalButton, styles.cancelButton]}
                      onPress={() => setShowDeleteModal(false)}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deleteModalButton, styles.confirmDeleteButton]}
                      onPress={handleDeleteReply}
                    >
                      <Text style={styles.confirmDeleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
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
  },
  headerContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
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
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  descriptionContainer: {
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
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
  metadataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metadataLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    color: "#6B7280",
  },
  metadataDot: {
    fontSize: 12,
    color: "#D1D5DB",
  },
  metadataRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  metadataItemText: {
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
  scrollView: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyReplies: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  emptyRepliesText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
  },
  replyContainer: {
    marginBottom: 8,
  },
  nestedReply: {
    marginLeft: 12,
  },
  replyCard: {
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  replyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  replyUserInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    flexWrap: "wrap",
  },
  replyHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  replyUsername: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  replyTime: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  editedBadge: {
    fontSize: 10,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  deleteButton: {
    padding: 4,
  },
  replyContent: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
    marginBottom: 12,
    marginLeft: 12,
  },
  replyActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  replyActionsLeft: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  actionTextActive: {
    color: "#6366F1",
  },
  repliesThread: {
    marginTop: 6,
  },
  inputContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 0,
    marginBottom: 20,
  },
  replyingToBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    marginBottom: 6,
  },
  replyingToContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  replyingToText: {
    fontSize: 11,
    color: "#6366F1",
    fontWeight: "500",
    flex: 1,
  },
  replyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  replyInput: {
    flex: 1,
    maxHeight: 80,
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginVertical: 12,
    fontSize: 13,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  deleteModalHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 8,
  },
  deleteModalText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  deleteModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  confirmDeleteButton: {
    backgroundColor: "#EF4444",
  },
  confirmDeleteText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default DiscussionThread;