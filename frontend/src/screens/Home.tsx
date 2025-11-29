import React from "react";
import { View, Text, StyleSheet } from "react-native";

const HomeScreen: React.FC = () => {
  return (
    <View style={styles.container}>
        <Text style={styles.title}>Home</Text>
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 16 },
    title: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
});
