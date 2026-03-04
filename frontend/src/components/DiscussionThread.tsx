// frontend/src/components/DiscussionThread.tsx
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DiscussionThreadSkeleton from "./skeletons/DiscussionThreadSkeleton";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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
  isNested?: boolean; 
  onInputFocus?: () => void; 
  bottomPadding?: number; 
  headerComponent?: React.ReactNode; 
}

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

const DiscussionThread: React.FC<DiscussionThreadProps> = ({ 
  discussionId,
  isNested = true, 
  onInputFocus, 
  bottomPadding = 0,
  headerComponent,
}) => {
  const queryClient = useQueryClient();
  
  // UI States
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<string | null>(null);
  
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedReply, setSelectedReply] = useState<Reply | null>(null);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowListener = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const keyboardHideListener = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  const getAuthToken = async (): Promise<string | null> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      setCurrentUser(user.uid);
      try {
        return await user.getIdToken();
      } catch (error) {
        return null;
      }
    }
    return null;
  };

  // ==========================================
  // REACT QUERY: FETCH REPLIES (CACHED)
  // ==========================================
  const {
    data: replies = [],
    isLoading,
    isRefetching,
    refetch
  } = useQuery({
    queryKey: ['discussionReplies', discussionId],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) return [];
      
      const response = await fetch(
        `${API_BASE_URL}/discussions/${discussionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error("Failed to fetch replies");
      const data = await response.json();
      return organizeReplies(data.replies || []);
    },
    enabled: !!discussionId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // ==========================================
  // REACT QUERY: MUTATIONS
  // ==========================================
  const submitReplyMutation = useMutation({
    mutationFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error("Not logged in");

      let url = `${API_BASE_URL}/discussions/${discussionId}/replies?content=${encodeURIComponent(replyText.trim())}`;
      if (replyingTo?.id) {
        url += `&parent_reply_id=${replyingTo.id}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to post reply");
      return response.json();
    },
    onSuccess: () => {
      setReplyText("");
      setReplyingTo(null);
      // Automatically refetch the new reply list
      queryClient.invalidateQueries({ queryKey: ['discussionReplies', discussionId] });
      
      if (!isNested) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    },
    onError: () => Alert.alert("Error", "Could not submit reply")
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async () => {
      if (!replyToDelete) throw new Error("No reply selected");
      const token = await getAuthToken();
      if (!token) throw new Error("Not logged in");

      const response = await fetch(
        `${API_BASE_URL}/discussions/replies/${replyToDelete}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error("Failed to delete reply");
      return response.json();
    },
    onSuccess: () => {
      setShowDeleteModal(false);
      setReplyToDelete(null);
      Alert.alert("Success", "Reply deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['discussionReplies', discussionId] });
    },
    onError: () => {
      setShowDeleteModal(false);
      Alert.alert("Error", "Failed to delete reply");
    }
  });

  // --- ACTIONS ---
  const handleUpvoteReply = async (replyId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/discussions/replies/${replyId}/upvote`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Optimistically update the cache without doing a full network refetch
        queryClient.setQueryData(['discussionReplies', discussionId], (oldReplies: Reply[] | undefined) => {
          if (!oldReplies) return [];
          const updateReplyInTree = (repliesList: Reply[]): Reply[] => {
            return repliesList.map(reply => {
              if (reply.id === replyId) {
                return {
                  ...reply,
                  is_upvoted_by_user: data.upvoted,
                  upvote_count: data.upvoted ? reply.upvote_count + 1 : reply.upvote_count - 1,
                };
              }
              if (reply.replies) return { ...reply, replies: updateReplyInTree(reply.replies) };
              return reply;
            });
          };
          return updateReplyInTree(oldReplies);
        });
      }
    } catch (error) {
      console.error("Error upvoting reply:", error);
    }
  };

  const handleReportContent = async () => {
    if (!selectedReply) return;
    setShowActionMenu(false);
    try {
      const token = await getAuthToken();
      await fetch(`${API_BASE_URL}/discussions/replies/${selectedReply.id}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      Alert.alert("Report Submitted", "Thank you for keeping PodNova safe. Our moderation team will review this content shortly.");
    } catch (error) {
      console.error("Error reporting:", error);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedReply) return;
    setShowActionMenu(false);
    Alert.alert(
      "Block User", 
      `Are you sure you want to block ${selectedReply.username}? You will no longer see their content.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Block", 
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getAuthToken();
              await fetch(`${API_BASE_URL}/users/block/${selectedReply.user_id}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
              });
              Alert.alert("User Blocked", `${selectedReply.username} has been blocked.`);
              queryClient.invalidateQueries({ queryKey: ['discussionReplies', discussionId] });
            } catch (error) {
              console.error("Error blocking user:", error);
            }
          }
        }
      ]
    );
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

  // --- RENDERERS ---
  const renderReply = (reply: Reply, depth: number = 0) => {
    const isExpanded = expandedThreads.has(reply.id);
    const hasReplies = reply.replies && reply.replies.length > 0;

    return (
      <View key={reply.id} style={[styles.replyContainer, depth > 0 && styles.nestedReply]}>
        <View style={styles.replyCard}>
          <View style={styles.replyHeader}>
            <View style={styles.replyUserInfo}>
              <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
              <Text style={styles.replyUsername}>{reply.username}</Text>
              <Text style={styles.replyTime}>• {reply.time_ago}</Text>
              {reply.is_edited && <Text style={styles.editedBadge}>(edited)</Text>}
            </View>

            <View style={styles.replyHeaderRight}>
              <TouchableOpacity
                style={styles.optionsMenuButton}
                onPress={() => {
                  setSelectedReply(reply);
                  setShowActionMenu(true);
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.replyContent}>{reply.content}</Text>

          <View style={styles.replyActionsRow}>
            <View style={styles.replyActionsLeft}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleUpvoteReply(reply.id)}>
                <Feather name="thumbs-up" size={14} color={reply.is_upvoted_by_user ? "#6366F1" : "#9CA3AF"} />
                <Text style={[styles.actionText, reply.is_upvoted_by_user && styles.actionTextActive]}>
                  {reply.upvote_count}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => { setReplyingTo(reply); inputRef.current?.focus(); }}>
                <Ionicons name="return-down-forward-outline" size={14} color="#9CA3AF" />
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>

              {hasReplies && (
                <TouchableOpacity style={styles.actionButton} onPress={() => toggleThread(reply.id)}>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#9CA3AF" />
                  <Text style={styles.actionText}>{reply.replies?.length}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {hasReplies && isExpanded && (
          <View style={styles.repliesThread}>
            {reply.replies?.map(childReply => renderReply(childReply, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, !isNested && { flex: 1 }]}>
        {headerComponent}
        <DiscussionThreadSkeleton />
      </View>
    );
  }

  const finalInputPadding = isNested ? 0 : (isKeyboardVisible ? 0 : (Platform.OS === 'ios' ? 24 : 12) + bottomPadding);

  return (
    <View style={[styles.container, !isNested && { flex: 1 }]}>
      
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, !isNested && { flex: 1 }]}
        refreshControl={!isNested ? <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} /> : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isNested} 
      >
        {headerComponent}

        <View style={styles.repliesWrapper}>
          {replies.length === 0 ? (
            <View style={styles.emptyReplies}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyRepliesText}>No replies yet. Be the first to share your thoughts!</Text>
            </View>
          ) : (
            replies.map(reply => renderReply(reply))
          )}
          <View style={styles.listBottomPadding} />
        </View>
      </ScrollView>

      {/* STICKY FOOTER INPUT */}
      <View style={[styles.inputContainer, { paddingBottom: finalInputPadding }]}>
        {replyingTo && (
          <View style={styles.replyingToBanner}>
            <View style={styles.replyingToContent}>
              <Ionicons name="return-down-forward" size={12} color="#6366F1" />
              <Text style={styles.replyingToText} numberOfLines={1}>Replying to {replyingTo.username}</Text>
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
            onFocus={onInputFocus}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!replyText.trim() || submitReplyMutation.isPending) && styles.sendButtonDisabled]}
            onPress={() => submitReplyMutation.mutate()}
            disabled={!replyText.trim() || submitReplyMutation.isPending}
          >
            {submitReplyMutation.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={16} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* BOTTOM SHEET */}
      <Modal visible={showActionMenu} transparent animationType="slide" onRequestClose={() => setShowActionMenu(false)}>
        <TouchableOpacity style={styles.bottomSheetOverlay} activeOpacity={1} onPress={() => setShowActionMenu(false)}>
          <View style={styles.bottomSheetContainer}>
            <View style={styles.bottomSheetHandle} />
            
            {selectedReply?.user_id === currentUser ? (
              <TouchableOpacity 
                style={styles.actionSheetButton}
                onPress={() => {
                  setShowActionMenu(false);
                  setReplyToDelete(selectedReply.id);
                  setShowDeleteModal(true);
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={[styles.actionSheetText, styles.destructiveText]}>Delete Reply</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.actionSheetButton} onPress={handleReportContent}>
                  <Ionicons name="flag-outline" size={20} color="#111827" />
                  <Text style={styles.actionSheetText}>Report Content</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionSheetButton} onPress={handleBlockUser}>
                  <Ionicons name="ban-outline" size={20} color="#EF4444" />
                  <Text style={[styles.actionSheetText, styles.destructiveText]}>Block User</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.actionSheetDivider} />

            <TouchableOpacity style={styles.actionSheetCancel} onPress={() => setShowActionMenu(false)}>
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* DELETE MODAL */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowDeleteModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.deleteModal}>
                <View style={styles.deleteModalHeader}>
                  <Ionicons name="warning" size={32} color="#EF4444" />
                  <Text style={styles.deleteModalTitle}>Delete Reply</Text>
                </View>
                <Text style={styles.deleteModalText}>Are you sure you want to delete this reply? This action cannot be undone.</Text>
                <View style={styles.deleteModalButtons}>
                  <TouchableOpacity style={[styles.deleteModalButton, styles.cancelButton]} onPress={() => setShowDeleteModal(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.deleteModalButton, styles.confirmDeleteButton]} 
                    onPress={() => deleteReplyMutation.mutate()}
                    disabled={deleteReplyMutation.isPending}
                  >
                    {deleteReplyMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmDeleteText}>Delete</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 0,
  },
  repliesWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listBottomPadding: {
    height: 20,
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
    marginTop: 5,
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
    paddingTop: 8,
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
    marginVertical: 4,
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
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  actionSheetButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  actionSheetText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  destructiveText: {
    color: "#EF4444",
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 8,
  },
  actionSheetCancel: {
    paddingVertical: 16,
    alignItems: "center",
  },
  actionSheetCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  optionsMenuButton: {
    padding: 4,
  },
});

export default DiscussionThread;