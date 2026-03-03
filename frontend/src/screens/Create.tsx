// frontend/src/screens/CreateScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import * as DocumentPicker from 'expo-document-picker';
import { auth } from "../firebase/config";
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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

const TONE_TO_STYLE: Record<string, string> = {
  casual: "casual",
  factual: "standard",
  analytical: "advanced",
  expert: "expert",
};

const LENGTH_TO_MINUTES: Record<string, number> = {
  short: 5,
  medium: 10,
  long: 20,
};

const CreateScreen: React.FC = () => {
  const navigation = useNavigation();
  
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("calm_female");
  const [selectedStyle, setSelectedStyle] = useState("standard");
  const [lengthMinutes, setLengthMinutes] = useState(10);
  
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState(60);

  // --- INITIALIZE PREFERENCES ---
  useEffect(() => {
    loadUserPreferences();
  }, []);

  const loadUserPreferences = async () => {
    try {
      setLoadingPreferences(true);
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const profile = await response.json();
        const prefs = profile.preferences;

        if (prefs) {
          setSelectedVoice(prefs.default_voice || "calm_female");
          setSelectedStyle(TONE_TO_STYLE[prefs.default_tone] || "standard");
          setLengthMinutes(LENGTH_TO_MINUTES[prefs.default_podcast_length] || 10);
        }
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoadingPreferences(false);
    }
  };

  // --- FILE HANDLING ---
  const handlePickDocument = async () => {
    try {
      if (files.length >= 5) {
        Alert.alert("Limit Reached", "You can only upload up to 5 files at a time.");
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const newFiles = [...files];
        result.assets.forEach(asset => {
          if (!newFiles.find(f => f.uri === asset.uri) && newFiles.length < 5) {
            newFiles.push(asset);
          }
        });
        setFiles(newFiles);
      }
    } catch (error) {
      console.error("Error picking document:", error);
      Alert.alert("Error", "Could not select the file.");
    }
  };

  const removeFile = (uri: string) => {
    setFiles(files.filter(f => f.uri !== uri));
  };

  // --- SUBMISSION ---
  const handleGenerate = async () => {
    if (files.length === 0 && !customPrompt.trim()) {
      Alert.alert("Missing Content", "Please upload at least one file or enter a prompt to generate a podcast.");
      return;
    }

    setGenerating(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("User not authenticated");
      
      const formData = new FormData();
      
      files.forEach((file, index) => {
        formData.append('files', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream'
        } as any);
      });

      formData.append('custom_prompt', customPrompt);
      formData.append('voice', selectedVoice);
      formData.append('style', selectedStyle);
      formData.append('length_minutes', lengthMinutes.toString());

      const response = await fetch(`${API_BASE_URL}/podcasts/generate-custom`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setEstimatedTime(data.estimated_time_seconds || lengthMinutes * 60);
        setGenerationStarted(true);
      } else {
        const error = await response.json();
        // SAFE ERROR PARSING TO PREVENT CRASH
        let errorMessage = "Unknown error occurred.";
        if (typeof error.detail === 'string') {
          errorMessage = error.detail;
        } else if (Array.isArray(error.detail) && error.detail.length > 0) {
          errorMessage = error.detail[0].msg;
        }
        Alert.alert("Generation Failed", errorMessage);
      }
    } catch (error) {
      console.error("Error generating custom podcast:", error);
      Alert.alert("Network Error", "Please check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  };

  const resetForm = () => {
    setFiles([]);
    setCustomPrompt("");
    setGenerationStarted(false);
  };

  const handleGoToLibrary = () => {
    resetForm();
    (navigation as any).navigate("Library");
  };

  // --- UI RENDERERS ---
  if (generationStarted) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={80} color="#10B981" />
        </View>
        <Text style={styles.successTitle}>Podcast Generating!</Text>
        <Text style={styles.successMessage}>
          Your custom podcast is being crafted in the background. Estimated time: {Math.round(estimatedTime / 60)} min {estimatedTime % 60} sec.
        </Text>
        
        <TouchableOpacity style={styles.successButton} onPress={handleGoToLibrary}>
          <Text style={styles.successButtonText}>Go to Library</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}>
          <Text style={styles.secondaryButtonText}>Create Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>STUDIO</Text>
        <Text style={styles.headerSubtitle}>Create a custom podcast</Text>
      </View>

      {loadingPreferences ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading studio...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={{ paddingBottom: 40 }} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          
          {/* FILE UPLOAD SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Source Material</Text>
            <Text style={styles.sectionSubtitle}>Upload PDFs or Text files for the AI to discuss.</Text>
            
            <TouchableOpacity style={styles.uploadButton} onPress={handlePickDocument}>
              <Ionicons name="cloud-upload-outline" size={24} color="#6366F1" />
              <Text style={styles.uploadButtonText}>Tap to Upload Files (Max 5)</Text>
            </TouchableOpacity>

            {files.length > 0 && (
              <View style={styles.fileList}>
                {files.map((file, idx) => (
                  <View key={idx} style={styles.fileItem}>
                    <Ionicons name="document-text" size={20} color="#9CA3AF" />
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <TouchableOpacity onPress={() => removeFile(file.uri)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* PROMPT SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <Text style={styles.sectionSubtitle}>What should the hosts focus on?</Text>
            <TextInput
              style={styles.textInput}
              placeholder="E.g., Summarize the key arguments in these documents, but make it sound like a debate..."
              placeholderTextColor="#9CA3AF"
              value={customPrompt}
              onChangeText={setCustomPrompt}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* VOICE SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceScroll}>
              {VOICES.map((voice) => (
                <TouchableOpacity
                  key={voice.id}
                  style={[styles.voiceCard, selectedVoice === voice.id && styles.voiceCardActive]}
                  onPress={() => setSelectedVoice(voice.id)}
                >
                  <Ionicons name={voice.icon as any} size={24} color={selectedVoice === voice.id ? "#6366F1" : "#6B7280"} />
                  <Text style={[styles.voiceName, selectedVoice === voice.id && styles.voiceNameActive]}>
                    {voice.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* STYLE SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comprehension Level</Text>
            <View style={styles.styleGrid}>
              {STYLES.map((style) => (
                <TouchableOpacity
                  key={style.id}
                  style={[styles.styleButton, selectedStyle === style.id && styles.styleButtonActive]}
                  onPress={() => setSelectedStyle(style.id)}
                >
                  <Text style={[styles.styleName, selectedStyle === style.id && styles.styleNameActive]}>
                    {style.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* LENGTH SECTION */}
          <View style={[styles.section, { borderBottomWidth: 0, paddingBottom: 20 }]}>
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
          </View>

        </ScrollView>
      )}

      {/* FIXED DOCKED FOOTER */}
      {!loadingPreferences && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <LinearGradient
                colors={['#8B5CF6', '#6366F1']}
                style={styles.generateButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                <Text style={styles.generateButtonText}>Generate Podcast</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#41439e",
    letterSpacing: 1,
    textTransform: "uppercase",
    width: "100%",
    textAlign: "center",
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    gap: 12,
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6366F1",
  },
  fileList: {
    marginTop: 12,
    gap: 8,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    marginHorizontal: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    minHeight: 120,
  },
  voiceScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  voiceCard: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    alignItems: "center",
    minWidth: 110,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  styleButtonActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  styleName: {
    fontSize: 12,
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
    alignItems: "center",
    marginBottom: 12,
  },
  lengthValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6366F1",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  footer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 85 : 80,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 10,
  },
  generateButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  generateButtonDisabled: {
    opacity: 0.7,
  },
  generateButtonGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#FFFFFF",
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 40,
  },
  successButton: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
});

export default CreateScreen;