// frontend/src/screens/LoginScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../Navigator";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
import { isValidEmail } from "../utils/validation";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const API_BASE_URL = 'https://podnova-backend-r8yz.onrender.com';

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // 1. Basic presence check
    if (!email || !password) {
      Alert.alert("Missing information", "Please enter email and password.");
      return;
    }

    // 2. Email format check
    if (!isValidEmail(email)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = userCredential.user;

      // Get Firebase ID token
      const token = await firebaseUser.getIdToken();

      // Verify user exists in MongoDB backend
      const response = await fetch(`${API_BASE_URL}/users/user`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // User exists in Firebase but not in MongoDB - create profile
          const createResponse = await fetch(`${API_BASE_URL}/users/user`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });

          if (!createResponse.ok) {
            throw new Error("Failed to create user profile");
          }
        } else {
          throw new Error("Failed to fetch user profile");
        }
      }
      // Login successful, navigate to main app screen

    } catch (error: any) {
      console.error("Login error:", error);
      
      // Handle Firebase errors
      let errorMessage = "Login failed. Please try again.";
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email.";
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "Incorrect password.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "This account has been disabled.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Please try again later.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("Login failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
            <Text style={styles.title}>PodNova</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Button
              title={loading ? "Logging in..." : "Login"}
              onPress={handleLogin}
              disabled={loading}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate("Register")}
              style={styles.linkContainer}
            >
                <Text style={styles.linkText}>Don't have an account? Register</Text>
            </TouchableOpacity>
        </View>
    </ScrollView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, justifyContent: "center" },
  container: { padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 16, color: "#666", marginBottom: 24, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  linkContainer: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#007AFF" },
});