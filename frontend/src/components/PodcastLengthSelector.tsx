// frontend/src/components/PodcastLengthSelector.tsx
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

const LENGTHS = [
  { id: "short", name: "Short", minutes: "5 min", description: "Quick overview" },
  { id: "medium", name: "Medium", minutes: "10 min", description: "Balanced coverage" },
  { id: "long", name: "Long", minutes: "20 min", description: "Deep dive" },
];

interface Props {
  visible: boolean;
  currentLength: string;
  onClose: () => void;
  onUpdate: (length: string) => void;
}

const PodcastLengthSelector: React.FC<Props> = ({ visible, currentLength, onClose, onUpdate }) => {
  const [selectedLength, setSelectedLength] = useState(currentLength);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (lengthId: string) => {
    setSelectedLength(lengthId);
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
        body: JSON.stringify({ default_podcast_length: lengthId }),
      });

      if (response.ok) {
        onUpdate(lengthId);
        setTimeout(onClose, 150);
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Error updating length:", error);
      setSelectedLength(currentLength);
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
          <Text style={styles.title}>Select Default Length</Text>
          
          {LENGTHS.map((length) => (
            <TouchableOpacity
              key={length.id}
              style={styles.option}
              onPress={() => handleSelect(length.id)}
              disabled={saving}
            >
              <View style={styles.optionContent}>
                <View style={styles.optionHeader}>
                  <Text style={[
                    styles.optionText,
                    selectedLength === length.id && styles.optionTextSelected
                  ]}>
                    {length.name}
                  </Text>
                  <Text style={styles.optionMinutes}>{length.minutes}</Text>
                </View>
                <Text style={styles.optionDescription}>{length.description}</Text>
              </View>
              {selectedLength === length.id && (
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
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  optionText: {
    fontSize: 15,
    color: "#111827",
  },
  optionTextSelected: {
    fontWeight: "600",
    color: "#6366F1",
  },
  optionMinutes: {
    fontSize: 13,
    color: "#6366F1",
    fontWeight: "500",
  },
  optionDescription: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});

export default PodcastLengthSelector;