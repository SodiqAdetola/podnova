// frontend/src/contexts/AudioContext.tsx

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Podcast {
  id: string;
  topic_title: string;
  category: string;
  duration_seconds?: number;
  audio_url?: string;
  script?: string;
  created_at: string;
}

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
  
  const positionUpdateInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio mode
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  }, []);

  // Position updater
  useEffect(() => {
    if (sound && isPlaying) {
      positionUpdateInterval.current = setInterval(async () => {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          setPosition(status.positionMillis);
          setDuration(status.durationMillis || 0);
        }
      }, 500);
    } else {
      if (positionUpdateInterval.current) {
        clearInterval(positionUpdateInterval.current);
        positionUpdateInterval.current = null;
      }
    }

    return () => {
      if (positionUpdateInterval.current) {
        clearInterval(positionUpdateInterval.current);
        positionUpdateInterval.current = null;
      }
    };
  }, [sound, isPlaying]);

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

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);

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

      // Load new podcast
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: podcast.audio_url! },
        { shouldPlay: false, rate: playbackRate },
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