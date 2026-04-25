import React, { createContext, useContext, useState, useEffect } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { Podcast } from '../types/podcasts';

interface AudioContextType {
  currentPodcast: Podcast | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  playbackRate: number;
  sound: Audio.Sound | null;
  loadPodcast: (podcast: Podcast) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  stopPlayback: () => Promise<void>;
  showPlayer: boolean;
  setShowPlayer: (show: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

const PLAYBACK_POSITION_KEY = '@podnova_playback_position_';

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [showPlayer, setShowPlayer] = useState(false);

  // Initialise audio mode
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.error("Failed to set audio mode:", error);
      }
    };
    setupAudio();
  }, []);

  // Save position periodically
  useEffect(() => {
    if (!currentPodcast || position === 0) return;

    const saveInterval = setInterval(() => {
      savePlaybackPosition();
    }, 5000);

    return () => clearInterval(saveInterval);
  }, [position, currentPodcast]);

  const savePlaybackPosition = async () => {
    if (!currentPodcast || position === 0) return;
    try {
      await AsyncStorage.setItem(
        `${PLAYBACK_POSITION_KEY}${currentPodcast.id}`,
        JSON.stringify({ position, duration })
      );
    } catch (error) {
      console.error('Error saving position:', error);
    }
  };

  const loadSavedPosition = async (podcastId: string): Promise<number> => {
    try {
      const saved = await AsyncStorage.getItem(`${PLAYBACK_POSITION_KEY}${podcastId}`);
      if (saved) {
        const { position: savedPosition } = JSON.parse(saved);
        return savedPosition > 1000 ? savedPosition : 0;
      }
    } catch (error) {
      console.error('Error loading position:', error);
    }
    return 0;
  };

  // Optimized native event listener
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        sound?.setPositionAsync(0);
      }
    }
  };

  const loadPodcast = async (podcast: Podcast) => {
    try {
      // If same podcast, just show player
      if (currentPodcast?.id === podcast.id && sound) {
        setShowPlayer(true);
        return;
      }

      // Stop current playback
      if (sound) {
        await savePlaybackPosition();
        await sound.unloadAsync();
        setSound(null);
      }

      // --- OFFLINE INTERCEPTION LOGIC (MODERN EXPO-FILE-SYSTEM) ---
      // Check if the file exists in cache (matching LibraryScreen's download path)
      const localFile = new File(Paths.cache, `podcast_${podcast.id}.mp3`);
      const isOfflineAvailable = localFile.exists;
      const uriToPlay = isOfflineAvailable ? localFile.uri : podcast.audio_url!;

      if (isOfflineAvailable) {
        console.log(`Playing OFFLINE downloaded file for podcast ${podcast.id}`);
      } else {
        console.log(`Streaming ONLINE file for podcast ${podcast.id}`);
      }
      // ------------------------------------------------------------

      // Load new podcast with native progress polling (500ms)
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: uriToPlay },
        { 
          shouldPlay: false, 
          rate: playbackRate,
          progressUpdateIntervalMillis: 500 
        },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setCurrentPodcast(podcast);

      // Load saved position
      const savedPosition = await loadSavedPosition(podcast.id);
      if (savedPosition > 0) {
        await newSound.setPositionAsync(savedPosition);
        setPosition(savedPosition);
      }
      setShowPlayer(true);

    } catch (error) {
      console.error('Error loading podcast:', error);
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

  const seekTo = async (newPosition: number) => {
    if (!sound) return;
    await sound.setPositionAsync(newPosition);
    setPosition(newPosition);
  };

  const skipForward = async () => {
    if (!sound) return;
    const newPosition = Math.min(position + 15000, duration);
    await seekTo(newPosition);
  };

  const skipBackward = async () => {
    if (!sound) return;
    const newPosition = Math.max(position - 15000, 0);
    await seekTo(newPosition);
  };

  const setRate = async (rate: number) => {
    setPlaybackRate(rate);
    if (sound) {
      await sound.setRateAsync(rate, true);
    }
  };

  const stopPlayback = async () => {
    if (sound) {
      await savePlaybackPosition();
      await sound.unloadAsync();
      setSound(null);
    }
    setCurrentPodcast(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    setShowPlayer(false);
  };

  const value: AudioContextType = {
    currentPodcast,
    isPlaying,
    position,
    duration,
    playbackRate,
    sound,
    loadPodcast,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    setRate,
    stopPlayback,
    showPlayer,
    setShowPlayer,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};