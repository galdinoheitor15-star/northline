import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUp, Mic, Sparkles } from 'lucide-react-native';
import { colors, font, radius, space } from '@/theme/tokens';
import { Text } from './ui/Text';

export const SUGGESTIONS = ['Marca uma reunião amanhã às 15h', 'Adiciona estudar matemática às 19h', 'Registra meu treino de hoje', 'Anota que gastei 35 reais', 'Quais são minhas tarefas de hoje?'];

const open = (params: Record<string, string>) => router.push({ pathname: '/assistant', params } as never);

export function AssistantCard() {
  const [text, setText] = useState('');
  const submit = () => {
    const q = text.trim();
    if (!q) return open({});
    setText('');
    open({ q });
  };
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: space.lg, gap: space.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir assistente" onPress={() => open({})} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Sparkles size={16} color={colors.silver} />
        <Text variant="heading">O que você deseja fazer?</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingLeft: space.lg, paddingRight: 4, height: 46 }}>
          <TextInput
            accessibilityLabel="Pedido para o assistente"
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            placeholder="Digite um pedido…"
            placeholderTextColor={colors.textFaint}
            returnKeyType="send"
            style={[{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15 }, { outlineStyle: 'none' } as object]}
          />
          {text.trim().length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Enviar" onPress={submit} style={{ width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.silver, alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUp size={18} color={colors.onSilver} />
            </Pressable>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Falar com o assistente" onPress={() => open({ voice: '1' })} style={({ pressed }) => ({ width: 46, height: 46, borderRadius: radius.pill, backgroundColor: pressed ? colors.silverDim : colors.silver, alignItems: 'center', justifyContent: 'center' })}>
          <Mic size={20} color={colors.onSilver} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} accessibilityRole="button" onPress={() => open({ q: s })} style={({ pressed }) => ({ paddingHorizontal: space.md, height: 32, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surface3 : colors.surface2 })}>
            <Text variant="small" tone="muted">
              “{s}”
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
