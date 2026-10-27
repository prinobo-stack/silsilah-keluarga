import {validDate,type State} from './domain';
export type StatGroup={key:string;label:string;ids:string[];description?:string};
export function familyStats(state:State,today:string){
 const people=state.persons.filter(p=>!p.deletedAt),ids=new Set(people.map(p=>p.id));
 const groups:StatGroup[]=[{key:'all',label:'Anggota aktif',ids:people.map(p=>p.id)}];
 for(const [key,label] of [['living','Masih hidup'],['deceased','Sudah wafat'],['unknown','Status belum diketahui']] as const)groups.push({key,label,ids:people.filter(p=>p.status===key).map(p=>p.id)});
 for(const [key,label] of [['M','Laki-laki'],['F','Perempuan'],['U','Jenis kelamin belum diketahui']] as const)groups.push({key,label,ids:people.filter(p=>p.sex===key).map(p=>p.id)});
 const ages=new Map<string,number>();
 const [year,month,day]=today.split('-').map(Number);
 for(const p of people){if(p.status!=='living'||p.birthApprox||p.birth.length!==10||!validDate(p.birth)||p.birth>today)continue;
 const [y,m,d]=p.birth.split('-').map(Number);ages.set(p.id,year-y-Number(month<m||(month===m&&day<d)));}
 for(const [key,label,min,max] of [['age-child','Usia 0–17 tahun',0,17],['age-adult','Usia 18–59 tahun',18,59],['age-senior','Usia 60 tahun ke atas',60,Infinity]] as const)groups.push({key,label,ids:[...ages].filter(([,age])=>age>=min&&age<=max).map(([id])=>id)});
 groups.push({key:'age-unknown',label:'Usia belum dapat dihitung',ids:people.filter(p=>p.status==='living'&&!ages.has(p.id)).map(p=>p.id),description:'Anggota masih hidup dengan tanggal lahir kosong, sebagian, perkiraan, atau berada di masa depan.'});
 groups.push({key:'incomplete',label:'Biodata dasar belum lengkap',ids:people.filter(p=>p.sex==='U'||p.status==='unknown'||p.birth.length!==10||p.birthApprox||!validDate(p.birth)||p.birth>today).map(p=>p.id),description:'Perlu memeriksa jenis kelamin, status hidup/wafat, atau tanggal lahir lengkap. NIK, agama, foto, dan nomor HP tidak wajib untuk hitungan ini.'});
 const linked=new Set<string>();
 for(const p of state.parents)if(ids.has(p.parentId)&&ids.has(p.childId)){linked.add(p.parentId);linked.add(p.childId);}
 for(const u of state.unions)if(u.members.every(id=>ids.has(id)))u.members.forEach(id=>linked.add(id));
 for(const s of state.siblings??[])if(ids.has(s.olderId)&&ids.has(s.youngerId)){linked.add(s.olderId);linked.add(s.youngerId);}
 groups.push({key:'unlinked',label:'Belum memiliki hubungan aktif',ids:people.filter(p=>!linked.has(p.id)).map(p=>p.id),description:'Belum terhubung dengan orang tua, anak, pasangan, atau saudara yang tidak berada di Sampah. Ini bukan berarti datanya salah.'});
 let min:number|null=null,max:number|null=null;
 for(const n of ages.values()){min=min===null?n:Math.min(min,n);max=max===null?n:Math.max(max,n);}
 return {groups,minAge:min,maxAge:max,ageCount:ages.size};
}
