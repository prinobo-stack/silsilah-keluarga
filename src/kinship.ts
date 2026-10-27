import type {Person,State} from './domain';
type Step={from:string;to:string;type:'up'|'down'|'sibling'|'spouse';kind:string;label:string};
export type KinshipResult={title:string;explanation:string;path:Step[];found:boolean};
const sexLabel=(p:Person,m:string,f:string,neutral:string)=>p.sex==='M'?m:p.sex==='F'?f:neutral;
function siblingTitle(a:Person,b:Person){
 if(a.birth.length===10&&b.birth.length===10&&!a.birthApprox&&!b.birthApprox&&a.birth!==b.birth)return b.birth<a.birth?'Kakak':'Adik';
 return 'Saudara';
}
function describe(path:Step[],a:Person,b:Person):string {
 const code=path.map(s=>({up:'U',down:'D',sibling:'S',spouse:'P'}[s.type])).join('');
 const ancestor=(n:number)=>n===1?sexLabel(b,'Ayah','Ibu','Orang tua'):n===2?sexLabel(b,'Kakek','Nenek','Kakek/nenek'):n===3?'Buyut':`Leluhur ${n} generasi`;
 const descendant=(n:number)=>n===1?'Anak':n===2?'Cucu':n===3?'Cicit':`Keturunan ${n} generasi`;
 if(/^U+$/.test(code))return ancestor(code.length);
 if(/^D+$/.test(code))return descendant(code.length);
 if(code==='P')return sexLabel(b,'Suami','Istri','Pasangan');
 if(code==='S'||code==='UD'){
   const sibling=path.find(s=>s.type==='sibling');
   // Explicit older/younger direction is more reliable than missing birthdays.
   const title=sibling?.label.startsWith('Kakak')?'Kakak':sibling?.label.startsWith('Adik')?'Adik':siblingTitle(a,b);
   return title;
 }
 if(code==='PU')return sexLabel(b,'Ayah mertua','Ibu mertua','Mertua');
 if(code==='DP')return 'Menantu';
 if(['SP','PS','PUD','UDP'].includes(code))return 'Ipar';
 if(code==='PP')return 'Pasangan dari pasangan';
 // An explicit sibling edge is equivalent to one shared-ancestor step,
 // without inventing a missing parent in the displayed path.
 const expanded=code.replace('S','UD');
 const match=/^(U+)(D+)$/.exec(expanded);
 if(match){const up=match[1].length,down=match[2].length;
   if(down===1&&up>=2)return up===2?sexLabel(b,'Paman','Bibi','Paman/bibi'):up===3?sexLabel(b,'Paman buyut','Bibi buyut','Paman/bibi buyut'): `Saudara leluhur ${up-1} generasi`;
   if(up===1&&down>=2)return down===2?'Keponakan':down===3?'Cucu keponakan':`Keturunan saudara ${down-1} generasi`;
   if(up===down)return up===2?'Sepupu':`Sepupu tingkat ${up-1}`;
   return `Sepupu tingkat ${Math.min(up,down)-1}, berbeda ${Math.abs(up-down)} generasi`;
 }
 // Do not assign a blood label to an unfamiliar combination of marriages.
 return 'Kerabat melalui jalur keluarga';
}
export function findKinship(state:State,from:string,to:string):KinshipResult {
 const people=new Map(state.persons.filter(p=>!p.deletedAt).map(p=>[p.id,p]));
 const a=people.get(from),b=people.get(to);
 if(!a||!b)return {found:false,title:'Pilih dua anggota aktif',explanation:'Anggota tidak ditemukan.',path:[]};
 if(from===to)return {found:true,title:'Diri sendiri',explanation:'Kedua pilihan menunjuk anggota yang sama.',path:[]};
 const graph=new Map<string,Step[]>();
 const add=(step:Step)=>{if(people.has(step.from)&&people.has(step.to)){const list=graph.get(step.from)??[];list.push(step);graph.set(step.from,list);}};
 for(const l of state.parents){
  const kind=l.kind==='step'?'tiri':l.kind==='adoptive'?'angkat':'kandung';
  add({from:l.childId,to:l.parentId,type:'up',kind,label:'Orang tua '+kind});
  add({from:l.parentId,to:l.childId,type:'down',kind,label:'Anak '+kind});
 }
 for(const l of state.siblings??[]){
  const kind=/^Saudara (kandung|tiri|seayah|seibu)(?:$| ·)/.exec(l.notes)?.[1]??'belum dikonfirmasi';
  add({from:l.olderId,to:l.youngerId,type:'sibling',kind,label:'Adik · '+kind});
  add({from:l.youngerId,to:l.olderId,type:'sibling',kind,label:'Kakak · '+kind});
 }
 for(const u of state.unions){if(u.end||['divorced','separated'].includes(u.status))continue;
  for(const [x,y] of [u.members,[u.members[1],u.members[0]]])add({from:x,to:y,type:'spouse',kind:'pasangan',label:u.status==='unknown'?'Pasangan · status belum diketahui':'Pasangan'});
 }
 // Breadth-first traversal bounds work to the recorded graph, with no recursion.
 const queue=[from],previous=new Map<string,Step|null>([[from,null]]);
 for(let i=0;i<queue.length&&!previous.has(to);i++)for(const step of graph.get(queue[i])??[]){if(previous.has(step.to))continue;previous.set(step.to,step);queue.push(step.to);}
 if(!previous.has(to))return {found:false,title:'Hubungan belum dapat ditentukan',explanation:'Belum ada jalur yang menghubungkan kedua anggota pada data aktif. Ini tidak berarti keduanya pasti tidak berkerabat.',path:[]};
 const path:Step[]=[];let id=to;while(id!==from){const step=previous.get(id)!;path.push(step);id=step.from;}path.reverse();
 let title=describe(path,a,b);
 const nonBlood=[...new Set(path.filter(s=>s.kind==='tiri'||s.kind==='angkat').map(s=>s.kind))];
 if(nonBlood.length)title+=' · melalui hubungan '+nonBlood.join(' dan ');
 const siblingKinds=[...new Set(path.filter(s=>s.type==='sibling').map(s=>s.kind))];
 if(path.length===1&&path[0].type==='sibling')title+=' · '+siblingKinds.join(', ');
 const explanation=`${b.name} adalah ${title.toLocaleLowerCase('id')} dari ${a.name}. `+(nonBlood.length?'Jalur ini mencakup hubungan tiri/angkat, sehingga bukan kesimpulan hubungan darah. ':'')+'Hasil berdasarkan satu jalur terpendek yang tercatat; hubungan lain mungkin juga ada. Periksa jalur di bawah, terutama jika data orang tua belum lengkap.';
 return {found:true,title,explanation,path};
}
