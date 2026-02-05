// frontend/src/components/MiniPlayer.tsx

import React from 'react';
import {
View,
Text,
StyleSheet,
TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../contexts/AudioContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MiniPlayerProps {
onExpand: () => void;
hasTabBar?: boolean; // Whether current screen has tab bar
}

const MiniPlayer: React.FC<MiniPlayerProps> = ({ onExpand, hasTabBar = true }) => {
const { currentPodcast, isPlaying, position, duration, togglePlayPause, stopPlayback } = useAudio();
const insets = useSafeAreaInsets();

if (!currentPodcast) return null;

const progress = duration > 0 ? (position / duration) * 100 : 0;

const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
    finance: '#3B82F6',
    technology: '#EF4444',
    politics: '#8B5CF6',
    };
    return colors[category?.toLowerCase()] || '#6366F1';
};

// Dynamic bottom position based on tab bar presence
const bottomPosition = hasTabBar ? 80 : 0;
const paddingBottomPosition = hasTabBar ? 0 : 20;
const paddingTopPosition = hasTabBar ? 0 : 0;


return (
    <TouchableOpacity
    style={[styles.container, { bottom: bottomPosition, paddingBottom: paddingBottomPosition, paddingTop: paddingTopPosition }]}
    activeOpacity={0.95}
    onPress={onExpand}
    >
    {/* Progress bar */}
    <View style={styles.progressBar}>
        <View style={[styles.progress, { width: `${progress}%` }]} />
    </View>

    <View style={styles.content}>
        {/* Thumbnail */}
        <View
        style={[
            styles.thumbnail,
            { backgroundColor: getCategoryColor(currentPodcast.category) },
        ]}
        >
        <Ionicons name="musical-notes" size={20} color="#FFFFFF" />
        </View>

        {/* Info */}
        <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
            {currentPodcast.topic_title}
        </Text>
        <Text style={styles.category} numberOfLines={1}>
            {currentPodcast.category.toUpperCase()}
        </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
        <TouchableOpacity
            style={styles.controlButton}
            onPress={(e) => {
            e.stopPropagation();
            togglePlayPause();
            }}
        >
            <Ionicons
            name={isPlaying ? 'pause-outline' : 'play-outline'}
            size={28}
            color="#6B7280"
            />
        </TouchableOpacity>

        <TouchableOpacity
            style={styles.controlButton}
            onPress={(e) => {
            e.stopPropagation();
            stopPlayback();
            }}
        >
            <Ionicons name="close" size={24} color="#6B7280" />
        </TouchableOpacity>
        </View>
    </View>
    </TouchableOpacity>
);
};

const styles = StyleSheet.create({
container: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingBottom: 30,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    borderBottomWidth: 3,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 1, 
},
progressBar: {
    height: 3,
    backgroundColor: '#E5E7EB',
},
progress: {
    height: '100%',
    backgroundColor: '#8B5CF6',
},
content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
},
thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
},
info: {
    flex: 1,
    marginRight: 12,
},
title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
},
category: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    letterSpacing: 0.5,
},
controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
},
controlButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
},
});

export default MiniPlayer;