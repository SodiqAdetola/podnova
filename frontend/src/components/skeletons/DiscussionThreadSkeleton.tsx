import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../ui/Skeleton';

const DiscussionThreadSkeleton: React.FC = () => {
  const renderReplySkeleton = (isNested = false) => (
    <View style={[styles.replyContainer, isNested && styles.nestedReply]}>
      <View style={styles.replyCard}>
        <View style={styles.replyHeader}>
          <View style={styles.replyUserInfo}>
            <Skeleton width={16} height={16} borderRadius={8} style={{ marginRight: 4 }} />
            <Skeleton width={100} height={14} />
          </View>
          <Skeleton width={20} height={14} />
        </View>
        
        <View style={styles.replyContent}>
          <Skeleton width="90%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="70%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="40%" height={14} />
        </View>

        <View style={styles.replyActionsRow}>
          <Skeleton width={30} height={14} style={{ marginRight: 16 }} />
          <Skeleton width={40} height={14} style={{ marginRight: 16 }} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {renderReplySkeleton(false)}
        {renderReplySkeleton(true)}
        {renderReplySkeleton(false)}
        {renderReplySkeleton(false)}
      </ScrollView>
      
      {/* Sticky Footer Input Skeleton */}
      <View style={styles.inputContainer}>
        <View style={styles.replyInputRow}>
          <Skeleton width="85%" height={40} borderRadius={18} />
          <Skeleton width={32} height={32} borderRadius={16} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  replyContainer: {
    marginBottom: 8,
  },
  nestedReply: {
    marginLeft: 12,
  },
  replyCard: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginTop: 5,
  },
  replyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  replyUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyContent: {
    marginBottom: 12,
    marginLeft: 12,
  },
  replyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default DiscussionThreadSkeleton;