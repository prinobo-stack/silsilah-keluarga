import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,type Person} from '../src/domain.ts';
import {checkFamilyData} from '../src/data-checks.ts';
function person(id:string,extra:Partial<Person>={}):Person{return {id,name:id,nickname:'',sex:'U',birth:'',birthApprox:false,death:'',status:'unknown',place:'',notes:'',photoId:null,deletedAt:null,createdAt:'2026-01-01',updatedAt:'2026-01-01',...extra};}
test('duplicate groups normalize names, omit blank NIK and deleted records, never mutate',()=>{
 const s=emptyState();s.persons=[person('a',{name:'  PRIYO-Mas ',nik:'1234567890123456'}),person('b',{name:'priyo mas',nik:'1234567890123456'}),person('c',{name:'priyo mas',deletedAt:'2026-01-01'})];const before=JSON.stringify(s);const results=checkFamilyData(s,'2026-10-27');assert.equal(results.filter(f=>f.category==='duplicate').length,2);assert.ok(results.every(f=>!f.personIds.includes('c')));assert.ok(!JSON.stringify(results).includes('1234567890123456'));assert.equal(JSON.stringify(s),before);
});
test('partial and approximate dates do not produce uncertain future or chronology claims',()=>{
 const s=emptyState();s.persons=[person('a',{birth:'2026'}),person('b',{birth:'2027',birthApprox:true}),person('c',{birth:'2027'}),person('d',{birth:'2026-10'})];const result=checkFamilyData(s,'2026-10-27').filter(f=>f.category==='date');assert.deepEqual(result.map(f=>f.personIds),[['c']]);
});
test('only biological parent chronology is flagged; step and adoptive remain distinct',()=>{
 const s=emptyState();s.persons=[person('a',{birth:'2000'}),person('b',{birth:'1990'})];s.parents=[{id:'p',parentId:'a',childId:'b',kind:'biological',role:''}];assert.equal(checkFamilyData(s).filter(f=>f.category==='date').length,1);s.parents[0].kind='step';assert.equal(checkFamilyData(s).filter(f=>f.category==='date').length,0);
});
test('all active relationship types count, and deletion leaves a reviewable isolated person',()=>{
 const s=emptyState();s.persons=['a','b','c','d','e','f'].map(id=>person(id));s.parents=[{id:'p',parentId:'a',childId:'b',kind:'step',role:''}];s.unions=[{id:'u',members:['c','d'],status:'married',start:'',end:'',notes:''}];s.siblings=[{id:'s',olderId:'e',youngerId:'f',notes:''}];assert.equal(checkFamilyData(s).length,0);s.persons[1].deletedAt='2026-01-01';assert.deepEqual(checkFamilyData(s).map(f=>f.personIds),[['a']]);
});
test('empty and one-person trees do not falsely require relationships',()=>{const s=emptyState();assert.deepEqual(checkFamilyData(s),[]);s.persons=[person('a')];assert.deepEqual(checkFamilyData(s),[]);});
