import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../Skeleton';

const HomeSkeleton: React.FC = () => {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Skeleton */}
      <View style={styles.header}>
        <Skeleton width={120} height={28} />
        <Skeleton width={40} height={40} borderRadius={20} />
      </View>

      {/* Explore Section Skeleton */}
      <View style={styles.section}>
        <Skeleton width={100} height={20} style={{ marginBottom: 16 }} />
        
        {/* Mock 3 Category Cards */}
        {[1, 2, 3].map((key) => (
          <View key={key} style={styles.categoryCard}>
            <Skeleton width={48} height={48} borderRadius={24} style={{ marginRight: 12 }} />
            <View style={styles.categoryContent}>
              <Skeleton width="60%" height={18} style={{ marginBottom: 8 }} />
              <Skeleton width="40%" height={14} />
            </View>
          </View>
        ))}
      </View>

      {/* Recent Topics Section Skeleton */}
      <View style={styles.section}>
        <Skeleton width={180} height={20} style={{ marginBottom: 16 }} />
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          {/* Mock 2 Horizontal Topic Cards */}
          {[1, 2].map((key) => (
            <View key={key} style={styles.topicCard}>
              <View style={styles.topicHeader}>
                <Skeleton width="80%" height={16} />
                <Skeleton width="60%" height={16} style={{ marginTop: 8 }} />
              </View>
              <Skeleton width="50%" height={12} style={{ marginTop: 16 }} />
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
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
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  section: {
    marginTop: 24,
    paddingLeft: 20,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#F3F4F6',
  },
  categoryContent: {
    flex: 1,
    justifyContent: 'center',
  },
  horizontalScroll: {
    paddingRight: 20,
  },
  topicCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 280,
    height: 110,
    justifyContent: 'space-between',
  },
  topicHeader: {
    alignItems: 'flex-start',
  },
});

export default HomeSkeleton;