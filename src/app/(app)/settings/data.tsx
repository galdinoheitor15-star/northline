import { useState } from 'react';
import { Platform, Share } from 'react-native';
import { Download, FlaskConical, Trash2, Upload } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { COLLECTIONS } from '@/data/collections';
import { LocalRepository } from '@/data/repository';
import { callFunction } from '@/lib/supabase';
import { useData } from '@/state/data';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

export default function DataPrivacy() {
  const mode = useSession((s) => s.mode);
  const [busy, setBusy] = useState<string | null>(null);

  const exportData = async () => {
    const s = useData.getState();
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), profile: s.profile, ...Object.fromEntries(COLLECTIONS.map((c) => [c, s[c]])) }, null, 2);
    if (Platform.OS === 'web') {
      const blob = new Blob([payload], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `northline-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } else {
      await Share.share({ message: payload, title: 'Exportação Northline' });
    }
  };

  // Leva os dados do modo local para a conta (útil depois de criar a conta).
  const importLocal = async () => {
    const local = new LocalRepository('local');
    if (!(await local.hasData())) return toast.show('Não há dados do modo local neste aparelho.');
    if (!(await confirm({ title: 'Importar dados locais?', message: 'Os dados criados no modo local serão enviados para a sua conta.', confirmLabel: 'Importar' }))) return;
    setBusy('import');
    try {
      const snap = await local.loadAll();
      // ordem respeita as dependências entre tabelas
      for (const c of ['accounts', 'recurring', 'taskLists', 'events', 'tasks', 'habits', 'habitLogs', 'routines', 'sessions', 'transactions', 'goals'] as const) {
        if (snap[c].length) await useData.getState().save(c, snap[c] as never[]);
      }
      toast.success('Dados importados.');
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (!(await confirm({ title: 'Excluir conta e dados?', message: 'Todos os seus dados (agenda, tarefas, hábitos, treinos, finanças, histórico do assistente e conexões) serão apagados permanentemente do servidor.', destructive: true, confirmLabel: 'Continuar' }))) return;
    if (!(await confirm({ title: 'Tem certeza?', message: 'Esta ação não pode ser desfeita.', destructive: true, confirmLabel: 'Excluir definitivamente' }))) return;
    setBusy('delete');
    try {
      await callFunction('delete-account', { confirm: 'EXCLUIR' });
      toast.show('Conta excluída.');
      await useSession.getState().signOut().catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const wipeLocal = async () => {
    if (!(await confirm({ title: 'Apagar dados deste aparelho?', message: 'Todos os dados do modo local serão apagados.', destructive: true, confirmLabel: 'Apagar' }))) return;
    await new LocalRepository('local').clear();
    await useSession.getState().signOut();
  };

  return (
    <Screen header={<Header title="Dados e privacidade" back />}>
      <Card>
        <Text variant="bodyMedium">Onde ficam seus dados</Text>
        <Text variant="small" tone="muted" style={{ marginTop: 4 }}>
          {mode === 'supabase'
            ? 'No Supabase (PostgreSQL), isolados por usuário com Row Level Security. Tokens de integração ficam cifrados e inacessíveis ao app. O histórico do assistente é mantido por 90 dias. Áudios de voz não são armazenados: são enviados para transcrição e descartados.'
            : mode === 'local'
              ? 'Somente neste aparelho (armazenamento local). Não há backup: se o app for desinstalado, os dados se perdem. Exporte regularmente ou crie uma conta.'
              : 'Você está vendo dados de DEMONSTRAÇÃO, fictícios e separados de qualquer dado real. Eles são descartados ao sair.'}
        </Text>
      </Card>
      <Button label="Exportar meus dados (JSON)" icon={Download} variant="secondary" onPress={exportData} />
      {mode === 'supabase' && <Button label="Importar dados do modo local" icon={Upload} variant="secondary" loading={busy === 'import'} onPress={importLocal} />}
      {mode === 'demo' && <Button label="Sair da demonstração" icon={FlaskConical} variant="secondary" onPress={() => useSession.getState().signOut()} />}
      {mode === 'local' && <Button label="Apagar dados deste aparelho" icon={Trash2} variant="danger" onPress={wipeLocal} />}
      {mode === 'supabase' && (
        <Card style={{ gap: space.sm }}>
          <Text variant="bodyMedium" tone="negative">
            Excluir conta
          </Text>
          <Text variant="small" tone="muted">
            Remove a conta e todos os dados associados do servidor, incluindo a conexão com o Google (os tokens são revogados).
          </Text>
          <Button label="Excluir minha conta" icon={Trash2} variant="danger" loading={busy === 'delete'} onPress={deleteAccount} />
        </Card>
      )}
    </Screen>
  );
}
