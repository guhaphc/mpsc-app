"use client";

import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Subtopic={id?:string;title:string;content:string;sort_order?:number};
type Topic={id?:string;title:string;notes:string;subtopics?:Subtopic[];subject_id?:string};

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
 const [selectedSubtopic,setSelectedSubtopic]=useState<Subtopic|null>(null);
 const [subtopicEditing,setSubtopicEditing]=useState(false);
 const [subtopicNotes,setSubtopicNotes]=useState("");

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

 function openTopic(t:Topic){setSelected(t);setEditing(false);setEditNotes(t.notes);setError("");setMessage("");}

 async function saveSubtopic(){
  if(!selectedSubtopic?.id)return;setLoading(true);setError("");setMessage("");
  try{const form=new FormData();form.append("mode","save_subtopic");form.append("subtopicId",selectedSubtopic.id);form.append("title",selectedSubtopic.title);form.append("content",subtopicNotes);const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not save subtopic.");const updated={...selectedSubtopic,content:subtopicNotes};setSelectedSubtopic(updated);setSelected(prev=>prev?{...prev,subtopics:(prev.subtopics||[]).map(s=>s.id===updated.id?updated:s)}:prev);setTopics(prev=>prev.map(t=>t.id===selected?.id?{...t,subtopics:(t.subtopics||[]).map(s=>s.id===updated.id?updated:s)}:t));setSubtopicEditing(false);setMessage("Subtopic saved.");}catch(e:any){setError(e?.message||"Could not save subtopic.");}finally{setLoading(false);}
 }
 async function deleteSubtopic(){
  if(!selectedSubtopic?.id)return;if(!confirm("Delete this subtopic permanently?"))return;setLoading(true);setError("");setMessage("");
  try{const form=new FormData();form.append("mode","delete_subtopic");form.append("subtopicId",selectedSubtopic.id);const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not delete subtopic.");setSelected(prev=>prev?{...prev,subtopics:(prev.subtopics||[]).filter(s=>s.id!==selectedSubtopic.id)}:prev);setTopics(prev=>prev.map(t=>t.id===selected?.id?{...t,subtopics:(t.subtopics||[]).filter(s=>s.id!==selectedSubtopic.id)}:t));setSelectedSubtopic(null);setMessage("Subtopic deleted.");}catch(e:any){setError(e?.message||"Could not delete subtopic.");}finally{setLoading(false);}
 }
 async function regenerateSubtopic(){
  if(!selectedSubtopic?.id)return;setLoading(true);setError("");setMessage("");
  try{const form=new FormData();form.append("mode","regenerate_subtopic");form.append("subtopicId",selectedSubtopic.id);const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not regenerate subtopic.");const updated=data.result as Subtopic;setSelectedSubtopic(updated);setSubtopicNotes(updated.content);setSelected(prev=>prev?{...prev,subtopics:(prev.subtopics||[]).map(s=>s.id===updated.id?updated:s)}:prev);setTopics(prev=>prev.map(t=>t.id===selected?.id?{...t,subtopics:(t.subtopics||[]).map(s=>s.id===updated.id?updated:s)}:t));setMessage("Subtopic regenerated.");}catch(e:any){setError(e?.message||"Could not regenerate subtopic.");}finally{setLoading(false);}
 }
 async function saveTopic(){
  if(!selected?.id){setError("This topic has no saved ID. Generate the subject again.");return;}
  setLoading(true);setError("");setMessage("");
  try{
   const form=new FormData();form.append("mode","save_topic");form.append("topicId",selected.id);form.append("notes",editNotes);
   const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});
   const data=await res.json();if(!res.ok) throw new Error(data.error||"Could not save topic.");
   const updated={...selected,notes:editNotes};
   setTopics(prev=>prev.map(t=>t.id===selected.id?updated:t));setSelected(updated);setEditing(false);setMessage("Topic saved successfully.");
  }catch(e:any){setError(e?.message||"Could not save topic.");}finally{setLoading(false);}
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
   setTopics(prev=>prev.map(t=>t.id===selected.id?updated:t));setSelected(updated);setEditNotes(updated.notes);setEditing(false);setMessage("Topic regenerated and saved.");
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
   {topics.length>0&&<section className="card"><h2>✓ {generatedSubject}</h2><p className="muted">{topics.length} topics generated · Draft for teacher review</p><div className="topicList">{topics.map((t,i)=><div className="topicRow" key={(t.id||t.title)+"-"+i}><div><strong>{i+1}. {t.title}</strong></div><button className="btn outline small" onClick={()=>openTopic(t)}>VIEW / EDIT</button></div>)}</div></section>}
   {selectedSubtopic&&subtopicEditing&&<section className="card"><h2>✏️ Edit Subtopic</h2><input className="input" value={selectedSubtopic.title} onChange={e=>setSelectedSubtopic({...selectedSubtopic,title:e.target.value})}/><textarea className="input" value={subtopicNotes} onChange={e=>setSubtopicNotes(e.target.value)} style={{marginTop:12,minHeight:360,resize:"vertical",lineHeight:1.6}}/><div style={{display:"flex",gap:8,marginTop:12}}><button className="btn primary" onClick={saveSubtopic} disabled={loading}>💾 SAVE SUBTOPIC</button><button className="btn secondary" onClick={()=>setSubtopicEditing(false)}>CANCEL</button></div></section>}{selected&&<section className="card"><h2>{selected.title}</h2><p className="muted">Review and improve the AI-generated notes before publishing.</p>
    
    {editing?<textarea className="input" value={editNotes} onChange={e=>setEditNotes(e.target.value)} style={{marginTop:14,minHeight:360,resize:"vertical",lineHeight:1.6}}/>:<div style={{marginTop:14,padding:14,border:"1px solid var(--line)",borderRadius:14,whiteSpace:"pre-wrap",lineHeight:1.6,fontSize:14}}>{selected.notes}</div>}
    {selected.subtopics?.length?<div style={{marginTop:22}}><h3>Complete Notes</h3>{selected.subtopics.map((s,i)=><article key={s.id||i} style={{marginTop:16,padding:16,border:"1px solid var(--line)",borderRadius:14}}><h3 style={{marginTop:0}}>{i+1}. {s.title}</h3><div style={{whiteSpace:"pre-wrap",lineHeight:1.65,fontSize:14}}>{s.content}</div><div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}><button className="btn outline small" onClick={()=>{setSelectedSubtopic(s);setSubtopicNotes(s.content);setSubtopicEditing(true);}}>✏️ EDIT</button><button className="btn outline small" onClick={()=>{setSelectedSubtopic(s);setTimeout(regenerateSubtopic,0);}} disabled={loading}>🔄 REGENERATE</button><button className="btn outline small" onClick={()=>{setSelectedSubtopic(s);setTimeout(deleteSubtopic,0);}} disabled={loading}>🗑️ DELETE</button></div></article>)}</div>:null}
    <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
     {!editing?<button className="btn outline" onClick={()=>{setEditing(true);setEditNotes(selected.notes);}}>✏️ Edit Notes</button>:<button className="btn primary" onClick={saveTopic} disabled={loading}>💾 SAVE CHANGES</button>}
     <button className="btn outline" onClick={regenerate} disabled={loading}>🔄 REGENERATE</button>
    </div>
   </section>}
  </main>
  <nav className="bottomNav"><a href="/teacher">⌂<span>Home</span></a><a href="/teacher/ai-study-notes">▣<span>AI Notes</span></a><a href="/teacher">◉<span>Tests</span></a><a href="/teacher">•••<span>More</span></a></nav>
 </div>;
}
