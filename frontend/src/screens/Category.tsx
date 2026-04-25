// frontend/src/screens/Category.tsx
// Shows either topics or discussions for a chosen category (technology, finance, politics).

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CompositeNavigationProp } from "@react-navigation/native";
import { MainTabParamList, MainStackParamList } from "../Navigator";
import { Ionicons } from '@expo/vector-icons';
import DiscussionsList from "../components/lists/DiscussionList";
import TopicsList from "../components/lists/TopicList";
import CreateDiscussionModal from "../components/modals/CreateDiscussionModal";

type TabType = "topics" | "discussions";

type CategoryNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Category">,
  NativeStackNavigationProp<MainStackParamList>
>;

const CategoryScreen: React.FC = () => {
  const navigation = useNavigation<CategoryNavigationProp>();
  const route = useRoute();
  
  // category = "technology", "finance", or "politics"
  // initialTab = which tab to show first (topics or discussions)
  const { category, initialTab } = route.params as { category: string, initialTab?: TabType };

  const [activeTab, setActiveTab] = useState<TabType>(initialTab || "topics");
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Changing this key forces DiscussionsList to remount, which refreshes the data
  const [discussionsKey, setDiscussionsKey] = useState(0);

  // If a link opened directly to discussions tab, switch to it
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [route.params]);

  const handleCreateSuccess = () => {
    // Increment key to refresh the discussions list after creating a new one
    setDiscussionsKey(prev => prev + 1);
  };

  return (
    <View style={styles.container}>
      {/* Header with back button and category name */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {category.toUpperCase()}
        </Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "topics" && styles.tabActive]}
          onPress={() => setActiveTab("topics")}
        >
          <Text style={[styles.tabText, activeTab === "topics" && styles.tabTextActive]}>
            Topics
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "discussions" && styles.tabActive]}
          onPress={() => setActiveTab("discussions")}
        >
          <Text style={[styles.tabText, activeTab === "discussions" && styles.tabTextActive]}>
            Discussions
          </Text>
        </TouchableOpacity>
      </View>

      {/* Show the correct component based on active tab */}
      {activeTab === "topics" ? (
        <TopicsList category={category} />
      ) : (
        <View style={styles.content}>
          <DiscussionsList
            key={discussionsKey}
            category={category}
            onCreatePress={() => setShowCreateModal(true)}
          />
        </View>
      )}

      {/* Modal for creating a new community discussion */}
      <CreateDiscussionModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        category={category}
      />
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 1,
    width: "77%",
    textAlign: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#6366F1",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 16,
    flex: 1,
  },
});

export default CategoryScreen;