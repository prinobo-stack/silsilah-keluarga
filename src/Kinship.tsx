import {useMemo,useState} from 'react';
import type {State} from './domain';
import {findKinship} from './kinship';
export default function Kinship({state,openPerson}:{state:State;openPerson:(id:string)=>void}){
 const people=useMemo(()=>state.persons.filter(p=>!p.deletedAt).sort((a,b)=>a.name.localeCompare(b.name,'id')),[state]);
 const byId=useMemo(()=>new Map(people.map(p=>[p.id,p])),[people]);
 const [first,setFirst]=useState(''),[second,setSecond]=useState(''),[result,setResult]=useState<{first:string;second:string}|null>(null);
 const found=useMemo(()=>result?findKinship(state,result.first,result.second):null,[state,result]);
 return <section className="card"><h2>Cari hubungan keluarga</h2><p>Pilih dua anggota. Hasil menjelaskan hubungan anggota kedua terhadap anggota pertama.</p>
 <form onSubmit={e=>{e.preventDefault();setResult({first,second});}}>
 <div className="form-grid">{([[first,setFirst,'Anggota pertama'],[second,setSecond,'Anggota kedua']] as const).map(([value,setter,label])=><label key={label}>{label}<select required value={value} onChange={e=>{setter(e.target.value);setResult(null);}}><option value="">Pilih anggota…</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}{p.birth?' · '+p.birth:''}</option>)}</select></label>)}</div>
 <button className="primary" disabled={!first||!second}>Cari hubungan</button>{' '}<button type="button" className="secondary" onClick={()=>{setFirst(second);setSecond(first);setResult(null);}}>Tukar anggota</button></form>
 {found&&<div role="status" className="kinship-result"><h3>{found.title}</h3><p>{found.explanation}</p>{result&&found.found&&<><h3>Jalur keluarga</h3><ol><li><button type="button" className="text-button" onClick={()=>openPerson(result.first)}>{byId.get(result.first)?.name}</button> · Anggota pertama</li>{found.path.map((step,i)=><li key={i}>{step.label} → <button type="button" className="text-button" onClick={()=>openPerson(step.to)}>{byId.get(step.to)?.name}</button></li>)}</ol></>}
 {found.title.startsWith('Paman buyut')||found.title.startsWith('Bibi buyut')?<p>Di sini, paman/bibi buyut berarti saudara dari kakek atau nenek. Sebutan dapat berbeda menurut kebiasaan keluarga.</p>:null}</div>}
 </section>;
}
