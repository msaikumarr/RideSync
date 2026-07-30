import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useAuth } from "../context/AuthContext";

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert("Missing Information", "Name, Email and Password are required.");
      return;
    }

    setSubmitting(true);

    try {
      await register(name.trim(), email.trim(), password, phone.trim());
    } catch (err) {
      Alert.alert(
        "Registration Failed",
        err?.response?.data?.message || "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >

        <View style={styles.header}>
          <Text style={styles.heading}>RideSync</Text>
          
          <Text style={styles.heading}>
            Create Account
          </Text>
          <Text style={styles.subtitle}>
            Join your riding crew and enjoy trips together.
          </Text>
        </View>

        <View style={styles.card}>

          <Text style={styles.label}>FULL NAME</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
          />

          <Text style={[styles.label,{marginTop:18}]}>EMAIL</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.label,{marginTop:18}]}>PHONE</Text>

          <TextInput
            style={styles.input}
            placeholder="Phone Number (Optional)"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <Text style={[styles.label,{marginTop:18}]}>PASSWORD</Text>

          <View style={styles.passwordBox}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Create Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry={secure}
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity onPress={() => setSecure(!secure)}>
              <Text style={styles.eye}>
                {secure ? "SHOW" : "HIDE"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleRegister}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>
              {submitting ? "Creating Account..." : "Create Account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.register}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.registerText}>
              Already have an account?
              <Text style={styles.registerBlue}> Login</Text>
            </Text>
          </TouchableOpacity>

        </View>

      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container:{
    flex:1,
    backgroundColor:"#F4F7FE",
    paddingHorizontal:24
  },

  circle1:{
    position:"absolute",
    width:280,
    height:280,
    borderRadius:140,
    backgroundColor:"#818CF8",
    top:-80,
    right:-100,
    opacity:.35
  },

  circle2:{
    position:"absolute",
    width:220,
    height:220,
    borderRadius:110,
    backgroundColor:"#67E8F9",
    bottom:-50,
    left:-80,
    opacity:.35
  },

  circle3:{
    position:"absolute",
    width:120,
    height:120,
    borderRadius:60,
    backgroundColor:"#A7F3D0",
    top:260,
    right:40,
    opacity:.45
  },

  header:{
    marginTop:70,
    marginBottom:30
  },

  logo:{
    fontSize:26,
    fontWeight:"800",
    color:"#4F46E5"
  },

  heading:{
    marginTop:25,
    fontSize:42,
    fontWeight:"900",
    color:"#1E293B",
    lineHeight:48
  },

  subtitle:{
    marginTop:15,
    color:"#64748B",
    fontSize:16,
    lineHeight:24
  },

  card:{
    backgroundColor:"#FFFFFF",
    borderRadius:30,
    padding:25,
    shadowColor:"#6366F1",
    shadowOpacity:.12,
    shadowRadius:20,
    shadowOffset:{width:0,height:12},
    elevation:8,
    marginBottom:20
  },

  label:{
    color:"#475569",
    fontWeight:"700",
    fontSize:12,
    letterSpacing:1,
    marginBottom:8
  },

  input:{
    height:58,
    borderRadius:18,
    backgroundColor:"#F8FAFC",
    borderWidth:1,
    borderColor:"#CBD5E1",
    paddingHorizontal:18,
    color:"#1E293B",
    fontSize:16
  },

  passwordBox:{
    height:58,
    borderRadius:18,
    backgroundColor:"#F8FAFC",
    borderWidth:1,
    borderColor:"#CBD5E1",
    flexDirection:"row",
    alignItems:"center",
    paddingHorizontal:18
  },

  passwordInput:{
    flex:1,
    color:"#1E293B",
    fontSize:16
  },

  eye:{
    color:"#4F46E5",
    fontWeight:"700",
    fontSize:13
  },

  button:{
    marginTop:30,
    height:60,
    borderRadius:18,
    backgroundColor:"#4F46E5",
    justifyContent:"center",
    alignItems:"center",
    shadowColor:"#4F46E5",
    shadowOpacity:.3,
    shadowRadius:15,
    shadowOffset:{width:0,height:8},
    elevation:8
  },

  buttonText:{
    color:"#fff",
    fontWeight:"800",
    fontSize:17
  },

  register:{
    marginTop:25,
    alignItems:"center"
  },

  registerText:{
    color:"#64748B",
    fontSize:15
  },

  registerBlue:{
    color:"#4F46E5",
    fontWeight:"700"
  }

});