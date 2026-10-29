import { randomUUID } from 'expo-crypto';

/** IDs gerados no cliente (UUID v4) para permitir criação offline e o mesmo id no banco. */
export const newId = (): string => randomUUID();

export const nowIso = (): string => new Date().toISOString();
