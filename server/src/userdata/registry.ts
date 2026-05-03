import type { UserDataNamespace } from './types.js';

const namespaces = new Map<string, UserDataNamespace>();

export function registerNamespace(ns: UserDataNamespace): void {
  if (namespaces.has(ns.id)) throw new Error(`Namespace "${ns.id}" already registered`);
  namespaces.set(ns.id, ns);
}

export function listNamespaces(): UserDataNamespace[] {
  return Array.from(namespaces.values());
}
