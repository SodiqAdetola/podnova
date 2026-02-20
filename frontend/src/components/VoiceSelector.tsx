// frontend/src/components/VoiceSelector.tsx - SLEEK VERSION
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../firebase/config";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

const VOICES = [
  { id: "calm_female", name: "Calm (Female)" },
  { id: "calm_male", name: "Calm (Male)" },
  { id: "energetic_female", name: "Energetic (Female)" },
  { id: "energetic_male", name: "Energetic (Male)" },
  { id: "professional_female", name: "Professional (Female)" },
  { id: "professional_male", name: "Professional (Male)" },
];

interface Props {
  visible: boolean;
  currentVoice: string;
  onClose: () => void;
  onUpdate: (voice: string) => void;
}

const VoiceSelector: React.FC<Props> = ({ visible, currentVoice, onClose, onUpdate }) => {
  const [selectedVoice, setSelectedVoice] = useState(currentVoice);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    setSaving(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("Not authenticated");

      const response = await fetch(`${API_BASE_URL}/users/preferences`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ default_voice: voiceId }),
      });

      if (response.ok) {
        onUpdate(voiceId);
        setTimeout(onClose, 150);
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Error updating voice:", error);
      setSelectedVoice(currentVoice);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          style={styles.modal} 
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.title}>Select Voice</Text>
          
          {VOICES.map((voice) => (
            <TouchableOpacity
              key={voice.id}
              style={styles.option}
              onPress={() => handleSelect(voice.id)}
              disabled={saving}
            >
              <Text style={[
                styles.optionText,
                selectedVoice === voice.id && styles.optionTextSelected
              ]}>
                {voice.name}
              </Text>
              {selectedVoice === voice.id && (
                <Ionicons name="checkmark" size={20} color="#6366F1" />
              )}
            </TouchableOpacity>
          ))}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: "center",
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
  },
  optionText: {
    fontSize: 15,
    color: "#111827",
  },
  optionTextSelected: {
    fontWeight: "600",
    color: "#6366F1",
  },
});

export default VoiceSelector;