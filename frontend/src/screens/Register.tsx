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
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../Navigator";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase/config";
import { isValidEmail, isValidPassword } from "../utils/validation";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

const API_BASE_URL = 'https://podnova-backend-r8yz.onrender.com';

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRegister = async () => {
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
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const firebaseUser = cred.user;

      await updateProfile(firebaseUser, {
        displayName: fullName.trim(),
      });

      const token = await firebaseUser.getIdToken();

      const response = await fetch(`${API_BASE_URL}/users/user`, {
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
        "Success!",
        "Your account has been created successfully!",
        [{ text: "OK" }]
      );

    } catch (error: any) {
      console.error("Registration error:", error);
      
      let errorMessage = "An unexpected error occurred. Please try again.";

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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              style={styles.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="mic" size={28} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join PodNova today</Text>
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          {/* Full Name Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="#9CA3AF"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          </View>

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Create a password"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={showPassword ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color="#9CA3AF" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor="#9CA3AF"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity 
                onPress={() => setShowConfirm(!showConfirm)}
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={showConfirm ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color="#9CA3AF" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Password Requirements */}
          <View style={styles.requirementsContainer}>
            <View style={styles.requirementRow}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.requirementText}>At least 5 characters</Text>
            </View>
            <View style={styles.requirementRow}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.requirementText}>Uppercase & lowercase letters</Text>
            </View>
            <View style={styles.requirementRow}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.requirementText}>At least one number</Text>
            </View>
          </View>

          {/* Create Account Button */}
          <TouchableOpacity
            style={[styles.createButton, loading && styles.createButtonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={loading ? ['#9CA3AF', '#6B7280'] : ['#8B5CF6', '#6366F1']}
              style={styles.createButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.createButtonText}>Creating Account...</Text>
                </View>
              ) : (
                <Text style={styles.createButtonText}>Create Account</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Login Link */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.loginLink}
            disabled={loading}
          >
            <Text style={styles.loginLinkText}>
              Already have an account?{" "}
              <Text style={styles.loginLinkTextBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContainer: {
    top: 50,
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: 12,
  },
  logoGradient: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  formContainer: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    height: "100%",
  },
  eyeIcon: {
    padding: 4,
  },
  requirementsContainer: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  requirementText: {
    fontSize: 12,
    color: "#166534",
    marginLeft: 6,
    fontWeight: "500",
  },
  createButton: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonDisabled: {
    shadowOpacity: 0,
  },
  createButtonGradient: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: 12,
  },
  loginLinkText: {
    fontSize: 15,
    color: "#6B7280",
  },
  loginLinkTextBold: {
    fontWeight: "600",
    color: "#6366F1",
  },
});