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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useAudio } from "../contexts/AudioContext";
import { PodcastPlayerProps } from "../types/podcasts";
import { MainStackParamList } from "../Navigator";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];
const SAVED_STORAGE_KEY = "@podnova_saved";

const TRANSCRIPT_CONTAINER_HEIGHT = 150;

const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  visible,
  podcast,
  onClose,
  isSaved: externalIsSaved,
  onToggleSave: externalOnToggleSave,
}) => {
  const insets = useSafeAreaInsets();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [internalIsSaved, setInternalIsSaved] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

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
  
  // --- PRODUCTION-READY TELEPROMPTER STATE ---
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [sentences, setSentences] = useState<{text: string, length: number}[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  // Store both Y position and height of each sentence for continuous fractional scrolling
  const itemLayouts = useRef<{ [key: number]: { y: number, height: number } }>({});

  // 1. Clean and split script into sentences
  useEffect(() => {
    const rawText = podcast?.script || (podcast as any)?.transcript || "";
    if (rawText) {
      const cleanScript = rawText.replace(/\n/g, ' ');
      const split = cleanScript.match(/[^.!?]+[.!?]+[\])'"`’”]*|.+/g) || [];
      
      const processedSentences = split
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)
        .map((s: string) => ({ text: s, length: s.length }));
      
      setSentences(processedSentences);
      setTotalChars(processedSentences.reduce((acc: number, curr: any) => acc + curr.length, 0));
    }
  }, [podcast?.script]);

  // 2. Fractional Continuous Sync Logic
  useEffect(() => {
    if (!duration || totalChars === 0 || showFullTranscript || sentences.length === 0) return;

    const safePosition = Number(position) || 0;
    const safeDuration = Number(duration) || 1;
    const progress = safePosition / safeDuration;

    if (isNaN(progress) || progress < 0 || progress > 1.5) return;

    const targetCharCount = progress * totalChars;
    
    let charAccumulator = 0;
    let newActiveIndex = 0;
    let sentenceFraction = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentenceLen = sentences[i].length;
      if (charAccumulator + sentenceLen >= targetCharCount) {
        newActiveIndex = i;
        const charsIntoSentence = targetCharCount - charAccumulator;
        sentenceFraction = Math.min(1, Math.max(0, charsIntoSentence / sentenceLen));
        break;
      }
      charAccumulator += sentenceLen;
    }
    
    if (newActiveIndex !== activeIndex) {
      setActiveIndex(newActiveIndex);
    }

    const currentLayout = itemLayouts.current[newActiveIndex];
    
    if (currentLayout && typeof currentLayout.y === 'number' && typeof currentLayout.height === 'number') {
      const exactY = currentLayout.y + (currentLayout.height * sentenceFraction);
      let scrollPosition = exactY - (TRANSCRIPT_CONTAINER_HEIGHT / 2) + 20;
      scrollPosition = Math.max(0, scrollPosition); 
      
      if (!isNaN(scrollPosition)) {
        Animated.timing(scrollAnim, {
          toValue: -scrollPosition,
          duration: 500, 
          useNativeDriver: true,
        }).start();
      }
    }

  }, [position, duration, totalChars, sentences, showFullTranscript, activeIndex]);

  const handleSentenceLayout = (index: number, event: any) => {
    itemLayouts.current[index] = {
      y: event.nativeEvent.layout.y,
      height: event.nativeEvent.layout.height,
    };
  };
  // -----------------------------------

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

  useEffect(() => {
    const checkSavedStatus = async () => {
      if (!podcast) return;
      try {
        const savedData = await AsyncStorage.getItem(SAVED_STORAGE_KEY);
        const savedSet = new Set(savedData ? JSON.parse(savedData) : []);
        setInternalIsSaved(savedSet.has(podcast.id));
      } catch (error) {
        console.error("Error checking saved status:", error);
      }
    };
    if (visible) checkSavedStatus();
  }, [podcast, visible]);

  const handleToggleSave = async () => {
    if (!podcast) return;
    try {
      const savedData = await AsyncStorage.getItem(SAVED_STORAGE_KEY);
      const savedArray = savedData ? JSON.parse(savedData) : [];
      const savedSet = new Set(savedArray);
      if (savedSet.has(podcast.id)) {
        savedSet.delete(podcast.id);
        setInternalIsSaved(false);
      } else {
        savedSet.add(podcast.id);
        setInternalIsSaved(true);
      }
      await AsyncStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...savedSet]));
      if (externalOnToggleSave) externalOnToggleSave();
    } catch (error) {
      console.error("Error toggling save:", error);
    }
  };

  const handleGoToTopic = () => {
    if (!podcast) return;
    onClose();
    const topicId = podcast.topic_id || podcast.id; 
    navigation.navigate("TopicDetail", { topicId });
  };

  const handleDiscuss = async () => {
    if (!podcast) return;
    onClose();
    const topicId = podcast.topic_id || podcast.id;
    try {
      const response = await fetch(`${API_BASE_URL}/discussions?topic_id=${topicId}`);
      const data = await response.json();
      if (data.discussions && data.discussions.length > 0) {
        navigation.navigate("DiscussionDetail", { discussionId: data.discussions[0].id });
      } else {
        navigation.navigate("TopicDetail", { topicId });
      }
    } catch (error) {
      navigation.navigate("TopicDetail", { topicId });
    }
  };

  // --- SMART PLAY/PAUSE WRAPPER ---
  const handlePlayPause = async () => {
    // If the audio is not playing and we are within 1 second of the end of the track
    if (!isPlaying && duration > 0 && position >= duration - 1000) {
      await seekTo(0); // Snap back to the beginning
      togglePlayPause(); // Start playing
    } else {
      togglePlayPause(); // Normal play/pause behavior
    }
  };

  const formatTime = (millis: number) => {
    const safeMillis = Number(millis) || 0;
    const totalSeconds = Math.floor(safeMillis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      finance: "#3B82F6",
      technology: "#EF4444",
      politics: "#8B5CF6",
      custom: "#10B981"
    };
    return colors[category?.toLowerCase()] || "#6366F1";
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) onClose();
        else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!podcast) return null;
  const isCustom = podcast.category?.toLowerCase() === "custom" || podcast.is_custom;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#8B5CF6" />
      <Animated.View style={[styles.container, { transform: [{ translateY }], paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Now Playing</Text>
          <TouchableOpacity onPress={handleToggleSave} style={styles.saveButton}>
            <Ionicons name={internalIsSaved ? "bookmark" : "bookmark-outline"} size={24} color={internalIsSaved ? "#FCD34D" : "#FFFFFF"} />
          </TouchableOpacity>
        </View>

        <View style={styles.dragHandleContainer} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          <View style={[styles.albumArt, { backgroundColor: getCategoryColor(podcast.category) }]}>
            <Ionicons name={isCustom ? "document-text" : "mic"} size={60} color="#FFFFFF" opacity={0.9} />
            <Text style={styles.podcastTitle} numberOfLines={2}>{podcast.topic_title}</Text>
            <Text style={styles.podcastCategory}>{isCustom ? "STUDIO CUSTOM" : podcast.category.toUpperCase()}</Text>
            <Text style={styles.podcastVoice}>Style: {podcast.style}</Text>
            <Text style={styles.podcastVoice}>Voice: {podcast.voice.replace(/_/g, " ")}</Text>
          </View>

          {/* TELEPROMPTER TRANSCRIPT */}
          {sentences.length > 0 && (
            <View style={styles.transcriptContainer}>
              <View style={styles.transcriptHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="document-text-outline" size={20} color="#E9D5FF" />
                  <Text style={styles.transcriptHeaderText}>Live Transcript</Text>
                </View>
                <TouchableOpacity onPress={() => setShowFullTranscript(true)}>
                  <Text style={styles.expandText}>Expand</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.transcriptContent}>
                <Animated.View style={{ transform: [{ translateY: scrollAnim }], width: '100%', paddingVertical: 60 }}>
                  {sentences.map((sentenceObj, index) => {
                    const isActiveWindow = index >= activeIndex - 1 && index <= activeIndex + 1;
                    return (
                      <View 
                        key={index} 
                        onLayout={(e) => handleSentenceLayout(index, e)}
                        style={styles.sentenceWrapper}
                      >
                        <Text style={[
                          styles.transcriptText,
                          isActiveWindow ? styles.transcriptTextActive : styles.transcriptTextDim
                        ]}>
                          {sentenceObj.text}
                        </Text>
                      </View>
                    );
                  })}
                </Animated.View>
              </View>
            </View>
          )}

          <View style={styles.progressContainer}>
            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 1}
              value={position || 0}
              onSlidingComplete={seekTo}
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
              thumbTintColor="#FFFFFF"
            />
          </View>

          <View style={styles.controlsContainer}>
            <TouchableOpacity onPress={skipBackward} style={styles.skipButton}>
              <Ionicons name="play-back" size={32} color="#FFFFFF" />
              <Text style={styles.skipText}>15s</Text>
            </TouchableOpacity>
            
            {/* UPDATED PLAY BUTTON WITH SMART WRAPPER */}
            <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={40} color="#8B5CF6" style={!isPlaying && { marginLeft: 4 }} />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={skipForward} style={styles.skipButton}>
              <Ionicons name="play-forward" size={32} color="#FFFFFF" />
              <Text style={styles.skipText}>15s</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.actionButtons, isCustom && { justifyContent: 'center' }]}>
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowSpeedMenu(true)}>
              <View style={styles.speedBadge}><Text style={styles.speedBadgeText}>{playbackRate}×</Text></View>
              <Text style={styles.actionButtonText}>Speed</Text>
            </TouchableOpacity>
            {!isCustom && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleGoToTopic}>
                  <View style={styles.iconCircle}><Ionicons name="newspaper-outline" size={20} color="#FFFFFF" /></View>
                  <Text style={styles.actionButtonText}>Topic</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={handleDiscuss}>
                  <View style={styles.iconCircle}><Ionicons name="chatbubbles-outline" size={20} color="#FFFFFF" /></View>
                  <Text style={styles.actionButtonText}>Discuss</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

        {showSpeedMenu && (
          <Modal transparent visible={showSpeedMenu} animationType="fade">
            <TouchableOpacity style={styles.speedMenuOverlay} activeOpacity={1} onPress={() => setShowSpeedMenu(false)}>
              <View style={styles.speedMenuContainer}>
                <Text style={styles.speedMenuTitle}>Playback Speed</Text>
                {SPEED_OPTIONS.map((speed) => (
                  <TouchableOpacity 
                    key={speed} 
                    style={[styles.speedMenuItem, playbackRate === speed && styles.speedMenuItemActive]} 
                    onPress={() => { setRate(speed); setShowSpeedMenu(false); }}
                  >
                    <Text style={[styles.speedMenuItemText, playbackRate === speed && styles.speedMenuItemTextActive]}>{speed}×</Text>
                    {playbackRate === speed && <Ionicons name="checkmark" size={24} color="#8B5CF6" />}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {showFullTranscript && (
          <Modal transparent visible={showFullTranscript} animationType="slide">
            <View style={styles.fullTranscriptContainer}>
              <View style={[styles.fullTranscriptHeader, { paddingTop: insets.top + 10 }]}>
                <Text style={styles.fullTranscriptTitle}>Full Transcript</Text>
                <TouchableOpacity onPress={() => setShowFullTranscript(false)}>
                  <Ionicons name="close-circle" size={30} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.fullTranscriptScroll}>
                <Text style={styles.fullTranscriptText}>{podcast.script}</Text>
              </ScrollView>
            </View>
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
    textTransform: 'capitalize',
  },
  
  // --- TELEPROMPTER STYLES ---
  transcriptContainer: {
    width: '100%',
    backgroundColor: "transparent",
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  transcriptHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  transcriptHeaderText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  transcriptContent: {
    height: TRANSCRIPT_CONTAINER_HEIGHT,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "#1e13356a",
    overflow: "hidden",
    position: "relative",
    width: '100%',
  },
  sentenceWrapper: {
    paddingVertical: 6,
    width: '100%', 
  },
  transcriptText: {
    fontSize: 14,
    paddingHorizontal: 15,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  transcriptTextActive: {
    color: "#f5f5f5",
    fontWeight: "500",
    fontSize: 14, 
  },
  transcriptTextDim: {
    color: "rgba(255, 255, 255, 0.5)", 
    fontWeight: "500",
  },
  expandText: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "600",
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
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 32,
    paddingHorizontal: 16,
    gap: 20,
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
  speedMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  speedMenuContainer: {
    backgroundColor: "#ffffffd8",
    width: "40%",
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
    backgroundColor: "#000000ab",
  },
  speedMenuItemActive: {
    backgroundColor: "#000000ad",
  },
  speedMenuItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#b6c1d4",
    textAlign: "center",
  },
  speedMenuItemTextActive: {
    color: "#8B5CF6",
  },
  fullTranscriptContainer: {
    flex: 1,
    backgroundColor: "#1e1335",
  },
  fullTranscriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  fullTranscriptTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  fullTranscriptScroll: {
    padding: 24,
    paddingBottom: 60,
  },
  fullTranscriptText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    lineHeight: 28,
  },
});

export default PodcastPlayer;