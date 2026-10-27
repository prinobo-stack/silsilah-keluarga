import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,addParent,validateState,siblingsOf,type State,type Person} from '../src/domain.ts';
import {suggestionsFor,applySuggestions} from '../src/family-suggestions.ts';
function fixture():State {
  const persons = ['father','partner','child','sibling'].map(id=>({id,name:id,nickname:'',sex:'U',birth:'',birthApprox:false,death:'',status:'unknown',place:'',notes:'',photoId:null,deletedAt:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'} as Person));
  persons[2].birth='2019-01-01';persons[3].birth='2017-01-01';
  let s:State={...emptyState(),persons,unions:[{id:'union',members:['father','partner'],status:'married',start:'',end:'',notes:''}]};
  s=addParent(s,'father','child','biological');
  return addParent(s,'father','sibling','biological');
}
test('suggest partner and sibling once; exact birthday gives younger; no automatic changes',()=>{
 const s=fixture(),before=JSON.stringify(s),items=suggestionsFor(s,'father','child');
 assert.equal(items.length,2);assert.equal(items[1].direction,'younger');
 assert.equal(applySuggestions(s,'child',items,{}),s);assert.equal(JSON.stringify(s),before);
});
test('confirm biological partner and sibling classification together',()=>{
 const s=fixture(),items=suggestionsFor(s,'father','child');
 const n=applySuggestions(s,'child',items,{'parent:partner':{value:'biological'},'sibling:sibling':{value:'seayah',direction:'younger'}});
 assert.equal(n.parents.length,3);assert.equal(n.siblings?.[0].olderId,'sibling');assert.equal(n.siblings?.[0].notes,'Saudara seayah');validateState(n);
});
test('step parent remains separate from adoptive/biological and round-trips',()=>{
 const s=fixture(),n=applySuggestions(s,'child',suggestionsFor(s,'father','child'),{'parent:partner':{value:'step'}});
 assert.equal(n.parents.at(-1)?.kind,'step');validateState(JSON.parse(JSON.stringify(n)));
});
test('step siblings reject shared biological parent; failed batch does not mutate source',()=>{
 const s=fixture(),before=JSON.stringify(s);
 assert.throws(()=>applySuggestions(s,'child',suggestionsFor(s,'father','child'),{'parent:partner':{value:'step'},'sibling:sibling':{value:'tiri',direction:'younger'}}),/bukan saudara tiri/);
 assert.equal(JSON.stringify(s),before);
});
test('unknown or partial birthdays require manual order',()=>{
 const s=fixture();s.persons[2].birth='2019';const items=suggestionsFor(s,'father','child');assert.equal(items[1].direction,'');
 assert.throws(()=>applySuggestions(s,'child',items,{'sibling:sibling':{value:'kandung'}}),/Pilih kakak/);
});
test('ended and separated partners excluded; existing parent and sibling links not duplicated',()=>{
 let s=fixture();s.unions[0].status='divorced';assert.equal(suggestionsFor(s,'father','child').some(i=>i.type==='parent'),false);
 s.unions[0].status='married';s=applySuggestions(s,'child',suggestionsFor(s,'father','child'),{'parent:partner':{value:'step'},'sibling:sibling':{value:'seayah',direction:'younger'}});
 assert.equal(suggestionsFor(s,'father','child').length,0);
});
test('sharing step parent does not imply biological siblings',()=>{
 let s=fixture();s={...s,parents:[]};s=addParent(s,'father','child','step');s=addParent(s,'father','sibling','step');assert.equal(siblingsOf(s,'child').length,0);
});
test('age inversion and third biological parent rejected',()=>{
 const s=fixture(),items=suggestionsFor(s,'father','child');assert.throws(()=>applySuggestions(s,'child',items,{'sibling:sibling':{value:'seayah',direction:'older'}}),/lebih muda/);
 const n=addParent(s,'sibling','child','biological');assert.throws(()=>applySuggestions(n,'child',suggestionsFor(n,'father','child'),{'parent:partner':{value:'biological'}}),/dua orang tua/);
});
