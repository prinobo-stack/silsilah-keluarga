import {validateState,type State} from '../src/domain.ts';import {proposalChanges} from './changes.ts';
type Snapshot={state:State;files:Record<string,string>};
export function prepareReviewedProposal(current:Snapshot,draft:Snapshot,selected:unknown):Snapshot{
 const changes=proposalChanges(current,draft);
 if(!Array.isArray(selected)||!selected.length||selected.length>1000||new Set(selected).size!==selected.length||selected.some(i=>!Number.isSafeInteger(i)||i<0||i>=changes.length))throw Error('Pilih bagian usulan yang valid.');
 const state=structuredClone(current.state),files={...current.files};
 const sections:Record<string,string>={'Anggota':'persons','Orang tua-anak':'parents','Kakak-adik':'siblings','Pasangan':'unions','Cerita':'memories','Foto':'media','Agenda keluarga':'events'};
 for(const i of selected){const c=changes[i];if(c.section==='Identitas keluarga'){if(c.name==='familyName')state.familyName=c.after as string;else if(c.name==='rootId')state.rootId=c.after as string|null;else if(c.name==='familyProfile')state.familyProfile=structuredClone(c.after) as State['familyProfile'];else throw Error('Identitas usulan tidak dikenal.');continue;}
 const key=sections[c.section];if(!key)throw Error('Bagian usulan tidak dikenal.');const old=c.before as {id:string}|null,row=c.after as {id:string;isiFotoBerubah?:boolean}|null,id=(row??old)!.id;
 const clean=row?structuredClone(row):null;if(clean)delete clean.isiFotoBerubah;
 const record=state as unknown as Record<string,unknown>;record[key]=((record[key]??[]) as {id:string}[]).filter(r=>r.id!==id);if(clean)(record[key] as unknown[]).push(clean);
 if(key==='media'){if(row){if(!draft.files[id])throw Error('Foto usulan tidak tersedia.');files[id]=draft.files[id];}else delete files[id];}
 }
 validateState(state);
 for(const media of state.media)if(!files[media.id])throw Error('Foto belum lengkap. Pilih juga perubahan foto yang terkait.');
 return {state,files};
}
