import { useState } from 'react';
import { type State } from './domain';
import { applySuggestions, type Choice, type Suggestion } from './family-suggestions';

export default function FamilySuggestions({ state, childId, items, commit, close }: { state: State; childId: string; items: Suggestion[]; commit: (s:State)=>Promise<void>; close:()=>void }) {
  const [choices,setChoices] = useState<Record<string,Choice>>({});
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const child = state.persons.find(p=>p.id===childId)!;
  async function save() {
    setBusy(true); setError('');
    try { await commit(applySuggestions(state,childId,items,choices)); close(); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="family-suggestions" aria-label="Saran hubungan keluarga">
    <h3>Lengkapi hubungan {child.name}</h3>
    <p>Hubungan utama belum disimpan. Pilih hubungan tambahan yang sudah diketahui. Pilihan awal semua saran adalah Lewati; tanggal lahir hanya membantu urutan.</p>
    <p className="muted">Kandung: ayah dan ibu sama. Seayah/seibu: satu orang tua kandung sama. Tiri: tidak berbagi orang tua kandung. Pilihan saudara tidak otomatis menyalin orang tua.</p>
    {items.map(item=>{
      const choice = choices[item.id] ?? {value:'skip',direction:item.direction};
      const update = (patch:Partial<Choice>) => setChoices(old=>({...old,[item.id]:{...choice,...patch}}));
      return <fieldset key={item.id} disabled={busy}>
        <legend>{child.name} terhadap {item.name}</legend>
        <p className="muted">{item.reason}</p>
        <label>Jenis hubungan<select value={choice.value} onChange={e=>update({value:e.target.value})}>
          <option value="skip">Lewati / belum diketahui</option>
          {item.type==='parent' ? <><option value="biological">Anak kandung</option><option value="step">Anak tiri</option><option value="adoptive">Anak angkat</option></> : <><option value="kandung">Saudara kandung</option><option value="tiri">Saudara tiri</option><option value="seayah">Saudara seayah</option><option value="seibu">Saudara seibu</option></>}
        </select></label>
        {item.type==='sibling' && choice.value!=='skip' && <label>Urutan {child.name}<select value={choice.direction ?? ''} onChange={e=>update({direction:e.target.value as Choice['direction']})}><option value="">Pilih urutan</option><option value="older">Kakak dari {item.name}</option><option value="younger">Adik dari {item.name}</option></select></label>}
      </fieldset>;
    })}
    {error && <p role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>Kembali ke formulir</button><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan hubungan yang dipilih'}</button></div>
  </section>;
}
