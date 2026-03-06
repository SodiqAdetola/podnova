import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../Skeleton';

const TopicDetailSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <Skeleton width={180} height={20} />
        <Skeleton width={40} height={40} borderRadius={20} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <Skeleton width="100%" height={200} borderRadius={0} />

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Skeleton width="90%" height={28} style={{ marginBottom: 8 }} />
          <Skeleton width="60%" height={28} style={{ marginBottom: 16 }} />
          <Skeleton width="40%" height={16} />
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <Skeleton width={60} height={40} />
          <View style={styles.statDivider} />
          <Skeleton width={60} height={40} />
          <View style={styles.statDivider} />
          <Skeleton width={60} height={40} />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Skeleton width="28%" height={45} borderRadius={24} />
          <Skeleton width="38%" height={45} borderRadius={24} />
          <Skeleton width="28%" height={45} borderRadius={24} />
        </View>

        {/* Summary Card */}
        <View style={styles.card}>
          <Skeleton width={100} height={20} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="80%" height={16} />
        </View>

        {/* Insights Card */}
        <View style={styles.card}>
          <Skeleton width={120} height={20} style={{ marginBottom: 16 }} />
          {[1, 2, 3].map((k) => (
            <View key={k} style={styles.insightItem}>
              <Skeleton width={16} height={16} borderRadius={8} style={{ marginRight: 12, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                 <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
                 <Skeleton width="70%" height={16} />
              </View>
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
        backgroundColor: '#FFFFFF' 
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    scrollView: { 
        flex: 1 
    },
    titleSection: { 
        padding: 20, 
        paddingBottom: 16 
    },
    statsGrid: {
        flexDirection: 'row',
        backgroundColor: '#F9FAFB',
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 16,
        padding: 16,
        justifyContent: 'space-around',
    },
    statDivider: { 
        width: 1, 
        backgroundColor: '#E5E7EB' 
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginHorizontal: 20,
        marginBottom: 24,
    },
    card: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 20,
        marginBottom: 20,
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    insightItem: { 
        flexDirection: 'row', 
        marginBottom: 16, 
        alignItems: 'flex-start' 
    },
});

export default TopicDetailSkeleton;