"use client";

import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Topic={title:string;notes:string;subtopics?:string[]};

export default function AIStudyNotes(){
 const [subject,setSubject]=useState("");
 const [stage,setStage]=useState("Mains");
 const [paper,setPaper]=useState("GS Paper II");
 const [file,setFile]=useState<File|null>(null);
 const [loading,setLoading]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState("");
 const [topics,setTopics]=useState<Topic[]>([]);
 const [selected,setSelected]=useState<Topic|null>(null);
 const [generatedSubject,setGeneratedSubject]=useState("");

 async function generate(){
  setError("");
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
   form.append("subject",subject.trim());
   form.append("stage",stage);
   form.append("paper",paper);
   form.append("mode","complete_subject");
   form.append("sourcePath",path);
   form.append("sourceName",file.name);
   form.append("sourceMime",file.type||"application/pdf");
   const res=await fetch("/api/teacher/ai-study-notes/generate",{method:"POST",body:form});
   const data=await res.json();
   if(!res.ok) throw new Error(data.error||"Generation failed.");
   const next=(data.result?.topics||[]) as Topic[];
   setTopics(next);setGeneratedSubject(subject.trim());setSelected(null);
  }catch(e:any){setError(e?.message||"Generation failed. Please try again.");}
  finally{setUploading(false);setLoading(false);}
 }

 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><a className="btn secondary" href="/teacher">Back</a></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>AI-POWERED SUBJECT BUILDER</div><h1 style={{margin:"6px 0",fontSize:27}}>Create Complete Subject Notes</h1><p className="muted">Upload one Master PDF. AI will build a structured, source-grounded subject for teacher review.</p></section>
   {error&&<div className="error" style={{marginBottom:14}}>{error}</div>}
   <section className="card">
    <h2>1. Select Subject</h2>
    <div className="formGrid">
     <label>Examination<select className="select" defaultValue="MPSC State Services"><option>MPSC State Services</option></select></label>
     <label>Stage<select className="select" value={stage} onChange={e=>setStage(e.target.value)}><option>Prelims</option><option>Mains</option></select></label>
     <label>Paper<select className="select" value={paper} onChange={e=>setPaper(e.target.value)}><option>GS Paper I</option><option>GS Paper II</option><option>GS Paper III</option><option>GS Paper IV</option></select></label>
     <label>Subject<input className="input" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Medieval History"/></label>
    </div>
   </section>
   <section className="card">
    <h2>2. Upload Master PDF</h2>
    <p className="muted">The PDF is uploaded securely to private storage first, then processed server-side by Gemini. Maximum 50 MB.</p>
    <input type="file" accept=".pdf,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/>
    {file&&<p className="success" style={{marginTop:10}}>✓ {file.name}</p>}
   </section>
   <section className="card">
    <h2>3. Generate</h2>
    <p className="muted">Gemini will organize topics and create comprehensive exam-oriented notes from the Master PDF. The result remains a draft until the teacher reviews and publishes it.</p>
    <button className="btn primary" onClick={generate} disabled={loading||!subject.trim()||!file}>{loading?(uploading?"⬆️ UPLOADING SOURCE…":"✨ GENERATING COMPLETE SUBJECT…"):"✨ GENERATE COMPLETE SUBJECT"}</button>
    {loading&&<p className="muted" style={{marginTop:10}}>This may take some time for a large PDF. Please keep this page open.</p>}
   </section>
   {topics.length>0&&<section className="card"><h2>✓ {generatedSubject}</h2><p className="muted">{topics.length} topics generated · Draft for teacher review</p><div className="topicList">{topics.map((t,i)=><div className="topicRow" key={t.title+"-"+i}><div><strong>{i+1}. {t.title}</strong></div><button className="btn outline small" onClick={()=>setSelected(t)}>View / Edit</button></div>)}</div></section>}
   {selected&&<section className="card"><h2>{selected.title}</h2><p className="muted">Review the AI-generated source-grounded notes before publishing.</p><div className="sourceBox"><strong>➕ Add to Existing Notes</strong><p className="muted">Next step: upload additional PDFs/images and AI will integrate useful information into this topic instead of creating a separate note.</p><button className="btn outline" disabled>ADD TO EXISTING NOTES</button></div><div style={{marginTop:14,padding:14,border:"1px solid var(--line)",borderRadius:14,whiteSpace:"pre-wrap",lineHeight:1.6,fontSize:14}}>{selected.notes}</div>{selected.subtopics?.length?<><h3 style={{marginTop:18}}>Subtopics</h3><ul>{selected.subtopics.map((s,i)=><li key={i} style={{marginBottom:6}}>{s}</li>)}</ul></>:null}<div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}><button className="btn outline" disabled>✏️ Edit Notes</button><button className="btn outline" disabled>🔄 Regenerate</button><button className="btn primary" disabled>💾 Save Topic</button></div></section>}
  </main>
  <nav className="bottomNav"><a href="/teacher">⌂<span>Home</span></a><a href="/teacher/ai-study-notes">▣<span>AI Notes</span></a><a href="/teacher">◉<span>Tests</span></a><a href="/teacher">•••<span>More</span></a></nav>
 </div>;
}
