import {useMemo,useState} from "react";
import type {State} from "./domain";
import {checkFamilyData} from "./data-checks";
export default function DataChecks({state,openPerson}:{state:State;openPerson:(id:string)=>void}){
 const [filter,setFilter]=useState("all"),[limit,setLimit]=useState(50);
 const today=new Date().toLocaleDateString("sv-SE");
 const findings=useMemo(()=>checkFamilyData(state,today),[state,today]);
 const people=useMemo(()=>new Map(state.persons.map(p=>[p.id,p.name])),[state]);
 const shown=findings.filter(f=>filter==="all"||f.category===filter);
 return <section className="card"><h2>Pemeriksaan data keluarga</h2>
 <p>Pemeriksaan memberi saran untuk ditinjau. Data tidak diubah, digabung, atau dihapus otomatis. Nama sama belum tentu orang yang sama.</p>
 <div className="filter-row">{([["all","Semua"],["duplicate","Kemungkinan ganda"],["date","Tanggal"],["relationship","Hubungan"]] as const).map(([key,label])=><button type="button" key={key} className={"chip "+(filter===key?"selected":"")} aria-pressed={filter===key} onClick={()=>{setFilter(key);setLimit(50);}}>{label} ({findings.filter(f=>key==="all"||f.category===key).length})</button>)}</div>
 <p role="status">{shown.length?`${shown.length} saran perlu ditinjau.`:state.persons.some(p=>!p.deletedAt)?"Tidak ada temuan pada kategori ini. Hasil ini belum menjamin seluruh data lengkap atau benar.":"Belum ada anggota untuk diperiksa."}</p>
 {shown.slice(0,limit).map(f=><article key={f.id} className="data-finding"><h3>{f.title}</h3><p>{f.detail}</p><div className="filter-row">{f.personIds.map(id=><button type="button" className="secondary" key={id} onClick={()=>openPerson(id)}>{people.get(id)} · Lihat profil</button>)}</div></article>)}
 {shown.length>limit&&<button type="button" className="secondary" onClick={()=>setLimit(n=>n+50)}>Tampilkan lebih banyak</button>}
 </section>;
}
