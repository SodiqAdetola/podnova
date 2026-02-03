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
import { Audio } from "expo-av";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Podcast {
  id: string;
  topic_title: string;
  category: string;
  duration_seconds?: number;
  audio_url?: string;
  script?: string;
  created_at: string;
}

interface PodcastPlayerProps {
  visible: boolean;
  podcast: Podcast | null;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAYBACK_POSITION_KEY = "@podnova_playback_position_";

const SPEED_OPTIONS = [
  { label: "0.75×", value: 0.75 },
  { label: "1×", value: 1.0 },
  { label: "1.25×", value: 1.25 },
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2.0 },
];

const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  visible,
  podcast,
  onClose,
  isSaved,
  onToggleSave,
}) => {
  const insets = useSafeAreaInsets();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const transcriptScrollRef = useRef<ScrollView>(null);
  const [transcriptContentHeight, setTranscriptContentHeight] = useState(0);
  const [transcriptViewHeight, setTranscriptViewHeight] = useState(0);

  // Initialize audio
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  }, []);

  // Load audio and saved position when podcast changes
  useEffect(() => {
    if (visible && podcast?.audio_url) {
      loadAudio();
    }
    return () => {
      if (sound) {
        savePlaybackPosition();
        sound.unloadAsync();
      }
    };
  }, [visible, podcast]);

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

  // Update position
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sound && isPlaying) {
      interval = setInterval(async () => {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          setPosition(status.positionMillis);
          setDuration(status.durationMillis || 0);
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [sound, isPlaying]);

  // Save position every 5 seconds
  useEffect(() => {
    if (!podcast || position === 0) return;
    
    const saveInterval = setInterval(() => {
      savePlaybackPosition();
    }, 5000);

    return () => clearInterval(saveInterval);
  }, [position, podcast]);


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


  const savePlaybackPosition = async () => {
    if (!podcast) return;
    try {
      await AsyncStorage.setItem(
        `${PLAYBACK_POSITION_KEY}${podcast.id}`,
        JSON.stringify({ position, duration })
      );
    } catch (error) {
      console.error("Error saving playback position:", error);
    }
  };

  const loadSavedPosition = async (): Promise<number> => {
    if (!podcast) return 0;
    try {
      const saved = await AsyncStorage.getItem(`${PLAYBACK_POSITION_KEY}${podcast.id}`);
      if (saved) {
        const { position: savedPosition } = JSON.parse(saved);
        return savedPosition;
      }
    } catch (error) {
      console.error("Error loading playback position:", error);
    }
    return 0;
  };

  const loadAudio = async () => {
    try {
      setIsLoading(true);
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: podcast!.audio_url! },
        { shouldPlay: false, rate: playbackRate },
        onPlaybackStatusUpdate
      );

      setSound(newSound);

      // Load saved position
      const savedPosition = await loadSavedPosition();
      if (savedPosition > 0) {
        await newSound.setPositionAsync(savedPosition);
        setPosition(savedPosition);
      }
    } catch (error) {
      console.error("Error loading audio:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);

      if (status.didJustFinish) {
        setIsPlaying(false);
        sound?.setPositionAsync(0);
      }
    }
  };

  const togglePlayPause = async () => {
    if (!sound) return;

    if (isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playAsync();
    }
  };

  const skipForward = async () => {
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (status.isLoaded) {
      await sound.setPositionAsync(Math.min(position + 15000, duration));
    }
  };

  const skipBackward = async () => {
    if (!sound) return;
    await sound.setPositionAsync(Math.max(position - 15000, 0));
  };

  const handleSliderChange = async (value: number) => {
    if (!sound) return;
    await sound.setPositionAsync(value);
  };

  const selectPlaybackRate = async (rate: number) => {
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    if (sound) {
      await sound.setRateAsync(rate, true);
    }
  };

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
          savePlaybackPosition();
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
      onRequestClose={() => {
        savePlaybackPosition();
        onClose();
      }}
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
        {/* Header with close button */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
              savePlaybackPosition();
              onClose();
            }} 
            style={styles.closeButton}
          >
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
          {/* Compact Album Art */}
          <View
            style={[
              styles.albumArt,
              { backgroundColor: getCategoryColor(podcast.category) },
            ]}
          >
            <Ionicons name="mic" size={60} color="#FFFFFF" opacity={0.9} />
          </View>

          {/* Podcast Info */}
          <Text style={styles.podcastTitle} numberOfLines={2}>
            {podcast.topic_title}
          </Text>
          <Text style={styles.podcastCategory}>
            {podcast.category.toUpperCase()}
          </Text>

                  {/* Full Transcript Section */}
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
                    onLayout={(e) =>
                    setTranscriptViewHeight(e.nativeEvent.layout.height)
                    }
                >
                    <Text style={styles.transcriptText}>
                    {podcast.script}
                    </Text>
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
              maximumValue={duration}
              value={position}
              onSlidingComplete={handleSliderChange}
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
              thumbTintColor="#FFFFFF"
            />
          </View>

          {/* Playback Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              onPress={skipBackward}
              style={styles.skipButton}
              disabled={!sound}
            >
              <Ionicons name="play-back" size={32} color="#FFFFFF" />
              <Text style={styles.skipText}>15s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlayPause}
              style={styles.playButton}
              disabled={!sound || isLoading}
            >
              {isLoading ? (
                <Ionicons name="hourglass-outline" size={40} color="#8B5CF6" />
              ) : (
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={40}
                  color="#8B5CF6"
                  style={!isPlaying && { marginLeft: 4 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={skipForward}
              style={styles.skipButton}
              disabled={!sound}
            >
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

        {/* Speed Selection Menu */}
        {showSpeedMenu && (
          <Modal transparent visible={showSpeedMenu} animationType="fade">
            <TouchableOpacity
              style={styles.speedMenuOverlay}
              activeOpacity={1}
              onPress={() => setShowSpeedMenu(false)}
            >
              <View style={styles.speedMenuContainer}>
                <Text style={styles.speedMenuTitle}>Playback Speed</Text>
                {SPEED_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.speedMenuItem,
                      playbackRate === option.value && styles.speedMenuItemActive,
                    ]}
                    onPress={() => selectPlaybackRate(option.value)}
                  >
                    <Text
                      style={[
                        styles.speedMenuItemText,
                        playbackRate === option.value && styles.speedMenuItemTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {playbackRate === option.value && (
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
    paddingVertical: 12,
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
    paddingBottom: 40,
  },
  albumArt: {
    width: SCREEN_WIDTH - 50,
    height: SCREEN_WIDTH - 150,
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
    fontSize: 22,
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
    fontSize: 16,
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
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
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
    maxHeight: 100,
    overflow: "hidden",
  },
  transcriptText: {
    paddingTop: 60,
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  speedMenuTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
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
    backgroundColor: "#F9FAFB",
  },
  speedMenuItemActive: {
    backgroundColor: "#EDE9FE",
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