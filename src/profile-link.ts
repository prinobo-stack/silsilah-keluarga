export function memberFromHash(hash:string):string|null {
 const prefix='#anggota=';if(!hash.startsWith(prefix))return null;
 try{const id=decodeURIComponent(hash.slice(prefix.length));return /^[a-zA-Z0-9-]{1,64}$/.test(id)?id:null;}catch{return null;}
}
export function profileLink(origin:string,id:string){
 if(!/^[a-zA-Z0-9-]{1,64}$/.test(id))throw Error('ID anggota tidak valid.');
 const base=new URL(origin);if(!['https:','http:'].includes(base.protocol))throw Error('Alamat aplikasi tidak valid.');
 return base.origin+'/#anggota='+encodeURIComponent(id);
}
export function profileShareText(name:string,url:string){return `Lihat profil ${name} di Silsilah Keluarga:\n${url}\nInformasi yang terlihat mengikuti pengaturan privasi dan akun penerima.`;}
