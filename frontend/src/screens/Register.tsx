// frontend/src/screens/RegisterScreen.tsx
// User registration screen with password strength validation.

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../Navigator";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase/config";
import { Ionicons } from "@expo/vector-icons";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

const API_BASE_URL = 'https://podnova-backend-r8yz.onrender.com';

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showRequirements, setShowRequirements] = useState(false);

  // Password strength tracking
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0, // 0-4
    label: "",
    color: "#E5E7EB",
    requirements: {
      length: false,
      number: false,
      uppercase: false,
      lowercase: false,
    }
  });

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // Analyse password strength in real-time as user types
  useEffect(() => {
    if (!password) {
      setPasswordStrength({
        score: 0,
        label: "",
        color: "#E5E7EB",
        requirements: {
          length: false,
          number: false,
          uppercase: false,
          lowercase: false,
        }
      });
      return;
    }

    const requirements = {
      length: password.length >= 6,
      number: /[0-9]/.test(password),
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
    };

    const metCount = Object.values(requirements).filter(Boolean).length;
    
    let score = 0;
    let label = "";
    let color = "#EF4444";

    if (metCount <= 1) {
      score = 1;
      label = "Weak";
      color = "#EF4444";
    } else if (metCount === 2) {
      score = 2;
      label = "Fair";
      color = "#F59E0B";
    } else if (metCount === 3) {
      score = 3;
      label = "Good";
      color = "#3B82F6";
    } else if (metCount === 4) {
      score = 4;
      label = "Strong";
      color = "#10B981";
    }

    setPasswordStrength({
      score,
      label,
      color,
      requirements,
    });
  }, [password]);

  const passwordsMatch = password === confirmPassword && password.length > 0;

  // Show password requirements when password field is focused
  useEffect(() => {
    if (focusedField === 'password') {
      setShowRequirements(true);
    } else if (focusedField !== 'password' && !password) {
      setShowRequirements(false);
    }
  }, [focusedField, password]);

  const canSubmit = passwordStrength.score >= 3 && passwordsMatch && username && email;

  const handleRegister = async () => {
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedEmail || !trimmedPassword) {
      Alert.alert("Missing information", "Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    if (!passwordStrength.requirements.number) {
      Alert.alert("Weak password", "Include at least one number.");
      return;
    }

    if (!passwordStrength.requirements.uppercase || !passwordStrength.requirements.lowercase) {
      Alert.alert("Weak password", "Include both uppercase and lowercase letters.");
      return;
    }

    if (!passwordsMatch) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
      await updateProfile(cred.user, { displayName: trimmedUsername });

      const token = await cred.user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to create profile');
    } catch (error: any) {
      console.error(error);
      let message = "Registration failed. Please try again.";
      if (error.code === 'auth/email-already-in-use') {
        message = "This email is already registered.";
      }
      Alert.alert("Registration failed", message);
    } finally {
      setLoading(false);
    }
  };

  const renderRequirement = (met: boolean, text: string) => (
    <View style={styles.requirementRow}>
      <Ionicons 
        name={met ? "checkmark-circle" : "ellipse-outline"} 
        size={14} 
        color={met ? "#10B981" : "#9CA3AF"} 
      />
      <Text style={[styles.requirementText, met && styles.requirementMet]}>
        {text}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Join PodNova to get AI‑generated podcasts from premium sources.
          </Text>

          <View style={styles.form}>
            {/* Username */}
            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'username' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={focusedField === 'username' ? '#6366F1' : '#9CA3AF'}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={usernameRef}
                  style={styles.input}
                  placeholder="AlexJohnson"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={focusedField === 'email' ? '#6366F1' : '#9CA3AF'}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="name@mail.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={focusedField === 'password' ? '#6366F1' : '#9CA3AF'}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>

              {/* Compact strength meter */}
              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBar}>
                    {[1, 2, 3, 4].map((level) => (
                      <View
                        key={level}
                        style={[
                          styles.strengthSegment,
                          { backgroundColor: level <= passwordStrength.score 
                              ? passwordStrength.color 
                              : "#E5E7EB" 
                          }
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                    {passwordStrength.label}
                  </Text>
                </View>
              )}

              {/* Progressive disclosure of requirements */}
              {(showRequirements || password.length > 0) && (
                <View style={styles.requirementsContainer}>
                  {renderRequirement(passwordStrength.requirements.length, "At least 6 characters")}
                  {renderRequirement(passwordStrength.requirements.number, "At least one number")}
                  {renderRequirement(passwordStrength.requirements.uppercase, "Uppercase letter")}
                  {renderRequirement(passwordStrength.requirements.lowercase, "Lowercase letter")}
                </View>
              )}
            </View>

            {/* Confirm Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Confirm password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'confirm' && styles.inputWrapperFocused,
                  confirmPassword.length > 0 && {
                    borderColor: passwordsMatch ? '#10B981' : '#EF4444',
                    borderWidth: 1,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={
                    focusedField === 'confirm'
                      ? '#6366F1'
                      : confirmPassword.length > 0
                      ? passwordsMatch
                        ? '#10B981'
                        : '#EF4444'
                      : '#9CA3AF'
                  }
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={confirmRef}
                  style={styles.input}
                  placeholder="Re‑enter password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                  <Ionicons
                    name={showConfirm ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>

              {/* Compact match indicator */}
              {confirmPassword.length > 0 && (
                <View style={styles.matchContainer}>
                  <Ionicons
                    name={passwordsMatch ? "checkmark-circle" : "close-circle"}
                    size={14}
                    color={passwordsMatch ? "#10B981" : "#EF4444"}
                  />
                  <Text
                    style={[
                      styles.matchText,
                      { color: passwordsMatch ? "#10B981" : "#EF4444" },
                    ]}
                  >
                    {passwordsMatch ? "Match" : "No match"}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.createButton, (!canSubmit || loading) && styles.createButtonDisabled]}
              onPress={handleRegister}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.createButtonText}>Create account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.replace('Login')}>
                <Text style={styles.linkText}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 30,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#6366F1",
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 28,
  },
  form: {
    width: "100%",
  },
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
  },
  inputWrapperFocused: {
    borderColor: "#6366F1",
    backgroundColor: "#FFFFFF",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: "#111827",
  },
  strengthContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  strengthBar: {
    width: 80,
    flexDirection: "row",
    height: 4,
    gap: 4,
  },
  strengthSegment: {
    flex: 1,
    height: "100%",
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "600",
    width: 45,
  },
  requirementsContainer: {
    marginTop: 10,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requirementText: {
    fontSize: 12,
    color: "#6B7280",
  },
  requirementMet: {
    color: "#374151",
  },
  matchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  matchText: {
    fontSize: 12,
    fontWeight: "500",
  },
  createButton: {
    height: 48, 
    backgroundColor: "#6366F1",
    borderRadius: 10, 
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 22,
  },
  footerText: {
    fontSize: 14,
    color: "#6B7280",
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },
});

export default RegisterScreen;