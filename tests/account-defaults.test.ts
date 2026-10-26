import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultFamilyPassword,defaultFamilyLogin} from '../src/account-defaults';
test('sandi awal dibuat acak per akun dan username mengikuti nama tanpa sandi bersama',()=>{
 const values=Array.from({length:100},()=>defaultFamilyPassword());
 assert.equal(new Set(values).size,100);assert.ok(values.every(v=>/^[a-f0-9]{36}$/.test(v)));
 assert.equal(defaultFamilyLogin(' Dewi Lestari '),'dewi.lestari');
 assert.equal(defaultFamilyLogin('Ahmad 01'),'ahmad.01');
});
