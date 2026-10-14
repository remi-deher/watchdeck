import { describe, expect, it } from 'vitest';
import { assignedLocationIds, connectionBody, connectionValuesFromRow, freshConnectionValues, keyAvailable, passwordAvailable } from './storageConnection';
import { accessFields, accessValues, bindingsOf, freshLocationValues, locationValuesFromRow, rootKeyOf } from './storageLocation';
import { freshTransferValues, gbLabel, needsApproval, transferForm, transferRoutes, transferValuesFromJob } from './storageTransfer';

const connections = [{ id: 1, name: 'Seedbox', method: 'ssh' }, { id: 2, name: 'Local', method: 'local' }];
const accesses = [{ connection_id: 1, roots: [{ arr_instance_id: 3, arr_root: '/data1/tv', path: '/mnt/tv' }] }];

describe('transfert · valeurs', () => {
  it('reprend une tâche : trajet, objectifs par source et méthodes', () => {
    const values = transferValuesFromJob({ params: { arr_instance_id: 3, source_roots: ['/a'], destination_root: '/b', root_goals: { '/a': 40 }, goal_gb: 20, transfer_mode: 'rsync_ssh', access_id: 1 } });
    expect(values.instances).toEqual(['3']);
    expect(values['src:3']).toEqual(['/a']);
    expect(values['dst:3']).toBe('/b');
    expect(values['goal:3:/a']).toBe(40);
    expect(values.per_source_goal).toBe(true);
    expect(values.access_ids.rsync_ssh).toBe(1);
  });
  it('décrit un trajet par instance, avec un objectif par source si demandé', () => {
    const values = { ...freshTransferValues(), instances: ['3'], 'src:3': ['/a', '/c'], 'dst:3': '/b', per_source_goal: true, goal_gb: 10, 'goal:3:/a': 25 };
    expect(transferRoutes(values)).toEqual([{ arr_instance_id: 3, source_roots: ['/a', '/c'], destination_root: '/b', root_goals: { '/a': 25, '/c': 10 } }]);
    expect(transferForm(values).routes).toHaveLength(1);
  });
  it('n’envoie un nombre de titres que pour une répartition au nombre', () => {
    expect(transferForm({ ...freshTransferValues(), distribution: 'auto', target_titles: 5 }).target_titles).toBeNull();
    expect(transferForm({ ...freshTransferValues(), distribution: 'count', target_titles: 5 }).target_titles).toBe(5);
  });
  it('exige un accord quand la sélection ne remplit pas l’objectif', () => {
    const plan = { mode: 'release_space', requested_bytes: 100, requested_titles: 0, groups: [{ items: [{ key: 'a', size_bytes: 60 }, { key: 'b', size_bytes: 60 }] }] };
    expect(needsApproval(plan, ['a'])).toBe(true);
    expect(needsApproval(plan, ['a', 'b'])).toBe(false);
    expect(needsApproval({ ...plan, mode: 'selection' }, ['a'])).toBe(false);
  });
  it('formate un volume décimal', () => {
    expect(gbLabel(null)).toBe('—');
    expect(gbLabel(1.5e9)).toContain('1,5');
  });
});

describe('connexion · valeurs', () => {
  it('reprend les chemins et les stockages complets', () => {
    const locations = [{ id: 9, mappings: [{ arr_instance_id: 3, arr_root: '/data1/tv' }] }, { id: 10, mappings: [{ arr_instance_id: 3, arr_root: '/other' }] }];
    const values = connectionValuesFromRow({ id: 1, name: 'Seedbox', method: 'ssh', connection: { host: 'h', port: 2200 }, has_private_key: true }, accesses, locations);
    expect(values.port).toBe(2200);
    expect(values['path:3:/data1/tv']).toBe('/mnt/tv');
    expect(values.locations).toEqual(['9']);
    expect(assignedLocationIds(freshConnectionValues(), locations)).toEqual([]);
  });
  it('garde un secret enregistré tant qu’on ne le supprime pas', () => {
    expect(keyAvailable({ has_private_key: true, clear_private_key: false })).toBe(true);
    expect(keyAvailable({ has_private_key: true, clear_private_key: true })).toBe(false);
    expect(passwordAvailable({ password: 'x' })).toBe(true);
    expect(passwordAvailable({})).toBe(false);
  });
  it('construit le corps attendu par le serveur', () => {
    const body = connectionBody({ ...freshConnectionValues(), name: 'A', host: 'h', port: '22' }, 4);
    expect(body).toMatchObject({ id: 4, name: 'A', method: 'ssh', connection: { host: 'h', port: 22 } });
  });
});

describe('stockage · valeurs', () => {
  it('lit les accès d’un dossier et les renvoie au format du serveur', () => {
    const values = accessValues(accesses, connections, 3, '/data1/tv');
    const key = rootKeyOf(3, '/data1/tv');
    expect(values[`ssh:${key}`]).toBe('1');
    expect(bindingsOf(values, key)).toEqual([{ connection_id: 1, path: '/mnt/tv' }]);
  });
  it('ne propose une méthode que si une connexion existe', () => {
    const fields = accessFields({ connections: () => [connections[0]], browse: async () => null }, '3:/x', 'ce dossier');
    expect(fields.find((f) => f.key === 'ssh:3:/x').when({})).toBe(true);
    expect(fields.find((f) => f.key === 'local:3:/x').when({})).toBe(false);
  });
  it('reprend une réserve en pourcentage ou en Go', () => {
    expect(locationValuesFromRow({ name: 'A', reserve_percent: 5, reserve_bytes: 0, mappings: [] }, [], [])).toMatchObject({ reserve_on: true, reserve_unit: 'percent', reserve_value: 5 });
    expect(locationValuesFromRow({ name: 'A', reserve_bytes: 20e9, mappings: [] }, [], [])).toMatchObject({ reserve_unit: 'go', reserve_value: 20 });
    expect(freshLocationValues().reserve_on).toBe(false);
  });
});
