import {
  CommerceError,
  foundingInstallMailto,
  MESHVAULT_CONTACT_EMAIL,
  SKILL_PACK_PRICE_USD,
  startSkillPackCheckout,
  submitFoundingInstallLead,
} from "@meshbot/contracts";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { native } from "../lib/native";
import { MESHVAULT_SELL } from "../lib/sell";

function openUrl(url: string) {
  void Linking.openURL(url);
}

export default function Commerce() {
  const insets = useSafeAreaInsets();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [leadPending, setLeadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  async function buyPack() {
    setError(null);
    setCheckoutPending(true);
    try {
      await startSkillPackCheckout(openUrl, fetch);
    } catch (err) {
      setError(
        err instanceof CommerceError
          ? err.message
          : "Could not start checkout. No charge was attempted.",
      );
    } finally {
      setCheckoutPending(false);
    }
  }

  async function submitLead() {
    setError(null);
    setLeadStatus(null);
    setLeadPending(true);
    try {
      const result = await submitFoundingInstallLead({ name, email, company, notes }, fetch);
      if (result.status === "submitted") {
        setLeadStatus(`Sent to ${result.inbox}. Someone will reply.`);
        return;
      }
      setLeadStatus(result.message);
      openUrl(foundingInstallMailto({ name, email, company, notes }));
    } catch (err) {
      setError(err instanceof CommerceError ? err.message : "Could not submit the lead.");
    } finally {
      setLeadPending(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sell}>{MESHVAULT_SELL}</Text>
      <Text style={styles.lede}>
        The application stays Apache-2.0 and self-hosted. These are optional. Native Mac and iPhone
        clients are in development and are not released.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Agent Skills Starter Pack · ${SKILL_PACK_PRICE_USD}</Text>
        <Text style={styles.cardCopy}>
          One-time Markdown skills and runbooks. Checkout opens Stripe; you complete payment
          yourself.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={checkoutPending}
          onPress={() => void buyPack()}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          {checkoutPending ? (
            <ActivityIndicator color="#17171A" />
          ) : (
            <Text style={styles.primaryLabel}>Buy the ${SKILL_PACK_PRICE_USD} pack</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Founding install</Text>
        <Text style={styles.cardCopy}>
          Managed install on hardware you own. If the form cannot send, it falls back to{" "}
          {MESHVAULT_CONTACT_EMAIL}.
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor="#6C6C70"
          autoComplete="name"
          style={styles.field}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6C6C70"
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.field}
        />
        <TextInput
          value={company}
          onChangeText={setCompany}
          placeholder="Company"
          placeholderTextColor="#6C6C70"
          autoComplete="organization"
          style={styles.field}
        />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          placeholderTextColor="#6C6C70"
          multiline
          style={[styles.field, styles.notes]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={leadPending}
          onPress={() => void submitLead()}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          {leadPending ? (
            <ActivityIndicator color="#ECECEE" />
          ) : (
            <Text style={styles.secondaryLabel}>Request a founding install</Text>
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {leadStatus ? <Text style={styles.status}>{leadStatus}</Text> : null}
      <Text style={styles.footer}>{MESHVAULT_SELL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: native.page,
    paddingHorizontal: 20,
  },
  sell: {
    color: native.label,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 12,
  },
  lede: {
    color: native.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 0,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: "#26262A",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#141416",
    gap: 10,
  },
  cardTitle: {
    color: native.label,
    fontSize: 17,
    fontWeight: "600",
  },
  cardCopy: {
    color: native.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    borderWidth: 1,
    borderColor: "#26262A",
    borderRadius: 11,
    color: native.label,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notes: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  primary: {
    backgroundColor: "#F1F1EF",
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#17171A",
    fontSize: 16,
    fontWeight: "600",
  },
  secondary: {
    borderWidth: 1,
    borderColor: "#26262A",
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryLabel: {
    color: native.label,
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    color: "#E65707",
    fontSize: 14,
    marginBottom: 8,
  },
  status: {
    color: native.secondaryLabel,
    fontSize: 14,
  },
  footer: {
    color: native.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
});
