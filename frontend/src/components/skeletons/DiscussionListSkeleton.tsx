import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../ui/Skeleton';

const DiscussionListSkeleton: React.FC = () => {
  const renderItem = () => (
    <View style={styles.discussionCard}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Skeleton width={140} height={20} borderRadius={8} style={{ marginRight: 6 }} />
          <Skeleton width={70} height={16} borderRadius={4} />
        </View>
        <Skeleton width={50} height={16} />
      </View>
      
      <Skeleton width="85%" height={18} style={{ marginBottom: 8 }} />
      <Skeleton width="100%" height={14} style={{ marginBottom: 4 }} />
      <Skeleton width="70%" height={14} style={{ marginBottom: 12 }} />
      
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <Skeleton width={16} height={16} borderRadius={8} style={{ marginRight: 4 }} />
          <Skeleton width={80} height={14} />
        </View>
        <Skeleton width={60} height={14} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Top Bar with Filters and "New" Button */}
      <View style={styles.actionsBar}>
        <View style={styles.sortButtons}>
          <Skeleton width={70} height={34} borderRadius={20} style={{ marginRight: 8 }} />
          <Skeleton width={120} height={34} borderRadius={20} />
        </View>
        <Skeleton width={75} height={34} borderRadius={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        {[1, 2, 3, 4].map(key => <React.Fragment key={key}>{renderItem()}</React.Fragment>)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortButtons: { flexDirection: 'row' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  discussionCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLeft: { flexDirection: 'row', alignItems: 'center' },
});

export default DiscussionListSkeleton;