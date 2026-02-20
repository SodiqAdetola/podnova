// frontend/src/components/AIStyleSelector.tsx - SLEEK VERSION
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../firebase/config";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

const AI_STYLES = [
  { id: "casual", name: "Casual", description: "Simple & conversational" },
  { id: "standard", name: "Standard", description: "Balanced & clear" },
  { id: "advanced", name: "Advanced", description: "In-depth analysis" },
  { id: "expert", name: "Expert", description: "Technical & comprehensive" },
];

const STYLE_TO_TONE: Record<string, string> = {
  casual: "casual",
  standard: "factual",
  advanced: "analytical",
  expert: "expert",
};

interface Props {
  visible: boolean;
  currentStyle: string;
  onClose: () => void;
  onUpdate: (style: string) => void;
}

const AIStyleSelector: React.FC<Props> = ({ visible, currentStyle, onClose, onUpdate }) => {
  const [selectedStyle, setSelectedStyle] = useState(currentStyle);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (styleId: string) => {
    setSelectedStyle(styleId);
    setSaving(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("Not authenticated");

      const toneValue = STYLE_TO_TONE[styleId] || "factual";

      const response = await fetch(`${API_BASE_URL}/users/preferences`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_tone: toneValue,
          default_ai_style: styleId,
        }),
      });

      if (response.ok) {
        onUpdate(styleId);
        setTimeout(onClose, 150);
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Error updating AI style:", error);
      setSelectedStyle(currentStyle);
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
          <Text style={styles.title}>Select AI Style</Text>
          
          {AI_STYLES.map((style) => (
            <TouchableOpacity
              key={style.id}
              style={styles.option}
              onPress={() => handleSelect(style.id)}
              disabled={saving}
            >
              <View style={styles.optionContent}>
                <Text style={[
                  styles.optionText,
                  selectedStyle === style.id && styles.optionTextSelected
                ]}>
                  {style.name}
                </Text>
                <Text style={styles.optionDescription}>{style.description}</Text>
              </View>
              {selectedStyle === style.id && (
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
    maxWidth: 320,
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
    paddingVertical: 12,
    borderRadius: 8,
  },
  optionContent: {
    flex: 1,
  },
  optionText: {
    fontSize: 15,
    color: "#111827",
    marginBottom: 2,
  },
  optionTextSelected: {
    fontWeight: "600",
    color: "#6366F1",
  },
  optionDescription: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});

export default AIStyleSelector;