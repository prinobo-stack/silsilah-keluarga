import {resolveAddress,type State} from './domain';
export interface MemberFilters {query:string;status:string;sex:string;place:string;address:string}
export const emptyMemberFilters:MemberFilters={query:'',status:'all',sex:'all',place:'',address:''};
const norm=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('id').replace(/\s+/g,' ').trim();
export function searchMembers(state:State,filters:MemberFilters){const q=norm(filters.query),place=norm(filters.place),address=norm(filters.address);return state.persons.filter(p=>!p.deletedAt&&(filters.status==='all'||p.status===filters.status)&&(filters.sex==='all'||p.sex===filters.sex)&&(!q||norm(p.name+' '+p.nickname+' '+p.place).includes(q))&&(!place||norm(p.place).includes(place))&&(!address||norm(resolveAddress(state,p.id).address).includes(address))).sort((a,b)=>a.name.localeCompare(b.name,'id'));}
