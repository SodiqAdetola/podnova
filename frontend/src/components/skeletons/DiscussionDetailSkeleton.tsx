import React from 'react';
import { View, StyleSheet } from 'react-native';
import Skeleton from '../ui/Skeleton';
import DiscussionThreadSkeleton from './DiscussionThreadSkeleton';

const DiscussionDetailSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.header}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <Skeleton width={180} height={20} />
        <Skeleton width={40} height={40} />
      </View>

      <View style={styles.content}>
        {/* Discussion Metadata Header */}
        <View style={styles.metadataContainer}>
          <View style={styles.typeBadgeRow}>
            <Skeleton width={130} height={24} borderRadius={12} style={{ marginRight: 8 }} />
            <Skeleton width={90} height={24} borderRadius={12} />
          </View>
          
          <Skeleton width="90%" height={20} style={{ marginBottom: 12 }} />
          
          <Skeleton width="100%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="70%" height={14} style={{ marginBottom: 16 }} />
          
          <View style={styles.tagsRow}>
            <Skeleton width={60} height={24} borderRadius={6} />
            <Skeleton width={80} height={24} borderRadius={6} />
            <Skeleton width={50} height={24} borderRadius={6} />
          </View>

          <View style={styles.statsRow}>
            <Skeleton width={140} height={16} />
            <Skeleton width={100} height={16} />
          </View>
          
          <View style={styles.divider} />
        </View>

        {/* Nested Thread Skeleton */}
        <View style={styles.threadWrapper}>
          <DiscussionThreadSkeleton />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  content: {
    flex: 1,
  },
  metadataContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginTop: 16,
  },
  threadWrapper: {
    flex: 1,
    marginTop: -16, // Pulls the thread skeleton up to sit flush with the divider
  },
});

export default DiscussionDetailSkeleton;