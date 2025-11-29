import React from "react";
import { View, Text, StyleSheet } from "react-native";

const LibraryScreen: React.FC = () => {
  return (
    <View style={styles.container}>
        <Text style={styles.title}>Library</Text>
    </View>
  );
};

export default LibraryScreen;

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 16 },
    title: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
});
