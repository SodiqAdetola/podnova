import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../ui/Skeleton';

const PodcastListSkeleton: React.FC = () => {
  const renderItem = () => (
    <View style={styles.podcastCard}>
      <View style={styles.cardContent}>
        {/* Thumbnail */}
        <Skeleton width={64} height={64} borderRadius={12} style={{ marginRight: 12 }} />
        
        {/* Podcast Info */}
        <View style={styles.podcastInfo}>
          {/* Title - Two lines */}
          <Skeleton width="90%" height={16} style={{ marginBottom: 6 }} />
          <Skeleton width="70%" height={16} style={{ marginBottom: 8 }} />
          
          {/* Meta Row (Length & Date) */}
          <Skeleton width="50%" height={12} style={{ marginBottom: 10 }} />
          
          {/* Category Tag */}
          <Skeleton width={80} height={20} borderRadius={6} />
        </View>

        {/* Play Button & Menu Button Placeholders */}
        <Skeleton width={40} height={40} borderRadius={20} style={{ marginLeft: 10 }} />
        <Skeleton width={20} height={20} borderRadius={10} style={{ marginLeft: 15 }} />
      </View>
    </View>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
      {[1, 2, 3, 4, 5].map(key => <React.Fragment key={key}>{renderItem()}</React.Fragment>)}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
  },
  podcastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  podcastInfo: {
    flex: 1,
  },
});

export default PodcastListSkeleton;