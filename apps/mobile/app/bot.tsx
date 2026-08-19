import { botHandle } from "@meshbot/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { type MobileBot, rpc } from "../lib/api";
import {
  duplicateRosterBot,
  fetchBotIdentity,
  listCatalogModels,
  loadHiddenBotIds,
  type MobileBotIdentity,
  type MobileCatalogModel,
  removeRosterBot,
  saveBotIdentity,
  setBotHidden,
} from "../lib/bot-mode";
import { MESHVAULT_SELL } from "../lib/sell";

export default function BotIdentity() {
  const router = useRouter();
  const { botId, name: nameParam } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const [bot, setBot] = useState<MobileBotIdentity | null>(null);
  const [name, setName] = useState(nameParam ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [models, setModels] = useState<MobileCatalogModel[]>([]);
  const [modelProvider, setModelProvider] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!botId) return;
    const next = await fetchBotIdentity(botId);
    setBot(next);
    setName(next.name);
    setTitle(next.title);
    setDescription(next.description ?? "");
    setInstructions(next.instructions ?? next.description ?? "");
    setModelProvider(next.modelProvider);
    setModelId(next.modelId);
    const hiddenIds = await loadHiddenBotIds();
    setHidden(hiddenIds.includes(next.id));
  }, [botId]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
    void listCatalogModels()
      .then(setModels)
      .catch(() => setModels([]));
  }, [load]);

  const draft = {
    name,
    title,
    description,
    instructions,
  };

  async function save() {
    if (!botId || pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await saveBotIdentity(botId, { ...draft, modelProvider, modelId });
      setBot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save identity");
    } finally {
      setPending(false);
    }
  }

  async function duplicate() {
    if (!bot || pending) return;
    setPending(true);
    setError(null);
    try {
      const roster = await rpc<MobileBot[]>("bots/list");
      const copy = await duplicateRosterBot({ ...bot, ...draft, modelProvider, modelId }, roster);
      router.replace({ pathname: "/bot", params: { botId: copy.id, name: copy.name } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate bot");
    } finally {
      setPending(false);
    }
  }

  async function toggleHidden() {
    if (!bot) return;
    const next = await setBotHidden(bot.id, await loadHiddenBotIds());
    setHidden(next.hidden);
  }

  function confirmDelete() {
    if (!bot) return;
    Alert.alert(
      `Delete ${bot.name}?`,
      "This permanently deletes the bot, including thread, computer, memory, and routines.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void removeRosterBot(bot.id)
              .then(() => router.replace("/"))
              .catch((err: Error) => setError(err.message)),
        },
      ],
    );
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
      <Stack.Screen options={{ title: bot?.name || nameParam || "Identity" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: "#050506" }}
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {!bot ? <ActivityIndicator color="#8E8E93" /> : null}
        <Text style={{ color: "#85858A", fontSize: 14 }}>Name</Text>
        <Field value={name} onChangeText={setName} placeholder="Name this bot" />
        {name.trim() ? (
          <Text style={{ color: "#6C6C70", marginTop: 8, fontSize: 13 }}>{botHandle(name)}</Text>
        ) : null}
        <Text style={{ color: "#85858A", marginTop: 16, fontSize: 14 }}>Title</Text>
        <Field value={title} onChangeText={setTitle} placeholder="What this bot is called" />
        <Text style={{ color: "#85858A", marginTop: 16, fontSize: 14 }}>Description</Text>
        <Field
          value={description}
          onChangeText={setDescription}
          placeholder="What this bot is for"
          multiline
        />
        <Text style={{ color: "#85858A", marginTop: 16, fontSize: 14 }}>Identity</Text>
        <Field
          value={instructions}
          onChangeText={setInstructions}
          placeholder="How this bot should speak and act"
          multiline
          tall
        />
        <Text style={{ color: "#85858A", marginTop: 16, fontSize: 14 }}>Model</Text>
        <Pressable
          onPress={() => {
            setModelProvider(null);
            setModelId(null);
          }}
          style={chipStyle(!modelProvider)}
        >
          <Text style={{ color: !modelProvider ? "#17171A" : "#ECECEE" }}>Workspace default</Text>
        </Pressable>
        {models.map((model) => {
          const selected = model.provider === modelProvider && model.id === modelId;
          return (
            <Pressable
              key={`${model.provider}:${model.id}`}
              onPress={() => {
                setModelProvider(model.provider);
                setModelId(model.id);
              }}
              style={chipStyle(selected)}
            >
              <Text style={{ color: selected ? "#17171A" : "#ECECEE" }}>
                {model.providerName ?? model.provider}: {model.label}
              </Text>
            </Pressable>
          );
        })}
        {error ? <Text style={{ color: "#E65707", marginTop: 16 }}>{error}</Text> : null}
        <Pressable onPress={() => void save()} disabled={pending} style={primaryStyle(pending)}>
          <Text style={{ color: "#17171A", fontSize: 16 }}>
            {pending ? "Saving…" : "Save identity"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/routines",
              params: { botId, name: name.trim() || bot?.name || "Bot" },
            })
          }
          style={linkStyle}
        >
          <Text style={{ color: "#ECECEE", fontSize: 16 }}>Routines</Text>
        </Pressable>
        <Pressable onPress={() => void duplicate()} disabled={pending} style={linkStyle}>
          <Text style={{ color: "#ECECEE", fontSize: 16 }}>Duplicate</Text>
        </Pressable>
        <Pressable onPress={() => void toggleHidden()} style={linkStyle}>
          <Text style={{ color: "#ECECEE", fontSize: 16 }}>
            {hidden ? "Unhide from roster" : "Hide from roster"}
          </Text>
        </Pressable>
        <Pressable onPress={confirmDelete} style={linkStyle}>
          <Text style={{ color: "#E65707", fontSize: 16 }}>Delete</Text>
        </Pressable>
        <Text style={{ color: "#6C6C70", marginTop: 28, fontSize: 13, lineHeight: 19 }}>
          {MESHVAULT_SELL}
        </Text>
      </ScrollView>
    </>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  tall = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  tall?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#6C6C70"
      multiline={multiline}
      style={{
        marginTop: 8,
        backgroundColor: "#1A1A1D",
        borderRadius: 11,
        padding: 16,
        color: "#ECECEE",
        minHeight: tall ? 140 : multiline ? 96 : undefined,
        textAlignVertical: multiline ? "top" : "center",
      }}
    />
  );
}

function chipStyle(selected: boolean) {
  return {
    marginTop: 8,
    borderRadius: 11,
    padding: 14,
    backgroundColor: selected ? "#F1F1EF" : "#1A1A1D",
  };
}

function primaryStyle(pending: boolean) {
  return {
    marginTop: 24,
    backgroundColor: "#F1F1EF",
    borderRadius: 11,
    padding: 16,
    alignItems: "center" as const,
    opacity: pending ? 0.4 : 1,
  };
}

const linkStyle = {
  marginTop: 16,
  paddingVertical: 8,
};
