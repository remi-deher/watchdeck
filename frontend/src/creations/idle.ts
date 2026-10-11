/* Definition vide : ce qu'une fenetre fermee recoit tant que rien n'est a creer. */
import type { CreateDefinition } from '@/components/templates/create/types';

export const idleCreation: CreateDefinition = { noun: '', another: '', initial: () => ({}), steps: [], submit: async () => ({ message: '' }) };
