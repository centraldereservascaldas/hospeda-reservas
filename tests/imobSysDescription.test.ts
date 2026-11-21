import assert from 'node:assert/strict';
import test from 'node:test';
import { organizeImobSysDescription } from '../src/utils/imobSysDescription';

test('organizes explicit supplier tags without inventing amenities or discarding unknown information', () => {
  assert.deepEqual(
    organizeImobSysDescription(
      '01 quarto, sala e cozinha Entrada 14h | Saida 10h #fogao #geladeira #piscina #tela #Rua/Externa #geladeira',
    ),
    {
      description: '01 quarto, sala e cozinha Entrada 14h | Saida 10h #tela #Rua/Externa',
      amenities: ['Fogão', 'Geladeira', 'Piscina'],
    },
  );
  assert.deepEqual(organizeImobSysDescription(''), { description: '', amenities: [] });
  assert.deepEqual(organizeImobSysDescription('Sem #piscina'), {
    description: 'Sem #piscina',
    amenities: [],
  });
});
