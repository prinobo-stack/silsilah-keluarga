import {useState,type FormEvent} from 'react';
import {api} from './online';
import {defaultFamilyPassword, defaultFamilyLogin} from './account-defaults';
type Action=(job:()=>Promise<void>)=>Promise<void>;
export function AccountSettings({busy,action,refresh}:{busy:boolean;action:Action;refresh:()=>Promise<void>}){
 const [message,setMessage]=useState('');
 const [name,setName]=useState(''),[login,setLogin]=useState(''),[loginEdited,setLoginEdited]=useState(false);
 const [draftPassword,setDraftPassword]=useState(defaultFamilyPassword),[show,setShow]=useState(false);
 const [created,setCreated]=useState<{login:string;password:string}|null>(null);
 const link=window.location.origin+'/';
 return <section>
  <label>Tautan keluarga<input value={link} readOnly onFocus={e=>e.target.select()}/></label>
  <button className="secondary full" onClick={()=>{void(async()=>{try{await navigator.clipboard.writeText(`Silakan lihat pohon keluarga di ${link}\nUntuk mengajukan perubahan, masuk menggunakan username dan kata sandi dari admin.`);setMessage('Tautan dan petunjuk berhasil disalin.');}catch{setMessage('Tekan lama kolom tautan, lalu Salin.');}})();}}>Salin tautan keluarga</button>
  <p>Pengunjung dapat melihat pohon. Akun keluarga dibuat oleh admin dan dapat mengajukan perubahan untuk disetujui admin.</p>
  <form onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));void action(async()=>{await api('members',data);setCreated({login:String(data.login),password:String(data.password)});form.reset();setName('');setLogin('');setLoginEdited(false);setDraftPassword(defaultFamilyPassword());setShow(false);setMessage('Akun keluarga berhasil dibuat. Sampaikan username dan kata sandinya langsung kepada anggota tersebut.');await refresh();});}}>
   <h3>Buat akun keluarga</h3>
   <label>Nama anggota<input name="name" value={name} onChange={e=>{setName(e.target.value);if(!loginEdited)setLogin(defaultFamilyLogin(e.target.value));}} required maxLength={100} disabled={busy}/></label>
   <label>Username anggota<input name="login" value={login} onChange={e=>{setLogin(e.target.value);setLoginEdited(true);}} required minLength={3} maxLength={120} autoComplete="off" disabled={busy}/></label>
   <label>Kata sandi anggota<input name="password" type={show?"text":"password"} value={draftPassword} onChange={e=>setDraftPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy}/></label>
   <label><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Tampilkan sandi awal</label>
   <button type="button" className="secondary" disabled={busy} onClick={()=>setDraftPassword(defaultFamilyPassword())}>Buat sandi acak</button>
   <small>Default acak dan berbeda untuk setiap akun. Minimal 12 karakter. Anggota dapat mengganti kata sandinya setelah masuk.</small>
   <button className="primary" disabled={busy}>Buat akun keluarga</button>
  </form><p role="status">{message}</p>
  {created&&<section className="card"><h3>Akun baru berhasil dibuat</h3><label>Username akun baru<input readOnly value={created.login}/></label><label>Sandi awal akun baru<input readOnly type={show?"text":"password"} value={created.password}/></label><button className="secondary" onClick={()=>{void(async()=>{try{await navigator.clipboard.writeText(`Akun Silsilah Keluarga\nTautan: ${link}#masuk\nUsername: ${created.login}\nKata sandi awal: ${created.password}\nSilakan ganti kata sandi setelah masuk.`);setMessage('Data akun disalin. Kirim langsung hanya kepada pemilik akun ini.');}catch{setMessage('Tekan Tampilkan sandi awal lalu salin username dan sandi secara manual.');}})();}}>Salin data akun untuk anggota ini</button><button className="text-button" onClick={()=>setCreated(null)}>Tutup informasi sandi</button><p className="muted">Informasi sandi ini hanya ditampilkan selama halaman terbuka, tidak disimpan di browser.</p></section>}
 </section>;
}
export function MemberPassword({id,name,busy,action}:{id:string;name:string;busy:boolean;action:Action}){
 const [open,setOpen]=useState(false);
 return <><button className="secondary" disabled={busy} onClick={()=>setOpen(v=>!v)}>Atur ulang sandi {name}</button>{open&&<form onSubmit={e=>{e.preventDefault();const password=String(new FormData(e.currentTarget).get('password'));void action(async()=>{await api('member-password',{id,password});setOpen(false);});}}><label>Sandi baru untuk {name}<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" disabled={busy}/></label><button disabled={busy}>Simpan sandi anggota</button></form>}</>;
}
