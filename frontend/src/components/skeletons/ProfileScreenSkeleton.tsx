import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../ui/Skeleton';

const ProfileScreenSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Header Skeleton */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Skeleton width={180} height={22} />
          <Skeleton width={24} height={24} borderRadius={12} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* User Info Section Skeleton */}
        <View style={styles.userSection}>
          {/* Avatar */}
          <Skeleton width={96} height={96} borderRadius={48} style={{ marginBottom: 16 }} />
          {/* Name */}
          <Skeleton width={150} height={24} style={{ marginBottom: 8 }} />
          {/* Email */}
          <Skeleton width={200} height={14} style={{ marginBottom: 24 }} />

          {/* Stats Grid */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Skeleton width={30} height={24} style={{ marginBottom: 8 }} />
              <Skeleton width={60} height={14} />
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Skeleton width={30} height={24} style={{ marginBottom: 8 }} />
              <Skeleton width={60} height={14} />
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Skeleton width={30} height={24} style={{ marginBottom: 8 }} />
              <Skeleton width={60} height={14} />
            </View>
          </View>
        </View>

        {/* Settings Section Placeholder */}
        <View style={styles.settingsSection}>
          <Skeleton width={140} height={18} style={{ marginBottom: 20 }} />
          
          {/* 3 Settings Rows */}
          {[1, 2, 3].map((key) => (
            <View key={key} style={styles.settingRow}>
              <View style={styles.settingText}>
                <Skeleton width={160} height={16} style={{ marginBottom: 8 }} />
                <Skeleton width={220} height={12} />
              </View>
              {/* Toggle switch placeholder */}
              <Skeleton width={44} height={24} borderRadius={12} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 70,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollView: {
    flex: 1,
  },
  userSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  settingsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  settingText: {
    flex: 1,
    marginRight: 16,
  },
});

export default ProfileScreenSkeleton;