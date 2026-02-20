// frontend/src/components/PodcastPlayer.tsx

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  PanResponder,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudio } from "../contexts/AudioContext";
import { Podcast } from "../types/podcasts";
import { PodcastPlayerProps } from "../types/podcasts";



const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  visible,
  podcast,
  onClose,
  isSaved,
  onToggleSave,
}) => {
  const insets = useSafeAreaInsets();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  // GLOBAL AUDIO CONTEXT - No local sound state!
  const {
    isPlaying,
    position,
    duration,
    playbackRate,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    setRate,
  } = useAudio();

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const transcriptScrollRef = useRef<ScrollView>(null);
  const [transcriptContentHeight, setTranscriptContentHeight] = useState(0);
  const [transcriptViewHeight, setTranscriptViewHeight] = useState(0);

  // Animate modal in/out
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Auto-scroll transcript
  useEffect(() => {
    if (!transcriptScrollRef.current || !duration) return;

    const maxScroll = transcriptContentHeight - transcriptViewHeight;
    if (maxScroll <= 0) return;

    const progress = position / duration;
    const scrollY = progress * maxScroll;

    transcriptScrollRef.current.scrollTo({
      y: scrollY,
      animated: false,
    });
  }, [position, duration, transcriptContentHeight, transcriptViewHeight]);

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      finance: "#3B82F6",
      technology: "#EF4444",
      politics: "#8B5CF6",
    };
    return colors[category?.toLowerCase()] || "#6366F1";
  };

  // Pan responder for swipe down
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!podcast) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#8B5CF6" />
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY }],
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Now Playing</Text>
          <TouchableOpacity onPress={onToggleSave} style={styles.saveButton}>
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={24}
              color={isSaved ? "#FCD34D" : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>

        {/* Drag handle */}
        <View style={styles.dragHandleContainer} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Album Art */}
          <View
            style={[
              styles.albumArt,
              { backgroundColor: getCategoryColor(podcast.category) },
            ]}
          >
            <Ionicons name="mic" size={60} color="#FFFFFF" opacity={0.9} />
            <Text style={styles.podcastTitle} numberOfLines={2}>
              {podcast.topic_title}
            </Text>
            <Text style={styles.podcastCategory}>
              {podcast.category.toUpperCase()}
            </Text>
            <Text style={styles.podcastVoice}>Style: {podcast.style}</Text>
            <Text style={styles.podcastVoice}>Voice Selection: {podcast.voice}</Text>
          </View>

          {/* Transcript */}
          {podcast.script && (
            <View style={styles.transcriptContainer}>
              <View style={styles.transcriptHeader}>
                <Ionicons name="document-text-outline" size={20} color="#E9D5FF" />
                <Text style={styles.transcriptHeaderText}>Transcript</Text>
              </View>
              <View style={styles.transcriptContent}>
                <ScrollView
                  ref={transcriptScrollRef}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={(w, h) => setTranscriptContentHeight(h)}
                  onLayout={(e) => setTranscriptViewHeight(e.nativeEvent.layout.height)}
                >
                  <Text style={styles.transcriptText}>{podcast.script}</Text>
                </ScrollView>
              </View>
            </View>
          )}

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 1}
              value={position}
              onSlidingComplete={seekTo}
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
              thumbTintColor="#FFFFFF"
            />
          </View>

          {/* Playback Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity onPress={skipBackward} style={styles.skipButton}>
              <Ionicons name="play-back" size={32} color="#FFFFFF" />
              <Text style={styles.skipText}>15s</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={40}
                color="#8B5CF6"
                style={!isPlaying && { marginLeft: 4 }}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={skipForward} style={styles.skipButton}>
              <Ionicons name="play-forward" size={32} color="#FFFFFF" />
              <Text style={styles.skipText}>15s</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowSpeedMenu(true)}
            >
              <View style={styles.speedBadge}>
                <Text style={styles.speedBadgeText}>{playbackRate}×</Text>
              </View>
              <Text style={styles.actionButtonText}>Speed</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={styles.iconCircle}>
                <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={styles.iconCircle}>
                <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.actionButtonText}>Discuss</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Speed Menu */}
        {showSpeedMenu && (
          <Modal transparent visible={showSpeedMenu} animationType="fade">
            <TouchableOpacity
              style={styles.speedMenuOverlay}
              activeOpacity={1}
              onPress={() => setShowSpeedMenu(false)}
            >
              <View style={styles.speedMenuContainer}>
                <Text style={styles.speedMenuTitle}>Playback Speed</Text>
                {SPEED_OPTIONS.map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={[
                      styles.speedMenuItem,
                      playbackRate === speed && styles.speedMenuItemActive,
                    ]}
                    onPress={() => {
                      setRate(speed);
                      setShowSpeedMenu(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.speedMenuItemText,
                        playbackRate === speed && styles.speedMenuItemTextActive,
                      ]}
                    >
                      {speed}×
                    </Text>
                    {playbackRate === speed && (
                      <Ionicons name="checkmark" size={24} color="#8B5CF6" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2e1f51",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  saveButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  dragHandleContainer: {
    paddingVertical: 8,
    alignItems: "center",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  albumArt: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH - 120,
    padding: 10,
    alignSelf: "center",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  podcastTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 6,
    lineHeight: 28,
  },
  podcastCategory: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 15,
  },
  podcastVoice: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "left",
    alignSelf: "flex-start",
    top: 40,
  },
  progressContainer: {
    marginBottom: 24,
    marginTop: 16,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    gap: 40,
  },
  skipButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    height: 60,
  },
  skipText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "600",
    marginTop: 4,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  actionButton: {
    alignItems: "center",
    gap: 8,
  },
  speedBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  speedBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  transcriptContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 2,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    padding: 10,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  transcriptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  transcriptHeaderText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  transcriptContent: {
    maxHeight: 160,
    overflow: "hidden",
  },
  transcriptText: {
    paddingTop: 30,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: 22,
  },
  speedMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  speedMenuContainer: {
    backgroundColor: "#5d5d5dd8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  speedMenuTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#251b3c",
    marginBottom: 16,
    textAlign: "center",
  },
  speedMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#00000080",
  },
  speedMenuItemActive: {
    backgroundColor: "#000000ad",
  },
  speedMenuItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  speedMenuItemTextActive: {
    color: "#8B5CF6",
  },
});

export default PodcastPlayer;