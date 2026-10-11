'use strict';
/**
 * Convert a successful Pages build into a verified, private LP-review signal.
 * No emails, profile edits, purchases, user data or public-site writes.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const SHA=/^[0-9a-f]{40}$/;
const ID=/^[A-Za-z0-9_-]{1,60}$/;

function verifiedManifest(m,sha,changed,html){
 assert.ok(SHA.test(sha),'Pages release SHA must be 40 hex characters');
 assert.ok(m&&typeof m==='object'&&!Array.isArray(m));
 const allowed=['lp_id','scenario_version','published_url','public_title',
   'theme_tags','counselor_ids','source_html_path'];
 assert.ok(Object.keys(m).every(x=>allowed.includes(x)),'Unknown release field');
 assert.ok(ID.test(m.lp_id)&&ID.test(m.scenario_version),'Invalid LP scenario');
 assert.ok(typeof m.public_title==='string'&&m.public_title.length>0&&m.public_title.length<=70);
 assert.ok(Array.isArray(m.theme_tags)&&m.theme_tags.length>0&&m.theme_tags.length<=10&&
   m.theme_tags.every(x=>typeof x==='string'&&x.length>0&&x.length<=32));
 assert.ok(Array.isArray(m.counselor_ids)&&m.counselor_ids.length>0&&m.counselor_ids.length<=20&&
   m.counselor_ids.every(x=>typeof x==='string'&&ID.test(x))&&
   new Set(m.counselor_ids).size===m.counselor_ids.length);
 const u=new URL(m.published_url);
 assert.equal(u.protocol,'https:');
 assert.equal(u.hostname,'relax-service.github.io');
 assert.equal(u.username,'');
 assert.equal(u.password,'');
 assert.equal(u.search,'');
 assert.equal(u.hash,'');
 assert.ok(/^\/story\/[a-z0-9-]+\/$/.test(u.pathname),'Invalid published story URL');
 const filename='story/'+u.pathname.split('/')[2]+'/index.html';
 assert.equal(m.source_html_path,filename);
 assert.ok(changed.includes(filename)||changed.includes('lp-release-manifests/'+m.lp_id+'.json'),
   'An unrelated deployment cannot trigger profile checks');
 function hasMeta(name,value){
   const pattern=new RegExp('<meta\\s+name="'+name+'"\\s+content="'+value+'"\\s*\\/?>','i');
   return pattern.test(html);
 }
 assert.ok(hasMeta('relax-lp-id',m.lp_id),'LP ID marker on live page mismatches');
 assert.ok(hasMeta('relax-scenario-version',m.scenario_version),'Live scenario marker mismatches');
 return {lp_id:m.lp_id,scenario_version:m.scenario_version,
   published_url:m.published_url,public_title:m.public_title,theme_tags:m.theme_tags,
   counselor_ids:m.counselor_ids,release_sha:sha,trigger:'lp_published'};
}

async function buildReleaseSignals(manifests,changed,sha,fetchHtml){
 const releases=[];
 for(const entry of manifests){
   if(!changed.includes(entry.manifest.source_html_path)&&!changed.includes(entry.path))continue;
   const html=await fetchHtml(entry.manifest.published_url);
   releases.push(verifiedManifest(entry.manifest,sha,changed,html));
 }
 const identities=releases.map(x=>x.lp_id+'|'+x.scenario_version);
 assert.equal(new Set(identities).size,identities.length,'Duplicate release scenario');
 return releases;
}

async function getPublicHtml(url){
 let error;
 for(let attempt=0;attempt<3;attempt++){
   try{
     const result=await fetch(url,{method:'GET',redirect:'follow',
       signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});
     if(!result.ok)throw new Error('Published HTML HTTP '+result.status);
     assert.equal(new URL(result.url).hostname,'relax-service.github.io');
     const html=await result.text();
     if(html.length>500000)throw new Error('Unexpectedly large LP HTML');
     return html;
   }catch(e){error=e;}
 }
 throw error;
}

async function main(){
 const changed=JSON.parse(fs.readFileSync(process.env.PAGES_CHANGED_PATHS,'utf8'));
 assert.ok(Array.isArray(changed)&&changed.every(x=>typeof x==='string'));
 const directory='lp-release-manifests';
 const files=fs.existsSync(directory)?
   fs.readdirSync(directory).filter(x=>/^[A-Za-z0-9_-]+\.json$/.test(x)):[];
 const manifests=files.map(file=>{
   const filename=path.join(directory,file);
   return {path:filename,manifest:JSON.parse(fs.readFileSync(filename,'utf8'))};
 });
 const releases=await buildReleaseSignals(manifests,changed,process.env.PAGES_RELEASE_SHA||'',getPublicHtml);
 if(!process.env.PAGES_RELEASE_QUEUE)throw new Error('Missing private queue path');
 fs.writeFileSync(process.env.PAGES_RELEASE_QUEUE,JSON.stringify({releases})+'\n',{mode:0o600});
 console.log('LP_VERIFIED_PAGES_RELEASE_COUNT='+releases.length);
}
if(require.main===module)main().catch(e=>{
 console.error('LP_RELEASE_EVENT_BLOCKED: '+String(e.message).slice(0,140));
 process.exitCode=1;
});
module.exports={verifiedManifest,buildReleaseSignals};
