import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from '../ui/Skeleton';

const CreateScreenSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Skeleton width={100} height={22} style={{ marginBottom: 8 }} />
        <Skeleton width={180} height={16} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.section}>
          <Skeleton width={120} height={20} style={{ marginBottom: 8 }} />
          <Skeleton width="80%" height={14} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={50} borderRadius={12} />
        </View>

        {/* File Upload Section */}
        <View style={styles.section}>
          <Skeleton width={130} height={20} style={{ marginBottom: 8 }} />
          <Skeleton width="90%" height={14} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={60} borderRadius={12} />
        </View>

        {/* Prompt Section */}
        <View style={styles.section}>
          <Skeleton width={110} height={20} style={{ marginBottom: 8 }} />
          <Skeleton width="70%" height={14} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={120} borderRadius={12} />
        </View>

        {/* Voice Section */}
        <View style={styles.section}>
          <Skeleton width={80} height={20} style={{ marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[1, 2, 3].map((key) => (
              <View key={key} style={{ alignItems: 'center' }}>
                <Skeleton width={110} height={60} borderRadius={12} />
              </View>
            ))}
          </View>
        </View>
        
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
});

export default CreateScreenSkeleton;