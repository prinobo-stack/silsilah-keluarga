import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicFamily} from '../server/public-family.ts';
import {treeFixture} from './fixtures/tree.ts';
test('pohon publik dibangun dengan whitelist dan tidak memuat bidang privat tambahan',()=>{
 const full=treeFixture();
 for(const p of full.persons)Object.assign(p,{phone:'PRIVATE-PHONE',religion:'PRIVATE-RELIGION',notes:'PRIVATE-NOTE',nik:'PRIVATE-NIK',address:'PRIVATE-ADDRESS',place:'PRIVATE-PLACE',extraSecret:'PRIVATE-EXTRA'});
 full.unions.forEach(u=>u.notes='PRIVATE-UNION');full.parents.forEach(p=>p.role='PRIVATE-ROLE');
 const safe=publicFamily(full),text=JSON.stringify(safe);
 assert.ok(!text.includes('PRIVATE-'));
 assert.ok(safe.persons.length>0);assert.equal(safe.memories.length,0);
 assert.equal(safe.persons[0].name,full.persons[0].name);
 safe.persons[0].name='Tamu';assert.notEqual(full.persons[0].name,'Tamu');
});
