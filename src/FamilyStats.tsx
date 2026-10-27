import {useMemo,useState} from 'react';
import type {State} from './domain';
import {localToday} from './agenda';
import {familyStats} from './family-stats';
export default function FamilyStats({state,compact=false,initialCategory="all",openStats,openPerson}:{state:State;compact?:boolean;initialCategory?:string;openStats?:(category:string)=>void;openPerson:(id:string)=>void}){
 const today=localToday(),stats=useMemo(()=>familyStats(state,today),[state,today]);
 const [category,setCategory]=useState(initialCategory),[limit,setLimit]=useState(50);
 const selected=stats.groups.find(g=>g.key===category)!;
 const people=useMemo(()=>new Map(state.persons.map(p=>[p.id,p])),[state]);
 return <section className="card"><h2>Statistik keluarga</h2><p>Anggota di Sampah tidak dihitung.</p>
 <div className="stats-grid">{(compact?stats.groups.slice(0,4):stats.groups).map(g=><button type="button" className={'secondary stat-tile '+(!compact&&category===g.key?'selected':'')} key={g.key} aria-pressed={!compact&&category===g.key} onClick={()=>{if(compact)openStats?.(g.key);else{setCategory(g.key);setLimit(50);}}}><strong>{g.ids.length}</strong><span>{g.label}</span></button>)}</div>
 <p>{stats.ageCount?`Rentang usia anggota masih hidup: ${stats.minAge}–${stats.maxAge} tahun, dari ${stats.ageCount} anggota dengan tanggal lahir lengkap dan tidak berupa perkiraan.`:'Rentang usia belum dapat dihitung. Isi tanggal lahir lengkap anggota yang masih hidup.'}</p>
 {compact?<button type="button" className="text-button" onClick={()=>openStats?.("all")}>Lihat statistik dan daftar anggota</button>:<><h3>{selected.label} · {selected.ids.length} anggota</h3>{selected.description&&<p>{selected.description}</p>}<p>Kategori dapat saling tumpang tindih; jumlahnya tidak untuk dijumlahkan menjadi total.</p>{!selected.ids.length&&<p>Belum ada anggota pada kategori ini.</p>}<ul className="stats-members">{selected.ids.slice(0,limit).map(id=><li key={id}><button type="button" className="text-button" onClick={()=>openPerson(id)}>{people.get(id)?.name}{people.get(id)?.birth?' · '+people.get(id)?.birth:''}</button></li>)}</ul>{selected.ids.length>limit&&<button type="button" className="secondary" onClick={()=>setLimit(n=>n+50)}>Tampilkan lebih banyak</button>}</>}
 </section>;
}
