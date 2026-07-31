import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { expenseAPI, tripAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = [
  { key: "fuel", label: "Fuel" },
  { key: "food", label: "Food" },
  { key: "tolls", label: "Tolls" },
  { key: "hotels", label: "Hotels" },
  { key: "parking", label: "Parking" },
  { key: "other", label: "Other" },
];

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

export default function ExpensesScreen({ route }) {
  const { trip } = route.params;
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("fuel");
  const [summary, setSummary] = useState({ totalSpent: 0, balances: {}, settlements: [], expenses: [] });
  const [membersById, setMembersById] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(
    async ({ showSpinner } = {}) => {
      if (showSpinner) setLoading(true);
      try {
        const [splitRes, membersRes] = await Promise.all([
          expenseAPI.split(trip._id),
          tripAPI.members(trip._id),
        ]);

        setSummary(splitRes.data);

        const map = {};
        (membersRes.data.members || []).forEach((m) => {
          if (m.user?._id) map[m.user._id] = m.user.name;
        });
        setMembersById(map);
      } catch (err) {
        // non-fatal — keep whatever we already have on screen
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [trip._id]
  );

  useFocusEffect(
    useCallback(() => {
      loadData({ showSpinner: true });
    }, [loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddExpense = async () => {
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid expense amount.");
      return;
    }
    setBusy(true);
    try {
      await expenseAPI.add({ tripId: trip._id, amount: numericAmount, description, category });
      setAmount("");
      setDescription("");
      await loadData();
    } catch (err) {
      Alert.alert("Could not add expense", err?.response?.data?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const nameFor = (id) => {
    if (id === user?.id) return "You";
    return membersById[id] || "A trip member";
  };

  const myBalance = useMemo(() => {
    if (!user?.id) return 0;
    return summary.balances?.[user.id] || 0;
  }, [summary.balances, user?.id]);

  const balanceLabel =
    myBalance > 0.01
      ? { text: `You're owed ${formatCurrency(myBalance)}`, color: "#16A34A", bg: "#DCFCE7" }
      : myBalance < -0.01
      ? { text: `You owe ${formatCurrency(Math.abs(myBalance))}`, color: "#DC2626", bg: "#FEE2E2" }
      : { text: "You're all settled up", color: "#4F46E5", bg: "#EEF2FF" };

  const recentExpenses = [...(summary.expenses || [])].reverse().slice(0, 8);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.statusText}>Loading expenses...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4F46E5" />}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Trip Expenses</Text>
          <Text style={styles.heading} numberOfLines={1}>{trip.name}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { marginRight: 12 }]}>
            <Text style={styles.summaryLabel}>TOTAL SPENT</Text>
            <Text style={styles.summaryValue}>{formatCurrency(summary.totalSpent)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: balanceLabel.bg }]}>
            <Text style={[styles.summaryLabel, { color: balanceLabel.color }]}>YOUR STATUS</Text>
            <Text style={[styles.summaryValue, { color: balanceLabel.color, fontSize: 15 }]}>
              {balanceLabel.text}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add an expense</Text>

          <Text style={styles.label}>AMOUNT</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>DESCRIPTION</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Petrol at Hyderabad"
            placeholderTextColor="#94A3B8"
            value={description}
            onChangeText={setDescription}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>CATEGORY</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[styles.categoryChip, category === c.key && styles.categoryChipActive]}
                onPress={() => setCategory(c.key)}
              >
                <Text style={[styles.categoryText, category === c.key && styles.categoryTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.button} onPress={handleAddExpense} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Adding..." : "Add Expense"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settlement summary</Text>
          <Text style={styles.cardHint}>The fewest payments needed to even everything out</Text>

          {summary.settlements?.length ? (
            summary.settlements.map((item, idx) => (
              <View key={`${item.from}-${item.to}-${idx}`} style={styles.settlementRow}>
                <View style={styles.settlementDot} />
                <Text style={styles.settlementText}>
                  <Text style={styles.settlementName}>{nameFor(item.from)}</Text> owes{" "}
                  <Text style={styles.settlementName}>{nameFor(item.to)}</Text>
                </Text>
                <Text style={styles.settlementAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No settlements needed — everyone's even.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent expenses</Text>

          {recentExpenses.length ? (
            recentExpenses.map((expense) => (
              <View key={expense._id} style={styles.expenseRow}>
                <View style={styles.expenseIconBadge}>
                  <Text style={styles.expenseIconText}>{expense.category?.[0]?.toUpperCase() || "?"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseDescription} numberOfLines={1}>
                    {expense.description || expense.category}
                  </Text>
                  <Text style={styles.expensePaidBy}>
                    Paid by {expense.paidBy?._id === user?.id ? "you" : expense.paidBy?.name || "someone"}
                  </Text>
                </View>
                <Text style={styles.expenseAmount}>{formatCurrency(expense.amount)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No expenses logged yet — add the first one above.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7FE", paddingHorizontal: 24 },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F4F7FE",
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: { fontSize: 14, color: "#64748B", marginTop: 10 },

  header: { marginTop: 16, marginBottom: 20 },
  logo: { fontSize: 13, fontWeight: "700", color: "#4F46E5", letterSpacing: 1 },
  heading: { marginTop: 4, fontSize: 26, fontWeight: "900", color: "#1E293B" },

  summaryRow: { flexDirection: "row", marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#6366F1",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  summaryLabel: { fontSize: 11, fontWeight: "700", color: "#64748B", letterSpacing: 1 },
  summaryValue: { fontSize: 20, fontWeight: "900", color: "#1E293B", marginTop: 6 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 24,
    marginBottom: 20,
    shadowColor: "#6366F1",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#1E293B" },
  cardHint: { fontSize: 12.5, color: "#64748B", marginTop: 2, marginBottom: 16 },

  label: { color: "#475569", fontWeight: "700", fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  input: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 18,
    color: "#1E293B",
    fontSize: 16,
  },

  categoryRow: { flexDirection: "row", flexWrap: "wrap" },
  categoryChip: {
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipActive: { backgroundColor: "#4F46E5" },
  categoryText: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  categoryTextActive: { color: "#FFFFFF" },

  button: {
    marginTop: 22,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#4F46E5",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4F46E5",
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  settlementDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B", marginRight: 12 },
  settlementText: { flex: 1, color: "#475569", fontSize: 14 },
  settlementName: { fontWeight: "700", color: "#1E293B" },
  settlementAmount: { fontWeight: "800", color: "#1E293B", fontSize: 14 },

  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  expenseIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  expenseIconText: { color: "#4F46E5", fontWeight: "800", fontSize: 14 },
  expenseDescription: { color: "#1E293B", fontWeight: "700", fontSize: 14 },
  expensePaidBy: { color: "#64748B", fontSize: 12, marginTop: 2 },
  expenseAmount: { color: "#1E293B", fontWeight: "800", fontSize: 14 },

  emptyText: { color: "#94A3B8", fontStyle: "italic", fontSize: 13 },
});
