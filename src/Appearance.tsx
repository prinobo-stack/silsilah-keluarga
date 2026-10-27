import {useEffect, useState} from "react";

type Appearance = {accent:string; background:string; surface:string; tree:string; mainImage:string; treeImage:string};
const key="silsilah-appearance-v1";
const defaults:Appearance={accent:"#16634a",background:"#f7f6f0",surface:"#fffef9",tree:"#f0f4ee",mainImage:"",treeImage:""};
const presets = [
  {name:"Hijau keluarga",value:defaults},
  {name:"Biru tenang",value:{...defaults,accent:"#245b91",background:"#edf4fb",surface:"#ffffff",tree:"#e7f0fa"}},
  {name:"Krem hangat",value:{...defaults,accent:"#81502c",background:"#faf0df",surface:"#fffaf1",tree:"#f4e8d2"}},
  {name:"Ungu lembut",value:{...defaults,accent:"#69478a",background:"#f5effb",surface:"#fffaff",tree:"#eee4f8"}},
];
function load():Appearance {
  try {const raw=JSON.parse(localStorage.getItem(key)||"{}"); const result={...defaults};
    for(const field of ["accent","background","surface","tree"] as const)if(/^#[0-9a-f]{6}$/i.test(raw[field]))result[field]=raw[field];
    for(const field of ["mainImage","treeImage"] as const)if(typeof raw[field]==="string" && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(raw[field]))result[field]=raw[field];
    return result;
  }catch{return {...defaults};}
}
export function useAppearance(){
  const [value,setValue]=useState(load);
  const [error,setError]=useState("");
  function update(next:Appearance){try{localStorage.setItem(key,JSON.stringify(next));setValue(next);setError("");}catch{setError("Penyimpanan browser penuh. Hapus background dahulu atau pilih gambar lebih kecil.");}}
  useEffect(()=>{
    const root=document.documentElement.style;
    for(const field of ["accent","background","surface","tree"] as const)root.setProperty("--appearance-"+field,value[field]);
    const rgb=value.accent.match(/[0-9a-f]{2}/gi)!.map(v=>parseInt(v,16));
    root.setProperty("--appearance-on-accent",(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>155?"#172e25":"#ffffff");
    root.setProperty("--appearance-main-image",value.mainImage?`url("${value.mainImage}")`:"none");
    root.setProperty("--appearance-tree-image",value.treeImage?`url("${value.treeImage}")`:"none");
  },[value]);
  return {value,update,error};
}
async function background(file:File){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>12*1024*1024)throw Error("Pilih JPG, PNG atau WebP maksimal 12 MB.");
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>50_000_000)throw Error("Resolusi gambar terlalu besar.");
    const ratio=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const ctx=canvas.getContext("2d")!;ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.7);
  }finally{bitmap.close();}
}
export function AppearanceSettings({appearance}:{appearance:ReturnType<typeof useAppearance>}){
  const {value,update,error}=appearance;
  const [busy,setBusy]=useState(false),[uploadError,setUploadError]=useState("");
  async function upload(field:"mainImage"|"treeImage",file?:File){if(!file)return;setBusy(true);setUploadError("");try{update({...value,[field]:await background(file)});}catch(e){setUploadError((e as Error).message);}finally{setBusy(false);}}
  return <section className="card appearance-settings"><h2>Tema, warna, dan background</h2>
    <p>Berlaku untuk halaman utama dan pohon, termasuk layar penuh. Disimpan khusus di browser perangkat ini; tidak ikut sinkronisasi atau cadangan keluarga.</p>
    <div className="filter-row">{presets.map(p=><button type="button" className="secondary" key={p.name} disabled={busy} onClick={()=>update({...p.value,mainImage:value.mainImage,treeImage:value.treeImage})}>{p.name}</button>)}</div>
    <div className="form-grid">{([["accent","Warna tombol"],["background","Warna latar aplikasi"],["surface","Warna kartu"],["tree","Warna latar pohon"]] as const).map(([field,label])=><label key={field}>{label}<input type="color" value={value[field]} disabled={busy} onChange={e=>update({...value,[field]:e.target.value})}/></label>)}</div>
    {([["mainImage","Background halaman utama"],["treeImage","Background pohon"]] as const).map(([field,label])=><div key={field}><label>{label}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void upload(field,e.target.files?.[0]);e.target.value="";}}/></label>{value[field]&&<><img src={value[field]} alt={label} style={{width:160,height:90,objectFit:"cover",borderRadius:8}}/><button type="button" className="secondary" disabled={busy} onClick={()=>update({...value,[field]:""})}>Hapus background</button></>}</div>)}
    {busy&&<p role="status">Memproses background…</p>}{(error||uploadError)&&<p role="alert">{error||uploadError}</p>}
    <button type="button" className="secondary" disabled={busy} onClick={()=>update({...defaults})}>Kembalikan tampilan awal</button>
  </section>;
}
