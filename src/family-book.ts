import {dateText,type State} from './domain';
export type BookOptions={photos:boolean;dates:boolean;stories:boolean};
export type BookPage={kind:'cover'|'contents'|'tree'|'profile'|'story';title:string;lines:string[];photoId?:string;personId?:string};
export function wrapBookText(text:string,width=54){const lines:string[]=[];for(const paragraph of text.replace(/\r/g,'').split('\n')){let current='';for(const word of paragraph.split(/\s+/).filter(Boolean)){const pieces=Array.from(word);while(pieces.length>width){if(current){lines.push(current);current='';}lines.push(pieces.splice(0,width).join(''));}const part=pieces.join('');if(!part)continue;if(Array.from(current+(current?' ':'')+part).length>width){lines.push(current);current=part;}else current+=(current?' ':'')+part;}lines.push(current);}return lines;}
export function buildFamilyBook(state:State,options:BookOptions):BookPage[]{
 const people=state.persons.filter(p=>!p.deletedAt).sort((a,b)=>a.name.localeCompare(b.name,'id')),names=new Map(people.map(p=>[p.id,p.name]));
 const content:BookPage[]=[{kind:'tree',title:'Pohon keluarga',lines:['Bagan ringkas keluarga. Hubungan tiap anggota dijelaskan pada halaman profil.']}];
 const add=(kind:'profile'|'story',title:string,paragraphs:string[],extra:Partial<BookPage>={})=>{const lines=paragraphs.flatMap(p=>[...wrapBookText(p),'']);const size=extra.photoId?22:32;for(let i=0;i<Math.max(1,lines.length);i+=size)content.push({kind,title:i?title+' · lanjutan':title,lines:lines.slice(i,i+size),...extra,photoId:i?undefined:extra.photoId});};
 for(const p of people){const sex={M:'Laki-laki',F:'Perempuan',U:'Belum diketahui'}[p.sex],status={living:'Masih hidup',deceased:'Sudah wafat',unknown:'Status belum diketahui'}[p.status];const lines=['Jenis kelamin: '+sex,'Status: '+status];
 if(options.dates){lines.push('Lahir: '+(p.birthApprox?'Sekitar ':'')+dateText(p.birth));if(p.status==='deceased')lines.push('Wafat: '+dateText(p.death));}
 for(const l of state.parents){if(l.childId===p.id&&names.has(l.parentId))lines.push('Orang tua '+({biological:'kandung',adoptive:'angkat',step:'tiri'}[l.kind])+': '+names.get(l.parentId));if(l.parentId===p.id&&names.has(l.childId))lines.push('Anak '+({biological:'kandung',adoptive:'angkat',step:'tiri'}[l.kind])+': '+names.get(l.childId));}
 for(const u of state.unions)if(u.members.includes(p.id)&&u.members.every(id=>names.has(id)))lines.push(({married:'Pasangan',divorced:'Mantan pasangan',separated:'Pasangan (berpisah)',unknown:'Pasangan (status belum diketahui)'}[u.status])+': '+names.get(u.members.find(id=>id!==p.id)!));
 for(const sibling of state.siblings??[])if(sibling.olderId===p.id&&names.has(sibling.youngerId))lines.push('Adik: '+names.get(sibling.youngerId));else if(sibling.youngerId===p.id&&names.has(sibling.olderId))lines.push('Kakak: '+names.get(sibling.olderId));
 add('profile',p.name,lines,{personId:p.id,photoId:options.photos&&p.photoId?p.photoId:undefined});}
 if(options.stories)for(const m of state.memories)add('story',m.title,[...(options.dates&&m.date?['Tanggal: '+dateText(m.date)]:[]),m.body],{photoId:options.photos?m.mediaIds[0]:undefined});
 const cover:BookPage={kind:'cover',title:state.familyName,lines:['BUKU KELUARGA','Silsilah, profil, dan kenangan',people.length+' anggota keluarga','NIK, alamat, nomor HP, agama, dan catatan pribadi tidak disertakan.']};
 const count=Math.max(1,Math.ceil(content.length/24));const toc=content.map((p,i)=>(i+count+2)+'. '+(Array.from(p.title).length>44?Array.from(p.title).slice(0,42).join('')+'…':p.title));const contents:BookPage[]=Array.from({length:count},(_,i)=>({kind:'contents',title:i?'Daftar isi · lanjutan':'Daftar isi',lines:toc.slice(i*24,i*24+24)}));
 return [cover,...contents,...content];
}
