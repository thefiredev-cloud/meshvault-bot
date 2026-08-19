import { ROUTINE_PRESETS, routinePresetCron } from "@meshbot/contracts";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  createBotRoutine,
  listBotRoutines,
  type MobileRoutine,
  removeBotRoutine,
  testBotRoutine,
  updateBotRoutine,
} from "../lib/bot-mode";
import { MESHVAULT_SELL } from "../lib/sell";

export default function BotRoutines() {
  const { botId, name } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const [routines, setRoutines] = useState<MobileRoutine[]>([]);
  const [draftName, setDraftName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<(typeof ROUTINE_PRESETS)[number]["id"]>("daily");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!botId) return;
    setRoutines(await listBotRoutines(botId));
    setReady(true);
  }, [botId]);

  useEffect(() => {
    void load().catch((err: Error) => {
      setError(err.message);
      setReady(true);
    });
  }, [load]);

  async function create() {
    if (!botId || pending) return;
    setPending(true);
    setError(null);
    try {
      await createBotRoutine({
        botId,
        name: draftName,
        prompt,
        cron: routinePresetCron(preset),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setDraftName("");
      setPrompt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create routine");
    } finally {
      setPending(false);
    }
  }

  async function toggle(routine: MobileRoutine) {
    if (!botId) return;
    setError(null);
    try {
      await updateBotRoutine(botId, routine, { active: !routine.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update routine");
    }
  }

  async function runNow(routine: MobileRoutine) {
    if (!botId) return;
    setError(null);
    try {
      await testBotRoutine(botId, routine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run routine");
    }
  }

  async function remove(routine: MobileRoutine) {
    if (!botId) return;
    setError(null);
    try {
      await removeBotRoutine(botId, routine);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete routine");
    }
  }

  if (!botId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050506", padding: 24 }}>
        <Text style={{ color: "#85858A" }}>Missing bot.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name} routines` : "Routines" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: "#050506" }}
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {!ready ? <ActivityIndicator color="#8E8E93" /> : null}
        <Text style={{ color: "#85858A", fontSize: 14 }}>Name</Text>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Morning check-in"
          placeholderTextColor="#6C6C70"
          style={fieldStyle}
        />
        <Text style={{ color: "#85858A", marginTop: 16, fontSize: 14 }}>Prompt</Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What this bot should do on the schedule"
          placeholderTextColor="#6C6C70"
          multiline
          style={{ ...fieldStyle, minHeight: 96, textAlignVertical: "top" }}
        />
        <Text style={{ color: "#85858A", marginTop: 16, fontSize: 14 }}>Schedule</Text>
        {ROUTINE_PRESETS.map((option) => {
          const selected = option.id === preset;
          return (
            <Pressable
              key={option.id}
              onPress={() => setPreset(option.id)}
              style={{
                marginTop: 8,
                borderRadius: 11,
                padding: 14,
                backgroundColor: selected ? "#F1F1EF" : "#1A1A1D",
              }}
            >
              <Text style={{ color: selected ? "#17171A" : "#ECECEE" }}>{option.label}</Text>
            </Pressable>
          );
        })}
        {error ? <Text style={{ color: "#E65707", marginTop: 16 }}>{error}</Text> : null}
        <Pressable
          onPress={() => void create()}
          disabled={!draftName.trim() || !prompt.trim() || pending}
          style={{
            marginTop: 24,
            backgroundColor: "#F1F1EF",
            borderRadius: 11,
            padding: 16,
            alignItems: "center",
            opacity: !draftName.trim() || !prompt.trim() || pending ? 0.4 : 1,
          }}
        >
          <Text style={{ color: "#17171A", fontSize: 16 }}>
            {pending ? "Creating…" : "Add routine"}
          </Text>
        </Pressable>
        {routines.map((routine) => (
          <View
            key={routine.id}
            style={{
              marginTop: 20,
              borderWidth: 1,
              borderColor: "#26262A",
              borderRadius: 16,
              padding: 16,
              gap: 8,
            }}
          >
            <Text style={{ color: "#ECECEE", fontSize: 16, fontWeight: "600" }}>
              {routine.name}
            </Text>
            <Text style={{ color: "#85858A", fontSize: 13 }}>
              {ROUTINE_PRESETS.find((option) => option.cron === routine.cron)?.label ??
                routine.cron}
            </Text>
            <Text style={{ color: "#A8A8AD", fontSize: 14, lineHeight: 20 }}>{routine.prompt}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
              <Pressable onPress={() => void toggle(routine)}>
                <Text style={{ color: "#ECECEE" }}>{routine.active ? "Pause" : "Activate"}</Text>
              </Pressable>
              <Pressable onPress={() => void runNow(routine)}>
                <Text style={{ color: "#ECECEE" }}>Run now</Text>
              </Pressable>
              <Pressable onPress={() => void remove(routine)}>
                <Text style={{ color: "#E65707" }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Text style={{ color: "#6C6C70", marginTop: 28, fontSize: 13, lineHeight: 19 }}>
          {MESHVAULT_SELL}
        </Text>
      </ScrollView>
    </>
  );
}

const fieldStyle = {
  marginTop: 8,
  backgroundColor: "#1A1A1D",
  borderRadius: 11,
  padding: 16,
  color: "#ECECEE",
};
