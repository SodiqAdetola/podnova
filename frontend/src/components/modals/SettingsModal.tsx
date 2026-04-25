// frontend/src/components/modals/SettingsModal.tsx
/**
 * Page‑sheet modal that wraps the ProfileSettings component.
 * Provides the overall container and header for the settings screen.
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ProfileSettings from "../ProfileSettings";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  userProfile: any;
  onProfileUpdated: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  userProfile,
  onProfileUpdated,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-down" size={28} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ProfileSettings
            userProfile={userProfile}
            onProfileUpdated={onProfileUpdated}
          />
          <View style={styles.footerPadding} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  placeholder: {
    width: 28,
  },
  scrollContent: {
    flex: 1,
    paddingTop: 16,
  },
  footerPadding: {
    height: 60,
  },
});

export default SettingsModal;