"use client";

import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Subtopic={id?:string;title:string;content:string;sort_order?:number};
type Topic={id?:string;title:string;notes:string;subtopics?:Subtopic[];subject_id?:string;status?:string};

export default function AIStudyNotes(){
 const [subject,setSubject]=useState("");
 const [stage,setStage]=useState("Mains");
 const [paper,setPaper]=useState("GS Paper II");
 const [file,setFile]=useState<File|null>(null);
 const [loading,setLoading]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [topics,setTopics]=useState<Topic[]>([]);
 const [selected,setSelected]=useState<Topic|null>(null);
 const [editing,setEditing]=useState(false);
 const [editNotes,setEditNotes]=useState("");
 const [generatedSubject,setGeneratedSubject]=useState("");
 const [adding,setAdding]=useState(false);
 const [newTitle,setNewTitle]=useState("");
 const [newNotes,setNewNotes]=useState("");
 const [editSubtopics,setEditSubtopics]=useState<Subtopic[]>([]);

 async function generate(){
  setError("");setMessage("");
  if(!subject.trim()){setError("Enter a subject first.");return;}
  if(!file){setError("Upload the Master PDF first.");return;}
  if(file.size>50*1024*1024){setError("Each PDF must be 50 MB or smaller.");return;}
  setUploading(true);setLoading(true);
  try{
   const supabase=createClient();
   const {data:{user}}=await supabase.auth.getUser();
   if(!user) throw new Error("Please login again.");
   const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
   const path=`${user.id}/${crypto.randomUUID()}-${safeName}`;
   const {error:uploadError}=await supabase.storage.from("study-sources").upload(path,file,{contentType:file.type||"application/pdf",upsert:false});
   if(uploadError) throw new Error(`Source upload failed: ${uploadError.message}`);
   setUploading(false);
   const form=new FormData();
   form.append("subject",subject.trim());form.append("stage",stage);form.append("paper",paper);
   form.append("mode","complete_subject");form.append("sourcePath",path);form.append("sourceName",file.name);form.append("sourceMime",file.type||"application/pdf");
   const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});
   const data=await res.json();if(!res.ok) throw new Error(data.error||"Generation failed.");
   setTopics(((data.result?.topics||[]) as Topic[]).map(t=>({...t,subject_id:data.subjectId})));setGeneratedSubject(subject.trim());setSelected(null);
   setMessage("Complete subject generated and saved as a draft.");
  }catch(e:any){setError(e?.message||"Generation failed. Please try again.");}
  finally{setUploading(false);setLoading(false);}
 }

 function openTopic(t:Topic){setSelected(t);setEditing(false);setEditNotes(t.notes);setEditSubtopics((t.subtopics||[]).map(s=>({...s})));setError("");setMessage("");}

 async function saveTopic(){
  if(!selected?.id){setError("This topic has no saved ID. Generate the subject again.");return;}
  setLoading(true);setError("");setMessage("");
  try{
   const form=new FormData();form.append("mode","save_complete_topic");form.append("topicId",selected.id);form.append("notes",editNotes);form.append("subtopics",JSON.stringify(editSubtopics.map((s,i)=>({title:s.title,content:s.content,sort_order:i+1}))));
   const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});
   const data=await res.json();if(!res.ok) throw new Error(data.error||"Could not save complete topic.");
   const updated={...selected,notes:editNotes,subtopics:editSubtopics.map((s,i)=>({...s,sort_order:i+1}))};
   setTopics(prev=>prev.map(t=>t.id===selected.id?updated:t));setSelected(updated);setEditing(false);setMessage("Complete topic saved successfully.");
  }catch(e:any){setError(e?.message||"Could not save complete topic.");}finally{setLoading(false);}
 }
 async function regenerate(){
  if(!selected?.id){setError("This topic has no saved ID. Generate the subject again.");return;}
  setLoading(true);setError("");setMessage("");
  try{
   const form=new FormData();form.append("mode","regenerate_topic");form.append("topicId",selected.id);
   const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});
   const data=await res.json();if(!res.ok) throw new Error(data.error||"Regeneration failed.");
   const regenerated=data.result as Topic;
   const updated={...selected,...regenerated,id:selected.id};
   setTopics(prev=>prev.map(t=>t.id===selected.id?updated:t));setSelected(updated);setEditNotes(updated.notes);setEditSubtopics((updated.subtopics||[]).map(s=>({...s})));setEditing(false);setMessage("Topic regenerated and saved.");
  }catch(e:any){setError(e?.message||"Regeneration failed.");}finally{setLoading(false);}
 }

 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><a className="btn secondary" href="/teacher">Back</a></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>AI-POWERED SUBJECT BUILDER</div><h1 style={{margin:"6px 0",fontSize:27}}>Create Complete Subject Notes</h1><p className="muted">Upload one Master PDF. AI will build a structured, source-grounded subject for teacher review.</p></section>
   {error&&<div className="error" style={{marginBottom:14}}>{error}</div>}{message&&<div className="success" style={{marginBottom:14}}>{message}</div>}
   <section className="card"><h2>1. Select Subject</h2><div className="formGrid">
    <label>Examination<select className="select" defaultValue="MPSC State Services"><option>MPSC State Services</option></select></label>
    <label>Stage<select className="select" value={stage} onChange={e=>setStage(e.target.value)}><option>Prelims</option><option>Mains</option></select></label>
    <label>Paper<select className="select" value={paper} onChange={e=>setPaper(e.target.value)}><option>GS Paper I</option><option>GS Paper II</option><option>GS Paper III</option><option>GS Paper IV</option></select></label>
    <label>Subject<input className="input" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Medieval History"/></label>
   </div></section>
   <section className="card"><h2>2. Upload Master PDF</h2><p className="muted">The PDF is uploaded securely to private storage first, then processed server-side by Gemini. Maximum 50 MB.</p><input type="file" accept=".pdf,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/>{file&&<p className="success" style={{marginTop:10}}>✓ {file.name}</p>}</section>
   <section className="card"><h2>3. Generate</h2><p className="muted">Gemini will organize topics and create comprehensive exam-oriented notes from the Master PDF. The result remains a draft until the teacher reviews and publishes it.</p><button className="btn primary" onClick={generate} disabled={loading||!subject.trim()||!file}>{loading?(uploading?"⬆️ UPLOADING SOURCE…":"✨ PROCESSING…"):"✨ GENERATE COMPLETE SUBJECT"}</button>{loading&&<p className="muted" style={{marginTop:10}}>Please keep this page open while Gemini processes the source.</p>}</section>
   {topics.length>0&&<section className="card"><h2>✓ {generatedSubject}</h2><p className="muted">{topics.length} topics generated · Draft for teacher review</p><div className="topicList">{topics.map((t,i)=><div className="topicRow" key={(t.id||t.title)+"-"+i}><div><strong>{i+1}. {t.title}</strong><div className="muted" style={{fontSize:12,marginTop:4}}>{t.status==="published"?"● Published":"● Draft"}</div></div><button className="btn outline small" onClick={()=>openTopic(t)}>VIEW / EDIT</button></div>)}</div></section>}
   {selected&&<section className="card"><h2>{selected.title}</h2><p className="muted">Review and edit the complete topic. All subtopics are included in the same edit session.</p><div className="muted" style={{fontWeight:700,marginTop:8}}>{selected.status==="published"?"● PUBLISHED":"● DRAFT"}</div>
    {editing?<div style={{marginTop:14}}>
      <label>Topic Overview<textarea className="input" value={editNotes} onChange={e=>setEditNotes(e.target.value)} style={{marginTop:8,minHeight:260,resize:"vertical",lineHeight:1.65}}/></label>
      {editSubtopics.length>0&&<div style={{marginTop:22}}><h3>Complete Notes — Subtopics</h3>{editSubtopics.map((s,i)=><article key={s.id||i} style={{marginTop:16,padding:16,border:"1px solid var(--line)",borderRadius:14}}><label><strong>Subtopic {i+1}</strong><input className="input" value={s.title} onChange={e=>setEditSubtopics(prev=>prev.map((x,j)=>j===i?{...x,title:e.target.value}:x))} style={{marginTop:8}}/></label><label style={{display:"block",marginTop:12}}>Content<textarea className="input" value={s.content} onChange={e=>setEditSubtopics(prev=>prev.map((x,j)=>j===i?{...x,content:e.target.value}:x))} style={{marginTop:8,minHeight:360,resize:"vertical",lineHeight:1.65}}/></label></article>)}</div>}
    </div>:<div style={{marginTop:14,padding:14,border:"1px solid var(--line)",borderRadius:14,whiteSpace:"pre-wrap",lineHeight:1.65,fontSize:14}}>{selected.notes}{selected.subtopics?.length?<div style={{marginTop:24}}><h3>Complete Notes</h3>{selected.subtopics.map((s,i)=><article key={s.id||i} style={{marginTop:16,padding:16,border:"1px solid var(--line)",borderRadius:14}}><h4 style={{marginTop:0}}>{i+1}. {s.title}</h4><div style={{whiteSpace:"pre-wrap",lineHeight:1.65}}>{s.content}</div></article>)}</div>:null}</div>}
    <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>{!editing?<><button className="btn outline" onClick={()=>{setEditing(true);setEditNotes(selected.notes);setEditSubtopics((selected.subtopics||[]).map(s=>({...s})));}}>✏️ EDIT COMPLETE NOTES</button><button className="btn outline" onClick={regenerate} disabled={loading}>✨ AI REGENERATE</button><button className="btn primary" onClick={async()=>{setLoading(true);setError("");setMessage("");try{const form=new FormData();form.append("mode","set_topic_status");form.append("topicId",selected.id||"");form.append("status",selected.status==="published"?"draft":"published");const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not update publication status.");const updated={...selected,status:selected.status==="published"?"draft":"published"};setSelected(updated);setTopics(prev=>prev.map(t=>t.id===updated.id?updated:t));setMessage(updated.status==="published"?"Topic published to students.":"Topic unpublished.");}catch(e:any){setError(e?.message||"Could not update publication status.");}finally{setLoading(false);}}} disabled={loading}>{selected.status==="published"?"⏸ UNPUBLISH":"🌐 PUBLISH"}</button></>:<><button className="btn primary" onClick={saveTopic} disabled={loading}>💾 SAVE COMPLETE TOPIC</button><button className="btn secondary" onClick={()=>{setEditing(false);setEditNotes(selected.notes);setEditSubtopics((selected.subtopics||[]).map(s=>({...s})));}}>CANCEL</button></>}</div>
   </section>}
  </main>
  <nav className="bottomNav"><a href="/teacher">⌂<span>Home</span></a><a href="/teacher/ai-study-notes">▣<span>AI Notes</span></a><a href="/teacher">◉<span>Tests</span></a><a href="/teacher">•••<span>More</span></a></nav>
 </div>;
}
