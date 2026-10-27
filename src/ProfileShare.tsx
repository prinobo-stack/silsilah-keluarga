import {useState} from 'react';import {profileLink,profileShareText} from './profile-link';
export default function ProfileShare({id,name}:{id:string;name:string}){
 const [message,setMessage]=useState('');
 const url=profileLink(window.location.origin,id),text=profileShareText(name,url);
 async function copy(){try{await navigator.clipboard.writeText(url);setMessage('Tautan profil berhasil disalin.');}catch{setMessage('Tekan lama kolom tautan di bawah, lalu Salin.');}}
 async function share(){if(!navigator.share){await copy();return;}try{await navigator.share({title:'Profil '+name,text,url});setMessage('Pilihan berbagi selesai.');}catch(e){if((e as Error).name!=='AbortError')setMessage('Berbagi belum berhasil. Gunakan Salin tautan atau WhatsApp.');}}
 return <section className="profile-share"><h3>Bagikan profil</h3><div className="filter-row"><button type="button" className="secondary" onClick={()=>void share()}>Bagikan profil</button><button type="button" className="secondary" onClick={()=>void copy()}>Salin tautan profil</button><a className="secondary profile-whatsapp" href={'https://wa.me/?text='+encodeURIComponent(text)} target="_blank" rel="noopener noreferrer">Bagikan ke WhatsApp</a></div><label>Tautan langsung<input readOnly aria-label="Tautan langsung profil" value={url} onFocus={e=>e.target.select()}/></label><p>Penerima tanpa login hanya melihat data publik yang diizinkan admin. Jika akses publik ditutup, penerima perlu masuk dengan akun keluarga.</p>{message&&<p role="status">{message}</p>}</section>;
}
