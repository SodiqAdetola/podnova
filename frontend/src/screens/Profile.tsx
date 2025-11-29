// src/screens/ProfileScreen.tsx
import React, { useLayoutEffect } from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { MainStackParamList } from "../Navigator";

type Props = BottomTabScreenProps<MainStackParamList, "Profile">;

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
    const handleLogout = async () => {
    await signOut(auth);
    };

    useLayoutEffect(() => {
        navigation.setOptions({
        headerRight: () => (
            <Button title="Logout" onPress={handleLogout} />
        ),
        title: "Profile",
        });
    }, [navigation]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Profile</Text>
        </View>
    );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
});
