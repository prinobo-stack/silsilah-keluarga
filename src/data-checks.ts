import type { State } from "./domain";
export type DataFinding = {id:string; category:"duplicate"|"date"|"relationship"; title:string; detail:string; personIds:string[]};
const normalized = (name:string)=>name.normalize("NFKC").toLocaleLowerCase("id").replace(/[^\p{L}\p{N}]+/gu," ").trim();
function dateBounds(value:string):[string,string]|null {
  if(!value)return null;
  if(value.length===4)return [value+"-01-01",value+"-12-31"];
  if(value.length===7){const [y,m]=value.split("-").map(Number);const day=new Date(Date.UTC(y<100?y+400:y,m,0)).getUTCDate();return [value+"-01",value+"-"+day];}
  return [value,value];
}
/** Read-only findings. Partial/approximate dates never establish uncertain chronology. */
export function checkFamilyData(state:State,today=new Date().toLocaleDateString("sv-SE")):DataFinding[]{
  const people=state.persons.filter(p=>!p.deletedAt),byId=new Map(people.map(p=>[p.id,p]));
  const findings:DataFinding[]=[];
  for(const [field,label] of [["name","Nama"],["nik","NIK"]] as const){
    const groups=new Map<string,string[]>();
    for(const p of people){const key=field==="name"?normalized(p.name):(p.nik??"").trim();if(!key)continue;const ids=groups.get(key)??[];ids.push(p.id);groups.set(key,ids);}
    for(const [key,ids] of groups)if(ids.length>1)findings.push({id:field+":"+ids[0],category:"duplicate",title:label+" sama pada "+ids.length+" anggota",detail:field==="name"?"Nama yang sama belum tentu orang yang sama. Bandingkan tanggal lahir, orang tua, dan profil sebelum memperbaiki.":"Periksa kembali NIK pada profil anggota berikut. Nomor NIK tidak ditampilkan di daftar pemeriksaan.",personIds:ids});
  }
  for(const p of people){for(const [field,label] of [["birth","Tanggal lahir"],["death","Tanggal wafat"]] as const){const bounds=dateBounds(p[field]);if(bounds && !(field==="birth"&&p.birthApprox) && bounds[0]>today)findings.push({id:field+":"+p.id,category:"date",title:label+" berada di masa depan",detail:"Periksa kembali tanggal pada profil. Tanggal sebagian hanya ditandai bila seluruh rentangnya berada di masa depan.",personIds:[p.id]});}}
  const linked=new Set<string>();
  for(const link of state.parents){if(!byId.has(link.parentId)||!byId.has(link.childId))continue;linked.add(link.parentId);linked.add(link.childId);
    if(link.kind!=="biological")continue;
    const parent=byId.get(link.parentId)!,child=byId.get(link.childId)!;
    const a=dateBounds(parent.birth),b=dateBounds(child.birth);
    if(a&&b&&!parent.birthApprox&&!child.birthApprox&&a[0]>b[1])findings.push({id:"parent-date:"+link.id,category:"date",title:"Orang tua kandung lahir setelah anak",detail:"Periksa tanggal lahir dan arah hubungan orang tua–anak.",personIds:[parent.id,child.id]});
  }
  for(const union of state.unions)if(union.members.every(id=>byId.has(id)))union.members.forEach(id=>linked.add(id));
  for(const sibling of state.siblings??[])if(byId.has(sibling.olderId)&&byId.has(sibling.youngerId)){linked.add(sibling.olderId);linked.add(sibling.youngerId);}
  if(people.length>1)for(const p of people)if(!linked.has(p.id))findings.push({id:"unlinked:"+p.id,category:"relationship",title:"Belum terhubung dengan anggota lain",detail:"Anggota ini belum memiliki hubungan orang tua, anak, pasangan, atau saudara aktif. Ini boleh dibiarkan jika datanya belum diketahui.",personIds:[p.id]});
  return findings;
}
