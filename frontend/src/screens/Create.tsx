import React from "react";
import { View, Text, StyleSheet } from "react-native";

const CreateScreen: React.FC = () => {
  return (
    <View style={styles.container}>
        <Text style={styles.title}>Create</Text>
    </View>
  );
};

export default CreateScreen;

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 16 },
    title: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
});
