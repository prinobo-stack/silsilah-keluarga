import type {State} from './domain';
export type AgendaItem={id:string;kind:'birthday'|'anniversary'|'event';title:string;date:string;time:string;location:string;notes:string;personIds:string[]};
export function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function anniversary(date:string,today:string,leap:'feb28'|'mar1'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today)return null;
 const occurrence=(year:number)=>{
  const md=date.slice(5);if(md==='02-29' && !(year%4===0&&(year%100!==0||year%400===0)))return `${year}-${leap==='mar1'?'03-01':'02-28'}`;
  return `${year}-${md}`;
 };
 let y=Number(today.slice(0,4)),next=occurrence(y);if(next<today)next=occurrence(++y);return next;
}
export function familyAgenda(state:State,today=localToday()):AgendaItem[]{
 const items:AgendaItem[]=[];const live=new Map(state.persons.filter(p=>!p.deletedAt).map(p=>[p.id,p]));
 for(const p of live.values())if(p.status==='living'&&!p.birthApprox){const date=anniversary(p.birth,today,state.settings.leapDay);if(date)items.push({id:'birthday:'+p.id,kind:'birthday',title:'Ulang tahun '+p.name,date,time:'',location:'',notes:'Dari tanggal lahir anggota.',personIds:[p.id]});}
 for(const u of state.unions){if(u.status!=='married'||u.end||!u.members.every(id=>live.get(id)?.status==='living'))continue;const date=anniversary(u.start,today,state.settings.leapDay);if(date)items.push({id:'anniversary:'+u.id,kind:'anniversary',title:'Hari pernikahan '+u.members.map(id=>live.get(id)!.name).join(' & '),date,time:'',location:'',notes:'Dari tanggal mulai pernikahan.',personIds:[...u.members]});}
 for(const e of state.events??[])items.push({...e,kind:'event',personIds:[]});
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.title.localeCompare(b.title,'id'));
}
