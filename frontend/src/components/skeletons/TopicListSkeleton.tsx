import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../ui/Skeleton';

const TopicListSkeleton: React.FC = () => {
  const renderItem = () => (
    <View style={styles.topicCard}>
      <View style={styles.topicContentRow}>
        <Skeleton width={80} height={80} borderRadius={8} style={{ marginRight: 12 }} />
        <View style={styles.topicContent}>
          <Skeleton width="90%" height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={14} style={{ marginBottom: 4 }} />
          <Skeleton width="60%" height={14} />
        </View>
      </View>
      <View style={styles.topicFooter}>
        <Skeleton width={130} height={22} borderRadius={4} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.sortContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
          <Skeleton width={70} height={34} borderRadius={20} />
          <Skeleton width={80} height={34} borderRadius={20} />
          <Skeleton width={120} height={34} borderRadius={20} />
        </ScrollView>
      </View>
      
      {/* List Items */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        {[1, 2, 3, 4].map(key => <React.Fragment key={key}>{renderItem()}</React.Fragment>)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: 'transparent' 
    },
    sortContainer: { 
        paddingVertical: 12, 
        marginBottom: 4, 
        paddingHorizontal: 16 
    },
    sortScroll: { 
        gap: 8 
    },
    listContent: { 
        paddingHorizontal: 16, 
        paddingBottom: 20 
    },
    topicCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 12,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    topicContentRow: { 
        flexDirection: 'row', 
        marginBottom: 12 
    },
    topicContent: { 
        flex: 1, 
        justifyContent: 'center' 
    },
    topicFooter: { 
        flexDirection: 'row' 
    },
});

export default TopicListSkeleton;