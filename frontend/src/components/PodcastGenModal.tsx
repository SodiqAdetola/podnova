// frontend/src/components/PodcastGeneratorModal.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { auth } from "../firebase/config";
import { minimum } from "firebase/firestore/pipelines";

const { height } = Dimensions.get("window");

interface PodcastGenModalProps {
  visible: boolean;
  onClose: () => void;
  topic: {
    id: string;
    title: string;
    article_count: number;
  };
  userSettings?: {
    defaultVoice: string;
    defaultStyle: string;
    defaultLength: number;
  };
}

const VOICES = [
  { id: "calm_female", name: "Calm (Female)", icon: "woman" },
  { id: "calm_male", name: "Calm (Male)", icon: "man" },
  { id: "energetic_female", name: "Energetic (Female)", icon: "woman-outline" },
  { id: "energetic_male", name: "Energetic (Male)", icon: "man-outline" },
  { id: "professional_female", name: "Professional (Female)", icon: "business" },
  { id: "professional_male", name: "Professional (Male)", icon: "briefcase" },
];

const STYLES = [
  { id: "casual", name: "Casual", description: "Simple & conversational" },
  { id: "standard", name: "Standard", description: "Balanced & clear" },
  { id: "advanced", name: "Advanced", description: "In-depth analysis" },
  { id: "expert", name: "Expert", description: "Technical & comprehensive" },
];

