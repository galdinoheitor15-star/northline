import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { CalendarDays, RefreshCw, Unplug } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Badge, Card, Row } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { toTimeOfDay, toDateKey, formatShortDate } from '@/domain/time';
import { isSupabaseConfigured } from '@/lib/env';
import { connectGoogle, disconnectGoogle, listConflicts, resolveConflict, syncGoogle, type ConflictRow } from '@/services/google';
import { useData } from '@/state/data';
import { useIntegrations } from '@/state/integrations';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

export default function Connections() {
  const mode = useSession((s) => s.mode);
  const tz = useData((s) => s.profile.timezone);
  const { google, googleConnected, refresh } = useIntegrations();
  const [busy, setBusy] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const canUse = isSupabaseConfigured && mode === 'supabase';

  const loadConflicts = useCallback(async () => {
    if (canUse && googleConnected) setConflicts(await listConflicts().catch(() => []));
  }, [canUse, googleConnected]);

  useEffect(() => {
    if (canUse) void refresh().catch(() => {});
  }, [canUse, refresh]);
  useEffect(() => {
    let alive = true;
    if (canUse && googleConnected) listConflicts().then((c) => alive && setConflicts(c), () => {});
    return () => {
      alive = false;
    };
  }, [canUse, googleConnected]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fmt = (iso: string) => `${formatShortDate(toDateKey(new Date(iso), tz))} ${toTimeOfDay(new Date(iso), tz)}`;

  return (
    <Screen header={<Header title="Conexões" back />}>
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <CalendarDays size={20} color={colors.silver} />
          <View style={{ flex: 1, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyMedium">Google Agenda</Text>
              {google ? <Badge label={{ connected: 'Conectado', revoked: 'Acesso revogado', error: 'Erro' }[google.status]} tone={google.status === 'connected' ? 'positive' : 'warning'} /> : <Badge label="Desconectado" tone="outline" />}
            </Row>
            <Text variant="small" tone="muted">
              Importa e envia eventos da agenda principal, com sincronização incremental.
            </Text>
            {google?.accountEmail && <Text variant="small">Conta: {google.accountEmail}</Text>}
            {google?.lastSyncAt && (
              <Text variant="small" tone="muted">
                Última sincronização: {fmt(google.lastSyncAt)}
              </Text>
            )}
            {google?.lastError && (
              <Text variant="small" tone="negative">
                {google.lastError}
              </Text>
            )}
          </View>
        </Row>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          {!canUse ? (
            <Text variant="small" tone="warning">
              {isSupabaseConfigured ? 'Entre com uma conta para conectar o Google Agenda.' : 'Bloqueado: configure o Supabase e as credenciais do Google Cloud (veja docs/google-calendar.md).'}
            </Text>
          ) : googleConnected ? (
            <>
              <Button
                label="Sincronizar agora"
                icon={RefreshCw}
                loading={busy === 'sync'}
                onPress={() =>
                  run('sync', async () => {
                    const r = await syncGoogle();
                    toast.success(`Sincronizado: ${r.imported} importados, ${r.updated} atualizados, ${r.pushed} enviados${r.conflicts ? `, ${r.conflicts} conflito(s)` : ''}.`);
                    await loadConflicts();
                  })
                }
              />
              <Button
                label="Desconectar"
                icon={Unplug}
                variant="ghost"
                loading={busy === 'disconnect'}
                onPress={async () => {
                  if (await confirm({ title: 'Desconectar Google Agenda?', message: 'Os tokens são apagados do servidor. Eventos já importados continuam no Northline como eventos locais.', confirmLabel: 'Desconectar', destructive: true }))
                    await run('disconnect', disconnectGoogle);
                }}
              />
            </>
          ) : (
            <Button
              label={google?.status === 'revoked' ? 'Reconectar Google Agenda' : 'Conectar Google Agenda'}
              loading={busy === 'connect'}
              onPress={() =>
                run('connect', async () => {
                  const r = await connectGoogle();
                  if (r === 'connected') {
                    toast.success('Google Agenda conectado. Importando eventos…');
                    const s = await syncGoogle();
                    toast.success(`${s.imported} eventos importados.`);
                  } else if (r === 'error') toast.error('A autorização não foi concluída.');
                })
              }
            />
          )}
        </View>
      </Card>

      {conflicts.length > 0 && (
        <Card style={{ borderColor: colors.warning }}>
          <Text variant="bodyMedium">Conflitos de edição</Text>
          <Text variant="small" tone="muted" style={{ marginBottom: space.md }}>
            Estes eventos mudaram aqui e no Google desde a última sincronização. Nada foi sobrescrito: escolha qual versão manter.
          </Text>
          {conflicts.map((c) => (
            <View key={c.id} style={{ gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text variant="small">Northline: {c.local_snapshot.title} · {fmt(c.local_snapshot.startAt)}</Text>
              <Text variant="small">Google: {c.remote_snapshot.title} · {fmt(c.remote_snapshot.startAt)}</Text>
              <Row>
                <Button label="Manter Northline" size="sm" variant="secondary" onPress={() => run('r', async () => { await resolveConflict(c.id, 'keep_local'); await loadConflicts(); })} />
                <Button label="Manter Google" size="sm" variant="secondary" onPress={() => run('r', async () => { await resolveConflict(c.id, 'keep_remote'); await loadConflicts(); })} />
              </Row>
            </View>
          ))}
        </Card>
      )}

      <Text variant="small" tone="faint">
        Lembretes: eventos criados no Northline usam os lembretes do Northline (notificação no aparelho). Eventos importados do Google mantêm os lembretes configurados no Google; o Northline não envia um segundo aviso para eles, a menos que você defina um lembrete aqui.
      </Text>
    </Screen>
  );
}
