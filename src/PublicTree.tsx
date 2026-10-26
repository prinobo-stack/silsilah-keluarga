import {useEffect,useState} from 'react';
import App from './App';
import {setWorkspace,completeSync,syncSnapshot} from './storage';
import {inspectBackup} from './backup';

export function PublicTree({login}:{login:()=>void}) {
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,inFlight=false,revision=-1;
  setWorkspace('public-tree','viewer');
  async function refresh(){
   if(inFlight)return;inFlight=true;
   try{
    const r=await fetch('/api/public/snapshot',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!r.ok || !r.headers.get('content-type')?.includes('application/zip'))throw Error('Pohon publik belum dapat diambil. Pastikan server dan internet aktif.');
    const rev=Number(r.headers.get('X-Family-Revision'));
    if(!Number.isSafeInteger(rev)||rev<0)throw Error('Revisi pohon publik tidak valid.');
    if(rev!==revision){
     const data=await inspectBackup(new Uint8Array(await r.arrayBuffer()));
     if(!active)return;
     const local=await syncSnapshot();if(!active)return;
     await completeSync(rev,local.meta.generation,data);
     revision=rev;if(active){setReady(true);window.dispatchEvent(new Event('family-refreshed'));}
    }
    if(active)setError('');
   }catch(e){if(active)setError((e as Error).message);}finally{inFlight=false;}
  }
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);
  return()=>{active=false;clearInterval(timer);};
 },[]);
 return <><aside className="draft-banner"><strong>Pengunjung · lihat saja</strong><p>Masuk dengan akun keluarga untuk mengajukan perubahan.</p><button className="secondary" onClick={login}>Masuk akun keluarga</button></aside>{error&&<p role="alert" className="error">{error}</p>}{ready?<App readOnly publicView />:<p role="status">{error?'Coba muat ulang saat server terhubung.':'Memuat pohon keluarga…'}</p>}</>;
}
