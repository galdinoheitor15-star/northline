import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Info, Mic, Square, Trash2, X } from 'lucide-react-native';
import { SUGGESTIONS } from '@/components/AssistantCard';
import { ModeBanner } from '@/components/ModeBanner';
import { ProposalCard } from '@/components/ProposalCard';
import { IconButton } from '@/components/ui/Button';
import { confirm } from '@/components/ui/Overlay';
import { Header } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { aiAvailable } from '@/services/assistant';
import { useVoiceInput, voiceAvailability } from '@/services/voice';
import { useAssistant } from '@/state/assistant';
import { colors, font, layout, radius, space } from '@/theme/tokens';

export default function Assistant() {
  const params = useLocalSearchParams<{ q?: string; voice?: string }>();
  const insets = useSafeAreaInsets();
  const { messages, busy, pending, load, send, confirm: confirmProposal, dismiss, updateProposal, clear } = useAssistant();
  const [text, setText] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const handled = useRef(false);
  const voice = useVoiceInput((t) => void send(t));
  const ai = aiAvailable();

  useEffect(() => {
    void load().then(() => {
      if (handled.current) return;
      handled.current = true;
      if (params.q) void send(params.q);
      else if (params.voice === '1') void voice.start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length, busy]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    void send(t);
  };

  const inner = { width: '100%' as const, maxWidth: layout.maxWidth, alignSelf: 'center' as const, paddingHorizontal: layout.gutter };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <ModeBanner />
        <View style={inner}>
          <Header
            title="Assistente"
            subtitle={ai ? 'IA · confirma antes de salvar' : 'Interpretação local · confirma antes de salvar'}
            back
            right={
              messages.length > 0 ? (
                <IconButton
                  icon={Trash2}
                  label="Apagar conversa"
                  onPress={async () => {
                    if (await confirm({ title: 'Apagar histórico?', message: 'As mensagens desta conversa serão excluídas.', destructive: true, confirmLabel: 'Apagar' })) await clear();
                  }}
                />
              ) : undefined
            }
          />
        </View>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={[inner, { paddingVertical: space.lg, gap: space.md }]} keyboardShouldPersistTaps="handled">
        {messages.length === 0 && !busy && (
          <View style={{ gap: space.md, paddingTop: space.lg }}>
            <Text variant="title">Como posso ajudar?</Text>
            <Text tone="muted">Peça para marcar compromissos, criar tarefas, registrar gastos, hábitos ou treinos. Toda ação aparece como sugestão e só é salva quando você confirmar.</Text>
            {!ai && (
              <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: colors.surface2, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                <Info size={16} color={colors.textMuted} />
                <Text variant="small" tone="muted" style={{ flex: 1 }}>
                  Sem conta conectada, o assistente usa um interpretador local (regras para português) em vez de IA. Comandos comuns funcionam; perguntas abertas, não.
                </Text>
              </View>
            )}
            <View style={{ gap: space.sm }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => void send(s)} style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surface3 : colors.surface })}>
                  <Text variant="small">“{s}”</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.surface3, borderRadius: radius.lg, borderBottomRightRadius: 6, paddingVertical: space.sm + 2, paddingHorizontal: space.md }}>
              <Text>{m.content}</Text>
            </View>
          ) : (
            <View key={m.id} style={{ alignSelf: 'stretch', gap: space.sm }}>
              {m.notice && (
                <Text variant="small" tone="warning">
                  {m.notice}
                </Text>
              )}
              <Text>{m.content}</Text>
              {m.proposals?.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  status={m.status?.[p.id] ?? { state: 'suggested' }}
                  onChange={(np) => updateProposal(m.id, np)}
                  onDismiss={() => dismiss(m.id, p.id)}
                  onConfirm={async () => {
                    const r = await confirmProposal(m.id, p.id);
                    if (r?.ok && r.navigate) router.push(r.navigate as never);
                  }}
                />
              ))}
              <Text variant="small" tone="faint" style={{ fontSize: 11 }}>
                {m.engine === 'ai' ? 'IA' : 'Interpretação local'}
              </Text>
            </View>
          ),
        )}
        {busy && (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.silver} />
            <Text variant="small" tone="muted">
              Pensando…
            </Text>
          </View>
        )}
        {pending && !busy && (
          <Text variant="small" tone="faint">
            Aguardando sua resposta para completar o pedido. Diga “cancela” para desistir.
          </Text>
        )}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom + space.sm, paddingTop: space.sm, backgroundColor: colors.bg }}>
        <View style={inner}>
          {voice.state === 'recording' || voice.state === 'requesting' || voice.state === 'transcribing' ? (
            <View accessibilityLiveRegion="assertive" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, height: 52, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: voice.state === 'recording' ? colors.negative : colors.border }}>
              {voice.state === 'recording' ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.negative }} /> : <ActivityIndicator size="small" color={colors.silver} />}
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {voice.state === 'recording' ? `Gravando… ${voice.seconds}s` : voice.state === 'requesting' ? 'Pedindo permissão do microfone…' : 'Transcrevendo…'}
              </Text>
              {voice.state === 'recording' && (
                <>
                  <IconButton icon={X} label="Cancelar gravação" onPress={() => void voice.cancel()} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Parar e enviar" onPress={() => void voice.stop()} style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.silver, alignItems: 'center', justifyContent: 'center' }}>
                    <Square size={14} color={colors.onSilver} fill={colors.onSilver} />
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={{ gap: space.xs }}>
              {voice.state === 'error' && voice.error && (
                <Text variant="small" tone="negative" onPress={voice.reset}>
                  {voice.error}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingLeft: space.lg, paddingRight: 4, minHeight: 48 }}>
                  <TextInput
                    accessibilityLabel="Mensagem para o assistente"
                    value={text}
                    onChangeText={setText}
                    onSubmitEditing={submit}
                    placeholder={pending ? 'Responda aqui…' : 'Escreva um pedido…'}
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="send"
                    maxLength={2000}
                    editable={!busy}
                    style={[{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15, paddingVertical: 12 }, { outlineStyle: 'none' } as object]}
                  />
                  {text.trim().length > 0 && (
                    <Pressable accessibilityRole="button" accessibilityLabel="Enviar" onPress={submit} disabled={busy} style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.silver, alignItems: 'center', justifyContent: 'center' }}>
                      <ArrowUp size={18} color={colors.onSilver} />
                    </Pressable>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={voiceAvailability().ok ? 'Gravar comando de voz' : 'Voz indisponível'}
                  onPress={() => void voice.start()}
                  disabled={busy}
                  style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: pressed ? colors.silverDim : colors.silver, alignItems: 'center', justifyContent: 'center', opacity: voiceAvailability().ok ? 1 : 0.5 })}
                >
                  <Mic size={20} color={colors.onSilver} />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
