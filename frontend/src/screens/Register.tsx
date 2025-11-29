// frontend/src/screens/RegisterScreen.tsx
import React, { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  ScrollView,
  ActivityIndicator 
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../Navigator";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase/config";
import { isValidEmail, isValidPassword } from "../utils/validation";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

// UPDATE THIS URL AFTER DEPLOYING TO RENDER
const API_BASE_URL = 'https://podnova-backend.onrender.com';

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // Validate all fields
    if (!fullName.trim()) {
      Alert.alert("Missing Information", "Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      Alert.alert("Missing Information", "Please enter your email address.");
      return;
    }

    if (!password) {
      Alert.alert("Missing Information", "Please enter a password.");
      return;
    }

    if (!confirm) {
      Alert.alert("Missing Information", "Please confirm your password.");
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!isValidPassword(password)) {
      Alert.alert(
        "Weak Password",
        "Password must be at least 5 characters and include uppercase, lowercase, and a number."
      );
      return;
    }

    if (password !== confirm) {
      Alert.alert("Password Mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // Create Firebase user
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const firebaseUser = cred.user;

      // Update Firebase profile with display name
      await updateProfile(firebaseUser, {
        displayName: fullName.trim(),
      });

      // Get Firebase token
      const token = await firebaseUser.getIdToken();

      // Create backend user profile
      const response = await fetch(`${API_BASE_URL}/user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create user profile');
      }

      Alert.alert(
        "Success! 🎉",
        "Your account has been created successfully!",
        [{ text: "OK" }]
      );

    } catch (error: any) {
      console.error("Registration error:", error);
      
      let errorMessage = "An unexpected error occurred. Please try again.";

      // Firebase errors
      if (error.code) {
        switch (error.code) {
          case "auth/email-already-in-use":
            errorMessage = "This email is already registered. Please login or use a different email.";
            break;
          case "auth/weak-password":
            errorMessage = "Your password is too weak. Please choose a stronger password.";
            break;
          case "auth/invalid-email":
            errorMessage = "The email address is invalid.";
            break;
          case "auth/network-request-failed":
            errorMessage = "Network error. Please check your internet connection.";
            break;
          default:
            errorMessage = error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert("Registration Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView 
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join PodNova today</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Email Address"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
        />

        <View style={styles.requirementsContainer}>
          <Text style={styles.requirementsTitle}>Password must include:</Text>
          <Text style={styles.requirementItem}>• At least 5 characters</Text>
          <Text style={styles.requirementItem}>• Uppercase letter (A-Z)</Text>
          <Text style={styles.requirementItem}>• Lowercase letter (a-z)</Text>
          <Text style={styles.requirementItem}>• Number (0-9)</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.buttonText}>Creating Account...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.linkContainer}
          disabled={loading}
        >
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkTextBold}>Login</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#f8f9fa",
  },
  container: {
    padding: 24,
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 32,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  requirementsContainer: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  requirementItem: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    paddingLeft: 4,
  },
  button: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: "#97c5f5",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    color: "#666",
    fontSize: 14,
  },
  linkTextBold: {
    color: "#007AFF",
    fontWeight: "600",
  },
});