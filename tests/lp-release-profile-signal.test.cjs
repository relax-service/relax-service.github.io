'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifiedManifest,buildReleaseSignals}=require('../scripts/lp-release-profile-signal.cjs');
const manifest={
 lp_id:'LP002',scenario_version:'s2',
 published_url:'https://relax-service.github.io/story/lp002/',
 public_title:'言えなかった夜',theme_tags:['夫婦','気持ち'],
 counselor_ids:['STAFF-2'],source_html_path:'story/lp002/index.html'
};
const page='<html><head><meta name="relax-lp-id" content="LP002"/><meta name="relax-scenario-version" content="s2"/></head></html>';
const sha='a'.repeat(40),changed=['story/lp002/index.html'];
test('one verified LP release becomes an internal-only payload',()=>{
 const r=verifiedManifest(manifest,sha,changed,page);
 assert.equal(r.release_sha,sha);
 assert.equal(r.trigger,'lp_published');
 assert.equal(r.counselor_ids.length,1);
 assert.ok(!Object.hasOwn(r,'contact_email'));
});
test('cosmetic unrelated deploy must not create consultant tasks',async()=>{
 const list=await buildReleaseSignals([{path:'lp-release-manifests/LP002.json',
  manifest}],['assets/images/logo.svg'],sha,async()=>page);
 assert.equal(list.length,0);
});
test('several newly released LPs become one batch',async()=>{
 const second={...manifest,lp_id:'LP003',scenario_version:'s3',
   published_url:'https://relax-service.github.io/story/lp003/',
   source_html_path:'story/lp003/index.html'};
 const html3=page.replace('LP002','LP003').replace('s2','s3');
 const batch=await buildReleaseSignals([
  {path:'lp-release-manifests/LP002.json',manifest},
  {path:'lp-release-manifests/LP003.json',manifest:second}],
  [manifest.source_html_path,second.source_html_path],sha,
  async url=>url.includes('/lp003/')?html3:page);
 assert.deepEqual(batch.map(x=>x.lp_id),['LP002','LP003']);
});
test('wrong live HTML version is rejected after GitHub Pages success',()=>{
 assert.throws(()=>verifiedManifest(manifest,sha,changed,page.replace('content="s2"','content="s1"')));
});
test('unexpected domains, parameters and wrong scenario path fail closed',()=>{
 for(const url of ['http://relax-service.github.io/story/lp002/',
   'https://evil.example/story/lp002/',
   'https://relax-service.github.io/story/lp002/?private=1',
   'https://relax-service.github.io/lp001/']){
    assert.throws(()=>verifiedManifest({...manifest,published_url:url},sha,changed,page));
 }
});
test('reject customer/contact fields and duplicate consultant IDs',()=>{
 assert.throws(()=>verifiedManifest({...manifest,customer_phone:'x'},sha,changed,page));
 assert.throws(()=>verifiedManifest({...manifest,counselor_ids:['A','A']},sha,changed,page));
});
test('reject early or guessed release SHA and no related source change',()=>{
 assert.throws(()=>verifiedManifest(manifest,'abc123',changed,page));
 assert.throws(()=>verifiedManifest(manifest,sha,['lp001/app.js'],page));
});
