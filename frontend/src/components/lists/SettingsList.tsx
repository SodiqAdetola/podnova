// frontend/src/components/lists/SettingsList.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface SettingItem {
  id: string;
  type: "navigation" | "toggle" | "value" | "header" | "action";
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string | boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  showChevron?: boolean;
  destructive?: boolean;
  subItems?: SettingItem[];
}

export interface SettingsSection {
  title?: string;
  items: SettingItem[];
}

interface Props {
  sections: SettingsSection[];
}

const SettingsList: React.FC<Props> = ({ sections }) => {
  const renderItem = (item: SettingItem) => {
    if (item.type === "toggle") {
      return (
        <View key={item.id}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              {item.icon && (
                <View style={[styles.iconContainer, { backgroundColor: item.iconColor ? item.iconColor + "15" : "#F3F4F6" }]}>
                  <Ionicons name={item.icon} size={20} color={item.iconColor || "#6366F1"} />
                </View>
              )}
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>{item.title}</Text>
                {item.subtitle && <Text style={styles.settingSubtitle}>{item.subtitle}</Text>}
              </View>
            </View>
            <Switch
              value={item.value as boolean}
              onValueChange={item.onToggle}
              trackColor={{ false: "#D1D5DB", true: "#A78BFA" }}
              thumbColor={item.value ? "#ffffff" : "#F3F4F6"}
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          {item.value && item.subItems && (
            <View style={styles.subSettingsWrapper}>
              {item.subItems.map((subItem) => (
                <View key={subItem.id} style={styles.subSettingRow}>
                  <Text style={styles.subSettingTitle}>{subItem.title}</Text>
                  <Switch
                    value={subItem.value as boolean}
                    onValueChange={subItem.onToggle}
                    trackColor={{ false: "#E5E7EB", true: "#adbdff" }}
                    thumbColor={subItem.value ? "#ffffff" : "#ffffff"}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }

    return (
      <TouchableOpacity key={item.id} style={styles.settingRow} onPress={item.onPress} activeOpacity={0.7}>
        <View style={styles.settingLeft}>
          {item.icon && (
            <View style={[
              styles.iconContainer, 
              { backgroundColor: item.destructive ? "#FEF2F2" : (item.iconColor ? item.iconColor + "15" : "#F3F4F6") }
            ]}>
              <Ionicons name={item.icon} size={20} color={item.destructive ? "#EF4444" : (item.iconColor || "#6366F1")} />
            </View>
          )}
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, item.destructive && styles.destructiveTitle]}>{item.title}</Text>
            {item.subtitle && <Text style={[styles.settingSubtitle, item.destructive && styles.destructiveSubtitle]}>{item.subtitle}</Text>}
          </View>
        </View>
        <View style={styles.settingRight}>
          {item.value && typeof item.value === "string" && <Text style={styles.valueText}>{item.value}</Text>}
          {(item.showChevron !== false && item.type === "navigation") && <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {sections.map((section, sectionIndex) => (
        <View key={sectionIndex} style={styles.section}>
          {section.title && <Text style={styles.sectionTitle}>{section.title}</Text>}
          <View style={styles.sectionContent}>
            {section.items.map((item, index) => (
              <View key={item.id}>
                {renderItem(item)}
                {index < section.items.length - 1 && <View style={styles.divider} />}
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
  destructiveTitle: { 
    color: "#EF4444", 
    fontWeight: "600",
  },
  destructiveSubtitle: { 
    color: "#F87171",
  },
  subSettingsWrapper: { 
    backgroundColor: "#FAFAFA", 
    borderTopWidth: 1, 
    borderTopColor: "#F3F4F6", 
    paddingVertical: 8,
  },
  subSettingRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingVertical: 10, 
    paddingLeft: 60, 
    paddingRight: 16,
  },
  subSettingTitle: { 
    fontSize: 14, 
    color: "#4B5563", 
    fontWeight: "400",
  },
});

export default SettingsList;