const PodcastGenModal: React.FC<PodcastGenModalProps> = ({
  visible,
  onClose,
  topic,
  userSettings,
}) => {
  // Initialize with user defaults or fallback defaults
  const [selectedVoice, setSelectedVoice] = useState(
    userSettings?.defaultVoice || "calm_female"
  );
  const [selectedStyle, setSelectedStyle] = useState(
    userSettings?.defaultStyle || "standard"
  );
  const [lengthMinutes, setLengthMinutes] = useState(
    userSettings?.defaultLength || 5
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStarted, setGenerationStarted] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setGenerationStarted(false);
      setGenerating(false);
    }
  }, [visible]);

  const estimatedTime = lengthMinutes * 12; // ~12 seconds per minute
  const estimatedCredits = lengthMinutes;

  const handleGenerate = async () => {
    setGenerating(true);

    try {
        const token = await auth.currentUser?.getIdToken(true);
        if (!token) {
            throw new Error("User not authenticated");
        }

        const response = await fetch(
        "https://podnova-backend-r8yz.onrender.com/podcasts/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            topic_id: topic.id,
            voice: selectedVoice,
            style: selectedStyle,
            length_minutes: lengthMinutes,
            custom_prompt: customPrompt || null,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setGenerationStarted(true);
        // Don't close modal yet - show success message
      } else {
        alert("Failed to start podcast generation. Please try again.");
        setGenerating(false);
      }
    } catch (error) {
      console.error("Error generating podcast:", error);
      alert("Network error. Please check your connection.");
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setCustomPrompt("");
    onClose();
  };

  const renderVoiceSelector = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Voice</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.voiceScroll}
      >
        {VOICES.map((voice) => (
          <TouchableOpacity
            key={voice.id}
            style={[
              styles.voiceCard,
              selectedVoice === voice.id && styles.voiceCardActive,
            ]}
            onPress={() => setSelectedVoice(voice.id)}
          >
            <Ionicons
              name={voice.icon as any}
              size={24}
              color={selectedVoice === voice.id ? "#6366F1" : "#6B7280"}
            />
            <Text
              style={[
                styles.voiceName,
                selectedVoice === voice.id && styles.voiceNameActive,
              ]}
            >
              {voice.name}
            </Text>
            {selectedVoice === voice.id && (
              <Ionicons
                name="checkmark-circle"
                size={16}
                color="#6366F1"
                style={styles.checkmark}
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderStyleSelector = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Comprehension Level</Text>
      <View style={styles.styleGrid}>
        {STYLES.map((style) => (
          <TouchableOpacity
            key={style.id}
            style={[
              styles.styleButton,
              selectedStyle === style.id && styles.styleButtonActive,
            ]}
            onPress={() => setSelectedStyle(style.id)}
          >
            <Text
              style={[
                styles.styleName,
                selectedStyle === style.id && styles.styleNameActive,
              ]}
            >
              {style.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.styleDescription}>
        {STYLES.find((s) => s.id === selectedStyle)?.description}
      </Text>
    </View>
  );

  const renderLengthSlider = () => (
    <View style={styles.section}>
      <View style={styles.lengthHeader}>
        <Text style={styles.sectionTitle}>Length</Text>
        <Text style={styles.lengthValue}>{lengthMinutes} min</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={3}
        maximumValue={20}
        step={1}
        value={lengthMinutes}
        onValueChange={setLengthMinutes}
        minimumTrackTintColor="#6366F1"
        maximumTrackTintColor="#E5E7EB"
        thumbTintColor="#6366F1"
      />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>3 min</Text>
        <Text style={styles.sliderLabel}>20 min</Text>
      </View>
    </View>
  );

  const renderAdvancedControls = () => {
    if (!showAdvanced) {
      return (
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(true)}
        >
          <Text style={styles.advancedToggleText}>Advanced Controls</Text>
          <Ionicons name="chevron-down" size={20} color="#6366F1" />
        </TouchableOpacity>
      );
    }

    return (
      <View>
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(false)}
        >
          <Text style={styles.advancedToggleText}>Advanced Controls</Text>
          <Ionicons name="chevron-up" size={20} color="#6366F1" />
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Custom Instructions (Optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="E.g., Focus on economic impacts, include expert opinions..."
            placeholderTextColor="#9CA3AF"
            value={customPrompt}
            onChangeText={setCustomPrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.inputHint}>
            {customPrompt.length}/500 characters
          </Text>
        </View>
      </View>
    );
  };

  if (generationStarted) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Podcast Generation Started!</Text>
            <Text style={styles.successMessage}>
              Your podcast is being generated in the background. This usually takes
              {estimatedTime} - {estimatedTime + 30} seconds.
            </Text>
            <Text style={styles.successInstruction}>
              Navigate to the <Text style={styles.bold}>Library</Text> tab to track
              progress and listen when ready.
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={handleClose}
            >
              <Text style={styles.successButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Podcast</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Topic Info */}
            <View style={styles.topicInfo}>
              <Text style={styles.topicLabel}>Topic</Text>
              <Text style={styles.topicTitle}>{topic.title}</Text>
              <Text style={styles.topicMeta}>{topic.article_count} Sources</Text>
            </View>

            {renderVoiceSelector()}
            {renderStyleSelector()}
            {renderLengthSlider()}
            {renderAdvancedControls()}

            {/* Estimate */}
            <View style={styles.estimate}>
              <Text style={styles.estimateText}>
                Estimated time: {estimatedTime}s • Cost: {estimatedCredits}{" "}
                credits
              </Text>
            </View>
          </ScrollView>

          {/* Generate Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.generateButton,
                generating && styles.generateButtonDisabled,
              ]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generate Podcast</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.9,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  placeholder: {
    width: 40,
  },
  content: {
    paddingHorizontal: 20,
  },
  topicInfo: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  topicLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  topicMeta: {
    fontSize: 14,
    color: "#6B7280",
  },
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  voiceScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  voiceCard: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  voiceCardActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  voiceName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 5,
    textAlign: "center",
  },
  voiceNameActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  styleGrid: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 8,
  },
  styleButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  styleButtonActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  styleName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  styleNameActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  styleDescription: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
    fontStyle: "italic",
  },
  lengthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderLabel: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 100,
  },
  inputHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    textAlign: "right",
  },
  estimate: {
    paddingVertical: 16,
    alignItems: "center",
  },
  estimateText: {
    fontSize: 13,
    color: "#6B7280",
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  generateButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#6366F1",
    gap: 8,
  },
  generateButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  successContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 32,
    alignItems: "center",
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  successMessage: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  successInstruction: {
    fontSize: 15,
    color: "#374151",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  bold: {
    fontWeight: "700",
    color: "#6366F1",
  },
  successButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#6366F1",
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default PodcastGenModal;