"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase/client";

type Block={type:"heading"|"subheading"|"paragraph"|"bullet"|"numbered"|"callout";text?:string;items?:string[]};
type Topic={id:string;title:string;notes:string;content_blocks:Block[];status:string;subject_id:string};
type Subject={id:string;subject_name:string;stage:string;paper:string;status:string;topics:Topic[]};

function blockLabel(type:string){return ({heading:"Heading",subheading:"Subheading",paragraph:"Paragraph",bullet:"Bullet list",numbered:"Numbered list",callout:"Callout"})[type]||"Paragraph";}

export default function StudyStudio(){
 const [subject,setSubject]=useState(""),[stage,setStage]=useState("Mains"),[paper,setPaper]=useState("GS Paper IV"),[topicTitle,setTopicTitle]=useState(""),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [topic,setTopic]=useState<Topic|null>(null),[blocks,setBlocks]=useState<Block[]>([]);
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [selectedId,setSelectedId]=useState("");

 async function load(){
  const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return;
  const {data:subs}=await s.from("study_subjects").select("id,subject_name,stage,paper,status").eq("created_by",user.id).eq("content_area","teacher").order("created_at",{ascending:false});
  const ids=(subs||[]).map(x=>x.id);if(!ids.length){setSubjects([]);return;}
  const {data:tops}=await s.from("study_topics").select("id,subject_id,title,notes,content_blocks,status").in("subject_id",ids).order("sort_order");
  const grouped=new Map<string,Topic[]>();for(const t of (tops||[])){const a=grouped.get(t.subject_id)||[];a.push(t as Topic);grouped.set(t.subject_id,a);}
  setSubjects((subs||[]).map(s=>({...s,topics:grouped.get(s.id)||[]})) as Subject[]);
 }
 useEffect(()=>{load()},[]);

 function openTopic(t:Topic){setTopic(t);setBlocks(Array.isArray(t.content_blocks)?t.content_blocks:[]);setTopicTitle(t.title);setSubject(subjects.find(s=>s.id===t.subject_id)?.subject_name||"");setError("");setMessage("");window.scrollTo({top:0,behavior:"smooth"});}

 async function importPdf(){
  if(!subject.trim()||!topicTitle.trim()||!file){setError("Enter subject, topic and select a PDF.");return;}
  if(file.size>50*1024*1024){setError("PDF must be 50 MB or smaller.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)throw new Error("Please login again.");
   const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),path=user.id+"/"+crypto.randomUUID()+"-"+safe;
   const {error:u}=await s.storage.from("study-sources").upload(path,file,{contentType:"application/pdf",upsert:false});
   if(u)throw new Error("Source upload failed: "+u.message);
   const form=new FormData();form.append("subject",subject);form.append("stage",stage);form.append("paper",paper);form.append("topicTitle",topicTitle);form.append("sourcePath",path);form.append("sourceName",file.name);
   const r=await fetch("/api/teacher/study-studio/import",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||"Import failed.");
   setMessage("PDF imported as a draft. Now format it block-by-block.");setFile(null);setTopic({id:d.topicId,subject_id:d.subjectId,title:topicTitle,notes:"",content_blocks:d.blocks,status:"draft"});setBlocks(d.blocks||[]);await load();
  }catch(e:any){setError(e.message||"Import failed.");}finally{setBusy(false);}
 }

 function updateBlock(i:number,next:Block){setBlocks(prev=>prev.map((b,j)=>j===i?next:b));}
 function removeBlock(i:number){setBlocks(prev=>prev.filter((_,j)=>j!==i));}
 function move(i:number,dir:number){setBlocks(prev=>{const a=[...prev],j=i+dir;if(j<0||j>=a.length)return a;[a[i],a[j]]=[a[j],a[i]];return a;});}
 function add(type:Block["type"]){setBlocks(prev=>[...prev,{type,text:"",...(type==="bullet"||type==="numbered"?{items:[""]}:{})} as Block]);}
 function setItem(i:number,j:number,value:string){setBlocks(prev=>prev.map((b,k)=>k===i?{...b,items:(b.items||[]).map((x,n)=>n===j?value:x)}:b));}
 function addItem(i:number){setBlocks(prev=>prev.map((b,k)=>k===i?{...b,items:[...(b.items||[]),""]}:b));}
 function removeItem(i:number,j:number){setBlocks(prev=>prev.map((b,k)=>k===i?{...b,items:(b.items||[]).filter((_,n)=>n!==j)}:b));}

 async function save(){
  if(!topic)return;
  setBusy(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/teacher/study-studio/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId:topic.id,title:topicTitle,notes:"",content_blocks:blocks})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Save failed.");setTopic({...topic,...d.topic});setBlocks(d.topic.content_blocks||[]);setMessage("Draft saved. It is not visible to students yet.");await load();
  }catch(e:any){setError(e.message||"Could not save.");}finally{setBusy(false);}
 }

 async function publish(){
  if(!topic)return;
  if(!blocks.length){setError("Add content before publishing.");return;}
  if(!confirm("Publish this formatted material to the student dashboard?"))return;
  setBusy(true);setError("");setMessage("");
  try{
   const s=await fetch("/api/teacher/study-studio/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId:topic.id,title:topicTitle,notes:"",content_blocks:blocks})});const sd=await s.json();if(!s.ok)throw new Error(sd.error||"Save failed.");
   const r=await fetch("/api/teacher/study-studio/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId:topic.id,action:"publish"})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Publish failed.");
   setTopic({...topic,status:"published"});setMessage("Published successfully to students.");await load();
  }catch(e:any){setError(e.message||"Could not publish.");}finally{setBusy(false);}
 }

 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">STUDY MATERIAL STUDIO</div></div><Link className="btn secondary" href="/teacher">Back</Link></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:800}}>TEACHER CONTENT STUDIO</div><h1 style={{margin:"6px 0",fontSize:28}}>Study Material Studio</h1><p className="muted">Upload the original PDF, format the content yourself, preview the structure, then publish only when everything is correct.</p></section>
   {error&&<div className="error" style={{marginBottom:14}}>{error}</div>}{message&&<div className="success" style={{marginBottom:14}}>{message}</div>}

   <section className="card">
    <h2>1. Upload Original PDF</h2><div className="formGrid">
     <label>Subject<input className="input" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Ethics"/></label>
     <label>Stage<select className="select" value={stage} onChange={e=>setStage(e.target.value)}><option>Prelims</option><option>Mains</option></select></label>
     <label>Paper<select className="select" value={paper} onChange={e=>setPaper(e.target.value)}><option>GS Paper I</option><option>GS Paper II</option><option>GS Paper III</option><option>GS Paper IV</option></select></label>
     <label>Chapter / Topic<input className="input" value={topicTitle} onChange={e=>setTopicTitle(e.target.value)} placeholder="e.g. Introduction to Ethics"/></label>
    </div>
    <input type="file" accept=".pdf,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)} style={{marginTop:14}}/>
    {file&&<div className="success" style={{marginTop:10}}>✓ {file.name}</div>}
    <button className="btn primary" style={{marginTop:12}} onClick={importPdf} disabled={busy||!file}>{busy?"IMPORTING…":"UPLOAD & OPEN IN EDITOR"}</button>
   </section>

   {topic&&<section className="card">
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
     <div><h2 style={{marginBottom:4}}>{topicTitle}</h2><span className={topic.status==="published"?"badge":"badge"}>{topic.status==="published"?"PUBLISHED":"DRAFT"}</span></div>
     <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
      <button className="btn secondary small" onClick={()=>add("heading")}>+ Heading</button><button className="btn secondary small" onClick={()=>add("subheading")}>+ Subheading</button><button className="btn secondary small" onClick={()=>add("paragraph")}>+ Paragraph</button><button className="btn secondary small" onClick={()=>add("bullet")}>+ Bullet</button><button className="btn secondary small" onClick={()=>add("numbered")}>+ Numbered</button><button className="btn secondary small" onClick={()=>add("callout")}>+ Callout</button>
     </div>
    </div>
    <input className="input" value={topicTitle} onChange={e=>setTopicTitle(e.target.value)} style={{margin:"14px 0"}}/>
    <div style={{display:"grid",gap:12}}>
     {blocks.map((b,i)=><article key={i} style={{border:"1px solid var(--line)",borderRadius:16,padding:14,background:"var(--soft)"}}>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:9,flexWrap:"wrap"}}>
       <strong>{i+1}. {blockLabel(b.type)}</strong>
       <select className="select" value={b.type} onChange={e=>updateBlock(i,{...b,type:e.target.value as Block["type"],items:(e.target.value==="bullet"||e.target.value==="numbered")?(b.items||[""]):undefined,text:(e.target.value==="bullet"||e.target.value==="numbered")?"":(b.text||"")})} style={{width:"auto",minWidth:140}}>
        <option value="heading">Heading</option><option value="subheading">Subheading</option><option value="paragraph">Paragraph</option><option value="bullet">Bullet list</option><option value="numbered">Numbered list</option><option value="callout">Callout</option>
       </select>
       <button className="btn secondary small" onClick={()=>move(i,-1)}>↑</button><button className="btn secondary small" onClick={()=>move(i,1)}>↓</button><button className="btn outline small" onClick={()=>removeBlock(i)}>Delete</button>
      </div>
      {(b.type==="bullet"||b.type==="numbered")?
       <div style={{display:"grid",gap:8}}>{(b.items||[]).map((x,j)=><div key={j} style={{display:"flex",gap:7}}><span style={{paddingTop:10,fontWeight:800}}>{b.type==="bullet"?"•":(j+1)+"."}</span><textarea className="input" value={x} onChange={e=>setItem(i,j,e.target.value)} rows={2}/><button className="btn outline small" onClick={()=>removeItem(i,j)}>×</button></div>)}<button className="btn secondary small" onClick={()=>addItem(i)}>+ Add item</button></div>
       :<textarea className="input" value={b.text||""} onChange={e=>updateBlock(i,{...b,text:e.target.value})} rows={b.type==="paragraph"?5:3}/>}
     </article>)}
    </div>
    <div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:16}}>
     <button className="btn secondary" onClick={save} disabled={busy}>{busy?"SAVING…":"💾 SAVE DRAFT"}</button>
     <button className="btn primary" onClick={publish} disabled={busy}>{busy?"PUBLISHING…":"🌐 PUBLISH TO STUDENTS"}</button>
    </div>
   </section>}

   <section className="card"><h2>Draft & Published Library</h2><p className="muted">Only material marked Published is visible to students.</p>
    {subjects.map(s=><div key={s.id} style={{borderTop:"1px solid var(--line)",padding:"12px 0"}}><strong>{s.subject_name}</strong><div className="muted" style={{fontSize:12}}>{s.stage} · {s.paper} · {s.status}</div>{s.topics.map(t=><button key={t.id} className="topicRow" onClick={()=>openTopic(t)} style={{width:"100%",textAlign:"left",marginTop:7}}><strong>{t.title}</strong><span className="muted"> · {t.status}</span></button>)}</div>)}
    {!subjects.length&&<p className="muted">No study material yet.</p>}
   </section>
  </main>
 </div>;
}