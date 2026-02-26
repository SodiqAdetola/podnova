// frontend/src/components/CreateDiscussionModal.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";

const API_BASE_URL = "https://podnova-backend-r8yz.onrender.com";

interface CreateDiscussionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  category?: string;
}

const CreateDiscussionModal: React.FC<CreateDiscussionModalProps> = ({
  visible,
  onClose,
  onSuccess,
  category,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        const token = await user.getIdToken();
        setAuthToken(token);
      } else {
        setAuthToken(null);
      }
    });

    return unsubscribe;
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setTitle("");
      setDescription("");
      setTags([]);
      setTagInput("");
    }
  }, [visible]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && tags.length < 5 && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title");
      return;
    }

    if (!description.trim()) {
      Alert.alert("Error", "Please enter a description");
      return;
    }

    if (!user || !authToken) {
      Alert.alert("Error", "You must be signed in to create a discussion");
      onClose();
      return;
    }

    try {
      setCreating(true);

      // Log the request payload for debugging
      const requestBody = {
        title: title.trim(),
        description: description.trim(),
        tags: tags,
        category: category || null, // Ensure category is sent, even if null
      };
      
      console.log("Creating discussion with payload:", requestBody);

      const response = await fetch(`${API_BASE_URL}/discussions/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();
      
      if (response.ok) {
        console.log("Discussion created successfully:", responseData);
        onClose();
        if (onSuccess) {
          onSuccess();
        }
        Alert.alert("Success", "Discussion created successfully!");
      } else {
        console.error("Failed to create discussion:", responseData);
        Alert.alert("Error", responseData.detail || "Failed to create discussion");
      }
    } catch (error) {
      console.error("Error creating discussion:", error);
      Alert.alert("Error", "Failed to create discussion");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Community Discussion</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Form */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category Display (read-only) */}
          {category && (
            <View style={styles.categoryContainer}>
              <Text style={styles.categoryLabel}>Category</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{category}</Text>
              </View>
            </View>
          )}

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.label}>Discussion Title</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="E.g., Latest development in renewable energy..."
              placeholderTextColor="#9CA3AF"
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />
            <Text style={styles.charCount}>
              {title.length}/200 characters
            </Text>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Share your thoughts, insights, or questions..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
              maxLength={2000}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>
              {description.length}/2000 characters
            </Text>
          </View>

          {/* Tags */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Tags{" "}
              <Text style={styles.labelHint}>
                (Help others find your discussion - max 5)
              </Text>
            </Text>

            {/* Tag input */}
            <View style={styles.tagInputRow}>
              <TextInput
                style={styles.tagInput}
                placeholder="Add a tag..."
                placeholderTextColor="#9CA3AF"
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={handleAddTag}
                returnKeyType="done"
                maxLength={20}
              />
              <TouchableOpacity
                style={[
                  styles.addTagButton,
                  (!tagInput.trim() || tags.length >= 5) && styles.addTagButtonDisabled
                ]}
                onPress={handleAddTag}
                disabled={!tagInput.trim() || tags.length >= 5}
              >
                <Text style={styles.addTagButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Tags list */}
            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveTag(tag)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#6366F1" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Guidelines */}
          <View style={styles.guidelines}>
            <Text style={styles.guidelinesTitle}>Discussion Guidelines:</Text>
            <Text style={styles.guidelineItem}>
              • Stay on topic and be respectful
            </Text>
            <Text style={styles.guidelineItem}>
              • Back up claims with sources when possible
            </Text>
            <Text style={styles.guidelineItem}>
              • Be open to different perspectives
            </Text>
            <Text style={styles.guidelineItem}>
              • Use tags to help others discover your discussion
            </Text>
          </View>
        </ScrollView>

        {/* Create Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.createButton,
              (!title.trim() || !description.trim() || creating) &&
                styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!title.trim() || !description.trim() || creating}
          >
            {creating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Create Discussion</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    textTransform: "uppercase",
    
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  categoryContainer: {
    marginBottom: 20,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  categoryText: {
    fontSize: 15,
    color: "#6366F1",
    fontWeight: "500",
    textTransform: "capitalize",
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  labelHint: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
  },
  titleInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
  },
  descriptionInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    minHeight: 120,
  },
  charCount: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    textAlign: "right",
  },
  tagInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  tagInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
  },
  addTagButton: {
    paddingHorizontal: 20,
    justifyContent: "center",
    backgroundColor: "#6366F1",
    borderRadius: 8,
  },
  addTagButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  addTagButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    color: "#6366F1",
    fontWeight: "500",
  },
  guidelines: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E7FF",
    marginBottom: 20,
  },
  guidelinesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
    marginBottom: 8,
  },
  guidelineItem: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 4,
  },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  createButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#6366F1",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  createButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default CreateDiscussionModal;