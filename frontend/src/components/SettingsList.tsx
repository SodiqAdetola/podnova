// frontend/src/components/SettingsList.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface SettingItem {
  id: string;
  type: "navigation" | "toggle" | "value" | "header";
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string | boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  showChevron?: boolean;
  destructive?: boolean;
}

interface Props {
  sections: {
    title?: string;
    items: SettingItem[];
  }[];
}

const SettingsList: React.FC<Props> = ({ sections }) => {
  const renderItem = (item: SettingItem) => {
    if (item.type === "header") {
      return (
        <View key={item.id} style={styles.headerContainer}>
          {item.icon && (
            <Ionicons
              name={item.icon}
              size={18}
              color={item.iconColor || "#6B7280"}
              style={styles.headerIcon}
            />
          )}
          <Text style={styles.headerTitle}>{item.title}</Text>
        </View>
      );
    }

    if (item.type === "toggle") {
      return (
        <View key={item.id} style={styles.settingRow}>
          <View style={styles.settingLeft}>
            {item.icon && (
              <View style={[styles.iconContainer, { backgroundColor: item.iconColor + "15" || "#F3F4F6" }]}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.iconColor || "#6366F1"}
                />
              </View>
            )}
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              {item.subtitle && (
                <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
          </View>
          <Switch
            value={item.value as boolean}
            onValueChange={item.onToggle}
            trackColor={{ false: "#D1D5DB", true: "#A78BFA" }}
            thumbColor={item.value ? "#6366F1" : "#F3F4F6"}
            ios_backgroundColor="#D1D5DB"
          />
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.settingRow}
        onPress={item.onPress}
        activeOpacity={0.7}
      >
        <View style={styles.settingLeft}>
          {item.icon && (
            <View style={[styles.iconContainer, { backgroundColor: item.iconColor + "15" || "#F3F4F6" }]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={item.iconColor || "#6366F1"}
              />
            </View>
          )}
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.settingTitle,
                item.destructive && styles.destructiveText,
              ]}
            >
              {item.title}
            </Text>
            {item.subtitle && (
              <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
            )}
          </View>
        </View>
        <View style={styles.settingRight}>
          {item.value && typeof item.value === "string" && (
            <Text style={styles.valueText}>{item.value}</Text>
          )}
          {(item.showChevron !== false && item.type === "navigation") && (
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {sections.map((section, sectionIndex) => (
        <View key={sectionIndex} style={styles.section}>
          {section.title && (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          <View style={styles.sectionContent}>
            {section.items.map((item, index) => (
              <View key={item.id}>
                {renderItem(item)}
                {index < section.items.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  sectionContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginHorizontal: 20,
    overflow: "hidden",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  valueText: {
    fontSize: 15,
    color: "#6B7280",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 60,
  },
  destructiveText: {
    color: "#EF4444",
  },
});

export default SettingsList;