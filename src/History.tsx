import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './online';
import {historyLabel} from './audit-history';
type Row={id:string;actor_name:string|null;actor:string;action:string;at:string};
export default function History(){
 const [rows,setRows]=useState<Row[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[filter,setFilter]=useState('all');
 const serial=useRef(0),requestBusy=useRef(false);
 async function load(before:string|null=null){if(requestBusy.current)return;requestBusy.current=true;const request=++serial.current;setBusy(true);setError('');try{const result=await api('history'+(before?'?before='+encodeURIComponent(before):''));if(request!==serial.current)return;setRows(old=>before?[...old,...result.rows]:result.rows);setNext(result.next);setLoaded(true);}catch(e){if(request===serial.current)setError(e instanceof ApiError&&e.status===403?'Riwayat hanya dapat dibuka oleh admin/pemilik.':(e as Error).message);}finally{if(request===serial.current){requestBusy.current=false;setBusy(false);}}}
 useEffect(()=>{void load();return()=>{serial.current++;requestBusy.current=false;};},[]);
 const visible=rows.filter(r=>filter==='all'||(filter==='data'?/^(snapshot|proposal|approve|reject):/.test(r.action):!/^(snapshot|proposal|approve|reject):/.test(r.action)));
 return <section className="card"><h2>Riwayat perubahan dan aktivitas</h2><p>Catatan server tentang penyimpanan revisi, usulan, dan pengelolaan akun. Perubahan lokal muncul setelah sinkronisasi berhasil. Catatan lama belum menyimpan rincian setiap kolom yang berubah; menu ini tidak menyediakan pengembalian versi.</p>
 <div className="filter-row"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}>Muat ulang riwayat</button><label>Tampilkan<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Semua aktivitas</option><option value="data">Data dan usulan</option><option value="account">Akun</option></select></label></div>
 {busy&&<p role="status">Memuat riwayat…</p>}{error&&<p role="alert">{error}</p>}{loaded&&!visible.length&&<p>Belum ada aktivitas pada kategori ini di halaman yang sudah dimuat.</p>}
 <ol className="history-list">{visible.map(r=><li key={r.id}><strong>{historyLabel(r.action)}</strong><p>Oleh {r.actor_name??'Akun tidak tersedia'}<br/><time dateTime={r.at}>{new Date(r.at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}</time></p></li>)}</ol>
 {next&&<button type="button" className="secondary" disabled={busy} onClick={()=>void load(next)}>Muat aktivitas lebih lama</button>}<p className="muted">Waktu mengikuti zona waktu perangkat. Penyaringan berlaku pada catatan yang sudah dimuat.</p>
 </section>;
}
