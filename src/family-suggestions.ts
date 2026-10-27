import { addParent, addSibling, validateState, type State } from './domain.ts';

export type Suggestion = { id: string; personId: string; type: 'parent' | 'sibling'; name: string; direction: 'older' | 'younger' | ''; reason: string };
export type Choice = { value: string; direction?: 'older' | 'younger' | '' };
export function suggestionsFor(s: State, parentId: string, childId: string): Suggestion[] {
  const live = new Map(s.persons.filter(p => !p.deletedAt).map(p => [p.id, p]));
  const partners = new Set(s.unions.filter(u => u.members.includes(parentId) && !u.end && u.status !== 'divorced' && u.status !== 'separated').flatMap(u => u.members).filter(id => id !== parentId && id !== childId && live.has(id)));
  const parents = new Set([parentId, ...partners, ...s.parents.filter(l => l.childId === childId).map(l => l.parentId)]);
  const result: Suggestion[] = [];
  for (const id of partners) {
    if (!s.parents.some(l => l.parentId === id && l.childId === childId)) result.push({ id: 'parent:'+id, personId: id, type: 'parent', name: live.get(id)!.name, direction: '', reason: 'Pasangan orang tua; jenis hubungan belum ditentukan.' });
  }
  const siblings = new Set(s.parents.filter(l => parents.has(l.parentId)).map(l => l.childId));
  for (const id of siblings) {
    const p = live.get(id), child = live.get(childId);
    if (!p || !child || id === childId || parents.has(id) || (s.siblings ?? []).some(l => [l.olderId,l.youngerId].includes(id) && [l.olderId,l.youngerId].includes(childId))) continue;
    // Only exact, non-approximate dates establish an order automatically.
    const exact = /^\d{4}-\d{2}-\d{2}$/.test(p.birth) && /^\d{4}-\d{2}-\d{2}$/.test(child.birth) && !p.birthApprox && !child.birthApprox;
    const direction = exact && child.birth !== p.birth ? (child.birth < p.birth ? 'older' : 'younger') : '';
    result.push({ id:'sibling:'+id, personId:id, type:'sibling', name:p.name, direction, reason: direction ? 'Urutan disarankan dari tanggal lahir; silakan periksa.' : 'Tanggal lahir belum menentukan urutan; pilih kakak atau adik.' });
  }
  return result;
}

export function applySuggestions(s: State, childId: string, suggestions: Suggestion[], choices: Record<string, Choice>): State {
  let next = s;
  // Parent choices must be applied first so sibling consistency uses the final parents.
  for (const item of suggestions.filter(v => v.type === 'parent')) {
    const value = choices[item.id]?.value;
    if (!value || value === 'skip') continue;
    if (!['biological','step','adoptive'].includes(value)) throw Error('Pilihan hubungan anak tidak valid.');
    if (next.parents.some(l => l.parentId === item.personId && l.childId === childId)) throw Error('Hubungan orang tua sudah tercatat.');
    if (value === 'biological' && next.parents.filter(l => l.childId === childId && l.kind === 'biological').length >= 2) throw Error('Anak sudah memiliki dua orang tua kandung. Periksa hubungan sebelumnya.');
    next = addParent(next, item.personId, childId, value as 'biological' | 'step' | 'adoptive');
  }
  for (const item of suggestions.filter(v => v.type === 'sibling')) {
    const choice = choices[item.id];
    if (!choice || choice.value === 'skip') continue;
    if (!choice.direction) throw Error('Pilih kakak atau adik untuk hubungan dengan '+item.name+'.');
    if (!['kandung','tiri','seayah','seibu'].includes(choice.value)) throw Error('Pilihan saudara tidak valid.');
    const mine = new Set(next.parents.filter(l => l.childId === childId && l.kind === 'biological').map(l => l.parentId));
    const theirs = new Set(next.parents.filter(l => l.childId === item.personId && l.kind === 'biological').map(l => l.parentId));
    const common = [...mine].filter(id => theirs.has(id));
    if (choice.value === 'tiri' && common.length) throw Error('Saudara yang berbagi orang tua kandung bukan saudara tiri. Pilih kandung atau seayah/seibu.');
    if (choice.value === 'kandung' && mine.size >= 2 && theirs.size >= 2 && common.length < 2) throw Error('Data orang tua kandung berbeda. Periksa pilihan saudara kandung.');
    if (['seayah','seibu'].includes(choice.value) && mine.size >= 2 && theirs.size >= 2 && common.length !== 1) throw Error('Data orang tua tidak sesuai dengan saudara seayah/seibu.');
    next = addSibling(next, choice.direction === 'older' ? childId : item.personId, choice.direction === 'older' ? item.personId : childId, 'Saudara '+choice.value);
  }
  validateState(next);
  return next;
}
