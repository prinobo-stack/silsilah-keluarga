import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './online';
type Connection={configured:boolean;revision:number|null;url:string|null};
export default function SheetsBackup(){
 const [connection,setConnection]=useState<Connection|null>(null),[privateFields,setPrivate]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const active=useRef(true),sending=useRef(false);
 useEffect(()=>{active.current=true;void api('sheets-backup').then(v=>{if(active.current)setConnection(v);}).catch(e=>{if(active.current)setError(e instanceof ApiError&&e.status===403?'Menu ini khusus admin/pemilik.':e.message);});return()=>{active.current=false;};},[]);
 async function send(){if(!connection?.configured||connection.revision===null||!consent||sending.current)return;sending.current=true;setBusy(true);setError('');setMessage('');try{const result=await api('sheets-backup',{includePrivate:privateFields,revision:connection.revision});if(active.current){setMessage('Salinan revisi '+result.revision+' tersimpan. Nama tab diawali '+result.prefix+'.');setConsent(false);}}catch(e){if(active.current)setError((e as Error).message);}finally{sending.current=false;if(active.current)setBusy(false);}}
 return <section className="card"><h2>Backup ke Google Sheets</h2>
 <p>Salin data resmi dari server setelah sinkronisasi berhasil. Perubahan lokal yang belum tersinkron dan usulan yang belum disetujui tidak ikut disalin. Perubahan di spreadsheet tidak mengubah aplikasi.</p>
 <p>Setiap penyalinan membuat tab baru: informasi revisi, anggota aktif, orang tua-anak, pasangan, saudara, dan agenda. Foto, akun, kata sandi, token, dan sampah tidak disertakan. Cadangan ini belum dapat diimpor kembali; tetap simpan ZIP untuk pemulihan lengkap.</p>
 {error&&<p role="alert">{error}</p>}{!connection&&!error&&<p>Memeriksa koneksi…</p>}
 {connection&&!connection.configured&&<><p>Koneksi Google Sheets belum disiapkan.</p><p>Siapkan spreadsheet khusus cadangan, aktifkan Google Sheets API, lalu hubungkan service account melalui pengaturan server. Kunci rahasia disimpan di Netlify; jangan masukkan ke formulir atau bagikan dalam obrolan.</p></>}
 {connection?.configured&&<><p>Revisi resmi yang akan disalin: {connection.revision??'Belum tersedia'}</p>{connection.url&&<p><a href={connection.url} target="_blank" rel="noopener noreferrer">Buka spreadsheet tujuan</a></p>}
 <form onSubmit={e=>{e.preventDefault();void send();}}><label className="check-label"><input type="checkbox" checked={privateFields} disabled={busy} onChange={e=>{setPrivate(e.target.checked);setConsent(false);}}/>Sertakan biodata pribadi, catatan, isi cerita, dan profil keluarga</label>
 <p>Nama, nama panggilan, jenis kelamin, status, tanggal, tempat lahir, hubungan, serta judul dan tanggal agenda ikut disalin. Jika pilihan di atas dicentang, NIK, nomor HP, agama, alamat, catatan, lokasi agenda, dan isi cerita juga disalin. Semua orang yang memiliki akses ke spreadsheet dapat membacanya.</p>
 <label className="check-label"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>Saya sudah memeriksa tujuan dan menyetujui penyalinan data tersebut ke spreadsheet.</label>
 <button className="primary" disabled={busy||!consent||connection.revision===null}>{busy?'Menyalin…':'Salin data resmi sekarang'}</button></form></>}
 {message&&<p role="status">{message}</p>}<p>Backup dijalankan lewat tombol ini, belum otomatis terjadwal. Jika proses terputus, periksa spreadsheet sebelum mengulang agar tidak membuat salinan ganda.</p></section>;
}
