// frontend/src/components/ProfileSettings.tsx
import React, { useState } from "react";
import { View, LayoutAnimation } from "react-native";
import SettingsList, { SettingItem } from "./lists/SettingsList";
import VoiceSelector from "./modals/VoiceSelectorModal";
import AIStyleSelector from "./modals/StyleSelectorModal";
import PodcastLengthSelector from "./modals/LengthSelectorModal";
import BlockedUsersModal from "./modals/BlockedUserModal";

interface ProfileSettingsProps { 
  userProfile: any;
  onUpdatePreference: (updates: any) => void;
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  userProfile,
  onUpdatePreference,
}) => {
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [showAIStyleSelector, setShowAIStyleSelector] = useState(false);
  const [showLengthSelector, setShowLengthSelector] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);

  const prefs = userProfile?.preferences || {};

  const handleToggle = (key: string, value: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onUpdatePreference({ [key]: value });
  };

  const formatVoiceName = (voice: string) => voice.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const formatAIStyleName = (style: string) => style.charAt(0).toUpperCase() + style.slice(1);
  const formatLengthName = (length: string) => {
    const map: any = { short: "Short (5 min)", medium: "Medium (10 min)", long: "Long (20 min)" };
    return map[length] || "Medium (10 min)";
  };

  const settingsSections = [
    {
      title: "Preferences",
      items: [
        {
          id: "push_notifications",
          type: "toggle",
          title: "Push Notifications",
          icon: "notifications",
          iconColor: "#6366F1",
          value: prefs.push_notifications ?? true,
          onToggle: (v: boolean) => handleToggle("push_notifications", v),
          subItems: [
            {
              id: "push_podcast_ready",
              type: "toggle",
              title: "Podcast Generation",
              value: prefs.push_podcast_ready ?? true,
              onToggle: (v: boolean) => handleToggle("push_podcast_ready", v),
            },
            {
              id: "push_reply",
              type: "toggle",
              title: "Message Replies",
              value: prefs.push_reply ?? true,
              onToggle: (v: boolean) => handleToggle("push_reply", v),
            },
            {
              id: "push_topic_update",
              type: "toggle",
              title: "Topic Updates",
              value: prefs.push_topic_update ?? true,
              onToggle: (v: boolean) => handleToggle("push_topic_update", v),
            },
          ]
        } as SettingItem,
      ],
    },
    {
      title: "Podcast Defaults",
      items: [
        {
          id: "default_voice",
          type: "navigation",
          title: "Default Voice",
          icon: "mic",
          iconColor: "#8B5CF6",
          value: prefs.default_voice ? formatVoiceName(prefs.default_voice) : "Calm Female",
          onPress: () => setShowVoiceSelector(true),
        } as SettingItem,
        {
          id: "default_ai_style",
          type: "navigation",
          title: "AI Style",
          icon: "sparkles",
          iconColor: "#6366F1",
          value: prefs.default_ai_style ? formatAIStyleName(prefs.default_ai_style) : "Standard",
          onPress: () => setShowAIStyleSelector(true),
        } as SettingItem,
        {
          id: "default_length",
          type: "navigation",
          title: "Default Length",
          icon: "time",
          iconColor: "#F59E0B",
          value: prefs.default_podcast_length ? formatLengthName(prefs.default_podcast_length) : "Medium",
          onPress: () => setShowLengthSelector(true),
        } as SettingItem,
      ],
    },
    {
      title: "Privacy & Account",
      items: [
        {
          id: "blocked_users",
          type: "navigation",
          title: "Blocked Users",
          icon: "shield",
          iconColor: "#f86c6c",
          onPress: () => setShowBlockedUsers(true),
        } as SettingItem,
      ],
    },
  ];

  return (
    <View>
      <SettingsList sections={settingsSections} />

      <VoiceSelector
        visible={showVoiceSelector}
        currentVoice={prefs.default_voice}
        onClose={() => setShowVoiceSelector(false)}
        onUpdate={(v) => onUpdatePreference({ default_voice: v })}
      />
      <AIStyleSelector
        visible={showAIStyleSelector}
        currentStyle={prefs.default_ai_style}
        onClose={() => setShowAIStyleSelector(false)}
        onUpdate={(v) => onUpdatePreference({ default_ai_style: v })}
      />
      <PodcastLengthSelector
        visible={showLengthSelector}
        currentLength={prefs.default_podcast_length}
        onClose={() => setShowLengthSelector(false)}
        onUpdate={(v) => onUpdatePreference({ default_podcast_length: v })}
      />
      <BlockedUsersModal 
        visible={showBlockedUsers} 
        onClose={() => setShowBlockedUsers(false)} 
      />
    </View>
  );
};

export default ProfileSettings;