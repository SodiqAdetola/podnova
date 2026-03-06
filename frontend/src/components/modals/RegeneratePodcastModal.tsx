// frontend/src/components/modals/RegeneratePodcastModal.tsx

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Podcast } from "../../types/podcasts";
import { auth } from "../../firebase/config";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const VOICES = [
  { id: "calm_female", name: "Calm (F)", icon: "woman" },
  { id: "calm_male", name: "Calm (M)", icon: "man" },
  { id: "energetic_female", name: "Energy (F)", icon: "woman-outline" },
  { id: "energetic_male", name: "Energy (M)", icon: "man-outline" },
  { id: "professional_female", name: "Pro (F)", icon: "business" },
  { id: "professional_male", name: "Pro (M)", icon: "briefcase" },
];

const STYLES = [
  { id: "casual", name: "Casual" },
  { id: "standard", name: "Standard" },
  { id: "advanced", name: "Advanced" },
  { id: "expert", name: "Expert" },
];

interface Props {
  visible: boolean;
  podcast: Podcast | null;
  onClose: () => void;
  onSuccess: () => void;
}

const RegeneratePodcastModal: React.FC<Props> = ({ visible, podcast, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [length, setLength] = useState(5);
  const [voice, setVoice] = useState("calm_female");
  const [style, setStyle] = useState("standard");
  const [customPrompt, setCustomPrompt] = useState("");

  // Pre-fill existing data when the modal opens
  useEffect(() => {
    if (podcast && visible) {
      setLength(podcast.length_minutes || 5);
      setVoice(podcast.voice || "calm_female");
      setStyle(podcast.style || "standard");
      setCustomPrompt(podcast.custom_prompt || "");
    }
  }, [podcast, visible]);

  if (!podcast) return null;

  const handleRegenerate = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/podcasts/${podcast.id}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          length_minutes: length,
          voice: voice,
          style: style,
          custom_prompt: customPrompt.trim() !== "" ? customPrompt.trim() : null,
        }),
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        throw new Error("Failed to regenerate");
      }
    } catch (error) {
      alert("Error regenerating podcast. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Regenerate Podcast</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {podcast.has_topic_update && (
              <View style={styles.updateBanner}>
                <Ionicons name="flash" size={20} color="#F59E0B" />
                <Text style={styles.updateBannerText}>
                  This topic has new developments! Regenerating will include the latest news.
                </Text>
              </View>
            )}

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle} numberOfLines={2}>
                {podcast.topic_title}
              </Text>
              <Text style={styles.infoSubtitle}>
                Generating will overwrite the current audio.
              </Text>
            </View>

            {/* Custom Instructions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Instructions (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="E.g., Focus specifically on the financial impact..."
                placeholderTextColor="#9CA3AF"
                value={customPrompt}
                onChangeText={setCustomPrompt}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Voice Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Voice</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceScroll}>
                {VOICES.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.voiceCard, voice === v.id && styles.voiceCardActive]}
                    onPress={() => setVoice(v.id)}
                  >
                    <Ionicons name={v.icon as any} size={20} color={voice === v.id ? "#6366F1" : "#6B7280"} />
                    <Text style={[styles.voiceName, voice === v.id && styles.voiceNameActive]}>
                      {v.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Comprehension Style Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Comprehension Level</Text>
              <View style={styles.styleGrid}>
                {STYLES.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.styleButton, style === s.id && styles.styleButtonActive]}
                    onPress={() => setStyle(s.id)}
                  >
                    <Text style={[styles.styleName, style === s.id && styles.styleNameActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Length Slider */}
            <View style={[styles.section, { marginBottom: 40 }]}>
              <View style={styles.lengthHeader}>
                <Text style={styles.sectionTitle}>Target Length</Text>
                <Text style={styles.lengthValue}>{length} min</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={3}
                maximumValue={20}
                step={1}
                value={length}
                onValueChange={setLength}
                minimumTrackTintColor="#6366F1"
                maximumTrackTintColor="#E5E7EB"
                thumbTintColor="#6366F1"
              />
            </View>

          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegenerate}
              disabled={loading}
            >
              <LinearGradient
                colors={["#8B5CF6", "#6366F1"]}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Regenerate Audio</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    maxHeight: "85%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  content: {
    padding: 20,
  },
  updateBanner: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  updateBannerText: {
    flex: 1,
    color: "#92400E",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  infoSubtitle: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "500",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    minHeight: 80,
  },
  voiceScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  voiceCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    alignItems: "center",
    minWidth: 90,
  },
  voiceCardActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  voiceName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 4,
  },
  voiceNameActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  styleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  styleButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  styleButtonActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  styleName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  styleNameActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  lengthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  lengthValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6366F1",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  button: {
    borderRadius: 12,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonGradient: {
    flexDirection: "row",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default RegeneratePodcastModal;