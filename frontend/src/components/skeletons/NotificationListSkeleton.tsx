import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../Skeleton';

const NotificationListSkeleton: React.FC = () => {
  const renderItem = () => (
    <View style={styles.notificationCard}>
      {/* Icon Container Placeholder */}
      <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: 12 }} />

      {/* Notification Content Placeholder */}
      <View style={styles.notificationContent}>
        {/* Title */}
        <Skeleton width="50%" height={16} style={{ marginBottom: 8 }} />

        {/* Message Preview (2 lines) */}
        <Skeleton width="100%" height={14} style={{ marginBottom: 6 }} />
        <Skeleton width="80%" height={14} style={{ marginBottom: 10 }} />
        
        {/* Time Ago Footer */}
        <Skeleton width={60} height={12} />
      </View>
    </View>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.container}>
      {[1, 2, 3, 4, 5, 6, 7].map(key => (
        <React.Fragment key={key}>{renderItem()}</React.Fragment>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationContent: {
    flex: 1,
  },
});

export default NotificationListSkeleton;