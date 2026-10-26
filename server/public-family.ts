import { emptyState, type State } from '../src/domain.ts';

// Construct public data from a whitelist; never serialize private records directly.
export function publicFamily(full: State): State {
  const s=emptyState();s.familyName=full.familyName;
  s.persons=full.persons.filter(p=>!p.deletedAt).map(p=>({id:p.id,name:p.name,nickname:p.nickname,sex:p.sex,photoId:p.photoId,
    birth:'',birthApprox:false,death:'',status:p.status,place:'',notes:'',deletedAt:null,createdAt:'1970-01-01T00:00:00.000Z',updatedAt:'1970-01-01T00:00:00.000Z',nik:'',address:'',addressMode:'manual'}));
  const ids=new Set(s.persons.map(p=>p.id));
  s.rootId=full.rootId && ids.has(full.rootId)?full.rootId:s.persons[0]?.id??null;
  s.parents=full.parents.filter(l=>ids.has(l.parentId)&&ids.has(l.childId)).map(l=>({id:l.id,parentId:l.parentId,childId:l.childId,kind:l.kind,role:''}));
  s.siblings=(full.siblings??[]).filter(l=>ids.has(l.olderId)&&ids.has(l.youngerId)).map(l=>({id:l.id,olderId:l.olderId,youngerId:l.youngerId,notes:''}));
  s.unions=full.unions.filter(u=>u.members.every(id=>ids.has(id))).map(u=>({id:u.id,members:[...u.members],status:u.status,start:'',end:'',notes:''}));
  const photos=new Set(s.persons.flatMap(p=>p.photoId?[p.photoId]:[]));
  s.media=full.media.filter(m=>photos.has(m.id)).map(m=>({id:m.id,mime:m.mime,size:m.size,name:'Foto anggota'}));
  return s;
}
